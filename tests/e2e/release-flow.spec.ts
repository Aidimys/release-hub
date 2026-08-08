import { test, expect, type Page } from '@playwright/test';

const ownerEmail = 'owner@example.com';
const password = 'test12';

async function createWorkspaceAndRelease(page: Page) {
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
}

async function loginAsOwner(page: Page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', ownerEmail);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Войти")');
  await page.waitForURL('**/workspaces');
}

async function openRelease(page: Page) {
  await page.click('text=Release 1.0');
}

test('Owner creates workspace, release, adds change, assigns reviewer, and sends to review', async ({ page }) => {
  await createWorkspaceAndRelease(page);

  await page.click('button:has-text("Добавить изменение")');
  await page.selectOption('select', 'feature');
  await page.fill('input[placeholder="Название изменения"]', 'New feature');
  await page.fill('textarea[placeholder="Описание изменения"]', 'Added awesome feature');
  await page.click('button:has-text("Добавить изменение")');

  await expect(page.locator('text=New feature')).toBeVisible();

  await page.click('button:has-text("Назначить согласующих")');
  const reviewerSelect = page.locator('select');
  await reviewerSelect.selectOption({ label: /maintainer@example.com/ } as any);
  await page.click('button:has-text("Сохранить")');

  await page.click('button:has-text("Отправить на review")');
  await expect(page.locator('text=review').first()).toBeVisible();
  await expect(page.locator('button:has-text("Проголосовать за")')).toBeVisible();
});

test('Maintainer approves release, publishes it, and anonymous user opens public page', async ({ page, context }) => {
  await loginAsOwner(page);

  await page.click('text=Test Workspace');
  await openRelease(page);

  await page.click('button:has-text("Назначить согласующих")');
  const reviewerSelect = page.locator('select');
  await reviewerSelect.selectOption({ label: /maintainer@example.com/ } as any);
  await page.click('button:has-text("Сохранить")');

  await page.click('button:has-text("Отправить на review")');
  await expect(page.locator('text=review').first()).toBeVisible();

  await page.reload();
  await page.waitForTimeout(500);

  await page.click('button:has-text("Проголосовать за")');
  await page.waitForTimeout(500);

  await expect(page.locator('text=approved').first()).toBeVisible();

  await page.click('button:has-text("Опубликовать")');
  await page.waitForTimeout(500);
  await expect(page.locator('text=published').first()).toBeVisible();

  const publicPage = await context.newPage();
  await publicPage.goto('/public/releases/test-product');
  await expect(publicPage.locator('text=Release 1.0')).toBeVisible();
});
