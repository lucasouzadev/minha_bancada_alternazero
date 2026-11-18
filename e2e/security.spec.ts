import AxeBuilder from '@axe-core/playwright';
import { test, expect, openAcervo, openBox, type Page } from './helpers';

/** Segurança e acessibilidade: roda em um celular e um desktop (o resto das telas já cobre o layout). */
const ONLY = /^(phone|desktop)$/;
const done = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
const next = async (page: Page) => { await done(page); await page.getByTestId('next').click(); };

const XSS = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>"'><svg onload=window.__xss=3>`;

test.describe('Segurança @flow', () => {
  test.describe.configure({ timeout: 240_000 });
  test.beforeEach(({}, info) => { test.skip(!ONLY.test(info.project.name), 'só celular e desktop'); });

  test('texto com HTML/script em todos os campos aparece como texto e nunca executa; link javascript: é recusado', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await page.getByLabel('Nome', { exact: true }).fill(`XSS ${XSS}`);
    await page.getByLabel('Subtítulo').fill(XSS);
    await next(page); await next(page);
    await page.getByRole('button', { name: 'Usar arte de exemplo' }).click();
    await next(page);
    await page.getByLabel('Frase').fill(XSS);
    await page.getByLabel('Conceito').fill(XSS);
    await page.getByLabel('Dentro da caixa').fill(`${XSS}\nCamiseta`);
    await page.getByLabel('Link da loja').fill('javascript:window.__xss=4');
    await page.getByLabel(/publicado/i).check();
    await done(page);
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Use um link completo, começando com https://')).toBeVisible(); // javascript: é recusado
    await expect(page).toHaveURL(/admin\/novo$/);
    await page.getByLabel('Link da loja').fill('https://alternazero.com/x" onmouseover="window.__xss=5');
    await done(page);
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page).toHaveURL(/\/admin\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const id = page.url().split('/').pop()!;

    await openAcervo(page, '/', 7);
    const slug = await page.locator('[data-testid="slot"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-slug')).find((s) => s?.startsWith('xss')));
    await openBox(page, slug!);
    const sh = page.getByTestId('sheet');
    await expect(sh).toContainText('<img src=x');                                // aparece como texto
    expect(await sh.locator('img[src="x"], script, svg[onload]').count()).toBe(0); // nada vira elemento
    expect(await sh.locator('a[href^="javascript:"], [onmouseover]').count()).toBe(0);
    await sh.locator('a[href^="https://alternazero.com"]').hover().catch(() => {});
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();

    // painel também
    await page.goto('/admin');
    await expect(page.locator('.hub-row, [data-testid="hub-row"]').first()).toBeVisible();
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();

    await page.goto(`/admin/${id}`);
    await page.getByTestId('menu').click();
    await page.getByRole('dialog').getByRole('button', { name: /excluir/i }).click();
    await page.getByTestId('confirm-yes').click();
    await expect(page).toHaveURL(/\/admin$/);
    void errors;
  });

  test('parâmetros na URL não injetam nada', async ({ page, errors }) => {
    await page.goto(`/c/${encodeURIComponent('"><img src=x onerror=window.__xss=1>')}`);
    await page.goto(`/?c=${encodeURIComponent('<img src=x onerror=window.__xss=1>')}#<svg onload=window.__xss=2>`);
    await page.goto(`/admin/${encodeURIComponent('<img src=x onerror=window.__xss=1>')}`);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
    void errors;
  });
});

/** axe-core (WCAG 2.1 A/AA): sem violações sérias/críticas nas telas principais. */
async function axe(page: Page, where: string) {
  // mede depois das animações de entrada (opacidade parcial engana o cálculo de contraste)
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && !(a.effect as KeyframeEffect)?.target?.closest?.('.skel, .spinner')).length)).toBe(0);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('canvas').analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${where}: ${v.id} (${v.impact}) → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
}

test.describe('Acessibilidade @flow', () => {
  test.describe.configure({ timeout: 180_000 });
  test.beforeEach(({}, info) => { test.skip(!ONLY.test(info.project.name), 'só celular e desktop'); });

  test('acervo, caixa aberta, painel e cada passo do editor', async ({ page, errors }) => {
    await openAcervo(page);
    await axe(page, 'acervo');
    await openBox(page, 'mutacoes');
    await axe(page, 'caixa');
    await page.goto('/admin');
    await expect(page.locator('.hub-row').first()).toBeVisible();
    await axe(page, 'painel');
    await page.goto('/admin/novo');
    await page.getByLabel('Nome', { exact: true }).fill('A11y');
    for (let i = 0; i < 4; i++) {
      await axe(page, `editor passo ${i + 1}`);
      if (i < 3) await next(page);
    }
    void errors;
  });
});

test.describe('Resiliência @flow', () => {
  test.beforeEach(({}, info) => { test.skip(!ONLY.test(info.project.name), 'só celular e desktop'); });

  test('falha ao carregar mostra aviso com "Tentar de novo" (e volta a funcionar)', async ({ page }) => {
    let block = true;
    await page.route(/\/assets\/hub-.*\.js$/, (r) => (block ? r.abort() : r.continue()));
    await page.goto('/admin');
    await expect(page.getByRole('alert')).toContainText('Não foi possível carregar');
    block = false;
    await page.getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(page.locator('.hub-row').first()).toBeVisible();
  });

  test('página de privacidade abre a partir do acervo', async ({ page, errors }) => {
    await openAcervo(page);
    await page.getByRole('link', { name: 'Privacidade e termos' }).click();
    await expect(page.getByRole('heading', { name: 'Privacidade e termos' })).toBeVisible();
    void errors;
  });
});
