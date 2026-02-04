# Request Auth Provider Plugin

This plugin system allows you to add custom authentication to MLflow tracking requests.

## Usage

Set the `MLFLOW_TRACKING_AUTH` environment variable to the name of your auth provider:

```bash
export MLFLOW_TRACKING_AUTH=kubernetes
```

MLflow will then use that provider to add authentication headers to all outgoing tracking requests.

## Built-in Providers

### Kubernetes

Adds authentication headers for Kubernetes environments.

```bash
export MLFLOW_TRACKING_AUTH=kubernetes
```

This provider automatically adds:

- `X-MLFLOW-WORKSPACE`: The Kubernetes namespace (from service account or kubeconfig)
- `Authorization`: Bearer token (from service account or kubeconfig)

It first checks for in-cluster service account credentials, then falls back to your local kubeconfig.
