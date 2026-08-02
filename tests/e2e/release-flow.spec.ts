import { test, expect } from '@playwright/test';

const ownerEmail = 'owner@example.com';
const maintainerEmail = 'maintainer@example.com';
const password = 'Password123!';

const createWorkspaceAndRelease = async (page) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', ownerEmail);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Войти")');
  await page.waitForURL('**/workspaces');

  await page.click('button:has-text("+ Создать пространство")');
  await page.fill('input[placeholder="E.g. Acme Corp"]', 'Test Workspace');
  await page.fill('input[placeholder="Название продукта должно быть не менее 2 символов"]', 'Test Product');
  await page.click('button:has-text("Создать")');

  await page.waitForURL('**/workspaces/*');
  await page.click('button:has-text("Создать релиз")');
  await page.fill('input[placeholder="1.2.0"]', '1.0.0');
  await page.fill('input[placeholder="Новый релиз"]', 'Release 1.0');
  await page.fill('textarea[placeholder="Кратко опишите релиз"]', 'First release notes');
  await page.click('button:has-text("Создать релиз")');

  await expect(page.locator('button:has-text("Отправить на review")')).toBeVisible();
};

test('Owner creates workspace, release, assigns reviewer, sends to review', async ({ page }) => {
  await createWorkspaceAndRelease(page);

  await page.click('button:has-text("Назначить согласующих")');
  await page.waitForSelector('button:has-text("Сохранить")');
  await page.click('button:has-text("Сохранить")');

  await page.click('button:has-text("Отправить на review")');
  await expect(page.locator('button:has-text("Подтвердить")')).toBeVisible();
});

test('Maintainer approves release, publishes it, and anonymous user opens public page', async ({ page, context }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', maintainerEmail);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Войти")');
  await page.waitForURL('**/workspaces');

  await page.click('text=Release 1.0');
  await page.click('button:has-text("Подтвердить")');
  await page.click('button:has-text("Опубликовать")');

  const publicPage = await context.newPage();
  await publicPage.goto('/public/releases/test-product');
  await expect(publicPage.locator('text=Release 1.0')).toBeVisible();
});
