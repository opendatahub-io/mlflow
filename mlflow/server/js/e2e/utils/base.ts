import { test as base } from '@playwright/test';
import { ExperimentsListPage, ExperimentRunsPage, CompareRunsPage, RunDetailPage } from '../pages/experimentPages';
import { ModelRegistryPage, ModelDetailPage, ModelVersionDetailPage, LoggedModelDetailPage } from '../pages/modelPages';
import {
  TracesTabPage,
  SessionsTabPage,
  DatasetsTabPage,
  EvaluationRunsTabPage,
  AgentVersionsTabPage,
  ScorersTabPage,
} from '../pages/genaiPages';
import { PromptsPage, PromptDetailPage } from '../pages/promptPages';

interface MlflowFixtures {
  experimentsListPage: ExperimentsListPage;
  experimentRunsPage: ExperimentRunsPage;
  compareRunsPage: CompareRunsPage;
  runDetailPage: RunDetailPage;
  modelRegistryPage: ModelRegistryPage;
  modelDetailPage: ModelDetailPage;
  modelVersionDetailPage: ModelVersionDetailPage;
  loggedModelDetailPage: LoggedModelDetailPage;
  tracesTabPage: TracesTabPage;
  sessionsTabPage: SessionsTabPage;
  datasetsTabPage: DatasetsTabPage;
  evaluationRunsTabPage: EvaluationRunsTabPage;
  agentVersionsTabPage: AgentVersionsTabPage;
  scorersTabPage: ScorersTabPage;
  promptsPage: PromptsPage;
  promptDetailPage: PromptDetailPage;
}

export const test = base.extend<MlflowFixtures>({
  experimentsListPage: async ({ page }, use) => {
    await use(new ExperimentsListPage(page));
  },
  experimentRunsPage: async ({ page }, use) => {
    await use(new ExperimentRunsPage(page));
  },
  compareRunsPage: async ({ page }, use) => {
    await use(new CompareRunsPage(page));
  },
  runDetailPage: async ({ page }, use) => {
    await use(new RunDetailPage(page));
  },
  modelRegistryPage: async ({ page }, use) => {
    await use(new ModelRegistryPage(page));
  },
  modelDetailPage: async ({ page }, use) => {
    await use(new ModelDetailPage(page));
  },
  modelVersionDetailPage: async ({ page }, use) => {
    await use(new ModelVersionDetailPage(page));
  },
  loggedModelDetailPage: async ({ page }, use) => {
    await use(new LoggedModelDetailPage(page));
  },
  tracesTabPage: async ({ page }, use) => {
    await use(new TracesTabPage(page));
  },
  sessionsTabPage: async ({ page }, use) => {
    await use(new SessionsTabPage(page));
  },
  datasetsTabPage: async ({ page }, use) => {
    await use(new DatasetsTabPage(page));
  },
  evaluationRunsTabPage: async ({ page }, use) => {
    await use(new EvaluationRunsTabPage(page));
  },
  agentVersionsTabPage: async ({ page }, use) => {
    await use(new AgentVersionsTabPage(page));
  },
  scorersTabPage: async ({ page }, use) => {
    await use(new ScorersTabPage(page));
  },
  promptsPage: async ({ page }, use) => {
    await use(new PromptsPage(page));
  },
  promptDetailPage: async ({ page }, use) => {
    await use(new PromptDetailPage(page));
  },
});

export { expect } from '@playwright/test';
