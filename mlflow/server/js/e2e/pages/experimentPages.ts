import { expect, type Page, type Locator } from '@playwright/test';
import { E2E_WORKSPACE } from '../utils/mlflowClient';
import { Timeout, UrlPatterns } from '../utils/const';

export class ExperimentsListPage {
  constructor(private page: Page) {}

  async visit(workspace = E2E_WORKSPACE) {
    const qs = new URLSearchParams({ workspace }).toString();
    await this.page.goto(`/#/experiments?${qs}`);
    await this.findCreateButton().waitFor({ state: 'visible', timeout: Timeout.long * 2 });
  }

  findCreateButton(): Locator {
    return this.page.getByTestId('create-experiment-button');
  }

  findExperimentLink(name: string): Locator {
    return this.page.getByTestId('experiment-list-item-link').filter({ hasText: name });
  }

  findCreateModalNameInput(): Locator {
    return this.page.getByRole('dialog').getByRole('textbox').first();
  }

  findCreateModalSubmit(): Locator {
    return this.page.getByRole('dialog').getByRole('button', { name: 'Create' });
  }

  async createExperiment(name: string) {
    await this.findCreateButton().click();
    await this.findCreateModalNameInput().fill(name);
    await this.findCreateModalSubmit().click();
  }

  async waitForExperimentId(): Promise<string> {
    await this.page.waitForURL(UrlPatterns.experiment);
    const match = this.page.url().match(UrlPatterns.experiment);
    if (!match?.[1]) {
      throw new Error('Could not extract experiment ID from URL');
    }
    return match[1];
  }

  async shouldShowExperiment(name: string) {
    await expect(this.findExperimentLink(name)).toBeVisible({ timeout: Timeout.medium });
  }

  async clickExperiment(name: string) {
    await this.findExperimentLink(name).click();
  }
}

export class ExperimentRunsPage {
  constructor(private page: Page) {}

  async switchToModelTraining() {
    await this.page.getByRole('button', { name: 'Model training' }).click();
  }

  findRunByName(name: string): Locator {
    return this.page.getByText(name, { exact: true });
  }

  findCompareButton(): Locator {
    return this.page.getByTestId('runs-compare-button');
  }

  findModelsTab(): Locator {
    return this.page.getByRole('link', { name: 'Models', exact: true });
  }

  findSelectAllCheckbox(): Locator {
    return this.page.locator('[aria-label="Select all runs"]');
  }

  async shouldShowRun(name: string) {
    await expect(this.findRunByName(name)).toBeVisible({ timeout: Timeout.long });
  }

  async clickRun(name: string) {
    await this.findRunByName(name).click();
  }

  async selectAllRuns() {
    await this.findSelectAllCheckbox().click({ force: true });
  }

  async clickCompare() {
    await this.findCompareButton().click();
  }

  async switchToModelsTab() {
    await this.findModelsTab().click();
  }

  findLoggedModelLink(name: string): Locator {
    return this.page.getByRole('link', { name, exact: true });
  }

  async clickLoggedModel(name: string) {
    await this.findLoggedModelLink(name).click();
  }
}

export class CompareRunsPage {
  constructor(private page: Page) {}

  findContainer(): Locator {
    return this.page.locator('.CompareRunView');
  }

  findCompareTable(): Locator {
    return this.page.locator('.mlflow-compare-run-table').first();
  }

  async shouldShowCompareView() {
    await expect(this.findContainer()).toBeVisible({ timeout: Timeout.long });
    await expect(this.findCompareTable()).toBeVisible({ timeout: Timeout.medium });
  }
}

export class RunDetailPage {
  constructor(private page: Page) {}

  async shouldShowMetric(key: string) {
    await expect(this.page.getByText(key, { exact: true })).toBeVisible();
  }

  async shouldShowParam(key: string) {
    await expect(this.page.getByText(key, { exact: true })).toBeVisible();
  }
}
