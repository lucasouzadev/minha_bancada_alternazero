import { test, expect, openAcervo, openBox } from './helpers';

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
});
