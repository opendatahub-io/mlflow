import { expect, type Page, type Locator } from '@playwright/test';
import { E2E_WORKSPACE } from '../utils/mlflowClient';
import { Timeout } from '../utils/const';

export class ModelRegistryPage {
  constructor(private page: Page) {}

  async visit(workspace = E2E_WORKSPACE) {
    const qs = new URLSearchParams({ workspace }).toString();
    await this.page.goto(`/#/models?${qs}`);
    await this.page.evaluate(() => {
      localStorage.setItem('_mlflow_model_registry_promo_modal_dismissed', 'true');
    });
    await this.page.reload();
  }

  findModelTable(): Locator {
    return this.page.getByTestId('model-list-table');
  }

  findModelLink(name: string): Locator {
    return this.findModelTable().getByRole('link', { name, exact: true });
  }

  async shouldShowModel(name: string) {
    await expect(this.findModelLink(name)).toBeVisible({ timeout: Timeout.medium });
  }

  async shouldNotShowModel(name: string) {
    await expect(this.findModelLink(name)).not.toBeVisible({ timeout: Timeout.medium });
  }

  async clickModel(name: string) {
    await this.findModelLink(name).click();
  }
}

export class ModelDetailPage {
  constructor(private page: Page) {}

  findVersionTable(): Locator {
    return this.page.getByTestId('model-version-table');
  }

  findVersionLink(version: string): Locator {
    return this.findVersionTable().getByRole('link', { name: `Version ${version}` });
  }

  findOverflowMenuTrigger(): Locator {
    return this.page.getByTestId('overflow-menu-trigger');
  }

  findDeleteMenuItem(): Locator {
    return this.page.getByRole('menuitem', { name: 'Delete' });
  }

  findDeleteConfirmButton(): Locator {
    return this.page.getByRole('dialog').getByRole('button', { name: 'Delete' });
  }

  async shouldShowVersion(version: string) {
    await expect(this.findVersionLink(version)).toBeVisible({ timeout: Timeout.medium });
  }

  async clickVersion(version: string) {
    await this.findVersionLink(version).click();
  }

  async deleteModel() {
    await this.findOverflowMenuTrigger().click();
    await this.findDeleteMenuItem().click();
    await expect(this.page.getByRole('dialog')).toBeVisible({ timeout: Timeout.short });
    await this.findDeleteConfirmButton().click();
  }
}

export class ModelVersionDetailPage {
  constructor(private page: Page) {}

  findAddAliasButton(): Locator {
    return this.page.getByTitle('Add aliases');
  }

  findEditAliasButton(): Locator {
    return this.page.getByRole('button', { name: 'Edit aliases' });
  }

  findAliasDialog(): Locator {
    return this.page.getByRole('dialog');
  }

  findAliasCombobox(): Locator {
    return this.page.getByRole('dialog').getByRole('combobox');
  }

  findSaveAliasesButton(): Locator {
    return this.findAliasDialog().getByRole('button', { name: 'Save aliases' });
  }

  findAliasBadge(alias: string): Locator {
    return this.page.getByRole('main').getByRole('status', { name: alias });
  }

  private async waitForDialogClose() {
    await expect(this.findAliasDialog()).not.toBeVisible({ timeout: Timeout.medium });
  }

  private async openAndSubmitAlias(opener: Locator, alias: string) {
    await opener.click();
    await expect(this.findAliasDialog()).toBeVisible({ timeout: Timeout.medium });
    await this.findAliasCombobox().click();
    await this.findAliasCombobox().pressSequentially(alias, { delay: 50 });
    await this.findAliasCombobox().press('Enter');
    await this.findSaveAliasesButton().click();
    await this.waitForDialogClose();
  }

  async addAlias(alias: string) {
    await this.openAndSubmitAlias(this.findAddAliasButton(), alias);
  }

  async addAnotherAlias(alias: string) {
    await this.openAndSubmitAlias(this.findEditAliasButton(), alias);
  }

  async shouldShowAlias(alias: string) {
    await expect(this.findAliasBadge(alias)).toBeVisible({ timeout: Timeout.medium });
  }

  async shouldNotShowAlias(alias: string) {
    await expect(this.findAliasBadge(alias)).not.toBeVisible({ timeout: Timeout.medium });
  }

  async deleteAlias(alias: string) {
    await this.findEditAliasButton().click();
    await this.findAliasDialog().getByRole('status', { name: alias }).getByRole('button').click();
    await this.findSaveAliasesButton().click();
    await this.waitForDialogClose();
  }
}

export class LoggedModelDetailPage {
  constructor(private page: Page) {}

  findRegisterModelButton(): Locator {
    return this.page.getByRole('button', { name: 'Register model' });
  }

  findModelSelectCombobox(): Locator {
    return this.page.getByRole('combobox', { name: 'Model' });
  }

  findModelNameInput(): Locator {
    return this.page.getByPlaceholder('Input a model name');
  }

  findConfirmRegisterButton(): Locator {
    return this.page.getByTestId('confirm-register-model');
  }

  async registerAsNewModel(modelName: string) {
    await expect(this.findRegisterModelButton()).toBeVisible({ timeout: Timeout.long });
    await this.findRegisterModelButton().click();
    await expect(this.findModelSelectCombobox()).toBeVisible({ timeout: Timeout.long });
    await this.findModelSelectCombobox().click();
    await this.page.locator('.mlflow-create-new-model-option').click();
    await expect(this.findModelNameInput()).toBeVisible({ timeout: Timeout.medium });
    await this.findModelNameInput().fill(modelName);
    await this.findConfirmRegisterButton().click();
  }
}
