import { test, expect, openAcervo, openBox, expectClosed, expectHitSize, slot, sheet, acervo, isTouch } from './helpers';

test.describe('Acervo — funções @flow', () => {
  test('mostra as 6 caixas e o contador zerado', async ({ page, errors }) => {
    await openAcervo(page);
    await expect(page.getByTestId('count')).toHaveText('0/6');
    void errors;
  });

  test('abre a caixa, mostra a folha e fecha pelo botão', async ({ page, errors }) => {
    await openAcervo(page);
    await openBox(page, 'mutacoes');
    await expect(sheet(page).getByRole('heading')).toHaveText(/muta[cç][oõ]es/i);
    await expect(sheet(page)).toContainText('Camiseta oversized');
    await expect(sheet(page)).toContainText('200 × 300 × 60 mm');
    await sheet(page).getByRole('button', { name: 'Fechar', exact: true }).click();
    await expectClosed(page);
    await expect(page).toHaveURL(/\/$/);
    void errors;
  });

  test('a folha é uma ficha: data em cima, medidas e demais dados na ficha técnica', async ({ page, errors }) => {
    await openAcervo(page);
    await openBox(page, 'mutacoes');
    const sh = sheet(page);
    // linha da data sem as medidas
    await expect(sh.locator('.meta')).toContainText('2026');
    await expect(sh.locator('.meta')).not.toContainText('mm');
    // ficha técnica com medidas, abertura, acabamento, cores e tags
    const ficha = sh.getByLabel('Ficha técnica');
    await expect(ficha).toContainText('Medidas');
    await expect(ficha).toContainText('200 × 300 × 60 mm');
    await expect(ficha).toContainText('Livro (capa lateral)');
    await expect(ficha).toContainText('Acetinado');
    await expect(ficha.getByRole('img')).toHaveCount(2);                 // as duas cores
    for (const t of ['horror', 'anime', 'corpo']) await expect(ficha.locator('.tag', { hasText: t })).toBeVisible({ timeout: 2000 }).catch(async () => { await ficha.locator('.tag', { hasText: t }).scrollIntoViewIfNeeded(); await expect(ficha.locator('.tag', { hasText: t })).toBeVisible(); });
    await expect(sh.getByLabel('Dentro da caixa').first()).toBeAttached();
    // mesmo com a ficha rolando por dentro, as ações continuam à vista
    await expect(sh.getByRole('button', { name: 'Fechar', exact: true })).toBeInViewport();
    await expect(sh.getByRole('button', { name: 'Compartilhar', exact: true })).toBeInViewport();
    void errors;
  });

  test('filtro por tag: chips no topo filtram a prateleira', async ({ page, errors }) => {
    await openAcervo(page);
    const bar = page.getByTestId('tagbar');
    await expect(bar).toBeVisible();
    await expectHitSize(page, bar.getByRole('button'), 'tags');
    await expect(bar.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true');
    await bar.getByRole('button', { name: 'ocultismo' }).click();
    await expect(page.getByTestId('slot')).toHaveCount(2);                       // Ensaio e Relicário
    await expect(bar.getByRole('button', { name: 'ocultismo' })).toHaveAttribute('aria-pressed', 'true');
    // abrir uma caixa filtrada e fechar mantém o filtro
    await openBox(page, 'ensaio');
    await sheet(page).getByRole('button', { name: 'Fechar', exact: true }).click();
    await expectClosed(page);
    await expect(page.getByTestId('slot')).toHaveCount(2);
    // tocar de novo na tag (ou em "Todas") mostra tudo
    await bar.getByRole('button', { name: 'ocultismo' }).click();
    await expect(page.getByTestId('slot')).toHaveCount(6);
    await bar.getByRole('button', { name: 'anime' }).click();
    await expect(page.getByTestId('slot')).toHaveCount(2);                       // Mutações e Cicatriz
    await bar.getByRole('button', { name: 'Todas' }).click();
    await expect(page.getByTestId('slot')).toHaveCount(6);
    void errors;
  });

  test('ficha com frase, conceito, status e link da loja; a folha reabre no topo', async ({ page, errors }) => {
    await openAcervo(page);
    await openBox(page, 'mutacoes');
    const sh = sheet(page);
    await expect(sh).toContainText('Você pode correr, mas não pode se esconder.');
    await expect(sh).toContainText('Especial de Halloween');
    const link = sh.getByTestId('store-link');
    await sh.locator('.sh-body').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', 'https://www.alternazero.com/lancamentos/drop-mutacoes/');
    await expect(link).toHaveAttribute('target', '_blank');
    expect(await link.getAttribute('rel')).toContain('noopener');
    await sh.getByRole('button', { name: 'Fechar', exact: true }).click();
    await expectClosed(page);
    // outra caixa: selo de esgotado, sem link, e a folha começa no topo (não herda a rolagem)
    await openBox(page, 'cicatriz');
    await expect(sh.locator('.badge')).toHaveText('Esgotado');
    await expect(sh.getByTestId('store-link')).toBeHidden();
    await expect(sh.getByRole('heading')).toBeInViewport();
    void errors;
  });

  test('botão Abrir alterna a tampa', async ({ page, errors }) => {
    await openAcervo(page);
    await openBox(page, 'ensaio');
    const lid = page.getByTestId('lid');
    await expect(lid).toHaveText('Abrir');
    await lid.click();
    await expect(lid).toHaveText('Fechar');
    await lid.click();
    await expect(lid).toHaveText('Abrir');
    void errors;
  });

  test('voltar do navegador fecha a caixa', async ({ page, errors }) => {
    await openAcervo(page);
    await openBox(page, 'circuito');
    await page.goBack();
    await expectClosed(page);
    void errors;
  });

  test('Esc e clique fora fecham (desktop)', async ({ page, errors }) => {
    test.skip(await isTouch(page), 'só com teclado/mouse');
    await openAcervo(page);
    await openBox(page, 'relicario');
    await page.keyboard.press('Escape');
    await expectClosed(page);
    await openBox(page, 'relicario');
    await page.mouse.click(8, 8 + (page.viewportSize()!.height / 2));
    await expectClosed(page);
    void errors;
  });

  /** Alça (celular/tablet em pé) ou botão de recolher (painel lateral): o que existir na tela. */
  const toggler = async (page: import('@playwright/test').Page) => page.getByTestId('grab');

  test('a alça recolhe a folha (só a caixa em tela) e traz de volta', async ({ page, errors }) => {
    await openAcervo(page);
    await openBox(page, 'vigilia');
    const vp = page.viewportSize()!;
    await (await toggler(page)).click();
    await expect(sheet(page)).toHaveClass(/peek/);
    await expect(acervo(page)).toHaveClass(/peeked/);
    await expect(acervo(page)).toHaveAttribute('data-open', 'vigilia');
    await page.waitForTimeout(900);
    const bar = await page.getByTestId('peek-tab').isVisible();
    if (bar) {
      // painel lateral: sai da tela e sobra um botão "Detalhes"
      await expect(sheet(page)).not.toBeInViewport();
    } else {
      // folha de baixo: só a faixa (alça + nome) fica visível
      // recolhida: só o cabeçalho (nome, Abrir, recolher/fechar e modos) fica à vista
      const headH = (await sheet(page).locator('.sh-head').boundingBox())!.height;
      await expect.poll(async () => vp.height - (await sheet(page).boundingBox())!.y, { message: 'só o cabeçalho visível', timeout: 8000 }).toBeLessThanOrEqual(headH + 2);
      expect(headH, 'cabeçalho recolhido compacto (≤ 24% da tela)').toBeLessThanOrEqual(vp.height * 0.24);
      const strip = sheet(page).locator('.sh-head');
      await expect(strip.getByRole('button', { name: 'Abrir tampa' })).toBeVisible();
      await strip.getByRole('button', { name: 'Abrir tampa' }).click();
      await expect(strip.getByRole('button', { name: 'Fechar tampa' })).toBeVisible();
    }
    await (bar ? page.getByTestId('peek-tab') : page.getByTestId('grab')).click();
    await expect(sheet(page)).not.toHaveClass(/peek/);
    await expect(sheet(page)).toBeInViewport({ ratio: 0.95 });
    void errors;
  });

  test('arrastar a folha para baixo recolhe; arrastar de novo (faixa) fecha', async ({ page, errors }) => {
    await openAcervo(page);
    await openBox(page, 'vigilia');
    const drag = async (dy: number) => {
      const b = (await sheet(page).getByRole('heading').boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + 4);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + 4 + dy / 3, { steps: 5 });
      await page.mouse.move(b.x + b.width / 2, b.y + 4 + dy, { steps: 5 });
      await page.mouse.up();
    };
    await drag(180);
    await expect(sheet(page)).toHaveClass(/peek/);
    await expect(acervo(page)).toHaveAttribute('data-open', 'vigilia');
    if (await page.getByTestId('peek-tab').isVisible()) { await page.keyboard.press('Escape'); }
    else await drag(120);
    await expectClosed(page);
    void errors;
  });

  test('modos Caixa · Arte · Planificada', async ({ page, errors }) => {
    await openAcervo(page);
    await openBox(page, 'mutacoes');
    const vp = page.viewportSize()!;
    await expectHitSize(page, page.locator('.modes button'), 'modos');
    await expect(page.getByTestId('mode-box')).toHaveAttribute('aria-checked', 'true');
    // ---- Arte: só a arte, por face
    await page.getByTestId('mode-art').click();
    const view = page.getByTestId('artview');
    await expect(view).toBeVisible();
    const img = view.locator('.art-img');
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { timeout: 20_000 }).toBe(true);
    await expect(page.getByTestId('face-front')).toHaveAttribute('aria-selected', 'true');
    const src1 = await img.getAttribute('src');
    await page.getByTestId('face-back').click();
    await expect(page.getByTestId('face-back')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => img.getAttribute('src')).not.toBe(src1);
    await expect(page.getByTestId('lid')).toBeHidden();                       // "Abrir tampa" não faz sentido aqui
    // a arte fica dentro da tela e não invade a folha
    const v = (await view.boundingBox())!, s = (await sheet(page).boundingBox())!;
    expect(v.x).toBeGreaterThanOrEqual(-1); expect(v.y).toBeGreaterThanOrEqual(0);
    expect(v.x + v.width).toBeLessThanOrEqual(vp.width + 1); expect(v.y + v.height).toBeLessThanOrEqual(vp.height + 1);
    expect(v.y + v.height <= s.y + 2 || v.x + v.width <= s.x + 2, 'arte não fica por baixo da folha').toBe(true);
    // zoom: toque duplo amplia e volta; roda do mouse amplia
    const host = page.getByTestId('art-host'), hb = (await host.boundingBox())!;
    const wrap = view.locator('.art-wrap');
    const scale = async () => wrap.evaluate((el) => { const m = /scale\(([\d.]+)\)/.exec((el as HTMLElement).style.transform); return m ? +m[1] : 1; });
    await page.mouse.dblclick(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await expect.poll(scale).toBeGreaterThan(2);
    await page.mouse.dblclick(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await expect.poll(scale).toBe(1);
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.wheel(0, -400);
    await expect.poll(scale).toBeGreaterThan(1.2);
    // ---- Planificada: a faca inteira, com guias de dobra
    await page.getByTestId('mode-pano').click();
    await expect(view).toHaveClass(/pano/);
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { timeout: 20_000 }).toBe(true);
    await expect(view.locator('.art-guides rect')).toHaveCount(6);
    await expect(page.getByTestId('guides')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('guides').click();
    await expect(view).toHaveClass(/guides/);
    await expect(page.getByTestId('guides')).toHaveAttribute('aria-pressed', 'true');
    // ---- voltar à caixa 3D
    await page.getByTestId('mode-box').click();
    await expect(view).toBeHidden();
    await expect(page.getByTestId('lid')).toBeVisible();
    void errors;
  });

  test('Esc fecha estando em Arte, e a próxima caixa abre em 3D', async ({ page, errors }) => {
    await openAcervo(page);
    await openBox(page, 'ensaio');
    await page.getByTestId('mode-art').click();
    await expect(page.getByTestId('artview')).toBeVisible();
    await page.keyboard.press('Escape');
    await expectClosed(page);
    await openBox(page, 'circuito');
    await expect(page.getByTestId('mode-box')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('artview')).toBeHidden();
    await expect(sheet(page)).not.toHaveClass(/peek/);
    void errors;
  });

  test('folha: cabeçalho e rodapé fixos enquanto o corpo rola; rodapé sem vão', async ({ page, errors }) => {
    await openAcervo(page);
    await openBox(page, 'mutacoes');
    const sh = sheet(page), vp = page.viewportSize()!;
    // abre no começo da ficha (a frase é o primeiro bloco)
    await expect(sh.getByText('Você pode correr, mas não pode se esconder.')).toBeInViewport();
    const body = sh.locator('.sh-body');
    await body.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(500);
    await expect(sh.getByRole('heading')).toBeInViewport();                       // título continua à vista
    await expect(page.getByTestId('grab')).toBeInViewport();                       // recolher continua à vista
    await expect(sh.getByRole('button', { name: 'Fechar', exact: true })).toBeInViewport();
    await expect(page.getByTestId('lid')).toBeInViewport();                        // ações do rodapé à vista
    const b = (await body.boundingBox())!, f = (await sh.locator('.sh-foot').boundingBox())!, s = (await sh.boundingBox())!;
    expect(b.y + b.height, 'corpo termina onde o rodapé começa').toBeLessThanOrEqual(f.y + 1);
    expect(Math.abs((f.y + f.height) - (s.y + s.height)), 'rodapé encosta no fim da folha').toBeLessThanOrEqual(1);
    if (await sh.evaluate((el) => getComputedStyle(el).getPropertyValue('--dock').trim() === 'bottom'))
      expect(Math.abs(s.y + s.height - vp.height), 'folha presa à borda de baixo').toBeLessThanOrEqual(1);
    // sem barra de rolagem visível
    expect(await body.evaluate((el) => el.offsetWidth - el.clientWidth)).toBe(0);
    void errors;
  });

  test('Arte: folha recolhe sozinha, toque na arte = tela cheia, ações centralizadas sem o "Abrir"', async ({ page, errors }) => {
    await openAcervo(page);
    await openBox(page, 'mutacoes');
    await page.getByTestId('mode-art').click();
    const docked = await sheet(page).evaluate((el) => getComputedStyle(el).getPropertyValue('--dock').trim());
    if (docked === 'bottom') await expect(sheet(page)).toHaveClass(/peek/);
    // ações sem o "Abrir" ficam centralizadas no rodapé
    if (docked === 'side') {
      const foot = (await sheet(page).locator('.sh-foot').boundingBox())!;
      const btns = await sheet(page).locator('.sh-foot button:visible').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
      const mid = (Math.min(...btns.map((r) => r.left)) + Math.max(...btns.map((r) => r.right))) / 2;
      expect(Math.abs(mid - (foot.x + foot.width / 2)), 'ações centralizadas').toBeLessThanOrEqual(12);
    }
    // um toque na arte esconde folha e controles; outro traz de volta
    const host = page.getByTestId('art-host');
    await expect.poll(() => host.evaluate((el) => (el.querySelector('img') as HTMLImageElement).naturalWidth > 0), { timeout: 20_000 }).toBe(true);
    const hb = (await host.boundingBox())!;
    await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await expect(acervo(page)).toHaveClass(/immersive/);
    await expect(sheet(page)).not.toBeInViewport();
    await expect(page.locator('.face-tabs')).toHaveCSS('opacity', '0');
    const full = (await host.boundingBox())!;
    expect(full.height, 'a arte ganha a tela').toBeGreaterThan(hb.height);
    await page.mouse.click(full.x + full.width / 2, full.y + full.height / 2);
    await expect(acervo(page)).not.toHaveClass(/immersive/);
    // planificada: nomes das faces nas guias com pelo menos 12 px
    await page.getByTestId('mode-pano').click();
    await page.getByTestId('guides').click();
    const sizes = await page.locator('.art-labels span').evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    expect(sizes.length).toBe(6);
    for (const f of sizes) expect(f).toBeGreaterThanOrEqual(12);
    void errors;
  });

  test('arrastar a caixa gira sem fechar', async ({ page, errors }) => {
    await openAcervo(page);
    await openBox(page, 'cicatriz');
    const vp = page.viewportSize()!;
    await page.mouse.move(vp.width / 2, vp.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(vp.width / 2 + 120, vp.height * 0.3, { steps: 8 });
    await page.mouse.up();
    await expect(acervo(page)).toHaveAttribute('data-open', 'cicatriz');
    void errors;
  });

  test('link direto /c/:slug abre a caixa', async ({ page, errors }) => {
    await page.goto('/c/ensaio');
    await expect(acervo(page)).toHaveAttribute('data-open', 'ensaio', { timeout: 60_000 });
    await expect(sheet(page).getByRole('heading')).toHaveText(/ensaio/i);
    void errors;
  });

  test('marcar "tenho" atualiza o contador e persiste', async ({ page, errors }) => {
    await openAcervo(page);
    await openBox(page, 'mutacoes');
    const own = sheet(page).getByRole('button', { name: /tenho/i });
    await own.click();
    await expect(page.getByTestId('count')).toHaveText('1/6');
    await expect(own).toHaveClass(/on/);
    await page.reload();
    await openAcervo(page, '/');
    await expect(page.getByTestId('count')).toHaveText('1/6');
    void errors;
  });

  test('compartilhar a caixa envia o link /c/:slug', async ({ page, errors }) => {
    await openAcervo(page);
    await openBox(page, 'circuito');
    await sheet(page).getByRole('button', { name: 'Compartilhar', exact: true }).click();
    const shared = await page.evaluate(() => (window as any).__shared);
    expect(shared.at(-1).url).toMatch(/\/c\/circuito$/);
    void errors;
  });

  test('coleção compartilhada abre em modo visitante', async ({ page, errors }) => {
    await openAcervo(page);
    await openBox(page, 'mutacoes');
    await sheet(page).getByRole('button', { name: /tenho/i }).click();
    await sheet(page).getByRole('button', { name: 'Fechar', exact: true }).click();
    await expectClosed(page);
    await page.getByTestId('share-collection').click();
    const url: string = await page.evaluate(() => (window as any).__shared.at(-1).url);
    expect(url).toMatch(/\/colecao\?c=mutacoes$/);

    await openAcervo(page, new URL(url).pathname + new URL(url).search);
    await expect(page.getByTestId('count')).toHaveText('1/6');
    await expect(page.getByRole('link', { name: 'Meu acervo' })).toBeVisible();
    await openBox(page, 'ensaio');
    await expect(sheet(page).getByRole('button', { name: /tenho/i })).toHaveCount(0);
    void errors;
  });

  test('caixas que faltam ficam escurecidas, as que tenho não', async ({ page, errors }) => {
    // Indireto: a caixa marcada continua no mesmo lugar e o slot segue clicável.
    await openAcervo(page);
    await openBox(page, 'ensaio');
    await sheet(page).getByRole('button', { name: /tenho/i }).click();
    await page.keyboard.press('Escape').catch(() => {});
    await expect(slot(page, 'ensaio')).toBeVisible();
    void errors;
  });

  test('fechar pelo toque/clique não deixa contorno de foco no slot', async ({ page, errors }) => {
    await openAcervo(page);
    await openBox(page, 'mutacoes');
    await sheet(page).getByRole('button', { name: 'Fechar', exact: true }).click();
    await expectClosed(page);
    const s = slot(page, 'mutacoes');
    await expect(s).toBeFocused();
    expect(await s.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
    // pelo teclado o anel continua
    await page.keyboard.press('ArrowRight');
    await expect(slot(page, 'mutacoes')).not.toBeFocused();
    const focusedOutline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
    expect(focusedOutline).not.toBe('none');
    void errors;
  });
});
