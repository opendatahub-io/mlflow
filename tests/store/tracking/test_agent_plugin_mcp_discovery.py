# Exercise the reusable discovery query against real endpoint/member rows.
# The parent projection demonstrates authorization before pagination; concrete
# search methods and permission policy are implemented separately.

import pytest
import sqlalchemy as sa
from sqlalchemy.dialects import mssql, mysql, postgresql, sqlite

from mlflow.entities import SkillStatus
from mlflow.exceptions import MlflowException
from mlflow.store.tracking.dbmodels.models import (
    SqlAgentPlugin,
    SqlAgentPluginVersion,
    SqlAgentPluginVersionMCPMember,
    SqlAgentPluginVersionMember,
    SqlMCPAccessEndpoint,
    SqlMCPServer,
    SqlSkill,
    SqlSkillVersion,
)
from mlflow.store.tracking.skill_registry_filter import (
    apply_member_name_filter,
    build_agent_plugin_mcp_member_query,
    paginate_results,
)
from mlflow.store.tracking.skill_registry_pagination import SkillRegistryPaginationToken
from mlflow.store.tracking.sqlalchemy_store import SqlAlchemyStore
from mlflow.utils.search_utils import SearchAgentPluginUtils


@pytest.fixture
def store(tmp_path, db_uri):
    return SqlAlchemyStore(db_uri, (tmp_path / "artifacts").as_uri())


def _add_endpoint(session, endpoint_id, server_name=None, workspace="default"):
    if server_name and session.get(SqlMCPServer, (workspace, server_name)) is None:
        session.add(SqlMCPServer(workspace=workspace, name=server_name))
        session.flush()
    endpoint = SqlMCPAccessEndpoint(id=endpoint_id, workspace=workspace, server_name=server_name)
    session.add(endpoint)
    session.flush()
    return endpoint


def _add_version(session, name, version, members, workspace="default", status=SkillStatus.ACTIVE):
    if session.get(SqlAgentPlugin, (workspace, "acme", name)) is None:
        session.add(SqlAgentPlugin(workspace=workspace, organization="acme", name=name))
        session.flush()
    session.add(
        SqlAgentPluginVersion(
            workspace=workspace,
            organization="acme",
            name=name,
            version=version,
            status=status.value,
            plugin_json={"name": name, "version": version},
        )
    )
    session.flush()
    for local_name, endpoint_id in members.items():
        session.add(
            SqlAgentPluginVersionMCPMember(
                plugin_workspace=workspace,
                plugin_organization="acme",
                plugin_name=name,
                plugin_version=version,
                member_name=local_name,
                access_endpoint_id=endpoint_id,
            )
        )
    session.flush()


def _query(filter_string, *, workspace="default", readable_ids=(), dialect="sqlite"):
    return build_agent_plugin_mcp_member_query(
        SearchAgentPluginUtils.parse_search_filter(filter_string),
        workspace=workspace,
        dialect=dialect,
        readable_endpoint_ids=sa.select(SqlMCPAccessEndpoint.id).where(
            SqlMCPAccessEndpoint.id.in_(readable_ids)
        ),
    )


def test_mcp_predicates_match_the_same_member_and_version(store):
    with store.ManagedSessionMaker(read_only=False) as session:
        _add_endpoint(session, "github-endpoint", "github")
        _add_endpoint(session, "other-endpoint", "other")
        _add_version(session, "match", "1.0.0", {"local": "github-endpoint"})
        _add_version(
            session,
            "split-members",
            "1.0.0",
            {
                "local": "other-endpoint",
                "different": "github-endpoint",
            },
        )
        _add_version(session, "split-versions", "1.0.0", {"local": "other-endpoint"})
        _add_version(session, "split-versions", "2.0.0", {"different": "github-endpoint"})
        query = _query(
            "mcp_member_name = 'local' AND mcp_server_name = 'github'",
            readable_ids=["github-endpoint", "other-endpoint"],
        )
        assert session.execute(query).all() == [("default", "acme", "match", "1.0.0")]


def test_mcp_discovery_uses_current_endpoint_association_and_preserves_missing_members(store):
    with store.ManagedSessionMaker(read_only=False) as session:
        endpoint = _add_endpoint(session, "endpoint", "github")
        session.add(SqlMCPServer(workspace="default", name="gitlab"))
        _add_version(session, "plugin", "1.0.0", {"local": "endpoint"})
        local = _query("mcp_member_name = 'local'")
        github = _query("mcp_server_name = 'github'", readable_ids=["endpoint"])
        gitlab = _query("mcp_server_name = 'gitlab'", readable_ids=["endpoint"])
        expected = [("default", "acme", "plugin", "1.0.0")]
        assert session.execute(github).all() == expected
        assert session.execute(gitlab).all() == []

        endpoint.server_name = "gitlab"
        session.flush()
        assert session.execute(github).all() == []
        assert session.execute(gitlab).all() == expected

        endpoint.server_name = None
        session.flush()
        assert session.execute(gitlab).all() == []
        assert session.execute(local).all() == expected

        session.delete(endpoint)
        session.flush()
        assert session.execute(github).all() == []
        assert session.execute(gitlab).all() == []
        assert session.execute(local).all() == expected
        assert session.query(SqlAgentPluginVersionMCPMember).count() == 1


def test_mcp_server_discovery_requires_readable_endpoint(store):
    with store.ManagedSessionMaker(read_only=False) as session:
        _add_endpoint(session, "hidden", "github")
        _add_version(session, "plugin", "1.0.0", {"local": "hidden"})
        assert session.execute(_query("mcp_server_name = 'github'")).all() == []
        assert session.execute(_query("mcp_member_name = 'local'")).all() == [
            ("default", "acme", "plugin", "1.0.0")
        ]


def test_server_discovery_rejects_missing_read_scope():
    with pytest.raises(MlflowException, match="readable access endpoint IDs"):
        build_agent_plugin_mcp_member_query(
            SearchAgentPluginUtils.parse_search_filter("mcp_server_name = 'github'"),
            workspace="default",
            dialect="sqlite",
        )


@pytest.mark.parametrize(
    "filter_string", ["", "member_name = 'github'", "tags.mcp_member_name = 'github'"]
)
def test_mcp_query_rejects_non_membership_filters(filter_string):
    with pytest.raises(MlflowException, match="MCP member filter"):
        _query(filter_string)


def test_mcp_discovery_preserves_candidate_versions_for_authorization_and_pagination(store):
    with store.ManagedSessionMaker(read_only=False) as session:
        _add_endpoint(session, "github-endpoint", "github")
        for name in ("hidden-history", "visible", "visible-next"):
            _add_version(
                session, name, "1.0.0", {"one": "github-endpoint", "two": "github-endpoint"}
            )
            _add_version(session, name, "2.0.0", {})
        _add_version(session, "visible", "3.0.0", {"one": "github-endpoint"})
        filter_string = "mcp_server_name = 'github'"
        query = _query(filter_string, readable_ids=["github-endpoint"])
        assert sorted((r.name, r.version) for r in session.execute(query)) == [
            ("hidden-history", "1.0.0"),
            ("visible", "1.0.0"),
            ("visible", "3.0.0"),
            ("visible-next", "1.0.0"),
        ]
        # Simulate READ access to the latest hidden-history version only: its
        # readable latest version cannot authorize its historical membership.
        authorized = query.where(
            sa.or_(
                SqlAgentPluginVersion.name != "hidden-history",
                SqlAgentPluginVersion.version == "2.0.0",
            )
        ).subquery()
        parents = sa.select(
            authorized.c.workspace, authorized.c.organization, authorized.c.name
        ).distinct()
        parents = parents.order_by(
            authorized.c.workspace, authorized.c.organization, authorized.c.name
        )
        scope = "workspace:default:agent_plugins"
        offset = 0
        names = []
        while True:
            rows = session.execute(parents.offset(offset).limit(2)).all()
            page = paginate_results(rows, 1, offset, filter_string, ["name ASC"], scope)
            names.extend(r.name for r in page)
            if page.token is None:
                break
            token = SkillRegistryPaginationToken.decode(page.token)
            token.validate(filter_string, ["name ASC"], scope)
            offset = token.offset
        assert names == ["visible", "visible-next"]


@pytest.mark.parametrize("changed", ["filter", "workspace", "surface"])
def test_mcp_pagination_token_is_query_bound(changed):
    original = "mcp_server_name = 'github'"
    scope = "workspace:team-a:agent_plugins"
    token = SkillRegistryPaginationToken.decode(
        SkillRegistryPaginationToken(original, None, 1, scope).encode()
    )
    if changed == "filter":
        original = "mcp_server_name = 'gitlab'"
    elif changed == "workspace":
        scope = "workspace:team-b:agent_plugins"
    else:
        scope = "workspace:team-a:agent_plugin_versions:acme/plugin"
    with pytest.raises(MlflowException, match="different"):
        token.validate(original, None, scope)


def test_mcp_discovery_scopes_versions_and_endpoint_joins_to_workspace(store):
    with store.ManagedSessionMaker(read_only=False) as session:
        _add_endpoint(session, "team-a-endpoint", "github", workspace="team-a")
        _add_endpoint(session, "team-b-endpoint", "gitlab", workspace="team-b")
        _add_version(session, "plugin", "1.0.0", {"local": "team-a-endpoint"}, workspace="team-a")
        _add_version(session, "plugin", "1.0.0", {"local": "team-b-endpoint"}, workspace="team-b")
        # There is no endpoint FK: a stale/invalid cross-workspace reference
        # must still not disclose the endpoint's server association.
        _add_version(
            session, "invalid-reference", "1.0.0", {"local": "team-a-endpoint"}, workspace="team-b"
        )
        kwargs = {"readable_ids": ["team-a-endpoint", "team-b-endpoint"]}
        assert session.execute(
            _query("mcp_server_name = 'github'", workspace="team-a", **kwargs)
        ).all() == [("team-a", "acme", "plugin", "1.0.0")]
        assert (
            session.execute(
                _query("mcp_server_name = 'github'", workspace="team-b", **kwargs)
            ).all()
            == []
        )


@pytest.mark.parametrize("status", list(SkillStatus))
def test_mcp_discovery_preserves_plugin_lifecycle_rules(store, status):
    with store.ManagedSessionMaker(read_only=False) as session:
        _add_version(session, "plugin", "1.0.0", {"local": "missing-endpoint"}, status=status)
        expected = [] if status == SkillStatus.DELETED else [("default", "acme", "plugin", "1.0.0")]
        assert session.execute(_query("mcp_member_name = 'local'")).all() == expected


@pytest.mark.parametrize("status", list(SkillStatus))
def test_mcp_discovery_preserves_skill_withdrawal_rules_and_separate_namespaces(store, status):
    with store.ManagedSessionMaker(read_only=False) as session:
        session.add(SqlSkill(workspace="default", organization="acme", name="code-review"))
        session.flush()
        session.add(
            SqlSkillVersion(
                workspace="default",
                organization="acme",
                name="code-review",
                version=1,
                status=status.value,
            )
        )
        _add_version(session, "plugin", "1.0.0", {"local": "missing-endpoint"})
        session.add(
            SqlAgentPluginVersionMember(
                plugin_workspace="default",
                plugin_organization="acme",
                plugin_name="plugin",
                plugin_version="1.0.0",
                member_organization="acme",
                member_name="code-review",
                member_version=1,
            )
        )
        session.flush()
        expected = [] if status == SkillStatus.DELETED else [("default", "acme", "plugin", "1.0.0")]
        assert session.execute(_query("mcp_member_name = 'local'")).all() == expected
        assert session.execute(_query("mcp_member_name = 'code-review'")).all() == []
        assert (
            apply_member_name_filter(session.query(SqlAgentPlugin), "local", "sqlite").all() == []
        )


@pytest.mark.parametrize(
    "dialect", [sqlite.dialect(), postgresql.dialect(), mysql.dialect(), mssql.dialect()]
)
def test_mcp_query_compiles_with_case_sensitive_comparisons(dialect):
    query = _query(
        "mcp_member_name = 'GitHub' AND mcp_server_name = 'GitHub'",
        readable_ids=["endpoint"],
        dialect=dialect.name,
    )
    sql = str(query.compile(dialect=dialect, compile_kwargs={"literal_binds": True}))
    assert "EXISTS" in sql
    assert (
        "mcp_access_endpoints.workspace = agent_plugin_version_mcp_members.plugin_workspace" in sql
    )
    if dialect.name == "mysql":
        assert "BINARY" in sql
    elif dialect.name == "mssql":
        assert "COLLATE" in sql
