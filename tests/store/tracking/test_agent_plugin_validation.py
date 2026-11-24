import re
from copy import deepcopy

import pytest

from mlflow.entities.mcp_access_endpoint import MCPAccessEndpoint
from mlflow.entities.skill_source import GitSource, MlflowSource, OCISource, ZipSource
from mlflow.exceptions import MlflowException
from mlflow.store.tracking.agent_plugin_validation import prepare_agent_plugin_version
from mlflow.store.tracking.dbmodels.models import (
    SqlAgentPlugin,
    SqlAgentPluginVersion,
    SqlMCPAccessEndpoint,
    SqlMCPServer,
    SqlMCPServerAlias,
    SqlMCPServerVersion,
    SqlSkill,
    SqlSkillAlias,
    SqlSkillVersion,
)
from mlflow.store.tracking.sqlalchemy_store import SqlAlchemyStore
from mlflow.store.tracking.sqlalchemy_workspace_store import WorkspaceAwareSqlAlchemyStore
from mlflow.utils.semver_utils import encode_prerelease_sort_key, parse_semver
from mlflow.utils.workspace_context import WorkspaceContext

SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
SERVER = "io.github.example/server"
GIT = "https://example.com/plugin.git"
REMOTE = {"type": "streamable-http", "url": "https://example.com/mcp"}
PACKAGE = {"registryType": "npm", "identifier": "example-server", "transport": {"type": "stdio"}}


@pytest.fixture(params=[False, True], ids=["single-workspace", "workspaces"])
def store(request, tmp_path, db_uri, monkeypatch):
    monkeypatch.setenv("MLFLOW_ENABLE_WORKSPACES", str(request.param).lower())
    cls = WorkspaceAwareSqlAlchemyStore if request.param else SqlAlchemyStore
    with WorkspaceContext("default"):
        yield cls(db_uri, (tmp_path / "artifacts").as_uri())


def _prepare(store, session, **kwargs):
    return prepare_agent_plugin_version(
        store, session, **{"name": "plugin", "workspace": "default", "version": "1", **kwargs}
    )


def _manifest(**kwargs):
    return {"$schema": SCHEMA, "name": "plugin", "version": "1", **kwargs}


def _skill(session, version=1, name="review", organization="", workspace="default", **kwargs):
    if session.get(SqlSkill, (workspace, organization, name)) is None:
        session.add(SqlSkill(workspace=workspace, organization=organization, name=name))
        session.flush()
    row = SqlSkillVersion(
        name=name,
        organization=organization,
        workspace=workspace,
        version=version,
        **{"source": GIT, "source_type": "git", "status": "active", **kwargs},
    )
    session.add(row)
    session.flush()
    return row


def _endpoint(session, workspace="default", **kwargs):
    row = SqlMCPAccessEndpoint(**{
        "id": "endpoint",
        "workspace": workspace,
        "client_config": REMOTE,
        **kwargs,
    })
    session.add(row)
    session.flush()
    return row


def _server(session, workspace="default", version="1.0.0", packages=None, status="active"):
    if session.get(SqlMCPServer, (workspace, SERVER)) is None:
        session.add(SqlMCPServer(workspace=workspace, name=SERVER))
        session.flush()
    parsed = parse_semver(version)
    row = SqlMCPServerVersion(
        workspace=workspace,
        name=SERVER,
        version=version,
        server_json={"name": SERVER, "version": version, "packages": packages or []},
        status=status,
        version_major=parsed.major,
        version_minor=parsed.minor,
        version_patch=parsed.patch,
        version_prerelease_sort_key=encode_prerelease_sort_key(parsed),
    )
    session.add(row)
    session.flush()
    return row


def test_manifest_preservation_and_no_writes(store, caplog):
    manifest = _manifest(**{
        "$schema": "https://example.com/future.json",
        "extensions": ["future"],
        "unknown": {"nested": [1, 2]},
    })
    original = deepcopy(manifest)
    with store.ManagedSessionMaker() as session:
        result = _prepare(store, session, plugin_json=manifest, path_version="1.0")
        assert result.version == "1.0.0"
        assert result.plugin_json == {**manifest, "version": "1.0.0"}
        assert result.kind == "assembled"
        assert result.source_type == "assembled"
        assert result.skills == ()
        assert result.mcp_servers == {}
        assert not session.new
        assert not session.dirty
        result.plugin_json["unknown"]["nested"].append(3)
    assert manifest == original
    assert "non-object" in caplog.text


@pytest.mark.parametrize(
    ("kwargs", "expected"),
    [
        ({}, {"$schema": SCHEMA, "name": "plugin", "version": "1.0.0"}),
        (
            {"plugin_json": {"$schema": SCHEMA, "name": "plugin"}},
            {"$schema": SCHEMA, "name": "plugin", "version": "1.0.0"},
        ),
        (
            {"version": None, "plugin_json": _manifest(version="2.3-beta+build")},
            _manifest(version="2.3.0-beta+build"),
        ),
    ],
)
def test_manifest_version_normalization(store, kwargs, expected):
    with store.ManagedSessionMaker() as session:
        assert _prepare(store, session, **kwargs).plugin_json == expected


@pytest.mark.parametrize(
    "kwargs",
    [
        {"plugin_json": []},
        {"plugin_json": {"name": "plugin"}},
        {"plugin_json": {"$schema": SCHEMA}},
        {"plugin_json": _manifest(name="other")},
        {"plugin_json": _manifest(name="Invalid")},
        {"plugin_json": _manifest(version="release")},
        {"plugin_json": _manifest(version=None)},
        {"plugin_json": _manifest(version="2")},
        {"plugin_json": _manifest(description=3)},
        {"plugin_json": _manifest(author="author")},
        {"plugin_json": _manifest(author={"email": 1})},
        {"plugin_json": _manifest(keywords=[1])},
        {"plugin_json": _manifest(unknown=float("nan"))},
        {"plugin_json": _manifest(unknown={1: "numeric", "1": "text"})},
        {"plugin_json": _manifest(unknown={"nested": (1, 2)})},
        {"plugin_json": _manifest(**{"$schema": ""})},
        {"path_name": "other"},
        {"path_version": "2"},
        {"version": None},
        {"version": None, "plugin_json": {"$schema": SCHEMA, "name": "plugin"}},
        {"source": GIT},
    ],
)
def test_invalid_manifests(store, kwargs):
    with store.ManagedSessionMaker() as session:
        with pytest.raises(MlflowException, match="(?i)(plugin|manifest|version|name|must)") as exc:
            _prepare(store, session, **kwargs)
        assert exc.value.error_code == "INVALID_PARAMETER_VALUE"


@pytest.mark.parametrize(
    ("source", "source_type", "expected"),
    [
        (GIT, None, "git"),
        ("https://example.com/repository", "git", "git"),
        (GitSource(GIT, ref="main", subpath="plugins/demo"), None, "git"),
        (GitSource("git@example.com:team/plugin.git"), None, "git"),
        (GitSource("ssh://git@example.com/team/plugin"), None, "git"),
        ("oci://example.com/plugin:v1", None, "oci"),
        (OCISource("example.com/plugin:v1"), None, "oci"),
        ("example.com/plugin:v1", "oci", "oci"),
        (ZipSource("https://example.com/download?release=1"), None, "zip"),
        ("https://example.com/plugin.zip", None, "zip"),
        ("mlflow-artifacts:/agent-plugins/plugin/token", None, "mlflow"),
        (MlflowSource("mlflow-artifacts:/agent-plugins/plugin/token"), None, "mlflow"),
        ("runs:/0123456789abcdef0123456789abcdef/plugin", None, "mlflow"),
        ("runs:/0123456789abcdef0123456789abcdef", None, "mlflow"),
        ("models:/model/1/plugin", None, "mlflow"),
        ("models:/model@prod", None, "mlflow"),
        ("models:/model@prod/plugin", None, "mlflow"),
    ],
)
def test_package_sources_and_empty_members(store, source, source_type, expected):
    with store.ManagedSessionMaker() as session:
        result = _prepare(
            store, session, plugin_json=_manifest(), source=source, source_type=source_type
        )
        assert result.kind == "packaged"
        assert result.source_type == expected
        assert result.skills == ()


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"source": "./local"}, "Upload local packages before server-side validation."),
        ({"source": GitSource("./local")}, "Git package source must be a remote Git locator."),
        (
            {"source": GitSource("https:relative")},
            "Git package source must be a remote Git locator.",
        ),
        ({"source": ZipSource("https:relative")}, "ZIP source requires a host."),
        (
            {"source": "file:///local/plugin.git"},
            "Git package source must be a remote Git locator.",
        ),
        ({"source": "https:///plugin.git"}, "Git package source must be a remote Git locator."),
        ({"source": "https:///plugin.zip"}, "ZIP source requires a host."),
        (
            {"source": "https://example.com:invalid/plugin.git"},
            "Invalid plugin package source URL.",
        ),
        ({"source": "https://example.com:65536/plugin.zip"}, "Invalid plugin package source URL."),
        (
            {"source": GitSource("git@example.com:")},
            "SCP-style Git sources require a repository path.",
        ),
        (
            {"source": GIT, "source_type": []},
            "Only git, oci, and zip source types may be explicitly supplied.",
        ),
        (
            {"source": "https://example.com/ambiguous"},
            "Invalid plugin package source, type, ref, or subpath.",
        ),
        (
            {"source": "oci://example.com/plugin", "source_type": "git"},
            "Git package source must be a remote Git locator.",
        ),
        (
            {"source": "https://example.com/plugin.zip", "source_type": "oci"},
            "Invalid OCI package source reference.",
        ),
        (
            {"source": GIT, "source_type": "assembled"},
            "Only git, oci, and zip source types may be explicitly supplied.",
        ),
        (
            {"source": "mlflow-artifacts:/package", "source_type": "mlflow"},
            "Only git, oci, and zip source types may be explicitly supplied.",
        ),
        (
            {"source": "mlflow-artifacts:/package", "source_type": "git"},
            "Git package source must be a remote Git locator.",
        ),
        (
            {"source": "https://example.com/plugin.zip", "ref": "main"},
            "Invalid plugin package source, type, ref, or subpath.",
        ),
        (
            {"source": GIT, "subpath": "../escape"},
            "Invalid plugin package source, type, ref, or subpath.",
        ),
        (
            {"source": "https://user:secret@example.com/plugin.git"},
            "Invalid plugin package source, type, ref, or subpath.",
        ),
        (
            {"source": "https://example.com/plugin.zip?token=secret"},
            "Invalid plugin package source, type, ref, or subpath.",
        ),
        ({"source": "mlflow-artifacts:/../secret"}, "Invalid MLflow artifact package source."),
        (
            {"source": "mlflow-artifacts:/%252e%252e/secret"},
            "Invalid MLflow artifact package source.",
        ),
        (
            {"source": "mlflow-artifacts://host/package"},
            "Package source must be an MLflow artifact URI without authority or query.",
        ),
        (
            {"source": "mlflow-artifacts:/package?token=secret"},
            "Package source must be an MLflow artifact URI without authority or query.",
        ),
        ({"source": "mlflow-artifacts:/"}, "Invalid MLflow artifact package source."),
        ({"source": "runs:/bad!run/plugin"}, "Invalid MLflow artifact package source."),
        ({"source_type": "git"}, "Source type, ref, and subpath require a package source."),
        ({"ref": "main"}, "Source type, ref, and subpath require a package source."),
    ],
)
def test_invalid_sources(store, kwargs, message):
    with store.ManagedSessionMaker() as session:
        with pytest.raises(MlflowException, match=rf"^{re.escape(message)}$") as exc:
            _prepare(store, session, plugin_json=_manifest(), **kwargs)
        assert exc.value.error_code == "INVALID_PARAMETER_VALUE"
        assert "secret" not in str(exc.value)


def test_skill_resolution_freezes_alias_and_active_latest(store):
    with store.ManagedSessionMaker(read_only=False) as session:
        _skill(session, version=1)
        _skill(session, version=2, status="deprecated")
        _skill(session, version=3, status="draft")
        _skill(session, version=4, status="deleted")
        alias = SqlSkillAlias(
            workspace="default", organization="", name="review", alias="prod", version=3
        )
        session.add(alias)
        session.flush()
        latest = _prepare(store, session, skills=["skills:/review"])
        pinned = _prepare(store, session, skills=["skills:/review/2"])
        aliased = _prepare(store, session, skills=["skills:/review@prod"])
        alias.version = 2
        _skill(session, version=5)
        assert latest.skills == ("skills:/review/1",)
        assert pinned.skills == ("skills:/review/2",)
        assert aliased.skills == ("skills:/review/3",)
        assert _prepare(store, session, skills=["skills:/review"]).skills == ("skills:/review/5",)


@pytest.mark.parametrize("status", ["draft", "deprecated", "deleted"])
def test_name_only_requires_active_but_explicit_members_allow_nonactive(store, status):
    with store.ManagedSessionMaker(read_only=False) as session:
        _skill(session, status=status)
        with pytest.raises(MlflowException, match="Name-only members require an active"):
            _prepare(store, session, skills=["skills:/review"])
        for uri in ("skills:/review/1", "skills:/review@latest"):
            if status == "deleted":
                with pytest.raises(MlflowException, match="No eligible version"):
                    _prepare(store, session, skills=[uri])
            else:
                assert _prepare(store, session, skills=[uri]).skills == ("skills:/review/1",)


def test_skill_names_unique_across_organizations(store):
    with store.ManagedSessionMaker(read_only=False) as session:
        _skill(session, organization="one")
        _skill(session, organization="two")
        with pytest.raises(MlflowException, match="Duplicate Skill member"):
            _prepare(store, session, skills=["skills:/@one/review", "skills:/@two/review"])


@pytest.mark.parametrize(
    "changes",
    [
        {},
        {"source": "https://example.com/other.git"},
        {"ref": "other"},
        {"subpath": "elsewhere/skills/review"},
        {"subpath": "plugin-other/skills/review"},
        {"subpath": "plugin"},
        {"subpath": "plugin/../review"},
        {"source_type": "zip"},
    ],
)
def test_packaged_skill_sources_must_derive_from_package(store, changes):
    with store.ManagedSessionMaker(read_only=False) as session:
        _skill(session, **{"ref": "main", "subpath": "plugin/skills/review", **changes})
        kwargs = {
            "source": GitSource(GIT, "main", "plugin"),
            "plugin_json": _manifest(),
            "skills": ["skills:/review"],
        }
        if changes:
            with pytest.raises(MlflowException, match="(derive its source|Path)"):
                _prepare(store, session, **kwargs)
        else:
            assert _prepare(store, session, **kwargs).skills == ("skills:/review/1",)


@pytest.mark.parametrize("packaged", [False, True])
def test_mlflow_backed_skills_and_mcp_name_overlap(store, packaged):
    source = "mlflow-artifacts:/agent-plugins/plugin/token"
    with store.ManagedSessionMaker(read_only=False) as session:
        _skill(session, source=source, source_type="mlflow", subpath="skills/review")
        result = _prepare(
            store,
            session,
            skills=["skills:/review"],
            plugin_json=_manifest(),
            source=MlflowSource(source) if packaged else None,
            mcp_servers={"review": MCPAccessEndpoint(client_config=REMOTE)},
        )
        assert result.skills == ("skills:/review/1",)
        assert result.mcp_servers["review"].id is None
        assert session.query(SqlMCPAccessEndpoint).count() == 0
        assert session.query(SqlAgentPluginVersion).count() == 0


def test_existing_endpoint_uses_current_config_and_does_not_update_it(store):
    with store.ManagedSessionMaker(read_only=False) as session:
        row = _endpoint(session)
        submitted = MCPAccessEndpoint(
            id=row.id,
            client_config={"invalid": "ignored"},
            server_name="ignored",
            workspace="elsewhere",
        )
        result = _prepare(store, session, mcp_servers={"mcp": submitted})
        assert result.mcp_servers["mcp"].client_config == REMOTE
        assert result.mcp_servers["mcp"].server_name is None
        result.mcp_servers["mcp"].client_config["url"] = "https://changed.example.com"
        assert row.client_config == REMOTE
        assert submitted.client_config == {"invalid": "ignored"}
        assert not session.dirty


def test_existing_endpoint_configuration_is_revalidated(store):
    with store.ManagedSessionMaker(read_only=False) as session:
        _endpoint(session, client_config={**REMOTE, "headers": {"Authorization": "secret"}})
        with pytest.raises(MlflowException, match="headers") as exc:
            _prepare(store, session, mcp_servers={"mcp": MCPAccessEndpoint(id="endpoint")})
        assert "secret" not in str(exc.value)


@pytest.mark.parametrize("present", [False, True])
def test_endpoint_missing_or_in_other_workspace(store, present):
    with store.ManagedSessionMaker(read_only=False) as session:
        if present:
            _endpoint(session, workspace="other")
        with pytest.raises(MlflowException, match="not found in the plugin workspace") as exc:
            _prepare(store, session, mcp_servers={"mcp": MCPAccessEndpoint(id="endpoint")})
        assert exc.value.error_code == "RESOURCE_DOES_NOT_EXIST"


def test_skill_and_alias_workspace_isolation(store):
    with store.ManagedSessionMaker(read_only=False) as session:
        _skill(session, workspace="other")
        session.add(
            SqlSkillAlias(
                workspace="other", organization="", name="review", alias="prod", version=1
            )
        )
        session.flush()
        for uri in ("skills:/review", "skills:/review/1", "skills:/review@prod"):
            with pytest.raises(MlflowException, match="(No eligible version|alias.*not found)"):
                _prepare(store, session, skills=[uri])


@pytest.mark.parametrize(
    "association",
    [
        {"server_version": "1.0.0"},
        {"server_alias": "prod"},
        {"server_name": SERVER, "server_version": "1.0.0", "server_alias": "prod"},
    ],
)
def test_endpoint_selectors_require_server_and_are_exclusive(store, association):
    with store.ManagedSessionMaker() as session:
        with pytest.raises(
            MlflowException, match="(requires server_name|mutually exclusive)"
        ) as exc:
            _prepare(
                store,
                session,
                mcp_servers={"mcp": MCPAccessEndpoint(client_config=REMOTE, **association)},
            )
        assert exc.value.error_code == "INVALID_PARAMETER_VALUE"


@pytest.mark.parametrize(
    "packages",
    [
        None,
        [{}],
        [{"identifier": "server"}],
        [{**PACKAGE, "transport": {"type": "streamable-http"}}],
        [{**PACKAGE, "identifier": ""}],
        [PACKAGE],
    ],
)
def test_stdio_requires_qualifying_server_package(store, packages):
    with store.ManagedSessionMaker(read_only=False) as session:
        _server(session, packages=packages)
        endpoint = MCPAccessEndpoint(
            server_name=SERVER,
            server_version="1.0.0",
            client_config={"type": "stdio", "command": "npx"},
        )
        if packages == [PACKAGE]:
            result = _prepare(store, session, mcp_servers={"mcp": endpoint})
            assert result.mcp_servers["mcp"].resolved_version.version == "1.0.0"
        else:
            with pytest.raises(MlflowException, match="Stdio requires"):
                _prepare(store, session, mcp_servers={"mcp": endpoint})


@pytest.mark.parametrize(
    "config",
    [
        {"type": "stdio", "command": "./server"},
        {"type": "stdio", "command": "node", "cwd": "./data"},
        {"type": "stdio", "command": "node", "args": ["${PLUGIN_ROOT}/server.js"]},
        {"type": "stdio", "command": "node", "env": {"DATA": "${PLUGIN_ROOT}/data"}},
    ],
)
def test_plugin_relative_stdio_cannot_be_reused_by_assembled_plugin(store, config):
    with store.ManagedSessionMaker(read_only=False) as session:
        _server(session, packages=[PACKAGE])
        _endpoint(session, server_name=SERVER, server_version="1.0.0", client_config=config)
        endpoint = MCPAccessEndpoint(id="endpoint")
        with pytest.raises(MlflowException, match="requires a packaged plugin"):
            _prepare(store, session, mcp_servers={"mcp": endpoint})
        result = _prepare(
            store, session, mcp_servers={"mcp": endpoint}, source=GIT, plugin_json=_manifest()
        )
        assert result.mcp_servers["mcp"].id == "endpoint"


def test_stdio_server_identity_alone_is_insufficient(store):
    with store.ManagedSessionMaker(read_only=False) as session:
        _server(session, packages=[PACKAGE])
        endpoint = MCPAccessEndpoint(
            server_name=SERVER, client_config={"type": "stdio", "command": "npx"}
        )
        with pytest.raises(MlflowException, match="Stdio requires"):
            _prepare(store, session, mcp_servers={"mcp": endpoint})


def test_mcp_alias_resolves_current_target_without_freezing_selector(store):
    with store.ManagedSessionMaker(read_only=False) as session:
        _server(session, packages=[PACKAGE])
        _server(session, version="2.0.0", packages=[PACKAGE])
        alias = SqlMCPServerAlias(workspace="default", name=SERVER, alias="prod", version="1.0.0")
        session.add(alias)
        _endpoint(
            session,
            server_name=SERVER,
            server_alias="prod",
            client_config={"type": "stdio", "command": "npx"},
        )
        endpoint = MCPAccessEndpoint(id="endpoint")
        first = _prepare(store, session, mcp_servers={"mcp": endpoint})
        alias.version = "2.0.0"
        session.flush()
        second = _prepare(store, session, mcp_servers={"mcp": endpoint})
        assert first.mcp_servers["mcp"].resolved_version.version == "1.0.0"
        assert second.mcp_servers["mcp"].resolved_version.version == "2.0.0"
        assert second.mcp_servers["mcp"].server_alias == "prod"
        assert second.mcp_servers["mcp"].server_version is None


@pytest.mark.parametrize(("workspace", "status"), [("other", "active"), ("default", "deleted")])
def test_mcp_server_versions_must_be_live_and_in_workspace(store, workspace, status):
    with store.ManagedSessionMaker(read_only=False) as session:
        _server(session, workspace=workspace, status=status)
        with pytest.raises(MlflowException, match="not found in the plugin workspace"):
            _prepare(
                store,
                session,
                mcp_servers={
                    "mcp": MCPAccessEndpoint(
                        server_name=SERVER, server_version="1.0.0", client_config=REMOTE
                    )
                },
            )


def test_kind_is_per_version_and_failure_rolls_back_with_caller(store):
    with store.ManagedSessionMaker(read_only=False) as session:
        session.add(SqlAgentPlugin(workspace="default", organization="", name="plugin"))
        session.flush()
        session.add(
            SqlAgentPluginVersion(
                workspace="default",
                organization="",
                name="plugin",
                version="0.1.0",
                plugin_json=_manifest(version="0.1.0"),
                source_type="assembled",
            )
        )

    def failing_creation():
        with store.ManagedSessionMaker(read_only=False) as session:
            _skill(session, subpath="skills/review")
            result = _prepare(
                store, session, source=GIT, plugin_json=_manifest(), skills=["skills:/review"]
            )
            assert result.kind == "packaged"
            _prepare(store, session, mcp_servers={"mcp": MCPAccessEndpoint(id="missing")})

    with pytest.raises(MlflowException, match="not found in the plugin workspace"):
        failing_creation()
    with store.ManagedSessionMaker() as session:
        assert session.query(SqlSkillVersion).count() == 0
        assert session.query(SqlAgentPluginVersion).count() == 1


def test_nondefault_workspace_uses_its_own_skill_and_server_aliases(store):
    with WorkspaceContext("team-a"), store.ManagedSessionMaker(read_only=False) as session:
        for workspace, version in (("default", 1), ("team-a", 2)):
            _skill(session, workspace=workspace, version=version)
            _server(session, workspace=workspace, version=f"{version}.0.0", packages=[PACKAGE])
            session.add(
                SqlSkillAlias(
                    workspace=workspace,
                    name="review",
                    organization="",
                    alias="prod",
                    version=version,
                )
            )
            session.add(
                SqlMCPServerAlias(
                    workspace=workspace, name=SERVER, alias="prod", version=f"{version}.0.0"
                )
            )
        _endpoint(session, workspace="team-a", server_name=SERVER, server_alias="prod")
        result = _prepare(
            store,
            session,
            workspace="team-a",
            skills=["skills:/review@prod"],
            mcp_servers={"mcp": MCPAccessEndpoint(id="endpoint")},
        )
        assert result.workspace == "team-a"
        assert result.skills == ("skills:/review/2",)
        assert result.mcp_servers["mcp"].resolved_version.version == "2.0.0"
        assert result.mcp_servers["mcp"].workspace == "team-a"


@pytest.mark.parametrize("transport", ["streamable-http", "sse"])
def test_legacy_remote_endpoint_without_association(store, transport):
    with store.ManagedSessionMaker(read_only=False) as session:
        _endpoint(session, client_config=None, url=REMOTE["url"], transport_type=transport)
        result = _prepare(store, session, mcp_servers={"mcp": MCPAccessEndpoint(id="endpoint")})
        assert result.mcp_servers["mcp"].url == REMOTE["url"]
        assert result.mcp_servers["mcp"].server_name is None


@pytest.mark.parametrize("packaged", [False, True])
def test_unassociated_stdio_requires_package_context(store, packaged):
    endpoint = MCPAccessEndpoint(client_config={"type": "stdio", "command": "node"})
    with store.ManagedSessionMaker() as session:
        if packaged:
            result = _prepare(
                store, session, source=GIT, plugin_json=_manifest(), mcp_servers={"mcp": endpoint}
            )
            assert result.mcp_servers["mcp"].server_name is None
        else:
            with pytest.raises(MlflowException, match="Stdio requires"):
                _prepare(store, session, mcp_servers={"mcp": endpoint})


def test_mcp_latest_prefers_active_then_falls_back_to_non_deleted(store):
    with store.ManagedSessionMaker(read_only=False) as session:
        active = _server(session, packages=[PACKAGE])
        _server(session, version="2.0.0", status="draft", packages=[PACKAGE])
        _server(session, version="3.0.0", status="deleted", packages=[PACKAGE])
        endpoint = MCPAccessEndpoint(
            server_name=SERVER,
            server_alias="latest",
            client_config={
                "type": "stdio",
                "command": "npx",
                "cwd": "${PLUGIN_DATA}",
            },
        )
        result = _prepare(store, session, mcp_servers={"mcp": endpoint})
        assert result.mcp_servers["mcp"].resolved_version.version == "1.0.0"
        result.mcp_servers["mcp"].resolved_version.server_json["packages"].clear()
        assert active.server_json["packages"] == [PACKAGE]
        active.status = "deprecated"
        session.flush()
        result = _prepare(store, session, mcp_servers={"mcp": endpoint})
        assert result.mcp_servers["mcp"].resolved_version.version == "2.0.0"


@pytest.mark.parametrize("resource", ["skill", "server"])
@pytest.mark.parametrize("alias_state", ["missing", "other-workspace", "deleted-target"])
def test_aliases_require_a_live_target_in_plugin_workspace(store, resource, alias_state):
    workspace = "other" if alias_state == "other-workspace" else "default"
    status = "deleted" if alias_state == "deleted-target" else "active"
    with store.ManagedSessionMaker(read_only=False) as session:
        _skill(session, workspace=workspace, status=status)
        _server(session, workspace=workspace, status=status)
        if alias_state != "missing":
            session.add(
                SqlSkillAlias(
                    workspace=workspace, organization="", name="review", alias="prod", version=1
                )
            )
            session.add(
                SqlMCPServerAlias(workspace=workspace, name=SERVER, alias="prod", version="1.0.0")
            )
            session.flush()
        kwargs = (
            {"skills": ["skills:/review@prod"]}
            if resource == "skill"
            else {
                "mcp_servers": {
                    "mcp": MCPAccessEndpoint(
                        server_name=SERVER, server_alias="prod", client_config=REMOTE
                    )
                }
            }
        )
        with pytest.raises(MlflowException, match="(not found|No eligible version)") as exc:
            _prepare(store, session, **kwargs)
        assert exc.value.error_code == "RESOURCE_DOES_NOT_EXIST"


@pytest.mark.parametrize(
    "config",
    [
        {"command": "./../server"},
        {"command": "node", "cwd": "./../"},
        {"command": "node", "cwd": "${PLUGIN_ROOT}/../../etc"},
        {"command": "node", "cwd": "${PLUGIN_DATA}/../../etc"},
    ],
)
def test_stdio_paths_cannot_escape_declared_root_even_with_package(store, config):
    with store.ManagedSessionMaker() as session:
        with pytest.raises(MlflowException, match="must stay within its declared root"):
            _prepare(
                store,
                session,
                source=GIT,
                plugin_json=_manifest(),
                mcp_servers={"mcp": MCPAccessEndpoint(client_config={"type": "stdio", **config})},
            )


@pytest.mark.parametrize("with_members", [False, True])
def test_workspace_context_mismatch_fails_before_member_resolution(store, with_members):
    with store.ManagedSessionMaker(read_only=False) as session:
        _skill(session, workspace="team-a")
        skills = ["skills:/review"] if with_members else []
        if store.supports_workspaces:
            with pytest.raises(MlflowException, match="active workspace context") as exc:
                _prepare(store, session, workspace="team-a", skills=skills)
            assert exc.value.error_code == "INVALID_PARAMETER_VALUE"
        else:
            result = _prepare(store, session, workspace="team-a", skills=skills)
            assert result.workspace == "team-a"
            assert result.skills == (("skills:/review/1",) if with_members else ())


@pytest.mark.parametrize(
    ("source", "message"),
    [
        ("./local", "Upload local packages before server-side validation"),
        (ZipSource("https:///plugin.zip"), "ZIP source requires a host"),
        (GitSource("file:///plugin"), "Git package source must be a remote Git locator"),
        (GitSource("git@example.com:"), "SCP-style Git sources require a repository path"),
        ("mlflow-artifacts://host/package", "without authority or query"),
    ],
)
def test_source_errors_keep_actionable_safe_messages(store, source, message):
    with store.ManagedSessionMaker() as session:
        with pytest.raises(MlflowException, match=message) as exc:
            _prepare(store, session, source=source, plugin_json=_manifest())
        assert exc.value.error_code == "INVALID_PARAMETER_VALUE"


@pytest.mark.parametrize(
    ("uri", "message"),
    [
        ("skills:/review/1", "pinned version must exist and must not be deleted"),
        ("skills:/review@prod", "selected alias must resolve"),
        ("skills:/review@latest", "selected alias must resolve"),
    ],
)
def test_missing_skill_version_message_matches_selector(store, uri, message):
    with store.ManagedSessionMaker(read_only=False) as session:
        _skill(session, status="deleted")
        session.add(
            SqlSkillAlias(
                workspace="default", organization="", name="review", alias="prod", version=1
            )
        )
        with pytest.raises(MlflowException, match=message) as exc:
            _prepare(store, session, skills=[uri])
        assert exc.value.error_code == "RESOURCE_DOES_NOT_EXIST"
        assert "Name-only" not in exc.value.message


def test_reserved_alias_casing_matches_each_existing_registry(store):
    with store.ManagedSessionMaker(read_only=False) as session:
        _skill(session)
        _server(session)
        result = _prepare(store, session, skills=["skills:/review@LATEST"])
        assert result.skills == ("skills:/review/1",)
        endpoint = MCPAccessEndpoint(
            server_name=SERVER, server_alias="LATEST", client_config=REMOTE
        )
        with pytest.raises(MlflowException, match="MCP server alias was not found"):
            _prepare(store, session, mcp_servers={"mcp": endpoint})
        endpoint.server_alias = "latest"
        result = _prepare(store, session, mcp_servers={"mcp": endpoint})
        assert result.mcp_servers["mcp"].resolved_version.version == "1.0.0"


def test_stdio_args_and_env_values_are_not_interpreted_as_paths(store):
    config = {
        "type": "stdio",
        "command": "node",
        "args": ["${PLUGIN_ROOT}/../../file"],
        "env": {"OPAQUE": "${PLUGIN_ROOT}/../../file"},
    }
    with store.ManagedSessionMaker() as session:
        result = _prepare(
            store,
            session,
            source=GIT,
            plugin_json=_manifest(),
            mcp_servers={"mcp": MCPAccessEndpoint(client_config=config)},
        )
        assert result.mcp_servers["mcp"].client_config == config
