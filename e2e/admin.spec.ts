import { test, expect, openAcervo, openBox, isTouch } from './helpers';

test.describe('Editor — funções @flow', () => {
  test.describe.configure({ timeout: 240_000 });
  test('cria, publica, aparece no acervo e exclui um drop', async ({ page, errors }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /novo drop/i })).toBeVisible();
    await page.getByLabel('Nome', { exact: true }).fill('Teste E2E');
    await expect(page.getByLabel('Link (slug)')).toHaveValue('teste-e2e');
    await page.getByLabel('Largura (mm)').fill('180');
    await page.getByLabel('Altura (mm)').fill('260');
    await page.getByLabel('Profundidade (mm)').fill('70');
    await page.getByLabel('Dentro da caixa').fill('Camiseta\nAdesivo');
    await page.getByRole('button', { name: 'Usar arte de exemplo' }).click();
    await page.getByLabel(/publicado/i).check();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page).toHaveURL(/\/admin\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /editar drop/i })).toBeVisible();
    const id = page.url().split('/').pop()!;

    await openAcervo(page, '/', 7);
    await openBox(page, 'teste-e2e');
    await expect(page.getByTestId('sheet')).toContainText('180 × 260 × 70 mm');
    await expect(page.getByTestId('sheet')).toContainText('Camiseta');

    await page.goto(`/admin/${id}`);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Excluir' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await openAcervo(page, '/', 6);
    void errors;
  });

  test('não publicado não aparece no acervo', async ({ page, errors }) => {
    await page.goto('/admin');
    await page.getByLabel('Nome', { exact: true }).fill('Rascunho E2E');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page).toHaveURL(/\/admin\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await openAcervo(page, '/', 6);
    void errors;
  });

  test('exige nome para salvar', async ({ page, errors }) => {
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText(/nome/i).last()).toBeVisible();
    await expect(page).toHaveURL(/\/admin$/);
    void errors;
  });

  test('baixa o gabarito da faca com as medidas no nome', async ({ page, errors }) => {
    await page.goto('/admin');
    await page.getByLabel('Largura (mm)').fill('150');
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: /baixar gabarito/i }).click();
    expect((await dl).suggestedFilename()).toMatch(/^gabarito-.*150x300x60\.png$/);
    void errors;
  });

  test('editar um drop existente carrega os dados', async ({ page, errors }) => {
    await openAcervo(page);
    await page.goto('/admin');
    const pick = page.locator('select').first();
    const opt = await pick.locator('option', { hasText: 'Ensaio' }).getAttribute('value');
    await pick.selectOption(opt!);
    await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Ensaio');
    await expect(page.getByLabel('Profundidade (mm)')).toHaveValue('90');
    void errors;
  });

  test('salvar um drop novo atualiza a tela no lugar (sem tela preta)', async ({ page, errors }) => {
    await page.goto('/admin');
    await page.getByLabel('Nome', { exact: true }).fill('No Lugar E2E');
    await expect(page.getByRole('button', { name: 'Excluir' })).toBeHidden();
    await page.locator('.admin').evaluate((el) => { (el as any).__mark = 1; });
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page).toHaveURL(/\/admin\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /editar drop/i })).toBeVisible();
    expect(await page.locator('.admin').evaluate((el) => (el as any).__mark), 'mesma tela, não recriada').toBe(1);
    await expect(page.getByRole('button', { name: 'Excluir' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver página' })).toHaveAttribute('href', '/c/no-lugar-e2e?preview');
    await expect(page.locator('select').first()).toHaveValue(page.url().split('/').pop()!);
    await expect(page.locator('select').first().locator('option:checked')).toHaveText('No Lugar E2E');
    void errors;
  });

  test('voltar pelo cache do navegador recoloca os valores nos campos', async ({ page, errors }) => {
    await page.goto('/admin');
    await page.getByLabel('Nome', { exact: true }).fill('Horror');
    await page.getByLabel('Tags').fill('anime, terror');
    // o que o Safari faz com campos autocomplete=off ao restaurar a página do cache
    await page.evaluate(() => {
      document.querySelectorAll<HTMLInputElement>('input[autocomplete="off"]').forEach((i) => { i.value = ''; });
      dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Horror');
    await expect(page.getByLabel('Tags')).toHaveValue('anime, terror');
    await expect(page.getByLabel('Link (slug)')).toHaveValue('horror');
    void errors;
  });

  test('medidas alinhadas, com a unidade dentro do campo', async ({ page, errors }) => {
    await page.goto('/admin');
    const tops = await Promise.all(['Largura (mm)', 'Altura (mm)', 'Profundidade (mm)'].map(async (l) => (await page.getByLabel(l).boundingBox())!.y));
    expect(Math.max(...tops) - Math.min(...tops), 'campos de medida na mesma linha').toBeLessThanOrEqual(1);
    void errors;
  });

  test('teclado aberto (toque): prévia e Salvar deixam de grudar e voltam depois', async ({ page, errors }) => {
    test.skip(!(await isTouch(page)), 'só em toque');
    await page.goto('/admin');
    const admin = page.locator('.admin');
    const pos = (sel: string) => page.locator(sel).evaluate((el) => getComputedStyle(el).position);
    await page.getByLabel('Nome', { exact: true }).focus();
    await expect(admin).toHaveClass(/typing/);
    expect(await pos('.actions')).toBe('relative');
    if ((page.viewportSize()!.width) < 1024) expect(await pos('.preview')).toBe('relative');
    // pular para o próximo campo não pisca
    await page.getByLabel('Subtítulo').focus();
    await expect(admin).toHaveClass(/typing/);
    // seletor/data/interruptor não abrem teclado
    await page.getByLabel(/publicado/i).focus();
    await expect(admin).not.toHaveClass(/typing/);
    expect(await pos('.actions')).toBe('sticky');
    void errors;
  });
});
