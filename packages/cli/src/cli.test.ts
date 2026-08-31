import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scaffoldProject, getAvailableTemplates, fluxPlugin } from './index';

describe('@flux/cli & Scaffolding Engine', () => {
  const tempDirs: string[] = [];

  function createTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `flux-test-${prefix}-`));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    tempDirs.length = 0;
  });

  it('provides available templates', () => {
    const templates = getAvailableTemplates();
    expect(templates).toContain('vue');
    expect(templates).toContain('svelte');
    expect(templates).toContain('solid');
    expect(templates).toContain('vanilla');
  });

  it('scaffolds a Vue project correctly', () => {
    const targetDir = createTempDir('vue');
    const result = scaffoldProject({
      projectName: 'my-test-vue-app',
      template: 'vue',
      targetDir,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'vite.config.ts'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'src/App.vue'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, '.gitignore'))).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('my-test-vue-app');
    expect(pkg.dependencies['@flux/vue']).toBeDefined();
  });

  it('scaffolds a Svelte project correctly', () => {
    const targetDir = createTempDir('svelte');
    const result = scaffoldProject({
      projectName: 'my-test-svelte-app',
      template: 'svelte',
      targetDir,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'src/App.svelte'))).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('my-test-svelte-app');
    expect(pkg.dependencies['@flux/svelte']).toBeDefined();
  });

  it('scaffolds a Solid project correctly', () => {
    const targetDir = createTempDir('solid');
    const result = scaffoldProject({
      projectName: 'my-test-solid-app',
      template: 'solid',
      targetDir,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'src/App.tsx'))).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('my-test-solid-app');
    expect(pkg.dependencies['@flux/solid']).toBeDefined();
  });

  it('scaffolds a Vanilla TS project correctly', () => {
    const targetDir = createTempDir('vanilla');
    const result = scaffoldProject({
      projectName: 'my-test-vanilla-app',
      template: 'vanilla',
      targetDir,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'src/main.ts'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'src/style.css'))).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('my-test-vanilla-app');
    expect(pkg.dependencies['@flux/core']).toBeDefined();
  });

  it('rejects invalid template types', () => {
    const targetDir = createTempDir('invalid');
    expect(() =>
      scaffoldProject({
        projectName: 'invalid-app',
        template: 'angular' as any,
        targetDir,
      })
    ).toThrow(/Invalid template/);
  });

  it('initializes fluxPlugin correctly', () => {
    const plugin = fluxPlugin({
      enableMockAgent: true,
      ssePath: '/custom/events',
    });

    expect(plugin.name).toBe('vite-plugin-flux');
    expect(typeof plugin.configureServer).toBe('function');
  });
});
