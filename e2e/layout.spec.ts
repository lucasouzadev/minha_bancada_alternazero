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
    await expectHitSize(page, page.locator('.modes button'), 'modos');
    const mb = (await page.locator('.modes').boundingBox())!;
    expect.soft(mb.x, 'modos dentro da tela').toBeGreaterThanOrEqual(0);
    expect.soft(mb.x + mb.width, 'modos dentro da tela').toBeLessThanOrEqual(vp.width);
    expect.soft(mb.y + mb.height <= s.y || mb.x + mb.width <= s.x || mb.x >= s.x + s.width, 'modos não cobrem a folha').toBe(true);
    await expectReadableText(page, 'folha');
    await expectNoHorizontalScroll(page, 'folha aberta');
    await shot(page, 'caixa-aberta');
    await page.getByTestId('lid').click();
    await page.waitForTimeout(1200);
    await shot(page, 'caixa-tampa-aberta');
    void errors;
  });

  test('editor (4 passos)', async ({ page, errors }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /novo drop/i })).toBeVisible();
    const vp = page.viewportSize()!;
    const touch = await isTouch(page);
    const name = page.getByLabel('Nome', { exact: true });
    await name.fill('Layout');
    const wide = vp.width >= 1024 || (vp.width >= 700 && vp.height <= 500);

    for (let n = 0; n < 4; n++) {
      if (n > 0) await page.getByTestId(`step-${n}`).click();
      const where = `editor passo ${n + 1}`;
      await expectNoHorizontalScroll(page, where);
      await expectReadableText(page, where);
      await expectHitSize(page, page.locator('.ed button, .ed a, .ed summary'), where);
      // a tela nunca rola inteira e ocupa exatamente a área visível (nada grudado/sobreposto)
      const m = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, ed: document.querySelector('.ed')!.getBoundingClientRect().toJSON() }));
      expect.soft(m.sh, `${where}: página não rola`).toBeLessThanOrEqual(m.ih + 1);
      expect.soft(Math.round(m.ed.height), `${where}: editor = altura visível`).toBe(m.ih);
      // rodapé alcançável e não coberto
      const foot = page.getByTestId(n === 3 ? 'save' : 'next');
      const hit = await foot.evaluate((el) => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('button') === el; });
      expect.soft(hit, `${where}: botão do rodapé clicável (não coberto)`).toBe(true);
      // nenhum bloco do conteúdo escapa por baixo do rodapé: o último campo pode rolar até ficar visível
      const sc = (await page.locator('.ed-scroll').boundingBox())!, ft = (await page.locator('.ed-foot').boundingBox())!;
      expect.soft(sc.y + sc.height, `${where}: conteúdo termina onde o rodapé começa`).toBeLessThanOrEqual(ft.y + 1);
      if (touch) {
        const small = await page.locator('.ed-scroll input:not([type=checkbox]):not([type=color]):not([type=file]), .ed-scroll textarea')
          .evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => (e as HTMLInputElement).name));
        expect.soft(small, `${where}: campos com fonte < 16px em toque`).toEqual([]);
      }
      // prévia: onde ajuda (Caixa e Arte) no celular; sempre ao lado no desktop/deitado
      const stage = page.locator('.ed-stage');
      if (wide) {
        const c = (await stage.boundingBox())!, f = (await name.boundingBox());
        expect.soft(c.width, `${where}: prévia larga ao lado`).toBeGreaterThan(vp.width * 0.4);
        expect.soft(c.x, `${where}: prévia à direita do formulário`).toBeGreaterThan((f?.x ?? 0));
      } else if (n === 1 || n === 2) {
        const c = (await stage.boundingBox())!;
        expect.soft(c.height, `${where}: prévia com altura útil`).toBeGreaterThanOrEqual(Math.min(140, vp.height * 0.2));
        expect.soft(c.height / vp.height, `${where}: prévia não domina a tela`).toBeLessThanOrEqual(0.5);
        const sc2 = (await page.locator('.ed-scroll').boundingBox())!;
        expect.soft(sc2.height, `${where}: sobra espaço para o formulário`).toBeGreaterThanOrEqual(vp.height * 0.3);
      } else {
        await expect(stage).toBeHidden();
      }
      await shot(page, `editor-passo-${n + 1}`);
    }
    void errors;
  });
});
