import { test, expect } from '../utils/base';
import { testData } from '../fixtures/testData';
import { Timeout } from '../utils/const';
import {
  createExperiment,
  createRun,
  logMetric,
  updateRun,
  deleteExperiment,
  setExperimentTag,
  seedTrace,
  deleteTraces,
  setTraceTag,
  createAssessment,
  createLoggedModel,
  registerScorer,
} from '../utils/mlflowClient';

const {
  experimentName,
  experimentKindTag,
  experimentKindValue,
  sessionMetadataKey,
  traces,
  datasetName,
  tagKey,
  tagValue,
} = testData.genaiObservability;

test('GenAI observability and evaluation cycle', async ({
  page,
  tracesTabPage,
  sessionsTabPage,
  datasetsTabPage,
  evaluationRunsTabPage,
  agentVersionsTabPage,
  scorersTabPage,
}) => {
  const suffix = process.env.MLFLOW_E2E_SUFFIX;
  if (!suffix) throw new Error('MLFLOW_E2E_SUFFIX is required');
  const fullExperimentName = `${experimentName}-${suffix}`;
  const fullDatasetName = `${datasetName}-${suffix}`;
  let experimentId: string | undefined;
  const seededTraces: { requestId: string; input: string }[] = [];

  try {
    await test.step('Create GenAI experiment via API', async () => {
      experimentId = await createExperiment(fullExperimentName);
      await setExperimentTag(experimentId, experimentKindTag, experimentKindValue);
    });

    await test.step('Seed traces with session grouping', async () => {
      for (const trace of traces) {
        const tags: { key: string; value: string }[] = [];
        if (trace.sessionId) {
          tags.push({ key: sessionMetadataKey, value: trace.sessionId });
        }
        const requestId = await seedTrace(experimentId!, trace.input, trace.output, tags);
        seededTraces.push({ requestId, input: trace.input });
      }
    });

    await test.step('Attach user feedback assessments to all traces', async () => {
      for (let i = 0; i < seededTraces.length; i++) {
        await createAssessment(seededTraces[i].requestId, 'correctness', i > 0);
      }
    });

    await test.step('Tag first trace via API', async () => {
      await setTraceTag(seededTraces[0].requestId, tagKey, tagValue);
    });

    await test.step('Register a scorer via API', async () => {
      await registerScorer(experimentId!, `e2e-scorer-${suffix}`, JSON.stringify({ type: 'llm' }));
    });

    await test.step('Verify scorer on Scorers tab', async () => {
      await scorersTabPage.visit(experimentId!);
      await scorersTabPage.shouldShowScorer(`e2e-scorer-${suffix}`);
    });

    await test.step('Verify traces on Traces tab', async () => {
      await tracesTabPage.visit(experimentId!);
      await tracesTabPage.shouldShowTrace(seededTraces[0].input);
    });

    await test.step('Open trace drawer and verify content', async () => {
      await tracesTabPage.clickTrace(seededTraces[0].input);
      await tracesTabPage.shouldShowDrawer();
      await tracesTabPage.shouldShowDrawerContent(seededTraces[0].input);
    });

    await test.step('Close drawer and verify Sessions tab', async () => {
      await page.keyboard.press('Escape');
      await sessionsTabPage.navigateToSessions();
      await sessionsTabPage.shouldShowContent();
    });

    await test.step('Create evaluation dataset via UI', async () => {
      await datasetsTabPage.navigateToDatasets();
      await datasetsTabPage.createDataset(fullDatasetName);
      await datasetsTabPage.shouldShowDataset(fullDatasetName);
    });

    await test.step('Seed an agent version from a run', async () => {
      const agentRunId = await createRun(experimentId!, `e2e-agent-run-${suffix}`);
      await updateRun(agentRunId, 'FINISHED');
      await createLoggedModel(experimentId!, `e2e-agent-${suffix}`, agentRunId);
    });

    await test.step('Verify agent version on Agent versions tab', async () => {
      await agentVersionsTabPage.navigateToAgentVersions();
      await agentVersionsTabPage.shouldShowContent();
      await expect(page.getByText(`e2e-agent-${suffix}`).first()).toBeVisible({ timeout: Timeout.long });
    });

    await test.step('Seed an evaluation run with metrics', async () => {
      const evalRunId = await createRun(experimentId!, `e2e-eval-run-${suffix}`);
      await logMetric(evalRunId, 'correctness_score', 0.85);
      await updateRun(evalRunId, 'FINISHED');
    });

    await test.step('Verify evaluation run on Evaluation runs tab', async () => {
      await evaluationRunsTabPage.navigateToEvalRuns();
      await evaluationRunsTabPage.shouldShowContent();
      await expect(page.getByText(`e2e-eval-run-${suffix}`).first()).toBeVisible({ timeout: Timeout.long });
    });

    await test.step('Delete first trace and verify removal', async () => {
      const firstTrace = seededTraces[0];
      await deleteTraces(experimentId!, [firstTrace.requestId]);
      await tracesTabPage.visit(experimentId!);
      await tracesTabPage.shouldNotShowTrace(firstTrace.input);
    });
  } finally {
    if (experimentId) {
      await deleteExperiment(experimentId).catch((e) => console.warn('Cleanup:', e.message));
    }
  }
});
