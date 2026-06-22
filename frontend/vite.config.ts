/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Spec EDITOR: "Both contracts share the PipelineIR type DIRECTLY
      // (imported from @modules/ir); they cannot drift because the type
      // is the same symbol." This alias resolves the frontend's
      // `@modules/ir` to the backend's pure IR module so both runtime
      // helpers (validate, computeEffectiveChain, serializeCanonical,
      // canonicalEquals) and the PipelineIR type are the exact same
      // source.
      '@modules/ir': resolve(__dirname, '../backend/src/modules/ir'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
    css: false,
  },
});
