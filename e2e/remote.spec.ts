import { test, expect } from '@playwright/test';

/**
 * Produção + Supabase. Rode com:  E2E_REMOTE=1 npx playwright test
 * Conta de teste via E2E_EMAIL / E2E_PASSWORD (padrão: a conta descartável do projeto).
 */
const EMAIL = process.env.E2E_EMAIL || 'admin@admin.com';
const PASS = process.env.E2E_PASSWORD || '12345678';

test.describe('Produção @remote', () => {
  test.describe.configure({ mode: 'serial' });
  const name = `E2E ${Date.now().toString(36)}`;
  let slug = '', id = '';

  test('login do editor', async ({ page }) => {
    await page.goto('/admin');
    await page.getByPlaceholder('e-mail').fill(EMAIL);
    await page.getByPlaceholder('senha').fill(PASS);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText(/não é editora/i), 'conta precisa estar em public.admins (supabase/fix-01-admin.sql)').toHaveCount(0);
    await expect(page.getByRole('heading', { name: /novo drop/i })).toBeVisible();
  });

  test('cria e publica um drop (gera a imagem do WhatsApp)', async ({ page }) => {
    await page.goto('/admin');
    await page.getByPlaceholder('e-mail').fill(EMAIL);
    await page.getByPlaceholder('senha').fill(PASS);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByLabel('Nome', { exact: true }).fill(name);
    await page.getByTestId('next').click(); await page.getByTestId('next').click();
    await page.getByRole('button', { name: 'Usar arte de exemplo' }).click();
    await page.getByTestId('next').click();
    await page.getByLabel('Dentro da caixa').fill('Camiseta\nPin');
    await page.getByLabel(/publicado/i).check();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Salvo', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/admin\/[0-9a-f-]{36}$/);
    id = page.url().split('/').pop()!;
    await page.getByTestId('step-0').click(); await page.locator('details.more > summary').first().click();
    slug = await page.getByLabel('Link (slug)').inputValue();
  });

  test('link /c/:slug entrega as tags Open Graph e a imagem', async ({ request }) => {
    test.skip(!slug, 'depende do drop criado');
    const html = await (await request.get(`/c/${slug}`)).text();
    expect(html).toContain(`og:title" content="${name}"`);
    const img = html.match(/og:image" content="([^"]+)"/)![1].replace(/&amp;/g, '&');
    const r = await request.get(img);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('image/jpeg');
    expect((await r.body()).length).toBeLessThan(300_000); // WhatsApp ignora imagens grandes
  });

  test('aparece no acervo público e depois é excluído', async ({ page }) => {
    test.skip(!id, 'depende do drop criado');
    await page.goto(`/c/${slug}`);
    await expect(page.getByTestId('acervo')).toHaveAttribute('data-open', slug, { timeout: 30_000 });
    await page.goto(`/admin/${id}`);
    await page.getByPlaceholder('e-mail').fill(EMAIL);
    await page.getByPlaceholder('senha').fill(PASS);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.goto(`/admin/${id}`);
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('menu').click();
    await page.getByRole('dialog').getByRole('button', { name: /excluir/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });
});
