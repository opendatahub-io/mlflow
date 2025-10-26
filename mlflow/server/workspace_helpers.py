from __future__ import annotations

import logging
import os
import re

from flask import Response, g, request

from mlflow.entities import Workspace
from mlflow.environment_variables import MLFLOW_ENABLE_WORKSPACES, MLFLOW_WORKSPACE_URI
from mlflow.exceptions import MlflowException
from mlflow.protos import databricks_pb2
from mlflow.store.workspace.utils import get_default_workspace_optional
from mlflow.tracking._workspace import context as workspace_context
from mlflow.tracking._workspace import utils as workspace_utils
from mlflow.tracking._workspace.registry import get_workspace_store
from mlflow.utils.workspace_utils import WORKSPACE_HEADER_NAME

STATIC_PREFIX_ENV_VAR = "_MLFLOW_STATIC_PREFIX"

_logger = logging.getLogger(__name__)

_workspace_store = None

_RBAC_RESOURCE_PREFIX_MAP = {
    "assessments": "experiments",
    "datasets": "experiments",
    "evaluation-datasets": "experiments",
    "experiments": "experiments",
    "artifacts": "experiments",
    "get-artifact": "experiments",
    "get-trace-artifact": "experiments",
    "logged-models": "experiments",
    "logged_models": "experiments",
    "mlflow-artifacts": "experiments",
    "metrics": "experiments",
    "model-version": "registered_models",
    "model-versions": "registered_models",
    "model-version-tags": "registered_models",
    "model-version-aliases": "registered_models",
    "registered-models": "registered_models",
    "registered_models": "registered_models",
    "registered-model-tags": "registered_models",
    "registered-model-aliases": "registered_models",
    "prompts": "registered_models",
    "webhooks": "registered_models",
    "runs": "experiments",
    "scorers": "experiments",
    "traces": "experiments",
    "unified-traces": "experiments",
    "get-online-trace-details": "experiments",
    "upload-artifact": "experiments",
    "workspaces": "workspaces",
    "gateway-proxy": "workspaces",
}

_GRAPHQL_OPERATION_RESOURCE_MAP = {
    # Experiment / Run surfaces
    "MlflowGetExperimentQuery": "experiments",
    "GetExperiment": "experiments",
    "GetRun": "experiments",
    "MlflowGetRunQuery": "experiments",
    "SearchRuns": "experiments",
    "MlflowSearchRunsQuery": "experiments",
    "GetMetricHistoryBulkInterval": "experiments",
    "MlflowGetMetricHistoryBulkIntervalQuery": "experiments",
    # Model Registry surfaces
    "SearchModelVersions": "registered_models",
    "MlflowSearchModelVersionsQuery": "registered_models",
    "GetModelVersion": "registered_models",
    "MlflowGetModelVersionQuery": "registered_models",
    "GetRegisteredModel": "registered_models",
    "MlflowGetRegisteredModelQuery": "registered_models",
    "SearchRegisteredModels": "registered_models",
    "MlflowSearchRegisteredModelsQuery": "registered_models",
}

_DEFAULT_GRAPHQL_RESOURCE = "experiments"


def _strip_api_and_mlflow_prefixes(segments: list[str]) -> list[str]:
    while segments:
        if segments[0] in {"api", "ajax-api"} and len(segments) >= 2:
            version_segment = segments[1]
            if match := re.fullmatch(r"(\d+\.\d+)(.*)", version_segment):
                remainder = match.group(2)
                segments = segments[2:]
                if remainder:
                    segments = [remainder] + segments
                continue
        if segments and segments[0] == "mlflow":
            segments = segments[1:]
            continue
        break
    return segments


def _strip_static_prefix_from_path(path: str) -> str:
    prefix = os.environ.get(STATIC_PREFIX_ENV_VAR)
    if not prefix:
        return path

    prefix = prefix.rstrip("/")
    if prefix and path.startswith(prefix):
        stripped = path[len(prefix) :]
        return stripped if stripped.startswith("/") else f"/{stripped}"
    return path


def _get_request_payload() -> dict[str, object]:
    try:
        payload = request.get_json(silent=True)
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _resolve_rbac_resource_type() -> str | None:
    """
    Determine the RBAC resource type from the request path.

    Examples:
        /api/2.0/mlflow/experiments/search -> "experiments"
        /mlflow/experiments/search -> "experiments"
        /mlflow/graphql -> determined by GraphQL operation name
    """

    path = _strip_static_prefix_from_path(request.path)
    segments = _strip_api_and_mlflow_prefixes([segment for segment in path.split("/") if segment])

    if not segments:
        return None

    if segments[0] == "workspaces":
        return "workspaces"

    base_segment = segments[0]

    # GraphQL requires inspecting the operation name in the request payload
    if base_segment == "graphql":
        payload = _get_request_payload()
        operation_name = payload.get("operationName") if isinstance(payload, dict) else None
        if not operation_name and request.args:
            operation_name = request.args.get("operationName")
        resource_type = (
            _GRAPHQL_OPERATION_RESOURCE_MAP.get(operation_name) if operation_name else None
        )
        return resource_type or _DEFAULT_GRAPHQL_RESOURCE

    return _RBAC_RESOURCE_PREFIX_MAP.get(base_segment)


def _get_workspace_store(workspace_uri: str | None = None, tracking_uri: str | None = None):
    """
    Resolve and cache the workspace store configured for this server process.

    The store is constructed on first invocation using the provided arguments (or their
    environment-derived defaults) and memoized for all subsequent calls, regardless of any new
    ``workspace_uri`` / ``tracking_uri`` values supplied later.
    """
    if not MLFLOW_ENABLE_WORKSPACES.get():
        raise MlflowException(
            "Workspace APIs are not available: multi-tenancy is not enabled on this server",
            databricks_pb2.FEATURE_DISABLED,
        )

    global _workspace_store
    if _workspace_store is not None:
        return _workspace_store

    from mlflow.server import BACKEND_STORE_URI_ENV_VAR

    resolved_tracking_uri = tracking_uri or os.environ.get(BACKEND_STORE_URI_ENV_VAR)
    resolved_workspace_uri = workspace_utils.resolve_workspace_uri(
        workspace_uri, tracking_uri=resolved_tracking_uri
    )
    if resolved_workspace_uri is None:
        raise MlflowException.invalid_parameter_value(
            "Workspace URI could not be resolved. Provide --workspace-store-uri or set "
            f"{MLFLOW_WORKSPACE_URI.name}."
        )

    _workspace_store = get_workspace_store(workspace_uri=resolved_workspace_uri)
    return _workspace_store


def _resolve_request_workspace() -> Workspace | None:
    """Determine the workspace for the current Flask request."""

    if not MLFLOW_ENABLE_WORKSPACES.get():
        return None

    header_workspace = request.headers.get(WORKSPACE_HEADER_NAME)
    header_workspace = header_workspace.strip() if header_workspace else None

    store = _get_workspace_store()

    if header_workspace:
        return store.get_workspace(header_workspace)

    workspace, _ = get_default_workspace_optional(store, logger=_logger)
    return workspace


def _workspace_error_response(exc: Exception) -> Response:
    if isinstance(exc, MlflowException):
        mlflow_exc = exc
    else:
        mlflow_exc = MlflowException(str(exc), error_code=databricks_pb2.INTERNAL_ERROR)

    response = Response(mimetype="application/json")
    response.set_data(mlflow_exc.serialize_as_json())
    response.status_code = mlflow_exc.get_http_status_code()
    return response


def workspace_before_request_handler():
    if not MLFLOW_ENABLE_WORKSPACES.get():
        header_workspace = request.headers.get(WORKSPACE_HEADER_NAME)
        header_workspace = header_workspace.strip() if header_workspace else None
        if header_workspace:
            return _workspace_error_response(
                MlflowException(
                    "Workspace APIs are not available: multi-tenancy is not enabled on this server",
                    error_code=databricks_pb2.FEATURE_DISABLED,
                )
            )
        return None

    try:
        resource_type = _resolve_rbac_resource_type()
    except Exception as exc:
        _logger.exception("Unexpected error while resolving RBAC resource type")
        return _workspace_error_response(exc)

    g.mlflow_rbac_resource_type = resource_type

    try:
        workspace = _resolve_request_workspace()
    except MlflowException as exc:
        return _workspace_error_response(exc)
    except Exception as exc:
        _logger.exception("Unexpected error while resolving workspace")
        return _workspace_error_response(exc)

    if workspace is None and resource_type and resource_type != "workspaces":
        return _workspace_error_response(
            MlflowException.invalid_parameter_value(
                f"Active workspace is required. Set the '{WORKSPACE_HEADER_NAME}' request header "
                "or configure a default workspace."
            )
        )

    workspace_name = workspace.name if workspace else None
    workspace_context.set_current_workspace(workspace_name)
    g.mlflow_workspace = workspace
    return None


def workspace_teardown_request_handler(_exc):
    if MLFLOW_ENABLE_WORKSPACES.get():
        workspace_context.clear_workspace()
        if hasattr(g, "mlflow_workspace"):
            delattr(g, "mlflow_workspace")
        if hasattr(g, "mlflow_rbac_resource_type"):
            delattr(g, "mlflow_rbac_resource_type")


__all__ = [
    "STATIC_PREFIX_ENV_VAR",
    "_GRAPHQL_OPERATION_RESOURCE_MAP",
    "_RBAC_RESOURCE_PREFIX_MAP",
    "_get_workspace_store",
    "_resolve_rbac_resource_type",
    "workspace_before_request_handler",
    "workspace_teardown_request_handler",
]
