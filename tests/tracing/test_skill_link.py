from unittest import mock

import pytest

from mlflow.entities import SkillVersion
from mlflow.exceptions import MlflowException
from mlflow.protos.databricks_pb2 import RESOURCE_DOES_NOT_EXIST
from mlflow.tracing.skill_link import SkillAliasCache, SkillAliasCacheKey, resolve_skill_alias
from mlflow.utils.workspace_context import WorkspaceContext

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
        assert cache.get(live_key) == skill_version
        assert cache.get(new_key) == skill_version


def test_alias_cache_evicts_least_recently_used_entry(monkeypatch):
    monkeypatch.setattr("mlflow.tracing.skill_link._SKILL_ALIAS_CACHE_MAX_SIZE", 2)
    cache = SkillAliasCache()
    skill_version = SkillVersion(name="code-review", version=7, workspace="team-a")
    first_key = SkillAliasCacheKey("tracking", "team-a", "acme", "first", "production")
    second_key = SkillAliasCacheKey("tracking", "team-a", "acme", "second", "production")
    third_key = SkillAliasCacheKey("tracking", "team-a", "acme", "third", "production")

    cache.set(first_key, skill_version, ttl_seconds=60)
    cache.set(second_key, skill_version, ttl_seconds=60)
    assert cache.get(first_key) == skill_version
    cache.set(third_key, skill_version, ttl_seconds=60)

    assert cache.get(first_key) == skill_version
    assert cache.get(second_key) is None
    assert cache.get(third_key) == skill_version


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
