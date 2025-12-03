# MLflow Multitenancy Test Plan

## Overview

This test plan covers MLflow Multitenancy functionality using the Kubernetes Workspace Provider. Tests are prioritized based on complexity and impact:

- **P0 (Critical)**: Core security, basic RBAC, authentication - 8 tests
- **P1 (High)**: Multi-workspace scenarios, admin access, resource-level permissions - 11 tests
- **P2 (Medium)**: Caching, configuration, proxies, client integration - 13 tests
- **P3 (Low)**: Non-Kubernetes deployment, edge cases - 7 tests

**Total Test Cases**: 39

---

## P0 - Critical Priority Tests

### Workspace Isolation

| Test ID   | Test Name                                      | Priority | Complexity | Impact | Description                                                      | Prerequisites                            | Test Steps                                                                                                                                                                    | Expected Result                           |
| --------- | ---------------------------------------------- | -------- | ---------- | ------ | ---------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| TC-WS-001 | Basic Workspace Access                         | P0       | Low        | High   | Verify user can only access workspaces they have permissions for | User with permission to namespace-A only | 1. Authenticate with service account token for namespace-A<br>2. Set X-MLFLOW-WORKSPACE header to namespace-A<br>3. Call GET /api/2.0/mlflow/experiments/list                 | Returns experiments from namespace-A only |
| TC-WS-002 | Workspace Isolation - Deny Unauthorized Access | P0       | Low        | High   | Verify user cannot access workspaces without permissions         | User with permission to namespace-A only | 1. Authenticate with service account token for namespace-A<br>2. Set X-MLFLOW-WORKSPACE header to namespace-B (no permission)<br>3. Call GET /api/2.0/mlflow/experiments/list | 403 Forbidden error                       |

### Authentication

| Test ID     | Test Name                            | Priority | Complexity | Impact | Description                                            | Prerequisites                                   | Test Steps                                                                                                                                               | Expected Result                   |
| ----------- | ------------------------------------ | -------- | ---------- | ------ | ------------------------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| TC-AUTH-001 | Service Account Token Authentication | P0       | Low        | High   | Verify authentication with valid service account token | Valid Kubernetes service account in namespace-A | 1. Generate token: `kubectl -n namespace-A create token mlflow-user`<br>2. Send request with Authorization: Bearer &lt;token&gt;<br>3. Access MLflow API | Request succeeds with valid token |
| TC-AUTH-002 | Invalid Token Rejection              | P0       | Low        | High   | Verify invalid/expired tokens are rejected             | None                                            | 1. Use expired or invalid token<br>2. Send request to MLflow API                                                                                         | 401 Unauthorized error            |

### Basic RBAC Enforcement

| Test ID     | Test Name                       | Priority | Complexity | Impact | Description                                                     | Prerequisites                                                                            | Test Steps                                                                                                                                         | Expected Result                 |
| ----------- | ------------------------------- | -------- | ---------- | ------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| TC-RBAC-001 | Read Permission on Experiments  | P0       | Low        | High   | Verify user with read permission can list experiments           | Create role with get/list verbs on experiments resource in mlflow.kubeflow.org API group | 1. Create role with get/list verbs on experiments resource<br>2. Bind role to user for namespace-A<br>3. Call GET /api/2.0/mlflow/experiments/list | Returns experiment list         |
| TC-RBAC-002 | Write Permission on Experiments | P0       | Low        | High   | Verify user with create permission can create experiments       | Role with create verb on experiments resource                                            | 1. Create role with create verb on experiments resource<br>2. Bind role to user for namespace-A<br>3. Call POST /api/2.0/mlflow/experiments/create | Experiment created successfully |
| TC-RBAC-003 | Deny Write Without Permission   | P0       | Low        | High   | Verify user with only read permission cannot create experiments | User has only get/list verbs (no create)                                                 | 1. User has only get/list verbs (no create)<br>2. Call POST /api/2.0/mlflow/experiments/create                                                     | 403 Forbidden error             |

---

## P1 - High Priority Tests

### Multi-Workspace Access

| Test ID   | Test Name                                                    | Priority | Complexity | Impact | Description                                            | Prerequisites                                                                                                                           | Test Steps                                                                                                                                                                                                                                   | Expected Result                                  |
| --------- | ------------------------------------------------------------ | -------- | ---------- | ------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| TC-MW-001 | Single User - Multiple Workspaces with Different Permissions | P1       | Medium     | High   | User with READ on workspace-A and WRITE on workspace-B | User has get/list permissions on namespace-A experiments; User has get/list/create/update/delete permissions on namespace-B experiments | 1. Set workspace to namespace-A<br>2. Attempt to create experiment → Should fail<br>3. List experiments → Should succeed<br>4. Set workspace to namespace-B<br>5. Create experiment → Should succeed<br>6. List experiments → Should succeed | Permissions enforced correctly per workspace     |
| TC-MW-002 | Workspace Switching                                          | P1       | Medium     | Medium | Verify workspace context changes properly              | User has access to namespace-A and namespace-B                                                                                          | 1. Set X-MLFLOW-WORKSPACE to namespace-A<br>2. Create experiment exp-A<br>3. Set X-MLFLOW-WORKSPACE to namespace-B<br>4. List experiments<br>5. Set X-MLFLOW-WORKSPACE back to namespace-A<br>6. List experiments                            | exp-A only visible when workspace is namespace-A |
| TC-MW-003 | Workspace Listing Filtered by Permissions                    | P1       | Medium     | High   | User only sees workspaces they have access to          | 5 namespaces exist, user has permission to 2 of them                                                                                    | 1. Call GET /api/2.0/mlflow/workspaces/list                                                                                                                                                                                                  | Returns only 2 accessible workspaces             |

### Admin Access

| Test ID      | Test Name                                       | Priority | Complexity | Impact | Description                                                                                  | Prerequisites                                           | Test Steps                                                                                                                                                                                                                                                                 | Expected Result                              |
| ------------ | ----------------------------------------------- | -------- | ---------- | ------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| TC-ADMIN-001 | Cluster Admin - List All Workspaces             | P1       | Low        | High   | Cluster admin can see all workspaces                                                         | User with cluster-admin role                            | 1. Authenticate as cluster admin<br>2. Call GET /api/2.0/mlflow/workspaces/list                                                                                                                                                                                            | Returns all MLflow-enabled namespaces        |
| TC-ADMIN-002 | Cluster Admin - Access Any Workspace            | P1       | Low        | High   | Cluster admin can perform operations on any workspace                                        | User with cluster-admin role; Multiple namespaces exist | 1. Authenticate as cluster admin<br>2. For each workspace in [namespace-A, namespace-B, namespace-C]:<br>&nbsp;&nbsp;&nbsp;- Set workspace<br>&nbsp;&nbsp;&nbsp;- Create experiment<br>&nbsp;&nbsp;&nbsp;- List experiments<br>&nbsp;&nbsp;&nbsp;- Create registered model | All operations succeed across all workspaces |
| TC-ADMIN-003 | Cluster Admin - Cannot Create/Delete Workspaces | P1       | Low        | High   | Even admins cannot create/delete workspaces via MLflow (namespace lifecycle managed outside) | User with cluster-admin role                            | 1. Authenticate as cluster admin<br>2. Call POST /api/2.0/mlflow/workspaces/create<br>3. Call DELETE /api/2.0/mlflow/workspaces/delete                                                                                                                                     | 403 Forbidden for both operations            |

### Resource-Level Permissions

| Test ID    | Test Name                                        | Priority | Complexity | Impact | Description                                                            | Prerequisites                                              | Test Steps                                                                                                                            | Expected Result                                                 |
| ---------- | ------------------------------------------------ | -------- | ---------- | ------ | ---------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| TC-RES-001 | Registered Models - Read Permission              | P1       | Medium     | High   | User with read on registeredmodels can list models                     | User has get/list permissions on registeredmodels resource | 1. Grant get/list on registeredmodels resource in mlflow.kubeflow.org API group<br>2. Call GET /api/2.0/mlflow/registered-models/list | Returns registered models                                       |
| TC-RES-002 | Registered Models - Write Permission             | P1       | Medium     | High   | User with create on registeredmodels can register models               | User has create permission on registeredmodels resource    | 1. Grant create on registeredmodels resource<br>2. Call POST /api/2.0/mlflow/registered-models/create                                 | Model registered successfully                                   |
| TC-RES-003 | Jobs - Permission Enforcement                    | P1       | Medium     | Medium | User needs jobs permissions to access job APIs                         | User initially has no permissions on jobs resource         | 1. User has no permissions on jobs resource<br>2. Call job-related API<br>3. Grant get/list on jobs resource<br>4. Retry call         | First call fails with 403, second succeeds                      |
| TC-RES-004 | Prompts Share Permissions with Registered Models | P1       | Medium     | Medium | Verify prompts inherit permissions from registeredmodels resource      | User has registeredmodels permissions                      | 1. Grant permissions on registeredmodels resource<br>2. Call prompt-related APIs                                                      | Prompt operations allowed based on registeredmodels permissions |
| TC-RES-005 | Workspaces - List Permission                     | P1       | Low        | Medium | User with list permission on workspaces can list accessible namespaces | User has list permission on workspaces resource            | 1. Grant list on workspaces resource<br>2. Call GET /api/2.0/mlflow/workspaces/list                                                   | Returns filtered workspace list                                 |

---

## P2 - Medium Priority Tests

### Authorization Caching

| Test ID      | Test Name                      | Priority | Complexity | Impact | Description                                              | Prerequisites                              | Test Steps                                                                                                                                                                        | Expected Result                                                  |
| ------------ | ------------------------------ | -------- | ---------- | ------ | -------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| TC-CACHE-001 | Authorization Decision Caching | P2       | High       | Medium | Verify SelfSubjectAccessReview results are cached        | MLflow server with caching enabled         | 1. Set MLFLOW_K8S_AUTH_CACHE_TTL_SECONDS=60<br>2. Make API call (cache miss)<br>3. Immediately make same API call (cache hit)<br>4. Monitor Kubernetes API calls                  | Second call uses cached authorization decision (no K8s API call) |
| TC-CACHE-002 | Cache Expiration               | P2       | High       | Medium | Cached decisions expire after TTL                        | MLflow server with short cache TTL         | 1. Set MLFLOW_K8S_AUTH_CACHE_TTL_SECONDS=5<br>2. Make API call<br>3. Wait 6 seconds<br>4. Make same API call                                                                      | Second call triggers new Kubernetes authorization check          |
| TC-CACHE-003 | Permission Change During Cache | P2       | High       | Medium | Verify behavior when permissions change during cache TTL | User with permissions that can be modified | 1. User has read permission, make API call<br>2. Revoke permission in Kubernetes<br>3. Immediately retry call (within cache TTL)<br>4. Wait for cache expiration<br>5. Retry call | Call succeeds during cache TTL, fails after expiration           |

### Workspace Configuration

| Test ID    | Test Name                             | Priority | Complexity | Impact | Description                                                 | Prerequisites                                                       | Test Steps                                                                                                                                                                          | Expected Result                                                         |
| ---------- | ------------------------------------- | -------- | ---------- | ------ | ----------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| TC-CFG-001 | Label Selector Filtering              | P2       | Medium     | Medium | Verify only labeled namespaces appear as workspaces         | MLflow server configured with label selector                        | 1. Set MLFLOW_K8S_WORKSPACE_LABEL_SELECTOR=mlflow-enabled=true<br>2. Create namespace-A with label mlflow-enabled=true<br>3. Create namespace-B without label<br>4. List workspaces | Only namespace-A appears in workspace list                              |
| TC-CFG-002 | Namespace Exclusion Globs             | P2       | Medium     | Low    | Custom namespace exclusion patterns work                    | MLflow server with custom exclusion globs                           | 1. Set MLFLOW_K8S_NAMESPACE_EXCLUDE_GLOBS=test-\*,dev-\*<br>2. Create namespaces: test-1, dev-1, prod-1<br>3. List workspaces                                                       | Only prod-1 appears (plus kube-\* and openshift-\* excluded by default) |
| TC-CFG-003 | Default Workspace                     | P2       | Low        | Low    | Default workspace used when none specified                  | MLflow server configured with default workspace                     | 1. Set MLFLOW_K8S_DEFAULT_WORKSPACE=namespace-A<br>2. Make API call without X-MLFLOW-WORKSPACE header<br>3. Verify experiment created in namespace-A                                | Request uses namespace-A context                                        |
| TC-CFG-004 | Workspace Description from Annotation | P2       | Low        | Low    | Workspace descriptions populated from namespace annotations | Namespace with mlflow.kubeflow.org/workspace-description annotation | 1. Create namespace with annotation: mlflow.kubeflow.org/workspace-description="Team A workspace"<br>2. List workspaces<br>3. Verify description field                              | Workspace includes description from annotation                          |

### Proxy Authentication

| Test ID      | Test Name                       | Priority | Complexity | Impact | Description                                       | Prerequisites                        | Test Steps                                                                                                                          | Expected Result                               |
| ------------ | ------------------------------- | -------- | ---------- | ------ | ------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| TC-PROXY-001 | X-Forwarded-Access-Token Header | P2       | Medium     | Medium | Verify proxy can forward tokens via custom header | MLflow deployed behind reverse proxy | 1. Deploy MLflow behind reverse proxy<br>2. Configure proxy to set X-Forwarded-Access-Token header<br>3. Make request through proxy | Authentication succeeds using forwarded token |

### Client Integration

| Test ID       | Test Name                                    | Priority | Complexity | Impact | Description                                   | Prerequisites                  | Test Steps                                                                                                                     | Expected Result                                  |
| ------------- | -------------------------------------------- | -------- | ---------- | ------ | --------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| TC-CLIENT-001 | Python Client - set_workspace()              | P2       | Low        | Medium | Verify Python SDK workspace setting           | MLflow Python client installed | 1. Run: `import mlflow`<br>2. Run: `mlflow.set_workspace("namespace-A")`<br>3. Run: `mlflow.create_experiment("test")`         | Experiment created in namespace-A                |
| TC-CLIENT-002 | Environment Variable - MLFLOW_WORKSPACE      | P2       | Low        | Medium | Verify workspace set via environment variable | MLflow CLI installed           | 1. Run: `export MLFLOW_WORKSPACE=namespace-A`<br>2. Run: `mlflow experiments create --experiment-name test`                    | Experiment created in namespace-A                |
| TC-CLIENT-003 | Environment Variable - MLFLOW_TRACKING_TOKEN | P2       | Low        | Medium | Verify token set via environment variable     | MLflow CLI installed           | 1. Run: `export MLFLOW_TRACKING_TOKEN=$(kubectl -n namespace-A create token mlflow-user)`<br>2. Run: `mlflow experiments list` | Authentication succeeds using token from env var |

### System Namespace Filtering

| Test ID    | Test Name                           | Priority | Complexity | Impact | Description                                              | Prerequisites                               | Test Steps                                                                                              | Expected Result                                         |
| ---------- | ----------------------------------- | -------- | ---------- | ------ | -------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| TC-SYS-001 | Kubernetes System Namespaces Hidden | P2       | Low        | Low    | System namespaces filtered from workspace list           | Cluster admin access                        | 1. List workspaces as cluster admin<br>2. Verify kube-system, kube-public, kube-node-lease not included | System namespaces (kube-\*) filtered out                |
| TC-SYS-002 | OpenShift System Namespaces Hidden  | P2       | Low        | Low    | OpenShift system namespaces filtered from workspace list | OpenShift cluster with cluster admin access | 1. On OpenShift cluster, list workspaces<br>2. Verify openshift-\* namespaces not included              | OpenShift system namespaces (openshift-\*) filtered out |

---

## P3 - Low Priority Tests

### Non-Kubernetes Deployment

| Test ID   | Test Name                                    | Priority | Complexity | Impact | Description                                                          | Prerequisites                                          | Test Steps                                                                                                                                        | Expected Result                                                     |
| --------- | -------------------------------------------- | -------- | ---------- | ------ | -------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| TC-NK-001 | MLflow Without Kubernetes Workspace Provider | P3       | Low        | Low    | MLflow works without workspace provider enabled                      | MLflow deployed without workspace provider             | 1. Deploy MLflow without --app-name kubernetes-auth<br>2. Do not configure workspace-store-uri<br>3. Create experiment                            | MLflow operates in single-tenant mode (no workspace isolation)      |
| TC-NK-002 | Workspace APIs Unavailable Without Provider  | P3       | Low        | Low    | Workspace endpoints return appropriate errors when provider disabled | MLflow deployed without workspace provider             | 1. Deploy MLflow without workspace provider<br>2. Call GET /api/2.0/mlflow/workspaces/list                                                        | 404 Not Found or appropriate error indicating feature not available |
| TC-NK-003 | Migration from Non-Kubernetes to Kubernetes  | P3       | High       | Low    | Existing data accessible after enabling workspace provider           | MLflow with existing experiments in non-workspace mode | 1. Create experiments in non-workspace mode<br>2. Enable workspace provider<br>3. Configure default workspace<br>4. Verify experiments accessible | Legacy experiments mapped to default workspace                      |

### Edge Cases

| Test ID     | Test Name                             | Priority | Complexity | Impact | Description                                                        | Prerequisites                             | Test Steps                                                                                                                                                                                    | Expected Result                                                |
| ----------- | ------------------------------------- | -------- | ---------- | ------ | ------------------------------------------------------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| TC-EDGE-001 | Very Long Namespace Names             | P3       | Low        | Low    | Verify handling of maximum length namespace names                  | Ability to create namespaces              | 1. Create namespace with 63-character name (Kubernetes limit)<br>2. Enable as MLflow workspace<br>3. Perform operations                                                                       | Works correctly with max-length namespace                      |
| TC-EDGE-002 | Special Characters in Workspace Names | P3       | Low        | Low    | Verify handling of valid Kubernetes special characters             | Ability to create namespaces              | 1. Create namespace with dashes, dots (valid K8s chars)<br>2. Test workspace access<br>3. Verify workspace name properly handled                                                              | Workspace name properly encoded/decoded in API calls           |
| TC-EDGE-003 | Concurrent Workspace Switches         | P3       | Medium     | Low    | Verify no context leakage between concurrent requests              | Multi-threaded test harness               | 1. Launch multiple threads<br>2. Each thread switches workspace rapidly<br>3. Verify each request uses correct workspace context                                                              | No context leakage; each request isolated to its workspace     |
| TC-EDGE-004 | Workspace Watch Loop Resilience       | P3       | High       | Low    | Verify workspace provider recovers from Kubernetes API disruptions | Ability to disrupt/restore Kubernetes API | 1. Monitor workspace watch loop<br>2. Temporarily disrupt Kubernetes API connection<br>3. Create new namespace during disruption<br>4. Restore connection<br>5. Verify new namespace detected | Workspace list updates after reconnection; watch loop recovers |

---

## Test Environment Requirements

### Infrastructure

- **Kubernetes Cluster**: Version 1.24 or higher
- **kubectl**: Version 1.24 or higher
- **MLflow**: Version 3.6 or higher with workspaces feature enabled
- **Backend Storage**: PostgreSQL (recommended) or MySQL
- **Artifact Storage**: S3-compatible storage (MinIO, AWS S3, etc.)

### MLflow Configuration

```bash
mlflow server \
  --backend-store-uri postgresql://user:pass@host:5432/mlflow \
  --default-artifact-root s3://mlflow-artifacts \
  --enable-workspaces \
  --workspace-store-uri "kubernetes://?label_selector=mlflow-enabled%3Dtrue" \
  --app-name kubernetes-auth
```

### Kubernetes RBAC Setup

**MLflow Server Service Account** (requires cluster-level permissions):

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: mlflow-k8s-workspace-provider
rules:
  - apiGroups: [""]
    resources: ["namespaces"]
    verbs: ["list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: mlflow-workspace-provider
subjects:
  - kind: ServiceAccount
    name: mlflow-server
    namespace: mlflow
roleRef:
  kind: ClusterRole
  name: mlflow-k8s-workspace-provider
  apiGroup: rbac.authorization.k8s.io
```

**Test User Roles** (namespace-scoped):

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: mlflow-reader
  namespace: namespace-A
rules:
  - apiGroups: ["mlflow.kubeflow.org"]
    resources: ["experiments", "registeredmodels", "workspaces", "jobs"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: mlflow-writer
  namespace: namespace-B
rules:
  - apiGroups: ["mlflow.kubeflow.org"]
    resources: ["experiments", "registeredmodels", "workspaces", "jobs"]
    verbs: ["get", "list", "create", "update", "delete"]
```

### Test Data Setup

**Create Test Namespaces**:

```bash
# Workspace A - Reader access
kubectl create namespace namespace-A
kubectl label namespace namespace-A mlflow-enabled=true
kubectl annotate namespace namespace-A mlflow.kubeflow.org/workspace-description="Team A Development"

# Workspace B - Writer access
kubectl create namespace namespace-B
kubectl label namespace namespace-B mlflow-enabled=true
kubectl annotate namespace namespace-B mlflow.kubeflow.org/workspace-description="Team B Production"

# Workspace C - Admin only
kubectl create namespace namespace-C
kubectl label namespace namespace-C mlflow-enabled=true
```

**Create Test Service Accounts**:

```bash
# Reader user for namespace-A
kubectl create serviceaccount mlflow-reader -n namespace-A
kubectl create rolebinding mlflow-reader-binding -n namespace-A \
  --role=mlflow-reader --serviceaccount=namespace-A:mlflow-reader

# Writer user for namespace-B
kubectl create serviceaccount mlflow-writer -n namespace-B
kubectl create rolebinding mlflow-writer-binding -n namespace-B \
  --role=mlflow-writer --serviceaccount=namespace-B:mlflow-writer

# Multi-workspace user
kubectl create serviceaccount mlflow-multiuser -n default
kubectl create rolebinding mlflow-multiuser-reader-A -n namespace-A \
  --role=mlflow-reader --serviceaccount=default:mlflow-multiuser
kubectl create rolebinding mlflow-multiuser-writer-B -n namespace-B \
  --role=mlflow-writer --serviceaccount=default:mlflow-multiuser
```

---

## Test Execution Guidelines

### Recommended Execution Order

1. **Phase 1: P0 Tests** - Establish core security and functionality
2. **Phase 2: P1 Tests** - Validate complex multi-workspace scenarios
3. **Phase 3: P2 Tests** - Verify advanced features and configurations
4. **Phase 4: P3 Tests** - Cover edge cases and fallback scenarios

### Complexity Assessment

- **Low Complexity**: Single workspace, single permission, straightforward setup (execution time: 1-5 minutes)
- **Medium Complexity**: Multiple workspaces, permission combinations, requires coordination (execution time: 5-15 minutes)
- **High Complexity**: Caching behavior, concurrent operations, failure/recovery scenarios (execution time: 15-30 minutes)

### Impact Assessment

- **High Impact**: Security violations possible, core functionality broken, data isolation compromised
- **Medium Impact**: Degraded user experience, performance issues, common workflows impacted
- **Low Impact**: Edge cases, rare scenarios, cosmetic/informational issues

### Success Criteria

- **P0 Tests**: 100% pass rate required (blocking for release)
- **P1 Tests**: 95% pass rate required (critical bugs must be fixed)
- **P2 Tests**: 90% pass rate required (known issues acceptable with workarounds)
- **P3 Tests**: 80% pass rate required (edge cases may be documented as limitations)

---

## Test Automation Considerations

### Automation Priority

1. **High Priority for Automation**:

   - All P0 tests (regression safety)
   - TC-MW-001, TC-MW-003 (common multi-workspace scenarios)
   - TC-ADMIN-001, TC-ADMIN-002 (admin workflows)
   - TC-RBAC-001 through TC-RBAC-003 (permission enforcement)

2. **Medium Priority for Automation**:

   - P2 caching tests (performance validation)
   - P2 configuration tests (CI/CD validation)
   - Client integration tests (SDK compatibility)

3. **Manual Testing Preferred**:
   - Edge cases (TC-EDGE-\*)
   - Migration scenarios (TC-NK-003)
   - Resilience tests (TC-EDGE-004)

### Test Framework Recommendations

- **Python**: pytest with Kubernetes Python client
- **API Testing**: requests library with token management
- **Kubernetes Operations**: kubectl or kubernetes Python client
- **Assertion Library**: pytest assertions or custom matchers

---

## Appendix: Priority Summary

| Priority Level | Test Count | Primary Focus                                                 | Execution Time Estimate |
| -------------- | ---------- | ------------------------------------------------------------- | ----------------------- |
| P0 - Critical  | 8          | Core security, authentication, basic RBAC                     | 30-45 minutes           |
| P1 - High      | 11         | Multi-workspace access, admin scenarios, resource permissions | 1-2 hours               |
| P2 - Medium    | 13         | Caching, configuration, proxies, client integration           | 1.5-2.5 hours           |
| P3 - Low       | 7          | Non-Kubernetes deployment, edge cases                         | 1-2 hours               |
| **Total**      | **39**     | **Complete multitenancy validation**                          | **4-7 hours**           |

---

## Notes

1. **Token Generation**: Service account tokens can be generated using:

   ```bash
   kubectl create token <service-account-name> -n <namespace> --duration=1h
   ```

2. **Authorization Cache**: Default TTL is 300 seconds (5 minutes). Adjust via `MLFLOW_K8S_AUTH_CACHE_TTL_SECONDS` environment variable.

3. **Workspace Context**: Can be set via:

   - HTTP Header: `X-MLFLOW-WORKSPACE: <namespace>`
   - Python SDK: `mlflow.set_workspace("<namespace>")`
   - Environment: `export MLFLOW_WORKSPACE=<namespace>`

4. **API Group**: All custom resources use the `mlflow.kubeflow.org` API group for RBAC evaluation.

5. **Namespace Lifecycle**: Workspaces (namespaces) must be created/deleted via kubectl, not through MLflow APIs.
