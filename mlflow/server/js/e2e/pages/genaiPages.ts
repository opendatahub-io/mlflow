import { expect, type Page, type Locator } from '@playwright/test';
import { E2E_WORKSPACE } from '../utils/mlflowClient';
import { Timeout } from '../utils/const';

export class TracesTabPage {
  constructor(private page: Page) {}

  findTraceDrawer(): Locator {
    return this.page.getByRole('dialog');
  }

  async visit(experimentId: string, workspace = E2E_WORKSPACE) {
    const qs = new URLSearchParams({ workspace }).toString();
    await this.page.goto(`/#/experiments/${experimentId}/traces?${qs}`);
  }

  async shouldShowTrace(text: string) {
    await expect(this.page.getByText(text)).toBeVisible({ timeout: Timeout.long });
  }

  async shouldNotShowTrace(text: string) {
    await expect(this.page.getByText(text, { exact: true })).not.toBeVisible({ timeout: Timeout.long });
  }

  async clickTrace(text: string) {
    await this.page.getByText(text, { exact: true }).click();
  }

  async shouldShowDrawer() {
    await expect(this.findTraceDrawer()).toBeVisible({ timeout: Timeout.medium });
  }

  async shouldShowDrawerContent(text: string) {
    await expect(this.findTraceDrawer().getByText(text)).toBeVisible({ timeout: Timeout.medium });
  }
}

export class SessionsTabPage {
  constructor(private page: Page) {}

  findSessionsLink(): Locator {
    return this.page.getByRole('link', { name: 'Sessions', exact: true });
  }

  async navigateToSessions() {
    await this.findSessionsLink().click();
  }

  async shouldShowContent() {
    await expect(this.page.getByText('Sessions').first()).toBeVisible({ timeout: Timeout.medium });
  }
}

export class DatasetsTabPage {
  constructor(private page: Page) {}

  findDatasetsLink(): Locator {
    return this.page.getByRole('link', { name: 'Datasets', exact: true });
  }

  findCreateButton(): Locator {
    return this.page.getByRole('button', { name: 'Create dataset' }).first();
  }

  findDatasetNameInput(): Locator {
    return this.page.locator('#dataset-name-input');
  }

  findCreateModalSubmit(): Locator {
    return this.page.getByRole('dialog').getByRole('button', { name: /^Create$/i });
  }

  async navigateToDatasets() {
    await this.findDatasetsLink().click();
  }

  async shouldShowContent() {
    await expect(this.page.getByText('Datasets').first()).toBeVisible({ timeout: Timeout.medium });
  }

  async createDataset(name: string) {
    await this.findCreateButton().click();
    await expect(this.page.getByRole('dialog')).toBeVisible({ timeout: Timeout.short });
    await this.findDatasetNameInput().fill(name);
    await this.findCreateModalSubmit().click();
  }

  async shouldShowDataset(name: string) {
    await expect(this.page.getByText(name).first()).toBeVisible({ timeout: Timeout.medium });
  }
}

export class EvaluationRunsTabPage {
  constructor(private page: Page) {}

  findEvalRunsLink(): Locator {
    return this.page.getByRole('link', { name: 'Evaluation runs', exact: true });
  }

  async navigateToEvalRuns() {
    await this.findEvalRunsLink().click();
  }

  async shouldShowContent() {
    await expect(this.page.getByText('Evaluation runs').first()).toBeVisible({ timeout: Timeout.medium });
  }
}

export class AgentVersionsTabPage {
  constructor(private page: Page) {}

  findAgentVersionsLink(): Locator {
    return this.page.getByRole('link', { name: 'Agent versions', exact: true });
  }

  async navigateToAgentVersions() {
    await this.findAgentVersionsLink().click();
  }

  async shouldShowContent() {
    await expect(this.page.getByText('Agent versions').first()).toBeVisible({ timeout: Timeout.medium });
  }
}

export class ScorersTabPage {
  constructor(private page: Page) {}

  async visit(experimentId: string, workspace = E2E_WORKSPACE) {
    const qs = new URLSearchParams({ workspace }).toString();
    await this.page.goto(`/#/experiments/${experimentId}/judges?${qs}`);
  }

  findScorerCard(name: string): Locator {
    return this.page.getByText(name);
  }

  async shouldShowContent() {
    await expect(
      this.page.getByText('New LLM judge').first().or(this.page.getByText('Create your first LLM judge').first()),
    ).toBeVisible({ timeout: Timeout.medium });
  }

  async shouldShowScorer(name: string) {
    await expect(this.findScorerCard(name)).toBeVisible({ timeout: Timeout.medium });
  }
}
