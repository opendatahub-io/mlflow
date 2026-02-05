#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="mlflow-test"
SERVICE_ACCOUNT="mlflow-test-sa"
ROLE_NAME="mlflow-k8s-namespace-access"
ROLE_BINDING_NAME="${ROLE_NAME}"

kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ${SERVICE_ACCOUNT}
  namespace: ${NAMESPACE}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ${ROLE_NAME}
  namespace: ${NAMESPACE}
rules:
  - apiGroups: ["mlflow.kubeflow.org"]
    resources:
      - experiments
      - registeredmodels
      - jobs
      - gateways
    verbs:
      - get
      - list
      - create
      - update
      - delete
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ${ROLE_BINDING_NAME}
  namespace: ${NAMESPACE}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: ${ROLE_NAME}
subjects:
  - kind: ServiceAccount
    name: ${SERVICE_ACCOUNT}
    namespace: ${NAMESPACE}
EOF
