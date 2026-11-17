import { test, expect, openAcervo, openBox, expectHitSize, expectNoHorizontalScroll, expectReadableText, isTouch, sheet, shot } from './helpers';

/**
 * Regras de layout que valem para todas as telas (celular, dobrável, tablet, notebook, desktop, ultrawide).
 * Usam expect.soft: um teste lista todos os problemas da tela de uma vez.
 */
test.describe('Layout @layout', () => {
  test('acervo', async ({ page, errors }) => {
    await openAcervo(page);
    const vp = page.viewportSize()!;
    await expectNoHorizontalScroll(page, 'acervo');
    await expectReadableText(page, 'acervo');
    await expectHitSize(page, page.locator('header button, header a'), 'cabeçalho');

    // prateleira: slots com largura razoável e iguais por linha, conteúdo centralizado
    const boxes = await page.getByTestId('slot').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    for (const b of boxes) {
      expect.soft(b.width, 'slot largo o bastante').toBeGreaterThanOrEqual(88);
      expect.soft(b.width, 'slot não gigante').toBeLessThanOrEqual(320);
    }
    const left = Math.min(...boxes.map((b) => b.left)), right = Math.max(...boxes.map((b) => b.right));
    expect.soft(Math.abs(left - (vp.width - right)), 'prateleira centralizada').toBeLessThanOrEqual(24);
    await shot(page, 'acervo');
    void errors;
  });

  test('caixa aberta + folha', async ({ page, errors }) => {
    await openAcervo(page);
    await openBox(page, 'mutacoes');
    await page.waitForTimeout(900);
    const vp = page.viewportSize()!;
    const s = (await sheet(page).boundingBox())!;
    expect.soft(s.y, 'folha começa dentro da tela').toBeGreaterThanOrEqual(0);
    expect.soft(s.y + s.height, 'folha termina dentro da tela').toBeLessThanOrEqual(vp.height + 1);
    expect.soft(s.width, 'folha com largura de leitura (≤ 640px)').toBeLessThanOrEqual(640);
    // sobra espaço para a caixa 3D: acima da folha ou ao lado dela
    const free = Math.max(s.y * vp.width, s.x * vp.height, (vp.width - s.x - s.width) * vp.height);
    expect.soft(free / (vp.width * vp.height), 'área livre para a caixa ≥ 35% da tela').toBeGreaterThanOrEqual(0.35);
    await expectHitSize(page, sheet(page).getByRole('button'), 'folha');
    await expectReadableText(page, 'folha');
    await expectNoHorizontalScroll(page, 'folha aberta');
    await shot(page, 'caixa-aberta');
    await page.getByTestId('lid').click();
    await page.waitForTimeout(1200);
    await shot(page, 'caixa-tampa-aberta');
    void errors;
  });

  test('editor', async ({ page, errors }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /novo drop/i })).toBeVisible();
    const vp = page.viewportSize()!;
    await expectNoHorizontalScroll(page, 'editor');
    await expectReadableText(page, 'editor');
    await expectHitSize(page, page.locator('main button, aside button, .panel button'), 'editor');

    // campos ≥ 16px em toque (evita zoom automático do iOS)
    if (await isTouch(page)) {
      const small = await page.locator('input:not([type=checkbox]):not([type=color]):not([type=file]), select, textarea')
        .evaluateAll((els) => els.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => (e as HTMLInputElement).name || e.tagName));
      expect.soft(small, 'campos com fonte < 16px em toque').toEqual([]);
    }

    const canvas = page.locator('.stage canvas, [data-testid="preview"] canvas').first();
    const c = (await canvas.boundingBox())!;
    expect.soft(c.height, 'pré-visualização 3D com altura útil').toBeGreaterThanOrEqual(Math.min(220, vp.height * 0.3));
    const form = (await page.getByLabel('Nome', { exact: true }).boundingBox())!;
    if (vp.width >= 1024) expect.soft(c.x, 'desktop/tablet deitado: prévia ao lado do formulário').toBeGreaterThan(form.x + form.width - 1);

    // o botão Salvar precisa ser alcançável e não ficar escondido sob a prévia fixa
    const save = page.getByRole('button', { name: 'Salvar' });
    await save.scrollIntoViewIfNeeded();
    const hit = await save.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('button') === el;
    });
    expect.soft(hit, 'Salvar clicável (não coberto)').toBe(true);
    await page.evaluate(() => scrollTo(0, 0));
    await shot(page, 'editor');
    void errors;
  });
});
