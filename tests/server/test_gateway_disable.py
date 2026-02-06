import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from mlflow.server.gateway_api import (
    GATEWAY_DISABLED_MESSAGE,
    gateway_router,
)


def test_gateway_endpoints_return_501_not_implemented(monkeypatch):
    monkeypatch.setenv("MLFLOW_ENABLE_AI_GATEWAY", "false")

    # Create a test app with the gateway router
    app = FastAPI()
    app.include_router(gateway_router)

    client = TestClient(app)

    # Test invocations endpoint
    response = client.post(
        "/gateway/test-endpoint/mlflow/invocations",
        json={"messages": [{"role": "user", "content": "Hello"}]},
    )
    assert response.status_code == 501
    assert response.json()["detail"] == GATEWAY_DISABLED_MESSAGE

    # Test chat completions endpoint
    response = client.post(
        "/gateway/mlflow/v1/chat/completions",
        json={"model": "test", "messages": [{"role": "user", "content": "Hello"}]},
    )
    assert response.status_code == 501
    assert response.json()["detail"] == GATEWAY_DISABLED_MESSAGE

    # Test OpenAI passthrough chat endpoint
    response = client.post(
        "/gateway/openai/v1/chat/completions",
        json={"model": "test", "messages": [{"role": "user", "content": "Hello"}]},
    )
    assert response.status_code == 501
    assert response.json()["detail"] == GATEWAY_DISABLED_MESSAGE

    # Test OpenAI passthrough embeddings endpoint
    response = client.post(
        "/gateway/openai/v1/embeddings",
        json={"model": "test", "input": "Hello"},
    )
    assert response.status_code == 501
    assert response.json()["detail"] == GATEWAY_DISABLED_MESSAGE

    # Test Anthropic passthrough endpoint
    response = client.post(
        "/gateway/anthropic/v1/messages",
        json={"model": "test", "messages": [{"role": "user", "content": "Hello"}]},
    )
    assert response.status_code == 501
    assert response.json()["detail"] == GATEWAY_DISABLED_MESSAGE


@pytest.mark.parametrize(
    "handler_name",
    [
        # Secrets
        "_create_gateway_secret",
        "_list_gateway_secrets",
        # Endpoints
        "_create_gateway_endpoint",
        "_list_gateway_endpoints",
        # Model Definitions
        "_create_gateway_model_definition",
        "_list_gateway_model_definitions",
        # Endpoint Model Mappings
        "_attach_model_to_gateway_endpoint",
        # Endpoint Bindings
        "_create_gateway_endpoint_binding",
        "_list_gateway_endpoint_bindings",
        # Endpoint Tags
        "_set_gateway_endpoint_tag",
        "_delete_gateway_endpoint_tag",
    ],
)
def test_flask_gateway_handlers_return_501_not_implemented(monkeypatch, handler_name):
    monkeypatch.setenv("MLFLOW_ENABLE_AI_GATEWAY", "false")

    from flask import Flask

    from mlflow.server import handlers

    handler = getattr(handlers, handler_name)
    flask_app = Flask(__name__)

    with flask_app.app_context():
        response, status_code = handler()
        assert status_code == 501
        assert response.get_json()["detail"] == GATEWAY_DISABLED_MESSAGE


def test_gateway_endpoints_pass_through_when_enabled():
    app = FastAPI()
    app.include_router(gateway_router)

    client = TestClient(app, raise_server_exceptions=False)

    # With gateway enabled (default), requests should NOT get 501
    response = client.post(
        "/gateway/test-endpoint/mlflow/invocations",
        json={"messages": [{"role": "user", "content": "Hello"}]},
    )
    assert response.status_code != 501
