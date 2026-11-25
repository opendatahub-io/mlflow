"""Prepare canonical Agent Plugin metadata inside the caller's creation transaction.

This module does not fetch packages, create rows, or authorize access. Creation/import
must authorize referenced resources, call ``prepare_agent_plugin_version`` in the same
session as its writes, and persist the returned Skill pins and endpoint IDs atomically.
Inline endpoints still need IDs assigned by that transaction. Endpoint configuration is
validated at registration time; it is not an immutable snapshot for future pulls.
"""

import json
import logging
from copy import deepcopy
from dataclasses import dataclass, replace
from typing import Any, Literal
from urllib.parse import urlsplit

import sqlalchemy as sa

from mlflow.entities.mcp_access_endpoint import MCPAccessEndpoint
from mlflow.entities.mcp_server import MCPStatus
from mlflow.entities.skill import SkillStatus
from mlflow.entities.skill_source import (
    GitSource,
    MlflowSource,
    OCISource,
    SkillSourceType,
    ZipSource,
)
from mlflow.exceptions import MlflowException
from mlflow.genai.skill_content.fetchers.oci import parse_image_reference
from mlflow.genai.skill_content.paths import canonical_relative_path, normalize_subpath
from mlflow.genai.skill_content.sources import (
    MAX_SOURCE_FIELD_LENGTH,
    ResolvedSource,
    is_local_path,
    resolve_source_type,
)
from mlflow.protos.databricks_pb2 import RESOURCE_DOES_NOT_EXIST
from mlflow.store.artifact.models_artifact_repo import ModelsArtifactRepository
from mlflow.store.artifact.runs_artifact_repo import RunsArtifactRepository
from mlflow.store.artifact.utils.models import _parse_model_uri
from mlflow.store.tracking.dbmodels.models import (
    SqlMCPAccessEndpoint,
    SqlMCPServer,
    SqlMCPServerAlias,
    SqlMCPServerVersion,
    SqlSkill,
    SqlSkillAlias,
    SqlSkillVersion,
)
from mlflow.utils.semver_utils import normalize_semver
from mlflow.utils.skill_uris import ParsedSkillUri, format_skill_uri, parse_skill_uri
from mlflow.utils.validation import (
    _validate_agent_plugin_mcp_servers,
    _validate_agent_plugin_name,
    _validate_organization_name,
    _validate_run_id,
    _validate_skill_artifact_path,
)

_logger = logging.getLogger(__name__)
_PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"


@dataclass(frozen=True)
class PreparedAgentPluginVersion:
    name: str
    organization: str
    workspace: str
    version: str
    plugin_json: dict[str, Any]
    source: ResolvedSource | None
    skills: tuple[str, ...]
    mcp_servers: dict[str, MCPAccessEndpoint]

    @property
    def source_type(self) -> SkillSourceType:
        return self.source.source_type if self.source else SkillSourceType.ASSEMBLED

    @property
    def kind(self) -> Literal["assembled", "packaged"]:
        return "packaged" if self.source else "assembled"


def _invalid(message):
    return MlflowException.invalid_parameter_value(message)


def _missing(message):
    return MlflowException(message, error_code=RESOURCE_DOES_NOT_EXIST)


def _validate_manifest(name, plugin_json, version, *, packaged, path_name, path_version):
    if not isinstance(name, str):
        raise _invalid("Plugin name must be a string.")
    _validate_agent_plugin_name(name)
    if path_name is not None and path_name != name:
        raise _invalid("Path and request plugin names must match.")
    if plugin_json is None:
        if packaged or version is None:
            raise _invalid("A manifest is required unless assembling with an explicit version.")
        plugin_json = {"$schema": _PLUGIN_SCHEMA, "name": name}
    if not isinstance(plugin_json, dict):
        raise _invalid("plugin_json must be an object.")
    try:
        manifest = json.loads(json.dumps(plugin_json, allow_nan=False))
    except (TypeError, ValueError, OverflowError, RecursionError):
        raise _invalid("plugin_json must contain JSON-compatible values.") from None
    # JSON encoding silently stringifies object keys and converts tuples to lists.
    # Reject these inputs so canonical metadata does not change when it is persisted.
    pending = [plugin_json]
    while pending:
        value = pending.pop()
        if isinstance(value, dict):
            if any(not isinstance(key, str) for key in value):
                raise _invalid("plugin_json object keys must be strings.")
            pending.extend(value.values())
        elif isinstance(value, list):
            pending.extend(value)
        elif value is not None and not isinstance(value, (str, int, float, bool)):
            raise _invalid("plugin_json must contain JSON values, including lists for arrays.")
    if not isinstance(manifest.get("$schema"), str) or not manifest["$schema"].strip():
        raise _invalid("plugin_json requires a non-empty '$schema' string.")
    if not isinstance(manifest.get("name"), str):
        raise _invalid("plugin_json.name must be a string.")
    _validate_agent_plugin_name(manifest["name"])
    if manifest["name"] != name:
        raise _invalid("Request and manifest plugin names must match.")
    for key in ("description", "homepage", "repository", "license"):
        if key in manifest and not isinstance(manifest[key], str):
            raise _invalid(f"plugin_json.{key} must be a string.")
    if "author" in manifest:
        author = manifest["author"]
        if not isinstance(author, dict) or any(
            key in author and not isinstance(author[key], str) for key in ("name", "email", "url")
        ):
            raise _invalid(
                "plugin_json.author must be an object with string name/email/url fields."
            )
    if "keywords" in manifest and (
        not isinstance(manifest["keywords"], list)
        or any(not isinstance(keyword, str) for keyword in manifest["keywords"])
    ):
        raise _invalid("plugin_json.keywords must be a list of strings.")
    if "extensions" in manifest and not isinstance(manifest["extensions"], dict):
        _logger.warning("Preserving non-object plugin_json.extensions without interpreting it.")
    versions = [
        normalize_semver(value, param_name=label)
        for label, value in (
            ("version", version),
            ("path version", path_version),
            ("plugin_json.version", manifest.get("version")),
        )
        if value is not None
    ]
    if "version" in manifest and manifest["version"] is None:
        raise _invalid("plugin_json.version must be a string.")
    if version is None and "version" not in manifest:
        raise _invalid("A version must be supplied in the request or manifest.")
    if len(set(versions)) != 1:
        raise _invalid("Path, request, and manifest plugin versions must match.")
    manifest["version"] = versions[0]
    return manifest


def _parse_source_url(source):
    try:
        parts = urlsplit(source)
        # urllib only validates a URL's port when this property is accessed.
        _ = parts.port
    except ValueError:
        raise _invalid("Invalid plugin package source URL.") from None
    return parts


def _validate_artifact_uri(source):
    parts = _parse_source_url(source)
    if (
        parts.scheme not in {"mlflow-artifacts", "runs", "models"}
        or parts.netloc
        or parts.query
        or parts.fragment
        or not parts.path.startswith("/")
    ):
        raise _invalid("Package source must be an MLflow artifact URI without authority or query.")
    path = parts.path.removeprefix("/")
    try:
        _validate_skill_artifact_path(path)
        if parts.scheme == "runs":
            run_id, _ = RunsArtifactRepository.parse_runs_uri(source)
            _validate_run_id(run_id)
        elif parts.scheme == "models":
            model_uri, _ = ModelsArtifactRepository.split_models_uri(source)
            parsed = _parse_model_uri(model_uri)
            if parsed.alias is not None and not parsed.name.strip():
                raise _invalid("Model alias package sources require a model name.")
    except MlflowException:
        raise _invalid("Invalid MLflow artifact package source.") from None


def _resolve_package_source(source, source_type, ref, subpath):
    if source is None:
        if any(value is not None for value in (source_type, ref, subpath)):
            raise _invalid("Source type, ref, and subpath require a package source.")
        return None
    if source_type is not None:
        if not isinstance(source_type, str) or source_type not in {"git", "oci", "zip"}:
            raise _invalid("Only git, oci, and zip source types may be explicitly supplied.")
        if not isinstance(source, str):
            raise _invalid("Explicit source_type requires a string source.")
        if ref is not None and source_type != "git":
            raise _invalid("Only Git sources accept ref.")
        match source_type:
            case "git":
                source = GitSource(source, ref, subpath)
            case "oci":
                source = OCISource(source, subpath)
            case "zip":
                source = ZipSource(source, subpath)
        ref = subpath = None
    if isinstance(source, MlflowSource):
        if ref is not None or subpath is not None:
            raise _invalid("Set subpath on the typed source; MLflow sources do not accept ref.")
        # Import supplies the authoritative stored URI after a local multipart upload.
        subpath = source.subpath
        source = source.artifact_path
        if not isinstance(source, str) or not source.startswith("mlflow-artifacts:/"):
            raise _invalid("An uploaded package requires its authoritative MLflow artifact URI.")
    if isinstance(source, str) and is_local_path(source):
        raise _invalid("Upload local packages before server-side validation.")
    try:
        resolved = resolve_source_type(source, ref=ref, subpath=subpath)
    except (MlflowException, ValueError, TypeError, AttributeError):
        # Sources can contain credentials; do not propagate a parser's echoed input.
        raise _invalid("Invalid plugin package source, type, ref, or subpath.") from None
    if resolved.source_type == SkillSourceType.OCI:
        try:
            parse_image_reference(resolved.source)
        except MlflowException:
            raise _invalid("Invalid OCI package source reference.") from None
    elif resolved.source_type == SkillSourceType.MLFLOW:
        _validate_artifact_uri(resolved.source)
    elif resolved.source_type == SkillSourceType.GIT:
        parts = _parse_source_url(resolved.source)
        if "://" in resolved.source:
            if parts.scheme not in {"https", "http", "ssh", "git"} or not parts.hostname:
                raise _invalid("Git package source must be a remote Git locator.")
        elif is_local_path(resolved.source) or parts.scheme in {
            "mlflow-artifacts",
            "runs",
            "models",
        }:
            raise _invalid("Git package source must be a remote Git locator.")
        elif not resolved.source.partition(":")[2]:
            raise _invalid("SCP-style Git sources require a repository path.")
    elif not _parse_source_url(resolved.source).hostname:
        raise _invalid("ZIP source requires a host.")
    if len(resolved.source) > MAX_SOURCE_FIELD_LENGTH:
        raise _invalid("Plugin package source is too long.")
    return resolved


def _query(store, session, model, workspace):
    # Autoflush preserves caller edits before refreshing cached rows from this transaction.
    return store._get_query(session, model).filter(model.workspace == workspace).populate_existing()


def _resolve_skills(store, session, workspace, skills, source):
    if skills is not None and not isinstance(skills, list):
        raise _invalid("skills must be a list of Skill URI strings.")
    pins = []
    names = set()
    for uri in skills or []:
        parsed = parse_skill_uri(uri)
        if parsed.name in names:
            raise _invalid(
                f"Duplicate Skill member name {parsed.name!r}, regardless of organization."
            )
        names.add(parsed.name)
        # Match Skill deletion's parent-first lock order. The no-op update is
        # needed on SQL Server, where ``with_for_update`` does not render a
        # locking clause, and also serializes writers on SQLite.
        (
            _query(store, session, SqlSkill, workspace)
            .filter(
                SqlSkill.name == parsed.name,
                SqlSkill.organization == parsed.organization,
            )
            .with_for_update()
            .one_or_none()
        )
        _query(store, session, SqlSkill, workspace).filter(
            SqlSkill.name == parsed.name,
            SqlSkill.organization == parsed.organization,
        ).update({SqlSkill.last_updated_at: SqlSkill.last_updated_at}, synchronize_session=False)
        query = _query(store, session, SqlSkillVersion, workspace).filter(
            SqlSkillVersion.name == parsed.name,
            SqlSkillVersion.organization == parsed.organization,
            SqlSkillVersion.status != SkillStatus.DELETED.value,
        )
        if parsed.version is not None:
            query = query.filter(SqlSkillVersion.version == parsed.version)
        elif parsed.alias is None:
            query = query.filter(SqlSkillVersion.status == SkillStatus.ACTIVE.value)
        elif parsed.alias.lower() != "latest":
            alias = (
                _query(store, session, SqlSkillAlias, workspace)
                .filter_by(name=parsed.name, organization=parsed.organization, alias=parsed.alias)
                .one_or_none()
            )
            if alias is None:
                raise _missing(f"Skill alias for member {parsed.name!r} was not found.")
            query = query.filter(SqlSkillVersion.version == alias.version)
        row = query.order_by(
            sa.case((SqlSkillVersion.status == SkillStatus.ACTIVE.value, 0), else_=1),
            SqlSkillVersion.version.desc(),
        ).first()
        if row is None:
            if parsed.version is not None:
                detail = "The pinned version must exist and must not be deleted."
            elif parsed.alias is not None:
                detail = "The selected alias must resolve to an existing, non-deleted version."
            else:
                detail = "Name-only members require an active version; publish it or pin a version."
            raise _missing(f"No eligible version for Skill member {parsed.name!r}. {detail}")
        if source is not None:
            _validate_member_source(row, source)
        pins.append(
            format_skill_uri(
                ParsedSkillUri(name=row.name, organization=row.organization, version=row.version)
            )
        )
    return tuple(pins)


def _validate_member_source(row, source):
    subpath = normalize_subpath(row.subpath)
    root = source.subpath
    if (
        row.source_type != source.source_type
        or row.source != source.source
        or row.ref != source.ref
        or subpath is None
        or (root is not None and not subpath.startswith(root + "/"))
    ):
        raise _invalid(f"Skill member {row.name!r} must derive its source from the plugin package.")


def _resolve_server(store, session, workspace, endpoint):
    if endpoint.server_name is None:
        return None
    server = (
        _query(store, session, SqlMCPServer, workspace)
        .filter_by(name=endpoint.server_name)
        .one_or_none()
    )
    if server is None:
        raise _missing("Associated MCP server was not found in the plugin workspace.")
    if endpoint.server_version is None and endpoint.server_alias is None:
        return None
    query = _query(store, session, SqlMCPServerVersion, workspace).filter(
        SqlMCPServerVersion.name == endpoint.server_name,
        SqlMCPServerVersion.status != MCPStatus.DELETED.value,
    )
    if endpoint.server_version is not None:
        query = query.filter_by(version=endpoint.server_version)
    # Match MCP CRUD and endpoint SQL resolution, which reserve lowercase "latest" only.
    elif endpoint.server_alias != "latest":
        alias = (
            _query(store, session, SqlMCPServerAlias, workspace)
            .filter_by(name=endpoint.server_name, alias=endpoint.server_alias)
            .one_or_none()
        )
        if alias is None:
            raise _missing("Associated MCP server alias was not found in the plugin workspace.")
        query = query.filter_by(version=alias.version)
    version = query.order_by(
        sa.case((SqlMCPServerVersion.status == MCPStatus.ACTIVE.value, 0), else_=1),
        *SqlMCPServer._version_order_by(),
    ).first()
    if version is None:
        raise _missing("Associated MCP server version was not found in the plugin workspace.")
    return version


def _validate_stdio_context(config, server_version, *, packaged):
    command = config["command"]
    if any(placeholder in command for placeholder in ("${PLUGIN_ROOT}", "${PLUGIN_DATA}")):
        raise _invalid("Stdio command must be a bare executable or ./ plugin-relative path.")
    cwd = config.get("cwd", "")
    for value in (command, cwd):
        for prefix in ("./", "${PLUGIN_ROOT}/", "${PLUGIN_DATA}/"):
            if value.startswith(prefix):
                try:
                    parts = value.removeprefix(prefix).split("/")
                    # Keep portable path spelling checks, but permit contained dot segments.
                    canonical_relative_path("/".join(p for p in parts if p not in {".", ".."}))
                    depth = 0
                    for part in parts:
                        if part == "..":
                            depth -= 1
                        elif part not in {"", "."}:
                            depth += 1
                        if depth < 0:
                            raise _invalid("Path escapes its declared root.")
                except MlflowException:
                    raise _invalid(
                        "Stdio command/cwd must stay within its declared root."
                    ) from None
                break
    plugin_relative = command.startswith("./") or cwd.startswith(("./", "${PLUGIN_ROOT}"))
    # Arguments and environment values are opaque except for the defined root placeholder.
    strings = [*config.get("args", []), *config.get("env", {}).values()]
    plugin_relative |= any("${PLUGIN_ROOT}" in value for value in strings)
    if plugin_relative and not packaged:
        raise _invalid("Plugin-relative stdio configuration requires a packaged plugin.")
    packages = (server_version.server_json.get("packages") or []) if server_version else []
    has_package = isinstance(packages, list) and any(
        isinstance(package, dict)
        and isinstance(package.get("registryType"), str)
        and package.get("registryType") in {"npm", "pypi", "oci", "nuget", "mcpb"}
        and isinstance(package.get("identifier"), str)
        and bool(package["identifier"].strip())
        and isinstance(package.get("transport"), dict)
        and package["transport"].get("type") == "stdio"
        for package in packages
    )
    if not packaged and not has_package:
        raise _invalid(
            "Stdio requires server package metadata or a packaged plugin supplying files."
        )


def _resolve_endpoints(store, session, workspace, mcp_servers, *, packaged):
    _validate_agent_plugin_mcp_servers(mcp_servers)
    result = {}
    for name, submitted in (mcp_servers or {}).items():
        if submitted.id is not None:
            row = (
                _query(store, session, SqlMCPAccessEndpoint, workspace)
                .filter_by(id=submitted.id)
                .one_or_none()
            )
            if row is None:
                raise _missing(
                    f"MCP member {name!r} endpoint was not found in the plugin workspace."
                )
            try:
                endpoint = deepcopy(row.to_mlflow_entity())
            except (TypeError, ValueError):
                raise _invalid(f"MCP member {name!r} has invalid stored configuration.") from None
        else:
            endpoint = deepcopy(submitted)
            endpoint.workspace = workspace
        # ID references ignore submitted metadata but must validate the current stored config.
        _validate_agent_plugin_mcp_servers({name: replace(endpoint, id=None)})
        version = _resolve_server(store, session, workspace, endpoint)
        endpoint.resolved_version = deepcopy(version.to_mlflow_entity()) if version else None
        config = endpoint.client_config
        if config is not None and config.get("type") == "stdio":
            _validate_stdio_context(config, version, packaged=packaged)
        result[name] = endpoint
    return result


def prepare_agent_plugin_version(
    store,
    session,
    *,
    workspace: str,
    name: str,
    organization: str = "",
    version: str | None = None,
    plugin_json: dict[str, Any] | None = None,
    source: str | GitSource | OCISource | ZipSource | MlflowSource | None = None,
    source_type: Literal["git", "oci", "zip"] | None = None,
    ref: str | None = None,
    subpath: str | None = None,
    skills: list[str] | None = None,
    mcp_servers: dict[str, MCPAccessEndpoint] | None = None,
    path_name: str | None = None,
    path_version: str | None = None,
) -> PreparedAgentPluginVersion:
    """Validate one version and resolve members using a caller-owned database session.

    For assembly, pass ``name``, ``version``, and e.g. ``skills=["skills:/review@prod"]``.
    Packaged import additionally supplies a complete ``plugin_json`` and package ``source``;
    its Skill rows must already be visible in this transaction, with derived package sources.
    For local uploads, pass ``MlflowSource`` with the authoritative artifact URI after upload.
    ``source_type`` accepts only explicit external types; assembled/MLflow are flow-derived.

    The returned containers are detached from input and ORM JSON. Persist them immediately in
    this transaction. Frozen membership consists of concrete Skill URIs and MCP names/IDs,
    not the current endpoint configuration or resolved server alias target. Permissions and
    HTTP's ID-only input restriction are enforced by the caller.
    For an existing endpoint ID, all accompanying submitted fields are ignored; validation
    uses the current stored endpoint. MCP's reserved ``latest`` alias is case-sensitive,
    matching the existing MCP store. Skill's reserved ``latest`` alias is case-insensitive.
    Resolution refreshes cached rows using the transaction's database visibility. Queries
    autoflush pending changes; callers disabling autoflush must flush before preparation.

    ``workspace`` must match the active context when using a workspace-aware store, even
    for a version with no members. The helper never switches the caller's workspace.
    Stdio ``command`` and ``cwd`` are checked for lexical containment. Arguments and
    environment values remain opaque: a value such as ``${PLUGIN_ROOT}/../../file`` does
    not receive path validation here. Root placeholders still require a packaged plugin;
    client-side import/pull owns file checks. This validation does not sandbox execution.

    Credential checks reuse the shared endpoint/source validators (e.g. URL userinfo and
    credential headers). They do not attempt to identify secrets in arbitrary strings.

    Examples:
        Assemble existing resources without a supplied manifest::

            with store.ManagedSessionMaker(read_only=False) as session:
                prepared = prepare_agent_plugin_version(
                    store,
                    session,
                    workspace="team-a",
                    name="review-tools",
                    version="1.2",
                    skills=["skills:/review@prod"],
                    mcp_servers={"search": MCPAccessEndpoint(id="existing-endpoint-id")},
                )
                # Creation persists prepared metadata and membership in this session.

        Validate an uploaded package after its member Skill rows have been inserted into
        the same session, using the authoritative URI returned by artifact storage::

            prepared = prepare_agent_plugin_version(
                store,
                session,
                workspace="team-a",
                name="review-tools",
                plugin_json={"$schema": _PLUGIN_SCHEMA, "name": "review-tools", "version": "2"},
                source=MlflowSource("mlflow-artifacts:/agent-plugins/review-tools/<upload-token>"),
                skills=["skills:/review/3"],
            )

        The member's source must be that same artifact URI, with a subpath such as
        ``skills/review``. Existing artifact references (e.g. ``runs:/<run-id>/plugin``)
        can instead be supplied as strings. Validation performs no artifact downloads.
    """
    if not isinstance(workspace, str) or not workspace:
        raise _invalid("A plugin workspace is required.")
    if store.supports_workspaces and workspace != store._get_active_workspace():
        raise _invalid("Plugin workspace must match the store's active workspace context.")
    _validate_organization_name(organization)
    package = _resolve_package_source(source, source_type, ref, subpath)
    manifest = _validate_manifest(
        name,
        plugin_json,
        version,
        packaged=package is not None,
        path_name=path_name,
        path_version=path_version,
    )
    pins = _resolve_skills(store, session, workspace, skills, package)
    endpoints = _resolve_endpoints(
        store, session, workspace, mcp_servers, packaged=package is not None
    )
    return PreparedAgentPluginVersion(
        name=name,
        organization=organization,
        workspace=workspace,
        version=manifest["version"],
        plugin_json=manifest,
        source=package,
        skills=pins,
        mcp_servers=endpoints,
    )
