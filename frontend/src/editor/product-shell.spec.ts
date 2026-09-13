import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

const FRONTEND_ROOT = resolve(__dirname, '..', '..');
const PRODUCT_CSS = readFileSync(join(FRONTEND_ROOT, 'src', 'styles', 'product.css'), 'utf-8');
const INDEX_HTML = readFileSync(join(FRONTEND_ROOT, 'index.html'), 'utf-8');
const VITE_CONFIG = readFileSync(join(FRONTEND_ROOT, 'vite.config.ts'), 'utf-8');

describe('Product shell contract', () => {
  it('PRODUCT-AC-002 — defines desktop rail and narrow one-column workspace layouts', () => {
    expect(PRODUCT_CSS).toMatch(
      /\.editor__workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.65fr\)\s+minmax\(330px,\s*0\.72fr\)/s,
    );
    expect(PRODUCT_CSS).toMatch(
      /@media\s*\(max-width:\s*820px\)[\s\S]*?\.editor__workspace\s*\{[^}]*grid-template-columns:\s*1fr/s,
    );
    expect(PRODUCT_CSS).toMatch(/\.editor\s*>\s*\*\s*\{[^}]*flex-shrink:\s*0/s);
  });

  it('PRODUCT-AC-003 — exposes visible keyboard focus styling and reduced motion', () => {
    expect(PRODUCT_CSS).toContain(':focus-visible');
    expect(PRODUCT_CSS).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('PRODUCT-AC-004 — the development proxy targets the IPv4 bind address', () => {
    expect(VITE_CONFIG).toContain("host: '127.0.0.1'");
    expect(VITE_CONFIG).toContain("target: 'http://127.0.0.1:3000'");
    expect(VITE_CONFIG).not.toContain("target: 'http://localhost:3000'");
  });

  it('PRODUCT-AC-010 — the shell uses a local icon and no remote font request', () => {
    expect(INDEX_HTML).toContain('href="/pipe-icon.svg"');
    expect(INDEX_HTML).not.toMatch(/fonts\.(googleapis|gstatic)\.com/i);
    expect(existsSync(join(FRONTEND_ROOT, 'public', 'pipe-icon.svg'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// T-PRODUCT-101 (ARCH-03) — no CSS framework, per ADR-0017.
//
// Tailwind was installed, configured with a themed palette, and used by
// exactly zero class names. The decision was to remove it; this guards
// against it drifting back in unnoticed — either as an unused dependency
// again, or as a second styling system alongside the hand-written CSS.
// ─────────────────────────────────────────────────────────────────────────
describe('T-PRODUCT-101 (ARCH-03) — no CSS framework', () => {
  const root = resolve(__dirname, '..', '..');

  it('declares no CSS-framework dependency', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps).not.toContain('tailwindcss');
    expect(deps).not.toContain('postcss');
    expect(deps).not.toContain('autoprefixer');
  });

  it('ships no framework config files', () => {
    expect(existsSync(join(root, 'tailwind.config.js'))).toBe(false);
    expect(existsSync(join(root, 'postcss.config.js'))).toBe(false);
  });

  it('has no @tailwind directives left in the stylesheets', () => {
    for (const file of ['src/styles/index.css', 'src/editor/editor.css']) {
      expect(readFileSync(join(root, file), 'utf-8')).not.toMatch(/@tailwind\b/);
    }
  });
});
