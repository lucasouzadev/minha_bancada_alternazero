import { test, expect, openAcervo, openBox, isTouch, type Page } from './helpers';

/** Editor em 4 passos: Identidade → Caixa → Arte → Publicar. */
const next = (page: Page) => page.getByTestId('next').click();
const stepTab = (page: Page, n: number) => page.getByTestId(`step-${n}`).click();
const name = (page: Page) => page.getByLabel('Nome', { exact: true });
const openMore = async (page: Page) => { await page.locator('details.more:visible > summary').first().click(); };
/** Vai ao último passo (preenche o nome se ainda não tiver). */
async function toPublish(page: Page, nome: string) {
  await name(page).fill(nome);
  await next(page); await next(page); await next(page);
  await expect(page.getByRole('heading', { name: 'A ficha' })).toBeVisible();
}
const menuAction = async (page: Page, label: string | RegExp) => {
  await page.getByTestId('menu').click();
  await page.getByRole('dialog').getByRole('button', { name: label }).click();
};

test.describe('Editor — funções @flow', () => {
  test.describe.configure({ timeout: 240_000 });

  test('cria em 4 passos, publica, aparece no acervo e exclui', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await expect(page.getByRole('heading', { name: /novo drop/i })).toBeVisible();
    await name(page).fill('Teste E2E');
    await expect(page.getByText('Link: /c/teste-e2e')).toBeVisible();
    await next(page);
    await expect(page.getByRole('heading', { name: 'Tamanho e abertura' })).toBeVisible();
    await page.getByLabel('Largura (mm)').fill('180');
    await page.getByLabel('Altura (mm)').fill('260');
    await page.getByLabel('Profundidade (mm)').fill('70');
    await next(page);
    await page.getByRole('button', { name: 'Usar arte de exemplo' }).click();
    await next(page);
    await page.getByLabel('Dentro da caixa').fill('Camiseta\nAdesivo');
    await page.getByLabel(/publicado/i).check();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page).toHaveURL(/\/admin\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /editar drop/i })).toBeVisible();
    // tela "Pronto": o que acabou de subir
    await expect(page.getByText('No ar no acervo', { exact: true })).toBeVisible();
    await expect(page.locator('.done-step')).toContainText('180 × 260 × 70 mm');
    await expect(page.locator('.done-step')).toContainText('/c/teste-e2e');
    const id = page.url().split('/').pop()!;

    await openAcervo(page, '/', 7);
    await openBox(page, 'teste-e2e');
    await expect(page.getByTestId('sheet')).toContainText('180 × 260 × 70 mm');
    await expect(page.getByTestId('sheet')).toContainText('Camiseta');

    await page.goto(`/admin/${id}`);
    await menuAction(page, /excluir/i);
    await page.getByTestId('confirm-yes').click();
    await expect(page).toHaveURL(/\/admin$/);
    await openAcervo(page, '/', 6);
    void errors;
  });

  test('não publicado não aparece no acervo', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await toPublish(page, 'Rascunho E2E');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page).toHaveURL(/\/admin\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await openAcervo(page, '/', 6);
    void errors;
  });

  test('exige nome para avançar e para salvar', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await next(page);
    await expect(page.getByText('Dê um nome ao drop.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Como se chama?' })).toBeVisible();
    await page.getByTestId('step-3').click();
    await expect(page.getByRole('heading', { name: 'Como se chama?' })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/novo$/);
    void errors;
  });

  test('os passos navegam, o progresso acompanha e Voltar funciona', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await expect(page.getByTestId('prev')).toHaveCount(0);
    await name(page).fill('Passos');
    await next(page);
    await expect(page.getByTestId('step-1')).toHaveAttribute('aria-current', 'step');
    await expect(page.getByTestId('prev')).toBeVisible();
    await next(page); await next(page);
    await expect(page.getByTestId('step-3')).toHaveAttribute('aria-current', 'step');
    await expect(page.getByTestId('next')).toHaveCount(0);
    await page.getByTestId('prev').click();
    await expect(page.getByTestId('step-2')).toHaveAttribute('aria-current', 'step');
    await page.getByTestId('step-0').click();
    await expect(name(page)).toHaveValue('Passos');
    void errors;
  });

  test('mais opções (link, subtítulo, data) e medidas prontas', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await name(page).fill('Mutações Novas');
    await openMore(page);
    await expect(page.getByLabel('Link (slug)')).toHaveValue('mutacoes-novas');
    await next(page);
    await page.getByRole('button', { name: /^Compacta/ }).click();
    await expect(page.getByLabel('Largura (mm)')).toHaveValue('150');
    await expect(page.getByLabel('Altura (mm)')).toHaveValue('200');
    await expect(page.getByLabel('Profundidade (mm)')).toHaveValue('50');
    await expect(page.getByRole('button', { name: /^Compacta/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('radio', { name: 'Livro' }).click();
    await expect(page.getByRole('radio', { name: 'Livro' })).toHaveAttribute('aria-checked', 'true');
    void errors;
  });

  test('baixa o gabarito da faca com as medidas no nome', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await name(page).fill('Gabarito');
    await next(page);
    await page.getByLabel('Largura (mm)').fill('150');
    await next(page);
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: /baixar gabarito/i }).click();
    expect((await dl).suggestedFilename()).toMatch(/^gabarito-.*150x300x60\.png$/);
    void errors;
  });

  test('editar um drop existente carrega os dados (seletor de drop)', async ({ page, errors }) => {
    await openAcervo(page);
    await page.goto('/admin');
    await page.getByRole('link', { name: 'Editar Ensaio' }).click();
    await expect(page).toHaveURL(/\/admin\/[0-9a-f-]{36}$/);
    await expect(name(page)).toHaveValue('Ensaio');
    await expect(page.getByRole('heading', { name: /editar drop/i })).toBeVisible();
    await stepTab(page, 1);
    await expect(page.getByLabel('Profundidade (mm)')).toHaveValue('90');
    // editando, "Salvar" fica sempre à mão
    await expect(page.getByRole('button', { name: 'Salvar' })).toBeVisible();
    void errors;
  });

  test('salvar um drop novo atualiza a tela no lugar (sem tela preta)', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await toPublish(page, 'No Lugar E2E');
    await page.locator('.ed').evaluate((el) => { (el as any).__mark = 1; });
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page).toHaveURL(/\/admin\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /editar drop/i })).toBeVisible();
    expect(await page.locator('.ed').evaluate((el) => (el as any).__mark), 'mesma tela, não recriada').toBe(1);
    await page.getByTestId('menu').click();
    await expect(page.getByRole('dialog').getByRole('button', { name: /excluir/i })).toBeVisible();
    await expect(page.getByTestId('act-view')).toHaveCount(0);                   // rascunho: não tem página pública
    void errors;
  });

  test('voltar pelo cache do navegador recoloca os valores nos campos', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await name(page).fill('Horror');
    await next(page); await next(page); await next(page);
    await page.getByLabel('Tags').fill('anime, terror');
    // o que o Safari faz com campos autocomplete=off ao restaurar a página do cache
    await page.evaluate(() => {
      document.querySelectorAll<HTMLInputElement>('input[autocomplete="off"]').forEach((i) => { i.value = ''; });
      dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await expect(name(page)).toHaveValue('Horror');
    await expect(page.getByLabel('Tags')).toHaveValue('anime, terror');
    await expect(page.getByLabel('Link (slug)')).toHaveValue('horror');
    void errors;
  });

  test('rascunho automático: recarregar recupera o que foi digitado', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await name(page).fill('Rascunho Vivo');
    await next(page);
    await page.getByLabel('Largura (mm)').fill('222');
    // espera o rascunho estar mesmo gravado no aparelho (e não um tempo fixo, que varia com a máquina)
    await expect.poll(() => page.evaluate(() => new Promise<number | null>((res) => {
      const r = indexedDB.open('caixa3d');
      r.onerror = () => res(null);
      r.onsuccess = () => {
        try {
          const g = r.result.transaction('drafts').objectStore('drafts').get('new');
          g.onsuccess = () => { res(g.result?.w ?? null); r.result.close(); };
        } catch { res(null); }
      };
    })), { timeout: 15_000 }).toBe(222);
    await page.reload();
    await expect(page.getByText(/recuperamos o que você não tinha salvo/i)).toBeVisible();
    await expect(name(page)).toHaveValue('Rascunho Vivo');
    await stepTab(page, 1);
    await expect(page.getByLabel('Largura (mm)')).toHaveValue('222');
    await page.getByRole('button', { name: 'Descartar' }).click();
    await expect(name(page)).toHaveValue('');
    await expect(page.getByText(/recuperamos/i)).toHaveCount(0);
    void errors;
  });

  test('duplicar cria uma cópia não publicada para ajustar', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await name(page).fill('Original E2E');
    await next(page); await next(page);
    await page.getByRole('button', { name: 'Usar arte de exemplo' }).click();
    await next(page);
    await page.getByLabel(/publicado/i).check();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page).toHaveURL(/\/admin\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await menuAction(page, /duplicar/i);
    await expect(page.getByRole('dialog')).toContainText('Cria uma cópia em rascunho');
    await page.getByTestId('confirm-yes').click();
    await expect(page).toHaveURL(/\/admin\/novo$/);
    await expect(page.getByText(/cópia pronta/i)).toBeVisible();
    await expect(name(page)).toHaveValue('Original E2E (cópia)');
    await next(page); await next(page);
    await next(page);
    await expect(page.getByLabel(/publicado/i)).not.toBeChecked();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page).toHaveURL(/\/admin\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await page.getByTestId('step-0').click(); await openMore(page);
    await expect(page.getByLabel('Link (slug)')).toHaveValue('original-e2e-copia');
    void errors;
  });

  test('instalável: manifesto e ícones existem', async ({ page, request, errors }) => {
    await page.goto('/');
    const href = await page.locator('link[rel=manifest]').getAttribute('href');
    const m = await (await request.get(href!)).json();
    expect(m.display).toBe('standalone');
    for (const i of m.icons) expect((await request.get(i.src)).status(), i.src).toBe(200);
    expect((await request.get('/apple-touch-icon.png')).status()).toBe(200);
    void errors;
  });

  test('a prévia 3D não pisca ao redimensionar (barra do Safari, teclado, rolagem)', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await name(page).fill('Sem Pisca');
    await next(page);
    await expect(page.locator('.stage[data-ready]')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(800);
    const r = await page.evaluate(async () => {
      const cv = document.querySelector('.stage canvas') as HTMLCanvasElement;
      const gl = (cv.getContext('webgl2') || cv.getContext('webgl')) as WebGLRenderingContext;
      const alpha = () => { const a = new Uint8Array(4); gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, a); return a[3]; };
      let total = 0, blank = 0;
      // registrado depois do observador da cena: roda logo após o setSize, antes de qualquer frame novo
      const ro = new ResizeObserver(() => { total++; if (alpha() === 0) blank++; });
      ro.observe(document.querySelector('.stage')!);
      const ed = document.querySelector('.ed') as HTMLElement;
      for (let i = 0; i < 10; i++) {
        ed.style.setProperty('--vvh', `${innerHeight - (i % 2 ? 24 : 0)}px`);
        ed.style.setProperty('--stage-h', `${190 + (i % 2 ? 20 : 0)}px`);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }
      return { total, blank };
    });
    expect(r.total, 'houve redimensionamentos').toBeGreaterThan(3);
    expect(r.blank, 'quadros em branco').toBe(0);
    void errors;
  });

  test('teclado aberto (toque): a prévia some, o rodapé continua, e tudo volta depois', async ({ page, errors }) => {
    test.skip(!(await isTouch(page)) || page.viewportSize()!.width >= 1024, 'só celular/tablet em pé');
    await page.goto('/admin/novo');
    const ed = page.locator('.ed');
    await name(page).fill('Teclado');
    await next(page);
    await expect(page.locator('.ed-stage')).toBeVisible();
    await page.getByLabel('Largura (mm)').focus();
    await expect(ed).toHaveClass(/typing/);
    await expect(page.locator('.ed-stage')).toBeHidden();
    await expect(page.getByTestId('next')).toBeInViewport();
    // pular para o próximo campo não pisca
    await page.getByLabel('Altura (mm)').focus();
    await expect(ed).toHaveClass(/typing/);
    // botão não abre teclado
    await page.getByRole('radio', { name: 'Livro' }).focus();
    await expect(ed).not.toHaveClass(/typing/);
    await expect(page.locator('.ed-stage')).toBeVisible();
    void errors;
  });

  test('gestos nativos travados, campos continuam editáveis', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await expect(name(page)).toBeVisible();
    const vp = await page.locator('meta[name=viewport]').getAttribute('content');
    expect(vp).toMatch(/user-scalable=no/); expect(vp).toMatch(/maximum-scale=1/);
    const st = (sel: string, prop: string) => page.locator(sel).first().evaluate((el, p) => (getComputedStyle(el) as any)[p] || getComputedStyle(el).getPropertyValue(p), prop);
    expect(await st('body', 'userSelect')).toBe('none');
    expect(await st('.ed-title h2', 'userSelect')).toBe('none');
    expect(await st('input[name="drop-name"]', 'userSelect')).toBe('text');
    expect(await st('html', 'touchAction')).toBe('manipulation');
    expect(await st('html', 'overscrollBehaviorY')).toBe('none');
    await name(page).fill('Texto selecionável');
    await name(page).selectText();
    expect(await page.evaluate(() => { const i = document.activeElement as HTMLInputElement; return i.value.slice(i.selectionStart!, i.selectionEnd!); })).toBe('Texto selecionável');
    const blocked = await page.evaluate(() => {
      const ev = (t: Element, type: string) => { const e = new Event(type, { cancelable: true, bubbles: true }); t.dispatchEvent(e); return e.defaultPrevented; };
      return [ev(document.querySelector('.ed-title h2')!, 'selectstart'), ev(document.querySelector('.stage canvas')!, 'contextmenu'), ev(document.querySelector('input[name="drop-name"]')!, 'selectstart')];
    });
    expect(blocked).toEqual([true, true, false]);
    void errors;
  });

  test('frase, conceito, status, link da loja e sugestões de tags chegam à ficha', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await name(page).fill('Ficha Completa');
    await stepTab(page, 3);
    await page.getByLabel('Frase de destaque').fill('Nada se esconde.');
    await page.getByLabel('Conceito').fill('Um drop de teste com conceito.');
    // sugestões: as já usadas nos outros drops e os temas da marca; um toque adiciona
    await page.getByLabel('Tags').fill('ocu');
    await page.getByRole('button', { name: '+ ocultismo' }).click();
    await expect(page.getByLabel('Tags')).toHaveValue('ocultismo');
    await expect(page.getByRole('button', { name: '+ ocultismo' })).toHaveCount(0);
    await page.getByLabel('Tags').fill('ocultismo, ');
    await page.getByRole('button', { name: '+ halloween' }).click();
    await expect(page.getByLabel('Tags')).toHaveValue('ocultismo, halloween');
    await page.getByRole('radio', { name: 'Esgotado' }).click();
    await page.getByLabel('Link da loja').fill('https://www.alternazero.com/lancamentos/drop-teste/');
    await page.getByLabel(/publicado/i).check();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page).toHaveURL(/\/admin\/[0-9a-f-]{36}$/, { timeout: 30_000 });

    await openAcervo(page, '/', 7);
    await openBox(page, 'ficha-completa');
    const sh = page.getByTestId('sheet');
    await expect(sh).toContainText('Nada se esconde.');
    await expect(sh).toContainText('Um drop de teste com conceito.');
    await expect(sh.locator('.badge')).toHaveText('Esgotado');
    await expect(sh.getByLabel('Ficha técnica').locator('.tag')).toHaveText(['ocultismo', 'halloween']);
    await sh.locator('.sh-body').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(sh.getByTestId('store-link')).toHaveAttribute('href', 'https://www.alternazero.com/lancamentos/drop-teste/');
    void errors;
  });

  test('itens da caixa: atalhos com os acessórios e a embalagem da marca', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await name(page).fill('Itens');
    await stepTab(page, 3);
    const box = page.getByLabel('Dentro da caixa');
    for (const t of ['Cartela de adesivos', 'Pin Rubedo', 'Caderno Grande Obra', 'Boné Aniquilação', 'Gorro O Fruto', 'Ziplock da marca'])
      await expect(page.getByRole('button', { name: `+ ${t}` })).toBeVisible();
    await page.getByRole('button', { name: '+ Cartela de adesivos' }).click();
    await page.getByRole('button', { name: '+ Pin Rubedo' }).click();
    await expect(box).toHaveValue('Cartela de adesivos\nPin Rubedo');
    await expect(page.getByRole('button', { name: '+ Pin Rubedo' })).toHaveCount(0);   // já está na lista
    // digitar à mão continua valendo e atualiza os atalhos
    await box.fill('Pin Rubedo\nMeu item');
    await expect(page.getByRole('button', { name: '+ Cartela de adesivos' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Pin Rubedo' })).toHaveCount(0);
    void errors;
  });

  test('link da loja inválido (javascript:) é recusado ao salvar', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await name(page).fill('Link Ruim');
    await stepTab(page, 3);
    await page.getByLabel('Link da loja').fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText(/começando com https/i)).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/novo$/);
    await page.getByLabel('Link da loja').fill('https://www.alternazero.com/');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page).toHaveURL(/\/admin\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    void errors;
  });

  test('Pronto: rascunho oferece "Publicar agora"; publicado leva ao acervo; "Editar" volta aos passos', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await toPublish(page, 'Pronto E2E');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Salvo como rascunho', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.ed-stage')).toBeVisible();                        // a caixa como ficou
    await page.getByTestId('publish-now').click();
    await expect(page.getByText('No ar no acervo', { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('edit-again').click();
    await expect(page.getByRole('heading', { name: 'Como se chama?' })).toBeVisible();
    await expect(name(page)).toHaveValue('Pronto E2E');
    await page.getByTestId('step-3').click();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await page.getByTestId('see').click();
    await expect(page).toHaveURL(/\/c\/pronto-e2e/);
    await expect(page.getByTestId('acervo')).toHaveAttribute('data-open', 'pronto-e2e', { timeout: 60_000 });
    void errors;
  });

  test('menus em folha: alça, título e "Excluir" sem estilo de botão de pílula', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await toPublish(page, 'Menu E2E');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Salvo como rascunho', { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('menu').click();
    const d = page.getByRole('dialog');
    await expect(d.locator('.sh-handle')).toBeVisible();
    await expect(d.locator('.dlg-title')).toHaveText('Ações');
    const del = d.getByRole('button', { name: /excluir/i });
    expect(await del.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('0px');
    expect(await del.evaluate((el) => getComputedStyle(el).justifyContent)).not.toBe('center');
    // folha presa à borda de baixo
    const vp = page.viewportSize()!;
    await expect.poll(async () => { const b = (await d.boundingBox())!; return Math.abs(b.y + b.height - vp.height); }).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');
    void errors;
  });

  test('sugestões de tags aparecem também com o campo já preenchido', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await name(page).fill('Tags Cheias');
    await stepTab(page, 3);
    await page.getByLabel('Tags').fill('Anime, Terror, Horror');
    await page.getByLabel('Frase de destaque').focus();                           // sai do campo
    await expect(page.getByRole('button', { name: '+ halloween' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ horror' })).toHaveCount(0);   // já está nas tags
    void errors;
  });

  test('campo de data não invade o vizinho; "Mais opções" só com o secundário', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await expect(page.getByLabel('Subtítulo')).toBeVisible();
    await expect(page.getByLabel('Lançamento')).toBeVisible();
    const date = (await page.getByLabel('Lançamento').boundingBox())!, scroll = (await page.locator('.ed-scroll').boundingBox())!;
    expect(date.x + date.width).toBeLessThanOrEqual(scroll.x + scroll.width);
    await expect(page.getByLabel('Link (slug)')).toBeHidden();
    await expect(page.getByLabel('Artista')).toBeHidden();
    void errors;
  });

  test('painel do editor: lista, filtro, publicar/remover, duplicar e excluir com confirmação', async ({ page, errors }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('hub')).toBeVisible();
    const rows = page.getByTestId('hub-list').getByRole('listitem');
    await expect(rows).toHaveCount(6);
    await expect(page.getByText('6 drops · 6 no ar · 0 rascunhos')).toBeVisible();
    // remover do acervo: explica e confirma
    const row = rows.filter({ hasText: 'Ensaio' });
    await row.getByTestId('row-menu').click();
    await expect(page.getByRole('dialog')).toContainText('some da prateleira');
    await page.getByTestId('act-unpub').click();
    await expect(page.getByRole('dialog')).toContainText('Nada é apagado');
    await page.getByTestId('confirm-yes').click();
    await expect(row).toContainText('Rascunho');
    await page.getByRole('radio', { name: 'Rascunhos' }).click();
    await expect(rows).toHaveCount(1);
    await page.getByRole('radio', { name: 'Todos' }).click();
    // cancelar não faz nada
    await rows.filter({ hasText: 'Circuito' }).getByTestId('row-menu').click();
    await page.getByTestId('act-del').click();
    await page.getByTestId('confirm-no').click();
    await expect(rows).toHaveCount(6);
    // excluir de verdade
    await rows.filter({ hasText: 'Circuito' }).getByTestId('row-menu').click();
    await page.getByTestId('act-del').click();
    await page.getByTestId('confirm-yes').click();
    await expect(rows).toHaveCount(5);
    // o acervo público reflete: Ensaio (rascunho) e Circuito (excluído) fora
    await openAcervo(page, '/', 4);
    // duplicar pelo painel abre o editor com a cópia
    await page.goto('/admin');
    await rows.filter({ hasText: 'Relicário' }).getByTestId('row-menu').click();
    await page.getByTestId('act-dup').click();
    await page.getByTestId('confirm-yes').click();
    await expect(page).toHaveURL(/\/admin\/novo$/);
    await expect(name(page)).toHaveValue('Relicário (cópia)');
    void errors;
  });

  test('folhas de ação saem animadas (Cancelar, Esc)', async ({ page, errors }) => {
    await page.goto('/admin');
    await page.getByTestId('row-menu').first().click();
    const d = page.locator('dialog.sheet-dlg[open]');
    await expect(d).toBeVisible();
    await d.getByRole('button', { name: 'Cancelar' }).click();
    await expect(d).toHaveClass(/closing/);                                       // saída animada
    await expect(page.locator('dialog.sheet-dlg[open]')).toHaveCount(0);
    await page.getByTestId('row-menu').first().click();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.sheet-dlg.closing')).toHaveCount(1);
    await expect(page.locator('dialog.sheet-dlg[open]')).toHaveCount(0);
    void errors;
  });

  test('teclado: "›" passa para o próximo campo e, no último, para o próximo passo; rodapé some ao digitar (toque)', async ({ page, errors }) => {
    await page.goto('/admin/novo');
    await name(page).fill('Teclas');
    await name(page).press('Enter');
    await expect(page.getByLabel('Subtítulo')).toBeFocused();
    if (await isTouch(page) && page.viewportSize()!.width < 1024) await expect(page.locator('.ed-foot')).toBeHidden();
    await page.getByLabel('Subtítulo').press('Enter');                            // data não abre teclado: pula
    await expect(page.getByRole('heading', { name: 'Tamanho e abertura' })).toBeVisible();
    void errors;
  });
});
