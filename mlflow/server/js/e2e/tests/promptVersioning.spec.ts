import { test } from '../utils/base';
import { testData } from '../fixtures/testData';
import { Timeout, UrlPatterns } from '../utils/const';
import { deleteRegisteredModel } from '../utils/mlflowClient';

const { promptName, promptTemplate, promptTemplateV2 } = testData.promptVersioning;

test('Prompt versioning', async ({ page, promptsPage, promptDetailPage }) => {
  const suffix = process.env.MLFLOW_E2E_SUFFIX;
  if (!suffix) throw new Error('MLFLOW_E2E_SUFFIX is required');
  const fullPromptName = `${promptName}-${suffix}`;

  try {
    await test.step('Navigate to Prompts page', async () => {
      await promptsPage.visit();
    });

    await test.step('Create a new prompt via UI', async () => {
      await promptsPage.createPrompt(fullPromptName, promptTemplate);
    });

    await test.step('Verify prompt detail page loads with version 1', async () => {
      await page.waitForURL(UrlPatterns.prompt(fullPromptName), { timeout: Timeout.long });
      await promptDetailPage.shouldShowHeading(fullPromptName);
      await promptDetailPage.shouldShowVersion(1);
    });

    await test.step('Verify template content is visible', async () => {
      await promptDetailPage.shouldShowTemplateContent(promptTemplate);
    });

    await test.step('Create a second version with updated template', async () => {
      await promptDetailPage.createVersion(promptTemplateV2);
    });

    await test.step('Verify version 2 appears with updated content', async () => {
      await promptDetailPage.shouldShowVersion(2);
      await promptDetailPage.shouldShowTemplateContent(promptTemplateV2);
    });

    await test.step('Navigate back to prompts list and verify prompt shows', async () => {
      await promptsPage.visit();
      await promptsPage.shouldShowPrompt(fullPromptName);
    });

    await test.step('Delete prompt via UI', async () => {
      await promptsPage.clickPrompt(fullPromptName);
      await promptDetailPage.shouldShowHeading(fullPromptName);
      await promptDetailPage.deletePrompt();
    });

    await test.step('Verify prompt disappears from the list', async () => {
      await promptsPage.visit();
      await page.reload();
      await promptsPage.shouldNotShowPrompt(fullPromptName);
    });
  } finally {
    await deleteRegisteredModel(fullPromptName).catch((e) => console.warn('Cleanup:', e.message));
  }
});
