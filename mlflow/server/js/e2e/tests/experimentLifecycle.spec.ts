import { test, expect } from '../utils/base';
import { testData } from '../fixtures/testData';
import { Timeout, UrlPatterns } from '../utils/const';
import { seedRun, createLoggedModel, deleteExperiment, deleteRegisteredModel } from '../utils/mlflowClient';

const { experimentName, runs, modelName, aliases } = testData.experimentLifecycle;

test('Model training, registry, and lifecycle', async ({
  page,
  experimentsListPage,
  experimentRunsPage,
  compareRunsPage,
  runDetailPage,
  modelRegistryPage,
  modelDetailPage,
  modelVersionDetailPage,
  loggedModelDetailPage,
}) => {
  const suffix = process.env.MLFLOW_E2E_SUFFIX;
  if (!suffix) throw new Error('MLFLOW_E2E_SUFFIX is required');
  const fullExperimentName = `${experimentName}-${suffix}`;
  const fullModelName = `${modelName}-${suffix}`;
  let experimentId: string | undefined;
  const seededRuns: { runId: string; modelId: string; modelName: string; runName: string; f1Score: number }[] = [];

  try {
    await test.step('Create experiment via UI', async () => {
      await experimentsListPage.visit();
      await experimentsListPage.createExperiment(fullExperimentName);
      experimentId = await experimentsListPage.waitForExperimentId();
    });

    await test.step('Seed runs with metrics, params, and logged models', async () => {
      for (const run of runs) {
        const runName = `${run.name}-${suffix}`;
        const runId = await seedRun(experimentId!, runName, run.metrics, run.params);
        const loggedModelName = `${run.name}-model-${suffix}`;
        const modelId = await createLoggedModel(experimentId!, loggedModelName, runId);
        seededRuns.push({ runId, modelId, modelName: loggedModelName, runName, f1Score: run.metrics.f1_score });
      }
    });

    await test.step('Switch to Model training tab and verify all runs appear', async () => {
      await page.reload();
      await experimentRunsPage.switchToModelTraining();
      for (const { runName } of seededRuns) {
        await experimentRunsPage.shouldShowRun(runName);
      }
    });

    await test.step('Select all runs and compare', async () => {
      await experimentRunsPage.selectAllRuns();
      await expect(experimentRunsPage.findCompareButton()).toBeVisible({ timeout: Timeout.medium });
      await experimentRunsPage.clickCompare();
      await compareRunsPage.shouldShowCompareView();
    });

    await test.step('Navigate back and verify each run detail', async () => {
      await page.goBack();
      for (let i = 0; i < seededRuns.length; i++) {
        const { runName } = seededRuns[i];
        const run = runs[i];
        await experimentRunsPage.shouldShowRun(runName);
        await experimentRunsPage.clickRun(runName);
        await expect(page).toHaveURL(UrlPatterns.run);
        for (const key of Object.keys(run.metrics)) {
          await runDetailPage.shouldShowMetric(key);
        }
        for (const key of Object.keys(run.params)) {
          await runDetailPage.shouldShowParam(key);
        }
        await page.goBack();
      }
    });

    await test.step('Switch to Models tab and verify logged models', async () => {
      await experimentRunsPage.switchToModelsTab();
      await expect(page).toHaveURL(UrlPatterns.experimentModels);
      for (const { modelName: name } of seededRuns) {
        await expect(page.getByText(name).first()).toBeVisible({ timeout: Timeout.long });
      }
    });

    await test.step('Click best logged model and register via UI', async () => {
      const best = seededRuns.reduce((a, b) => (a.f1Score >= b.f1Score ? a : b));
      await experimentRunsPage.clickLoggedModel(best.modelName);
      await loggedModelDetailPage.registerAsNewModel(fullModelName);
    });

    await test.step('Navigate to Model Registry and verify registered model', async () => {
      await modelRegistryPage.visit();
      await modelRegistryPage.shouldShowModel(fullModelName);
    });

    await test.step('Click model and verify Version 1', async () => {
      await modelRegistryPage.clickModel(fullModelName);
      await expect(page).toHaveURL(UrlPatterns.model);
      await modelDetailPage.shouldShowVersion('1');
    });

    await test.step('Click version and add primary alias', async () => {
      await modelDetailPage.clickVersion('1');
      await modelVersionDetailPage.addAlias(aliases.primary);
      await modelVersionDetailPage.shouldShowAlias(aliases.primary);
    });

    await test.step('Add secondary alias and verify both', async () => {
      await modelVersionDetailPage.addAnotherAlias(aliases.secondary);
      await modelVersionDetailPage.shouldShowAlias(aliases.primary);
      await modelVersionDetailPage.shouldShowAlias(aliases.secondary);
    });

    await test.step('Delete secondary alias and verify removal', async () => {
      await modelVersionDetailPage.deleteAlias(aliases.secondary);
      await modelVersionDetailPage.shouldNotShowAlias(aliases.secondary);
      await modelVersionDetailPage.shouldShowAlias(aliases.primary);
    });

    await test.step('Delete model via UI and verify removal', async () => {
      await modelRegistryPage.visit();
      await modelRegistryPage.clickModel(fullModelName);
      await modelDetailPage.deleteModel();
      await modelRegistryPage.visit();
      await modelRegistryPage.shouldNotShowModel(fullModelName);
    });
  } finally {
    await deleteRegisteredModel(fullModelName).catch((e) => console.warn('Cleanup:', e.message));
    if (experimentId) {
      await deleteExperiment(experimentId).catch((e) => console.warn('Cleanup:', e.message));
    }
  }
});
