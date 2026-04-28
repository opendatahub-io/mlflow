import { test, expect } from '@playwright/test';

test('MLflow dashboard loads successfully', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/MLflow/);
  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(page.getByRole('link', { name: 'default', exact: true })).toBeVisible();
});
