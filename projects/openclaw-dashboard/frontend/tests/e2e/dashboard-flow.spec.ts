import { expect, test } from '@playwright/test';

test('readonly dashboard flow: node -> agent timeline -> alerts', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'OpenClaw Monitor' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Singapore Gateway/i })).toBeVisible();

  await expect(page.getByText('Node Detail')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Singapore Gateway' })).toBeVisible();

  await expect(page.getByText('Compile AI policy digest')).toBeVisible();
  await expect(page.getByRole('button', { name: /agent-sg-14/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /agent-sg-21/i }).first()).toBeVisible();
  await expect(page.getByText('Task recovered')).toBeVisible();

  await page.getByRole('searchbox').fill('sg-21');
  await expect(page.getByText('Compile AI policy digest')).not.toBeVisible();
  await expect(page.getByRole('button', { name: /agent-sg-21/i }).first()).toBeVisible();

  await page.getByRole('searchbox').fill('');
  await page.getByRole('button', { name: 'Alerts' }).click();

  await expect(page.getByRole('heading', { name: 'Alerts / Events' })).toBeVisible();
  const criticalFilterButton = page.getByRole('button', { name: 'critical', exact: true });
  await expect(criticalFilterButton).toBeVisible();
  await criticalFilterButton.click();

  const criticalAlert = page.locator('button', { hasText: 'Task failed' }).first();
  await expect(criticalAlert).toBeVisible();
  await criticalAlert.click();

  await expect(page.getByText('Alert Detail')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Task failed' })).toBeVisible();
  await expect(page.getByText('upstream request timeout')).toBeVisible();
});
