import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    // Decorated DTOs need the Reflect metadata polyfill that Nest normally loads.
    setupFiles: ['reflect-metadata'],
  },
});
