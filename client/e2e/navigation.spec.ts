import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('loads dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  });

  test('loads caseload', async ({ page }) => {
    await page.goto('/caseload');
    await expect(page.getByRole('heading', { name: 'Caseload', level: 1 })).toBeVisible();
  });

  test('loads worklist', async ({ page }) => {
    await page.goto('/worklist');
    await expect(page.getByRole('heading', { name: 'Worklist', level: 1 })).toBeVisible();
  });

  test('loads templates', async ({ page }) => {
    await page.goto('/templates');
    await expect(page.getByRole('heading', { name: 'Templates', level: 1 })).toBeVisible();
  });

  test('loads settings', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  });

  test('sidebar links navigate correctly', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Caseload' }).click();
    await expect(page).toHaveURL(/\/caseload/);
  });
});
