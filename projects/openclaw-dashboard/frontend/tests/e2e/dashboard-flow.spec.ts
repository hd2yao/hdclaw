import { expect, test } from '@playwright/test';

test('readonly dashboard flow: node -> agent timeline -> alerts', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'OpenClaw Monitor' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Singapore Gateway/i })).toBeVisible();

  await expect(page.getByText('Selected node')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Singapore Gateway' })).toBeVisible();

  const sg14AgentRow = page.getByRole('button', { name: /agent-sg-14/i }).first();
  const sg21AgentRow = page.getByRole('button', { name: /agent-sg-21/i }).first();
  await expect(sg14AgentRow).toBeVisible();
  await expect(sg21AgentRow).toBeVisible();
  await expect(page.getByText('Task recovered')).toBeVisible();

  await page.getByRole('searchbox').fill('sg-21');
  await expect(sg14AgentRow).not.toBeVisible();
  await expect(sg21AgentRow).toBeVisible();

  await page.getByRole('button', { name: 'Node Detail' }).click();
  await expect(page.getByRole('heading', { name: /Node detail/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Singapore Gateway' })).toBeVisible();

  await page.getByRole('button', { name: 'Agent Work' }).click();
  await expect(page.getByRole('heading', { name: /Agent work detail/i })).toBeVisible();
  await expect(page.getByText('agent-sg-21')).toBeVisible();

  await page.getByRole('button', { name: 'Dashboard' }).click();
  await page.getByRole('searchbox').fill('');
  await page.getByRole('button', { name: 'Alerts' }).click();

  await expect(page.getByRole('heading', { name: /Incidents with enough context to act/i })).toBeVisible();
  const criticalFilterButton = page.getByRole('button', { name: 'critical', exact: true });
  await expect(criticalFilterButton).toBeVisible();
  await criticalFilterButton.click();

  const criticalAlert = page.locator('button', { hasText: 'Task failed' }).first();
  await expect(criticalAlert).toBeVisible();
  await criticalAlert.click();

  await expect(page.getByText('Alert Detail')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Task failed' })).toBeVisible();
  await expect(page.getByText('upstream request timeout').last()).toBeVisible();
});
