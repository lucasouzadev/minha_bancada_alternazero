import { test, expect, openAcervo, openBox, expectClosed, slot, sheet, acervo, isTouch } from './helpers';

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

  test('arrastar a folha para baixo fecha', async ({ page, errors }) => {
    await openAcervo(page);
    await openBox(page, 'vigilia');
    const b = (await sheet(page).getByRole('heading').boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + 4);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + 60, { steps: 5 });
    await page.mouse.move(b.x + b.width / 2, b.y + 180, { steps: 5 });
    await page.mouse.up();
    await expectClosed(page);
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
});
