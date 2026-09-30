# ODH Midstream Only

All items that live in this folder are meant to be completely separate from upstream. Any downstream specific items can be placed here to avoid merge conflicts with upstream.

## Creating MLflow CR

You might need to create an MLflow CR if you haven't already. First ensure that the `mlflowoperator` component is set to `Managed` in the RHOAI/ODH DSC resource.

Apply this [YAML](https://github.com/opendatahub-io/mlflow-operator/blob/main/config/samples/mlflow_v1_mlflow.yaml) (with `oc`, in OpenShift, etc.)



## Testing Integrated Changes in ODH Locally

To test for changes that need to be integrated into ODH via module federation, follow these steps (assuming you have oc logged in, mlflow setup, and mlflow working on your cluster):

All in separate terminals:

1. `oc port-forward -n redhat-ods-applications svc/mlflow 5001:8443`
2. In the `js` folder:

```
MLFLOW_PROXY=https://localhost:5001 yarn start:federated
```

3. In the ODH-Dashboard repository

```
cd packages/mlflow

npm i

make dev-start-federated
```

4. In the ODH-Dashboard root
```
npm run dev
```
