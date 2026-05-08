import { expect, type Page, type Locator } from '@playwright/test';
import { E2E_WORKSPACE } from '../utils/mlflowClient';
import { Timeout } from '../utils/const';

export class PromptsPage {
  constructor(private page: Page) {}

  async visit(workspace = E2E_WORKSPACE) {
    const qs = new URLSearchParams({ workspace }).toString();
    await this.page.goto(`/#/prompts?${qs}`);
  }

  findCreateButton(): Locator {
    return this.page.getByTestId('create-prompt-button').or(this.page.getByTestId('create-prompt-empty-state-button'));
  }

  findPromptLink(name: string): Locator {
    return this.page.getByRole('link', { name, exact: true });
  }

  findCreateModalNameInput(): Locator {
    return this.page.getByRole('dialog').getByLabel('Name');
  }

  findCreateModalPromptInput(): Locator {
    return this.page.getByRole('dialog').getByPlaceholder(/Type prompt content/i);
  }

  findCreateModalSubmit(): Locator {
    return this.page.getByRole('dialog').getByRole('button', { name: 'Create' });
  }

  async createPrompt(name: string, template: string) {
    await expect(this.findCreateButton()).toBeVisible({ timeout: Timeout.medium });
    await this.findCreateButton().click();
    await this.findCreateModalNameInput().fill(name);
    await this.findCreateModalPromptInput().fill(template);
    await this.findCreateModalSubmit().click();
  }

  async shouldShowPrompt(name: string) {
    await expect(this.findPromptLink(name)).toBeVisible({ timeout: Timeout.medium });
  }

  async shouldNotShowPrompt(name: string) {
    await expect(this.findPromptLink(name)).not.toBeVisible({ timeout: Timeout.medium });
  }

  async clickPrompt(name: string) {
    await this.findPromptLink(name).click();
  }
}

export class PromptDetailPage {
  constructor(private page: Page) {}

  findCreateVersionButton(): Locator {
    return this.page.getByRole('button', { name: 'Create prompt version' });
  }

  findVersionText(version: number): Locator {
    return this.page.getByText(`Version ${version}`, { exact: true });
  }

  findMoreActionsButton(): Locator {
    return this.page.getByRole('button', { name: 'More actions' });
  }

  findDeleteMenuItem(): Locator {
    return this.page.getByRole('menuitem', { name: 'Delete' });
  }

  findDeleteConfirmButton(): Locator {
    return this.page.getByRole('dialog').getByRole('button', { name: 'Delete' });
  }

  findCreateVersionModalPromptInput(): Locator {
    return this.page.getByRole('dialog').getByPlaceholder(/Type prompt content/i);
  }

  findCreateVersionModalSubmit(): Locator {
    return this.page.getByRole('dialog').getByRole('button', { name: 'Create' });
  }

  async createVersion(template: string) {
    await this.findCreateVersionButton().click();
    await this.findCreateVersionModalPromptInput().fill(template);
    await this.findCreateVersionModalSubmit().click();
  }

  async shouldShowHeading(name: string) {
    await expect(this.page.getByRole('heading', { name })).toBeVisible({ timeout: Timeout.medium });
  }

  async shouldShowVersion(version: number) {
    await expect(this.findVersionText(version)).toBeVisible({ timeout: Timeout.medium });
  }

  async shouldShowTemplateContent(text: string) {
    await expect(this.page.getByRole('main').getByText(text).first()).toBeVisible({ timeout: Timeout.medium });
  }

  async deletePrompt() {
    await this.findMoreActionsButton().click();
    await this.findDeleteMenuItem().click();
    await this.findDeleteConfirmButton().click();
    await expect(this.page.getByRole('dialog')).not.toBeVisible({ timeout: Timeout.medium });
  }
}
