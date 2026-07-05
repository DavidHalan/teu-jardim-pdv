// ESLint (flat) — raiz do monorepo. Cada pacote roda `eslint .` no próprio cwd;
// o ESLint resolve este arquivo subindo a árvore, então os `files` abaixo são
// relativos à raiz do repo.
//
// Boundaries (R-TS2/R-RA1): regras via no-restricted-imports (specifier-based).
// Camadas web (FSD-lite, ADR-0024): app → screens → features → lib/shared.
// Guarda do shared (R-RA3): packages/shared é Published Language — só contrato.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Prefixos relativos até 4 níveis — no-restricted-imports casa o specifier
// literal ('**' não atravessa segmentos '..' por causa da regra de dotfiles).
const relPatterns = (suffix) =>
  ['', './', '../', '../../', '../../../', '../../../../'].map((pre) => `${pre}${suffix}`);

const WEB_FEATURES = ['accounts', 'audit', 'auth', 'catalog', 'payments', 'print-queue', 'reports', 'shift'];

const noWebFromApi = {
  group: ['**/apps/web/**', '@teu-jardim/web', ...relPatterns('web/**')],
  message: 'api não importa web (fronteira de app — R-RA1).',
};
const noApiFromWeb = {
  group: ['**/apps/api/**', '@teu-jardim/api', ...relPatterns('api/**')],
  message: 'web não importa api — contrato só via @teu-jardim/shared (ADR-0027).',
};
const noScreensFromBelow = {
  group: relPatterns('screens/*'),
  message: 'screens é camada superior (FSD-lite, ADR-0024): features/lib/shared não importam screens.',
};

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', 'apps/api/src/generated/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  // Testes: mocks usam `any` deliberadamente.
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['apps/web/src/**'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // ── Boundaries ─────────────────────────────────────────────────────────────
  // Guarda do shared: sem framework, sem importar apps.
  {
    files: ['packages/shared/src/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@nestjs/*',
                'react',
                'react-*',
                '@prisma/*',
                'prisma',
                'express',
                'vite',
                'socket.io*',
                'rxjs',
                'class-validator',
                'class-transformer',
                'zod',
              ],
              message: 'packages/shared é contrato puro (Published Language) — sem framework (R-RA3).',
            },
            { group: ['**/apps/*', ...relPatterns('apps/**')], message: 'shared não importa apps.' },
          ],
        },
      ],
    },
  },
  // API: Prisma client é infra — só via src/prisma (ADR-0018).
  {
    files: ['apps/api/**/*.ts'],
    ignores: ['apps/api/src/prisma/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: relPatterns('generated/prisma/*'),
              message: 'Prisma client é infra: importar de src/prisma/client (ADR-0018).',
            },
            noWebFromApi,
          ],
        },
      ],
    },
  },
  // Web features: não sobem para screens, não tocam a api.
  {
    files: WEB_FEATURES.map((d) => `apps/web/src/${d}/**`),
    rules: {
      'no-restricted-imports': ['error', { patterns: [noScreensFromBelow, noApiFromWeb] }],
    },
  },
  // Web lib/shared (camada base): não importam features nem screens.
  {
    files: ['apps/web/src/lib/**', 'apps/web/src/shared/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            noScreensFromBelow,
            noApiFromWeb,
            {
              group: WEB_FEATURES.flatMap((d) => relPatterns(`${d}/*`)),
              message: 'lib/shared são camada base (FSD-lite): não importam features.',
            },
          ],
        },
      ],
    },
  },
  // Web screens/app: não tocam a api.
  {
    files: ['apps/web/src/screens/**', 'apps/web/src/App.tsx', 'apps/web/src/main.tsx'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [noApiFromWeb] }],
    },
  },
  // Print service: consumidor burro — só contrato shared; nunca api/web internals nem Prisma.
  {
    files: ['apps/print-service/src/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            noApiFromWeb,
            noWebFromApi,
            {
              group: ['@prisma/*', 'prisma', 'pg'],
              message: 'print-service não toca o Postgres — fala pela API (Fase 11 §6).',
            },
          ],
        },
      ],
    },
  },
);
