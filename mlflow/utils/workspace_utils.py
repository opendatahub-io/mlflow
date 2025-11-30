"""Workspace-related utility constants and helpers."""

from __future__ import annotations

from mlflow.environment_variables import MLFLOW_WORKSPACE

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


__all__ = ["DEFAULT_WORKSPACE_NAME", "WORKSPACE_HEADER_NAME", "resolve_entity_workspace_name"]
