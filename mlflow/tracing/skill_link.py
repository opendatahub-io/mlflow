import hashlib
import threading
import time
from collections import OrderedDict
from contextlib import nullcontext
from typing import NamedTuple

import mlflow
from mlflow.entities.skill_version import SkillVersion
from mlflow.environment_variables import MLFLOW_ALIAS_SKILL_CACHE_TTL_SECONDS
from mlflow.exceptions import MlflowException
from mlflow.protos.databricks_pb2 import INVALID_PARAMETER_VALUE
from mlflow.utils.validation import _validate_organization_name, _validate_skill_name
from mlflow.utils.workspace_context import ServerWorkspaceContext
from mlflow.utils.workspace_utils import resolve_entity_workspace_name

_SKILL_ALIAS_CACHE_MAX_SIZE = 1024


def _get_skill_cache_namespace(tracking_uri: str) -> str:
    return hashlib.sha256(tracking_uri.encode()).hexdigest()


class SkillAliasCacheKey(NamedTuple):
    tracking_namespace: str
    workspace: str
    organization: str
    name: str
    alias: str


class SkillAliasCache:
    """Thread-safe process-local cache for Skill alias lookups."""

    _instance_lock = threading.RLock()
    _instance: "SkillAliasCache | None" = None

    @classmethod
    def get_instance(cls) -> "SkillAliasCache":
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @classmethod
    def _reset_instance(cls) -> None:
        with cls._instance_lock:
            cls._instance = None

    def __init__(self):
        self._cache: OrderedDict[SkillAliasCacheKey, tuple[SkillVersion, float, float]] = (
            OrderedDict()
        )
        self._lock = threading.RLock()

    def get(self, key: SkillAliasCacheKey, ttl_seconds: float) -> SkillVersion | None:
        with self._lock:
            item = self._cache.get(key)
            if item is None:
                return None
            value, created_at, expiry = item
            now = time.time()
            if now >= expiry or now >= created_at + ttl_seconds:
                self._cache.pop(key, None)
                return None
            self._cache.move_to_end(key)
            return value

    def set(self, key: SkillAliasCacheKey, value: SkillVersion, ttl_seconds: float) -> None:
        with self._lock:
            now = time.time()
            expired_keys = [
                cache_key for cache_key, (_, _, expiry) in self._cache.items() if now >= expiry
            ]
            for expired_key in expired_keys:
                self._cache.pop(expired_key, None)

            self._cache[key] = (value, now, now + ttl_seconds)
            self._cache.move_to_end(key)
            while len(self._cache) > _SKILL_ALIAS_CACHE_MAX_SIZE:
                self._cache.popitem(last=False)


def resolve_skill_alias(
    *,
    name: str,
    alias: str,
    organization: str,
    workspace: str | None,
    cache_ttl_seconds: float | None,
) -> tuple[int, str]:
    """Resolve a Skill alias and return its concrete version and workspace."""
    _validate_skill_name(name)
    _validate_organization_name(organization)
    if not isinstance(alias, str) or not alias:
        raise MlflowException.invalid_parameter_value("Skill alias must be a non-empty string.")

    if cache_ttl_seconds is None:
        cache_ttl_seconds = MLFLOW_ALIAS_SKILL_CACHE_TTL_SECONDS.get()
    if cache_ttl_seconds < 0:
        raise MlflowException(
            "`cache_ttl_seconds` argument must be greater than or equal to 0.",
            error_code=INVALID_PARAMETER_VALUE,
        )

    resolved_workspace = resolve_entity_workspace_name(workspace)
    tracking_uri = mlflow.get_tracking_uri()
    cache_key = SkillAliasCacheKey(
        tracking_namespace=_get_skill_cache_namespace(tracking_uri),
        workspace=resolved_workspace,
        organization=organization,
        name=name,
        alias=alias,
    )
    cache = SkillAliasCache.get_instance()
    if cache_ttl_seconds > 0:
        if cached := cache.get(cache_key, cache_ttl_seconds):
            return cached.version, resolved_workspace

    workspace_context = (
        ServerWorkspaceContext(resolved_workspace) if workspace is not None else nullcontext()
    )
    with workspace_context:
        skill_version = mlflow.MlflowClient().get_skill_version_by_alias(
            name=name, alias=alias, organization=organization
        )

    if cache_ttl_seconds > 0:
        cache.set(cache_key, skill_version, cache_ttl_seconds)
    return skill_version.version, resolved_workspace
