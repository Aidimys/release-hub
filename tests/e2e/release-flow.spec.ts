/// <reference types="node" />
import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/shared/api/database.types';
import { readFileSync } from 'fs';
import { join } from 'path';

const envPath = join(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const envVars = Object.fromEntries(
  envContent.split('\n').filter((line: string) => line && !line.startsWith('#')).map((line: string) => {
    const [key, ...valueParts] = line.split('=');
    return [key, valueParts.join('=')] as [string, string];
  }),
) as Record<string, string>;

const SUPABASE_URL = envVars.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = envVars.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = envVars.VITE_SUPABASE_SERVICE_ROLE_KEY;

const OWNER_EMAIL = 'owner@example.com';
const MAINTAINER_EMAIL = 'maintainer@example.com';
const TEST_PASSWORD = 'test12';

function createApiClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function createServiceClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('VITE_SUPABASE_SERVICE_ROLE_KEY is required for e2e tests');
  }
  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const ws1 = `E2E Owner ${uniqueId}`;
const prod1 = `Product ${uniqueId}`;
const rel1Ver = `1.0.${uniqueId.slice(-4)}`;
const rel1Title = `Release ${uniqueId}`;

const ws2 = `E2E Maintainer ${uniqueId}`;
const prod2 = `Product ${uniqueId + 1}`;
const rel2Ver = `1.0.${uniqueId.slice(-4) + 1}`;
const rel2Title = `Release ${uniqueId + 1}`;

async function apiSignIn(email: string) {
  const supabase = createApiClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (error) throw new Error(`Sign in failed: ${error.message}`);
  return { userId: data.user?.id, client: supabase };
}

async function getAuthenticatedClient(email: string) {
  const client = createApiClient();
  const { error } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (error) throw new Error(`Sign in failed: ${error.message}`);
  return client;
}

async function createWorkspaceViaApi(_client: ReturnType<typeof createApiClient>, _ownerId: string, name: string, productName: string) {
  const client = createServiceClient();
  const { data: workspaceId, error } = await client.rpc('create_workspace_with_defaults', {
    workspace_name: name,
    default_product_name: productName,
  });
  if (error) throw new Error(`Workspace creation failed: ${error.message}`);

  const { data: product, error: productError } = await client
    .from('products')
    .select('id, slug')
    .eq('workspace_id', workspaceId)
    .single();
  if (productError) throw new Error(`Product fetch failed: ${productError.message}`);

  return { workspaceId, product: product as { id: string; slug: string } };
}

async function addMemberViaApi(_client: ReturnType<typeof createApiClient>, workspaceId: string, userId: string, role: 'owner' | 'maintainer' | 'contributor') {
  const client = createServiceClient();
  const { error } = await client
    .from('workspace_members')
    .insert({ workspace_id: workspaceId, user_id: userId, role });
  if (error) throw new Error(`Add member failed: ${error.message}`);

  const { data: members, error: verifyError } = await client
    .from('workspace_members')
    .select('user_id, role')
    .eq('workspace_id', workspaceId);
  if (verifyError) throw new Error(`Member verify failed: ${verifyError.message}`);
  const added = members?.some((m) => m.user_id === userId && m.role === role);
  if (!added) throw new Error(`Member was not added: ${userId} ${role}`);
}

async function verifyReleaseStatus(_client: ReturnType<typeof createApiClient>, releaseId: string, expectedStatus: string, timeout = 10000) {
  const client = createServiceClient();
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const { data, error } = await client
      .from('releases')
      .select('status')
      .eq('id', releaseId)
      .single();
    if (error) throw new Error(`Status check failed: ${error.message}`);
    if (data?.status === expectedStatus) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  expect((await client.from('releases').select('status').eq('id', releaseId).single()).data?.status).toBe(expectedStatus);
}

async function verifyReviewerAssigned(_client: ReturnType<typeof createApiClient>, releaseId: string, userId: string) {
  const client = createServiceClient();
  const { data, error } = await client
    .from('release_reviewers')
    .select('user_id')
    .eq('release_id', releaseId)
    .eq('user_id', userId);
  if (error) throw new Error(`Reviewer check failed: ${error.message}`);
  expect(data?.length).toBeGreaterThan(0);
}

async function verifyChangeAdded(_client: ReturnType<typeof createApiClient>, releaseId: string, title: string) {
  const client = createServiceClient();
  const { data, error } = await client
    .from('release_changes')
    .select('title')
    .eq('release_id', releaseId)
    .eq('title', title);
  if (error) throw new Error(`Change check failed: ${error.message}`);
  expect(data?.length).toBeGreaterThan(0);
}

async function loginAsOwner(page: Page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', OWNER_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button:has-text("Войти")');
  await page.waitForURL('**/workspaces');
}

async function loginAsMaintainer(page: Page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', MAINTAINER_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button:has-text("Войти")');
  await page.waitForURL('**/workspaces');
}

async function navigateToProduct(page: Page, workspaceId: string, productId: string) {
  await page.goto(`/workspaces/${workspaceId}/products/${productId}`);
  await page.waitForURL(`**/workspaces/${workspaceId}/products/${productId}`);
}

async function createRelease(page: Page, version: string, title: string, description: string) {
  await page.click('button:has-text("+ Создать релиз")');
  await page.fill('input[placeholder="1.2.0"]', version);
  await page.fill('input[placeholder="Новый релиз"]', title);
  await page.fill('textarea[placeholder="Кратко опишите релиз"]', description);
  await page.locator('.fixed.inset-0 button[type="submit"]').click();
}

async function openRelease(page: Page, title: string) {
  await page.click(`text=${title}`);
  await page.waitForURL('**/workspaces/*/releases/*');
}

async function addChange(page: Page, category: string, title: string, description: string) {
  await page.selectOption('select[name="category"]', category);
  await page.fill('input[name="title"]', title);
  await page.fill('textarea[name="description"]', description);
  await page.click('button:has-text("Добавить изменение")');
  await expect(page.locator(`text="${title}"`)).toBeVisible();
}

async function assignReviewerByValue(page: Page, userId: string) {
  const select = page.locator('select').first();
  await select.selectOption(userId);
}

async function submitForReview(page: Page) {
  await page.click('button:has-text("Отправить на review")');
}

async function approveRelease(page: Page) {
  await page.click('button:has-text("Проголосовать за")');
}

async function publishRelease(page: Page) {
  await page.click('button:has-text("Опубликовать")');
}

test.afterEach(async () => {
  // Workspaces use unique names per test run; explicit cleanup is not required.
});

test('Owner creates release, adds change, assigns reviewer, and submits for review', async ({ page }) => {
  const { userId: _ownerId } = await apiSignIn(OWNER_EMAIL);
  const { workspaceId, product } = await createWorkspaceViaApi(await getAuthenticatedClient(OWNER_EMAIL), _ownerId, ws1, prod1);

  await loginAsOwner(page);
  await navigateToProduct(page, workspaceId, product.id);

  await createRelease(page, rel1Ver, rel1Title, 'Test release notes');
  await openRelease(page, rel1Title);

  const changeTitle = `Change ${uniqueId}`;
  await addChange(page, 'feature', changeTitle, 'Test change description');

  await assignReviewerByValue(page, _ownerId);
  await submitForReview(page);

  const releaseIdMatch = page.url().match(/\/releases\/([^/]+)/);
  const releaseId = releaseIdMatch?.[1] ?? (() => { throw new Error('Release ID not found in URL'); })();
  await verifyChangeAdded(createApiClient(), releaseId, changeTitle);
  await verifyReviewerAssigned(createApiClient(), releaseId, _ownerId);
  await verifyReleaseStatus(createApiClient(), releaseId, 'review');

  await expect(page.locator('text=review').first()).toBeVisible();
  await expect(page.locator('button:has-text("Проголосовать за")')).toBeVisible();
});

test('Maintainer approves and publishes release, and anonymous user opens public page', async ({ page, context }) => {
  const { userId: ownerId } = await apiSignIn(OWNER_EMAIL);
  const { userId: maintainerId } = await apiSignIn(MAINTAINER_EMAIL);
  const { workspaceId, product } = await createWorkspaceViaApi(await getAuthenticatedClient(OWNER_EMAIL), ownerId, ws2, prod2);
  await addMemberViaApi(await getAuthenticatedClient(OWNER_EMAIL), workspaceId, maintainerId, 'maintainer');

  await loginAsOwner(page);
  await navigateToProduct(page, workspaceId, product.id);

  await createRelease(page, rel2Ver, rel2Title, 'Test release notes 2');
  await openRelease(page, rel2Title);

  const changeTitle = `Change ${uniqueId}`;
  await addChange(page, 'feature', changeTitle, 'Test change description');

  await assignReviewerByValue(page, maintainerId);
  await submitForReview(page);

  const releaseIdMatch = page.url().match(/\/releases\/([^/]+)/);
  const releaseId = releaseIdMatch?.[1] ?? (() => { throw new Error('Release ID not found in URL'); })();
  await verifyReleaseStatus(createApiClient(), releaseId, 'review');
  await verifyChangeAdded(createApiClient(), releaseId, changeTitle);
  await verifyReviewerAssigned(createApiClient(), releaseId, maintainerId);

  await loginAsMaintainer(page);
  await page.goto(`/workspaces/${workspaceId}`);
  await page.waitForURL(`**/workspaces/${workspaceId}`);
  await expect(page.locator(`text=${prod2}`)).toBeVisible();
  await page.click(`text=${prod2}`);
  await page.waitForURL(`**/workspaces/${workspaceId}/products/${product.id}`);
  await page.click(`text=${rel2Title}`);
  await page.waitForURL(`**/workspaces/${workspaceId}/releases/${releaseId}`);

  await approveRelease(page);
  await verifyReleaseStatus(createApiClient(), releaseId, 'approved');

  await publishRelease(page);
  await expect(page.locator('button:has-text("Опубликовать")')).toBeDisabled();
  await verifyReleaseStatus(createApiClient(), releaseId, 'published');

  const publicPage = await context.newPage();
  await publicPage.goto(`/public/releases/${product.id}`);
  await expect(publicPage.locator(`text=${rel2Title}`)).toBeVisible();
});
