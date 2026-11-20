import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext
from unittest import mock

import pytest

import mlflow
from mlflow.entities import SkillVersion
from mlflow.exceptions import MlflowException
from mlflow.protos.databricks_pb2 import RESOURCE_DOES_NOT_EXIST
from mlflow.tracing.constant import SpanAttributeKey
from mlflow.tracing.skill_link import SkillAliasCache, SkillAliasCacheKey, resolve_skill_alias
from mlflow.utils.workspace_context import WorkspaceContext, get_request_workspace

from tests.tracing.helper import skip_when_testing_trace_sdk


@pytest.fixture(autouse=True)
def reset_skill_alias_cache():
    SkillAliasCache._reset_instance()
    yield
    SkillAliasCache._reset_instance()


@skip_when_testing_trace_sdk
def test_alias_lookup_is_cached():
    skill_version = SkillVersion(name="code-review", version=7, workspace="team-a")
    with mock.patch("mlflow.MlflowClient") as client_cls:
        client_cls.return_value.get_skill_version_by_alias.return_value = skill_version

        assert resolve_skill_alias(
            name="code-review",
            alias="production",
            organization="acme",
            workspace="team-a",
            cache_ttl_seconds=60,
        ) == (7, "team-a")
        assert resolve_skill_alias(
            name="code-review",
            alias="production",
            organization="acme",
            workspace="team-a",
            cache_ttl_seconds=60,
        ) == (7, "team-a")

    client_cls.return_value.get_skill_version_by_alias.assert_called_once_with(
        name="code-review", alias="production", organization="acme"
    )


@skip_when_testing_trace_sdk
def test_alias_cache_expires():
    skill_version = SkillVersion(name="code-review", version=7, workspace="team-a")
    with mock.patch("mlflow.MlflowClient") as client_cls:
        client_cls.return_value.get_skill_version_by_alias.return_value = skill_version
        with mock.patch("mlflow.tracing.skill_link.time.time", side_effect=[100, 101.1, 101.1]):
            for _ in range(2):
                assert resolve_skill_alias(
                    name="code-review",
                    alias="production",
                    organization="acme",
                    workspace="team-a",
                    cache_ttl_seconds=1,
                ) == (7, "team-a")

    assert client_cls.return_value.get_skill_version_by_alias.call_count == 2


@skip_when_testing_trace_sdk
def test_alias_lookup_honors_shorter_ttl_after_alias_reassignment():
    skill_versions = [
        SkillVersion(name="code-review", version=1, workspace="team-a"),
        SkillVersion(name="code-review", version=2, workspace="team-a"),
    ]
    with (
        mock.patch("mlflow.MlflowClient") as client_cls,
        mock.patch("mlflow.tracing.skill_link.time.time", side_effect=[100, 110, 110]),
    ):
        client_cls.return_value.get_skill_version_by_alias.side_effect = skill_versions

        assert resolve_skill_alias(
            name="code-review",
            alias="production",
            organization="acme",
            workspace="team-a",
            cache_ttl_seconds=60,
        ) == (1, "team-a")
        assert resolve_skill_alias(
            name="code-review",
            alias="production",
            organization="acme",
            workspace="team-a",
            cache_ttl_seconds=1,
        ) == (2, "team-a")

    assert client_cls.return_value.get_skill_version_by_alias.call_count == 2


@skip_when_testing_trace_sdk
def test_alias_lookup_applies_default_ttl_after_longer_override(monkeypatch):
    monkeypatch.setenv("MLFLOW_ALIAS_SKILL_CACHE_TTL_SECONDS", "1")
    skill_versions = [
        SkillVersion(name="code-review", version=1, workspace="team-a"),
        SkillVersion(name="code-review", version=2, workspace="team-a"),
    ]
    with (
        mock.patch("mlflow.MlflowClient") as client_cls,
        mock.patch("mlflow.tracing.skill_link.time.time", side_effect=[100, 110, 110]),
    ):
        client_cls.return_value.get_skill_version_by_alias.side_effect = skill_versions

        assert resolve_skill_alias(
            name="code-review",
            alias="production",
            organization="acme",
            workspace="team-a",
            cache_ttl_seconds=60,
        ) == (1, "team-a")
        assert resolve_skill_alias(
            name="code-review",
            alias="production",
            organization="acme",
            workspace="team-a",
            cache_ttl_seconds=None,
        ) == (2, "team-a")

    assert client_cls.return_value.get_skill_version_by_alias.call_count == 2


def test_alias_cache_removes_expired_entries_when_storing_new_entries():
    cache = SkillAliasCache()
    skill_version = SkillVersion(name="code-review", version=7, workspace="team-a")
    expired_key = SkillAliasCacheKey("tracking", "team-a", "acme", "old", "production")
    live_key = SkillAliasCacheKey("tracking", "team-a", "acme", "live", "production")
    new_key = SkillAliasCacheKey("tracking", "team-a", "acme", "new", "production")

    with mock.patch(
        "mlflow.tracing.skill_link.time.time",
        side_effect=[100, 100, 102],
    ):
        cache.set(expired_key, skill_version, ttl_seconds=1)
        cache.set(live_key, skill_version, ttl_seconds=60)
        cache.set(new_key, skill_version, ttl_seconds=60)

    assert expired_key not in cache._cache
    with mock.patch("mlflow.tracing.skill_link.time.time", return_value=102):
        assert cache.get(live_key, ttl_seconds=60) == skill_version
        assert cache.get(new_key, ttl_seconds=60) == skill_version


def test_alias_cache_evicts_least_recently_used_entry(monkeypatch):
    monkeypatch.setattr("mlflow.tracing.skill_link._SKILL_ALIAS_CACHE_MAX_SIZE", 2)
    cache = SkillAliasCache()
    skill_version = SkillVersion(name="code-review", version=7, workspace="team-a")
    first_key = SkillAliasCacheKey("tracking", "team-a", "acme", "first", "production")
    second_key = SkillAliasCacheKey("tracking", "team-a", "acme", "second", "production")
    third_key = SkillAliasCacheKey("tracking", "team-a", "acme", "third", "production")

    cache.set(first_key, skill_version, ttl_seconds=60)
    cache.set(second_key, skill_version, ttl_seconds=60)
    assert cache.get(first_key, ttl_seconds=60) == skill_version
    cache.set(third_key, skill_version, ttl_seconds=60)

    assert cache.get(first_key, ttl_seconds=60) == skill_version
    assert cache.get(second_key, ttl_seconds=60) is None
    assert cache.get(third_key, ttl_seconds=60) == skill_version


@skip_when_testing_trace_sdk
def test_default_alias_cache_ttl_can_be_disabled_with_environment_variable(monkeypatch):
    monkeypatch.setenv("MLFLOW_ALIAS_SKILL_CACHE_TTL_SECONDS", "0")
    skill_version = SkillVersion(name="code-review", version=7, workspace="team-a")
    with mock.patch("mlflow.MlflowClient") as client_cls:
        client_cls.return_value.get_skill_version_by_alias.return_value = skill_version

        for _ in range(2):
            assert resolve_skill_alias(
                name="code-review",
                alias="production",
                organization="acme",
                workspace="team-a",
                cache_ttl_seconds=None,
            ) == (7, "team-a")

    assert client_cls.return_value.get_skill_version_by_alias.call_count == 2


@skip_when_testing_trace_sdk
def test_zero_ttl_bypasses_cache():
    skill_version = SkillVersion(name="code-review", version=7, workspace="team-a")
    with mock.patch("mlflow.MlflowClient") as client_cls:
        client_cls.return_value.get_skill_version_by_alias.return_value = skill_version

        for _ in range(2):
            assert resolve_skill_alias(
                name="code-review",
                alias="production",
                organization="acme",
                workspace="team-a",
                cache_ttl_seconds=0,
            ) == (7, "team-a")

    assert client_cls.return_value.get_skill_version_by_alias.call_count == 2


@skip_when_testing_trace_sdk
def test_alias_cache_isolated_by_workspace_and_organization():
    skill_versions = [
        SkillVersion(name="code-review", version=1, workspace="team-a"),
        SkillVersion(name="code-review", version=2, workspace="team-b"),
        SkillVersion(name="code-review", version=3, workspace="team-a"),
    ]
    with mock.patch("mlflow.MlflowClient") as client_cls:
        client_cls.return_value.get_skill_version_by_alias.side_effect = skill_versions

        assert resolve_skill_alias(
            name="code-review",
            alias="production",
            organization="acme",
            workspace="team-a",
            cache_ttl_seconds=60,
        ) == (1, "team-a")
        assert resolve_skill_alias(
            name="code-review",
            alias="production",
            organization="acme",
            workspace="team-b",
            cache_ttl_seconds=60,
        ) == (2, "team-b")
        assert resolve_skill_alias(
            name="code-review",
            alias="production",
            organization="other",
            workspace="team-a",
            cache_ttl_seconds=60,
        ) == (3, "team-a")

    assert client_cls.return_value.get_skill_version_by_alias.call_count == 3


@skip_when_testing_trace_sdk
def test_alias_lookup_uses_current_workspace_when_workspace_is_omitted():
    skill_version = SkillVersion(name="code-review", version=7, workspace="team-a")
    with mock.patch("mlflow.MlflowClient") as client_cls:
        client_cls.return_value.get_skill_version_by_alias.return_value = skill_version

        with WorkspaceContext("team-a"):
            assert resolve_skill_alias(
                name="code-review",
                alias="production",
                organization="acme",
                workspace=None,
                cache_ttl_seconds=0,
            ) == (7, "team-a")

    client_cls.return_value.get_skill_version_by_alias.assert_called_once_with(
        name="code-review", alias="production", organization="acme"
    )


@skip_when_testing_trace_sdk
def test_alias_lookup_does_not_override_default_workspace_for_concurrent_calls():
    skill_versions = {
        "team-a": SkillVersion(name="code-review", version=1, workspace="team-a"),
        "team-b": SkillVersion(name="code-review", version=2, workspace="team-b"),
    }
    explicit_lookup_started = threading.Event()
    release_explicit_lookup = threading.Event()
    observed_workspaces = []

    def get_skill_version_by_alias(**_):
        workspace = get_request_workspace()
        observed_workspaces.append(workspace)
        if workspace == "team-b":
            explicit_lookup_started.set()
            assert release_explicit_lookup.wait(timeout=5)
        return skill_versions[workspace]

    with (
        WorkspaceContext("team-a"),
        mock.patch("mlflow.MlflowClient") as client_cls,
        ThreadPoolExecutor(max_workers=2, thread_name_prefix="skill-link-test") as executor,
    ):
        client_cls.return_value.get_skill_version_by_alias.side_effect = get_skill_version_by_alias
        explicit_future = executor.submit(
            resolve_skill_alias,
            name="code-review",
            alias="production",
            organization="acme",
            workspace="team-b",
            cache_ttl_seconds=0,
        )
        assert explicit_lookup_started.wait(timeout=5)
        default_future = executor.submit(
            resolve_skill_alias,
            name="code-review",
            alias="production",
            organization="acme",
            workspace=None,
            cache_ttl_seconds=0,
        )
        assert default_future.result(timeout=5) == (1, "team-a")
        release_explicit_lookup.set()
        assert explicit_future.result(timeout=5) == (2, "team-b")

    assert observed_workspaces == ["team-b", "team-a"]


@skip_when_testing_trace_sdk
@pytest.mark.parametrize("workspaces_enabled", [False, True], ids=["disabled", "enabled"])
def test_alias_lookup_validates_registry_workspace(tmp_path, monkeypatch, workspaces_enabled):
    from mlflow.environment_variables import MLFLOW_ENABLE_WORKSPACES
    from mlflow.store.tracking.sqlalchemy_store import SqlAlchemyStore
    from mlflow.store.tracking.sqlalchemy_workspace_store import WorkspaceAwareSqlAlchemyStore

    monkeypatch.setenv(MLFLOW_ENABLE_WORKSPACES.name, str(workspaces_enabled).lower())
    db_uri = f"sqlite:///{tmp_path / 'mlflow.db'}"
    artifact_uri = (tmp_path / "artifacts").as_uri()
    store_cls = WorkspaceAwareSqlAlchemyStore if workspaces_enabled else SqlAlchemyStore
    store = store_cls(db_uri, artifact_uri)
    previous_tracking_uri = mlflow.get_tracking_uri()

    try:
        workspace = "team-b" if workspaces_enabled else "default"
        workspace_context = WorkspaceContext(workspace) if workspaces_enabled else nullcontext()
        with workspace_context:
            store.create_skill("code-review")
            store.create_skill_version(
                "code-review",
                source_type="git",
                source="https://example.com/skills.git",
            )
            store.set_skill_alias("code-review", "production", 1)

        mlflow.set_tracking_uri(db_uri)
        assert resolve_skill_alias(
            name="code-review",
            alias="production",
            organization="",
            workspace=workspace,
            cache_ttl_seconds=0,
        ) == (1, workspace)

        if not workspaces_enabled:
            with mlflow.start_span("test_span") as span:
                span.link_skill(name="existing-skill", version=1, workspace="default")
                with pytest.raises(MlflowException, match="workspace"):
                    span.link_skill(
                        name="code-review",
                        alias="production",
                        workspace="team-b",
                        cache_ttl_seconds=60,
                    )

                assert not SkillAliasCache.get_instance()._cache
                assert span.get_attribute(SpanAttributeKey.SKILL_NAME) == "existing-skill"
                assert span.get_attribute(SpanAttributeKey.SKILL_VERSION) == 1
                assert span.get_attribute(SpanAttributeKey.SKILL_WORKSPACE) == "default"
                assert span.get_attribute(SpanAttributeKey.SKILL_ORGANIZATION) == ""
                assert span.get_attribute(SpanAttributeKey.SKILL_ROLE) == "activation"
    finally:
        mlflow.set_tracking_uri(previous_tracking_uri)
        store._dispose_engine()


def test_negative_alias_cache_ttl_is_rejected():
    with pytest.raises(MlflowException, match="greater than or equal to 0"):
        resolve_skill_alias(
            name="code-review",
            alias="production",
            organization="acme",
            workspace="team-a",
            cache_ttl_seconds=-1,
        )


@skip_when_testing_trace_sdk
def test_alias_lookup_propagates_registry_error():
    error = MlflowException("Skill alias was not found", error_code=RESOURCE_DOES_NOT_EXIST)
    with mock.patch("mlflow.MlflowClient") as client_cls:
        client_cls.return_value.get_skill_version_by_alias.side_effect = error

        with pytest.raises(MlflowException, match="Skill alias was not found"):
            resolve_skill_alias(
                name="code-review",
                alias="production",
                organization="acme",
                workspace="team-a",
                cache_ttl_seconds=0,
            )
