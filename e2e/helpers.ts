import { expect, test as base, type Page, type Locator } from '@playwright/test';

/** Falha o teste se a página lançar erro de JS. Também guarda o que foi "compartilhado". */
export const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      (window as any).__shared = [];
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (d: ShareData) => { (window as any).__shared.push(d); },
      });
    });
    await use(errors);
    expect(errors, 'erros de JavaScript na página').toEqual([]);
  },
});
export { expect };
export type { Page, Locator };

export const isTouch = (page: Page) => page.evaluate(() => matchMedia('(pointer: coarse)').matches);

export async function openAcervo(page: Page, path = '/', n = 6) {
  await page.goto(path);
  const slots = page.getByTestId('slot');
  await expect(slots).toHaveCount(n, { timeout: 60_000 });
  await expect(page.locator('[data-testid="slot"][data-state="ready"]')).toHaveCount(n, { timeout: 60_000 });
  return slots;
}

export const slot = (page: Page, slug: string) => page.locator(`[data-testid="slot"][data-slug="${slug}"]`);
export const sheet = (page: Page) => page.getByTestId('sheet');
export const acervo = (page: Page) => page.getByTestId('acervo');

export async function openBox(page: Page, slug: string) {
  await slot(page, slug).click();
  await expect(acervo(page)).toHaveAttribute('data-open', slug);
  await expect(page).toHaveURL(new RegExp(`/c/${slug}`));
  await expect(sheet(page)).toBeInViewport({ ratio: 0.95 });
}

export async function expectClosed(page: Page) {
  await expect(acervo(page)).not.toHaveAttribute('data-open', /.+/);
  await expect(sheet(page)).not.toBeInViewport();
}

/** Tamanho mínimo de alvo: 44 px em toque (Apple HIG / Material 48dp ≈ 44–48), 32 px com mouse. */
export async function expectHitSize(page: Page, loc: Locator, label: string) {
  const min = (await isTouch(page)) ? 44 : 32;
  const n = await loc.count();
  for (let i = 0; i < n; i++) {
    const el = loc.nth(i);
    if (!(await el.isVisible())) continue;
    const b = (await el.boundingBox())!;
    const name = (await el.getAttribute('aria-label')) || (await el.innerText()).trim() || label;
    expect.soft(Math.round(Math.min(b.width, b.height)), `alvo "${name}" (${label}) ≥ ${min}px`).toBeGreaterThanOrEqual(min);
  }
}

export async function expectNoHorizontalScroll(page: Page, where: string) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect.soft(sw, `${where}: sem rolagem horizontal (${sw} > ${cw})`).toBeLessThanOrEqual(cw + 1);
}

/** Nenhum texto visível menor que 12 px. */
export async function expectReadableText(page: Page, where: string) {
  const tiny = await page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode as Text; const el = t.parentElement!;
      if (!t.textContent!.trim() || !el.offsetParent) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight || r.width === 0) continue;
      if (parseFloat(cs.fontSize) < 12) out.push(`${t.textContent!.trim().slice(0, 30)} (${cs.fontSize})`);
    }
    return out;
  });
  expect.soft(tiny, `${where}: textos menores que 12px`).toEqual([]);
}

export async function shot(page: Page, name: string) {
  await page.waitForTimeout(250);
  await test.info().attach(name, { body: await page.screenshot(), contentType: 'image/png' });
}
