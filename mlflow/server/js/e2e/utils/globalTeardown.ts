import { deleteExperiment, deleteWorkspace, searchExperiments, E2E_WORKSPACE } from './mlflowClient';

export default async function globalTeardown() {
  try {
    const experiments = await searchExperiments();
    for (const exp of experiments) {
      if (exp.name.startsWith('e2e-')) {
        await deleteExperiment(exp.experiment_id).catch(() => {});
      }
    }
  } catch {
    // best-effort
  }

  await deleteWorkspace(E2E_WORKSPACE).catch(() => {});
}
