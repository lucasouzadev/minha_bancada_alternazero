import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';

/**
 * E2E — duas partes:
 *  - local (padrão): build sem Supabase (IndexedDB + 6 caixas de exemplo), roda em várias telas.
 *      @flow   = funções (abrir caixa, coleção, compartilhar, editor…) — em celular, tablet e desktop
 *      @layout = regras de layout por tela — em todos os tamanhos
 *  - remoto (E2E_REMOTE=1): produção + Supabase com a conta de teste (@remote).
 *
 * CHROME_PATH aponta para um Chrome já instalado (senão usa o do `npx playwright install chromium`).
 */
const exe = process.env.CHROME_PATH;
const launch = {
  ...(exe ? { executablePath: exe } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
};
const touch = { isMobile: true, hasTouch: true };
const LAYOUT = /@flow|@layout/;

type P = NonNullable<PlaywrightTestConfig['projects']>[number];
const local = (name: string, use: P['use'], grep: RegExp): P => ({
  name, grep, grepInvert: /@remote/,
  use: { browserName: 'chromium', launchOptions: launch, ...use },
});

const REMOTE = !!process.env.E2E_REMOTE;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  outputDir: 'e2e-results',
  use: { baseURL: 'http://localhost:4317', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: REMOTE ? undefined : {
    // variáveis vazias = modo local, mesmo que exista um .env com Supabase
    command: 'VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 4317 --strictPort',
    url: 'http://localhost:4317',
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: REMOTE
    ? [{ name: 'remote', grep: /@remote/, use: { browserName: 'chromium', launchOptions: launch, baseURL: process.env.E2E_BASE_URL || 'https://caixas-3d.vercel.app', viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] } }]
    : [
        // celulares
        local('phone-sm', { viewport: { width: 360, height: 740 }, deviceScaleFactor: 3, ...touch }, /@layout/),       // Android compacto
        local('phone', { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, ...touch }, LAYOUT),             // iPhone 15/16
        local('phone-lg', { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, ...touch }, /@layout/),       // iPhone Pro Max
        local('phone-landscape', { viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, ...touch }, /@layout/),
        local('foldable', { viewport: { width: 673, height: 841 }, deviceScaleFactor: 2.6, ...touch }, /@layout/),       // Galaxy Fold aberto
        // tablets
        local('tablet-portrait', { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, ...touch }, LAYOUT),  // iPad Air
        local('tablet-landscape', { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, ...touch }, /@layout/),
        // computadores
        local('laptop', { viewport: { width: 1280, height: 720 } }, /@layout/),
        local('desktop', { viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] }, LAYOUT),
        local('wide', { viewport: { width: 2560, height: 1440 } }, /@layout/),
      ],
});
