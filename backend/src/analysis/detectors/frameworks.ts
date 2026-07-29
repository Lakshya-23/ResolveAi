import { SupportedEcosystem } from '../../shared/types';

export interface FrameworkResults {
  projectType: string | null;
  buildTool: string | null;
  testFramework: string | null;
  formatter: string | null;
  linter: string | null;
  ci: string | null;
}

/**
 * Detect frameworks, build tools, formatters, linters, and CI from file markers.
 */
export function detectFrameworks(
  ecosystem: SupportedEcosystem,
  fileList: string[],
  packageJsonDeps: Record<string, string> | null
): FrameworkResults {
  const fileSet = new Set(fileList.map((f) => f.split('/').pop() || ''));
  const dirSet = new Set(fileList.map((f) => f.split('/')[0]));
  const deps = packageJsonDeps || {};

  return {
    projectType: detectProjectType(ecosystem, fileSet, deps),
    buildTool: detectBuildTool(ecosystem, fileSet, deps),
    testFramework: detectTestFramework(ecosystem, fileSet, deps),
    formatter: detectFormatter(ecosystem, fileSet, deps),
    linter: detectLinter(ecosystem, fileSet, deps),
    ci: detectCI(fileList),
  };
}

function detectProjectType(eco: SupportedEcosystem, files: Set<string>, deps: Record<string, string>): string | null {
  if (eco === 'nodejs') {
    if (deps['next']) return 'Next.js';
    if (deps['nuxt']) return 'Nuxt';
    if (deps['@angular/core']) return 'Angular';
    if (deps['react']) return deps['react-native'] ? 'React Native' : 'React';
    if (deps['vue']) return 'Vue';
    if (deps['svelte']) return 'Svelte';
    if (deps['express'] || deps['fastify'] || deps['hono'] || deps['koa']) return 'API Server';
    if (files.has('tsconfig.json')) return 'TypeScript Library';
    return 'Node.js';
  }
  if (eco === 'python') {
    if (deps['django']) return 'Django';
    if (deps['flask']) return 'Flask';
    if (deps['fastapi']) return 'FastAPI';
    return 'Python';
  }
  return null;
}

function detectBuildTool(eco: SupportedEcosystem, files: Set<string>, deps: Record<string, string>): string | null {
  if (eco === 'nodejs') {
    if (deps['vite']) return 'Vite';
    if (deps['webpack']) return 'Webpack';
    if (deps['esbuild']) return 'esbuild';
    if (deps['rollup']) return 'Rollup';
    if (deps['turbo'] || files.has('turbo.json')) return 'Turborepo';
    if (files.has('tsconfig.json')) return 'tsc';
  }
  if (eco === 'cpp') {
    if (files.has('CMakeLists.txt')) return 'CMake';
    if (files.has('Makefile')) return 'Make';
    if (files.has('meson.build')) return 'Meson';
  }
  return null;
}

function detectTestFramework(eco: SupportedEcosystem, files: Set<string>, deps: Record<string, string>): string | null {
  if (eco === 'nodejs') {
    if (deps['vitest']) return 'Vitest';
    if (deps['jest']) return 'Jest';
    if (deps['mocha']) return 'Mocha';
    if (deps['ava']) return 'Ava';
    if (deps['playwright'] || deps['@playwright/test']) return 'Playwright';
    if (deps['cypress']) return 'Cypress';
  }
  if (eco === 'python') {
    if (files.has('pytest.ini') || files.has('conftest.py') || deps['pytest']) return 'pytest';
    if (deps['unittest']) return 'unittest';
  }
  if (eco === 'cpp') {
    if (deps['gtest'] || files.has('googletest')) return 'Google Test';
    if (deps['catch2']) return 'Catch2';
  }
  return null;
}

function detectFormatter(eco: SupportedEcosystem, files: Set<string>, deps: Record<string, string>): string | null {
  if (eco === 'nodejs') {
    if (deps['prettier'] || files.has('.prettierrc') || files.has('.prettierrc.json') || files.has('.prettierrc.js')) return 'Prettier';
    if (deps['dprint']) return 'dprint';
  }
  if (eco === 'python') {
    if (deps['black'] || files.has('.black.toml')) return 'Black';
    if (deps['yapf']) return 'YAPF';
    if (deps['ruff']) return 'Ruff';
  }
  if (eco === 'cpp') {
    if (files.has('.clang-format')) return 'clang-format';
  }
  return null;
}

function detectLinter(eco: SupportedEcosystem, files: Set<string>, deps: Record<string, string>): string | null {
  if (eco === 'nodejs') {
    if (deps['eslint'] || files.has('eslint.config.js') || files.has('eslint.config.mjs') || files.has('.eslintrc.json') || files.has('.eslintrc.js')) return 'ESLint';
    if (deps['biome'] || files.has('biome.json')) return 'Biome';
  }
  if (eco === 'python') {
    if (deps['ruff'] || files.has('ruff.toml') || files.has('.ruff.toml')) return 'Ruff';
    if (deps['flake8'] || files.has('.flake8')) return 'Flake8';
    if (deps['pylint'] || files.has('.pylintrc')) return 'Pylint';
    if (deps['mypy']) return 'Mypy';
  }
  if (eco === 'cpp') {
    if (files.has('.clang-tidy')) return 'clang-tidy';
  }
  return null;
}

function detectCI(fileList: string[]): string | null {
  const paths = fileList.map((f) => f.toLowerCase());
  if (paths.some((f) => f.startsWith('.github/workflows/'))) return 'GitHub Actions';
  if (paths.some((f) => f === '.gitlab-ci.yml')) return 'GitLab CI';
  if (paths.some((f) => f === '.circleci/config.yml')) return 'CircleCI';
  if (paths.some((f) => f === 'Jenkinsfile')) return 'Jenkins';
  if (paths.some((f) => f === '.travis.yml')) return 'Travis CI';
  return null;
}
