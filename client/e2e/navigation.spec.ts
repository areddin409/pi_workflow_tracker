import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('loads dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('loads caseload', async ({ page }) => {
    await page.goto('/caseload');
    await expect(page.locator('h1')).toContainText('Caseload');
  });

  test('loads worklist', async ({ page }) => {
    await page.goto('/worklist');
    await expect(page.locator('h1')).toContainText('Worklist');
  });

  test('loads templates', async ({ page }) => {
    await page.goto('/templates');
    await expect(page.locator('h1')).toContainText('Templates');
  });

  test('loads settings', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1')).toContainText('Settings');
  });

  test('sidebar links navigate correctly', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Caseload' }).click();
    await expect(page).toHaveURL(/\/caseload/);
  });
});
