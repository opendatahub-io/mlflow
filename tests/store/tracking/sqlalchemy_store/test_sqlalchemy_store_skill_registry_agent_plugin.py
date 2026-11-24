import pytest

from mlflow.entities.skill import SkillStatus
from mlflow.exceptions import MlflowException
from mlflow.store.tracking.dbmodels.models import SqlAgentPlugin, SqlAgentPluginVersion

pytestmark = pytest.mark.notrackingurimock


def _seed_plugin_version(
    store,
    *,
    version="1.0.0",
    status=SkillStatus.ACTIVE.value,
    created_at=None,
):
    workspace = store._get_active_workspace()
    with store.ManagedSessionMaker(read_only=False) as session:
        plugin = (
            session
            .query(SqlAgentPlugin)
            .filter(
                SqlAgentPlugin.workspace == workspace,
                SqlAgentPlugin.organization == "acme",
                SqlAgentPlugin.name == "developer-tools",
            )
            .one_or_none()
        )
        if plugin is None:
            plugin = SqlAgentPlugin(
                workspace=workspace,
                organization="acme",
                name="developer-tools",
                description="Developer tools",
                created_by="alice",
                last_updated_by="alice",
            )
            session.add(plugin)
        version = SqlAgentPluginVersion(
            workspace=workspace,
            organization="acme",
            name="developer-tools",
            version=version,
            plugin_json={"name": "developer-tools", "version": version},
            status=status,
            created_by="alice",
            last_updated_by="alice",
            created_at=created_at,
            plugin=plugin,
        )
        session.add(version)


def test_create_agent_plugin_persists_parent_metadata(store):
    plugin = store.create_agent_plugin(
        "developer-tools",
        organization="acme",
        description="Developer tools",
        created_by="alice",
    )

    assert plugin.name == "developer-tools"
    assert plugin.organization == "acme"
    assert plugin.description == "Developer tools"
    assert plugin.status is None
    assert plugin.latest_version is None
    assert plugin.created_by == "alice"
    assert plugin.last_updated_by == "alice"
    assert plugin.creation_timestamp is not None

    assert store.get_agent_plugin("developer-tools", organization="acme") == plugin


def test_create_agent_plugin_duplicate_is_scoped_by_organization(store):
    store.create_agent_plugin("developer-tools", organization="acme")
    example = store.create_agent_plugin("developer-tools", organization="example")

    assert example.organization == "example"
    with pytest.raises(MlflowException, match="already exists") as exc:
        store.create_agent_plugin("developer-tools", organization="acme")

    assert exc.value.error_code == "RESOURCE_ALREADY_EXISTS"


def test_update_agent_plugin_preserves_omitted_fields_and_allows_clearing(store):
    created = store.create_agent_plugin(
        "developer-tools",
        description="Developer tools",
        icons=[{"src": "https://example.com/icon.svg"}],
        created_by="alice",
    )

    updated = store.update_agent_plugin("developer-tools", last_updated_by="bob")

    assert updated.description == created.description
    assert updated.icons == created.icons
    assert updated.last_updated_by == "bob"
    assert updated.last_updated_timestamp >= created.last_updated_timestamp

    cleared = store.update_agent_plugin(
        "developer-tools", description=None, icons=None, last_updated_by="carol"
    )

    assert cleared.description is None
    assert cleared.icons is None
    assert cleared.last_updated_by == "carol"


def test_get_agent_plugin_returns_resolved_parent_metadata(store):
    _seed_plugin_version(store)

    plugin = store.get_agent_plugin("developer-tools", organization="acme")

    assert plugin.name == "developer-tools"
    assert plugin.organization == "acme"
    assert plugin.description == "Developer tools"
    assert plugin.latest_version == "1.0.0"
    assert plugin.status is SkillStatus.ACTIVE


def test_get_agent_plugin_version_returns_immutable_snapshot(store):
    _seed_plugin_version(store)

    version = store.get_agent_plugin_version("developer-tools", "1.0.0", organization="acme")

    assert version.name == "developer-tools"
    assert version.version == "1.0.0"
    assert version.plugin_json == {"name": "developer-tools", "version": "1.0.0"}
    assert version.skills == []
    assert version.mcp_servers == {}


def test_get_latest_agent_plugin_version_prefers_active_status(store):
    _seed_plugin_version(store, version="1.0.0", status=SkillStatus.ACTIVE.value)
    _seed_plugin_version(store, version="2.0.0", status=SkillStatus.DEPRECATED.value)

    latest = store.get_latest_agent_plugin_version("developer-tools", organization="acme")

    assert latest.version == "1.0.0"
    assert latest.status is SkillStatus.ACTIVE


def test_get_latest_agent_plugin_version_uses_semver_when_no_active_version(store):
    _seed_plugin_version(store, version="1.0.0", status=SkillStatus.DEPRECATED.value)
    _seed_plugin_version(store, version="2.0.0", status=SkillStatus.DRAFT.value)

    latest = store.get_latest_agent_plugin_version("developer-tools", organization="acme")

    assert latest.version == "2.0.0"
    assert latest.status is SkillStatus.DRAFT


def test_get_latest_agent_plugin_version_respects_prerelease_order(store):
    _seed_plugin_version(store, version="1.0.0-alpha", status=SkillStatus.ACTIVE.value)
    _seed_plugin_version(store, version="1.0.0-beta", status=SkillStatus.ACTIVE.value)

    latest = store.get_latest_agent_plugin_version("developer-tools", organization="acme")

    assert latest.version == "1.0.0-beta"


def test_get_latest_agent_plugin_version_uses_creation_time_for_build_metadata(store):
    _seed_plugin_version(
        store,
        version="1.0.0+old",
        status=SkillStatus.ACTIVE.value,
        created_at=100,
    )
    _seed_plugin_version(
        store,
        version="1.0.0+new",
        status=SkillStatus.ACTIVE.value,
        created_at=200,
    )

    latest = store.get_latest_agent_plugin_version("developer-tools", organization="acme")

    assert latest.version == "1.0.0+new"


def test_get_latest_agent_plugin_version_uses_version_as_equal_time_tiebreaker(store):
    _seed_plugin_version(
        store,
        version="1.0.0+build.1",
        status=SkillStatus.ACTIVE.value,
        created_at=100,
    )
    _seed_plugin_version(
        store,
        version="1.0.0+build.2",
        status=SkillStatus.ACTIVE.value,
        created_at=100,
    )

    latest = store.get_latest_agent_plugin_version("developer-tools", organization="acme")

    assert latest.version == "1.0.0+build.2"


def test_get_latest_agent_plugin_version_raises_when_no_version_resolves(store):
    _seed_plugin_version(store, status=SkillStatus.DELETED.value)

    with pytest.raises(MlflowException, match="No resolved latest version"):
        store.get_latest_agent_plugin_version("developer-tools", organization="acme")

    plugin = store.get_agent_plugin("developer-tools", organization="acme")
    assert plugin.latest_version is None
    assert plugin.status is None
