import { defineConfig } from 'vitest/config';

/** Unit + e2e in one run, measuring the services that hold the business rules. */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['reflect-metadata', 'test/setup-env.ts'],
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.service.ts', 'src/**/*.processor.ts', 'src/**/*.provider.ts'],
      reporter: ['text-summary', 'text'],
      thresholds: { lines: 70 },
    },
  },
});
