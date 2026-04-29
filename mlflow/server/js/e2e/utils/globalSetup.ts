import { checkHealth, createWorkspace, E2E_WORKSPACE } from './mlflowClient';

export default async function globalSetup() {
  const healthy = await checkHealth();
  if (!healthy) {
    throw new Error('MLflow server is not reachable. Start it before running e2e tests.');
  }

  process.env.MLFLOW_E2E_SUFFIX = `${Date.now()}`;

  await createWorkspace(E2E_WORKSPACE);
}
