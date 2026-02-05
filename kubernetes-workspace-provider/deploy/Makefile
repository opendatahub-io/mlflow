# Deploy MLflow locally using a KinD cluster.

.PHONY: mlflow-k8s-kind
mlflow-k8s-kind:
	# Create kind cluster
	kind create cluster

	# Create SA account to mimic end user. Create role binding for that service account.
	./create-sa-end-user.sh

	# Run MLflow server
	 MLFLOW_FLASK_SERVER_SECRET_KEY="my-secret-key" MLFLOW_LOG_LEVEL="DEBUG" mlflow server   --backend-store-uri sqlite:///mlflow.db   --default-artifact-root mlflow-artifacts:/   --enable-workspaces   --host 127.0.0.1   --workers=1   --port 5000   --app-name kubernetes-auth   --serve-artifacts   --workspace-store-uri kubernetes://
