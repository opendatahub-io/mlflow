"""Workspace-related utility constants and helpers."""

from __future__ import annotations

from mlflow.environment_variables import MLFLOW_WORKSPACE, MLFLOW_WORKSPACE_STORE_URI

_workspace_store_uri: str | None = None

DEFAULT_WORKSPACE_NAME = "default"
WORKSPACE_HEADER_NAME = "X-MLFLOW-WORKSPACE"


def _normalize_workspace(workspace: str | None) -> str | None:
    if workspace is None:
        return None
    value = workspace.strip()
    return value or None


def resolve_entity_workspace_name(workspace: str | None) -> str:
    """
    Determine the workspace to associate with client-facing entities.

    Preference order:
      1. Explicit ``workspace`` argument provided by the backend store
      2. Active workspace bound via ``mlflow.set_workspace`` (context var)
      3. ``MLFLOW_WORKSPACE`` environment variable
      4. ``DEFAULT_WORKSPACE_NAME``
    """

    candidate = _normalize_workspace(workspace)
    if candidate:
        return candidate

    from mlflow.utils.workspace_context import get_current_workspace

    candidate = _normalize_workspace(get_current_workspace())
    if candidate:
        return candidate

    candidate = _normalize_workspace(MLFLOW_WORKSPACE.get())
    if candidate:
        return candidate

    return DEFAULT_WORKSPACE_NAME


def set_workspace_store_uri(uri: str | None) -> None:
    """Set the global workspace provider URI override."""

    global _workspace_store_uri
    _workspace_store_uri = uri
    if uri is None:
        MLFLOW_WORKSPACE_STORE_URI.unset()
    else:
        MLFLOW_WORKSPACE_STORE_URI.set(uri)


def get_workspace_store_uri() -> str | None:
    """Get the current workspace provider URI, if any has been set."""
    return _workspace_store_uri or MLFLOW_WORKSPACE_STORE_URI.get()


__all__ = [
    "DEFAULT_WORKSPACE_NAME",
    "WORKSPACE_HEADER_NAME",
    "resolve_entity_workspace_name",
    "set_workspace_store_uri",
    "get_workspace_store_uri",
]
