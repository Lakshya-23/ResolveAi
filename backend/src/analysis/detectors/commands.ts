import { SupportedEcosystem, RepositoryCommands } from '../../shared/types';

/**
 * Discover build, test, lint, and dev commands from project config files.
 */
export function detectCommands(
  ecosystem: SupportedEcosystem,
  packageJsonScripts: Record<string, string> | null,
  fileList: string[]
): RepositoryCommands {
  if (ecosystem === 'nodejs') {
    return detectNodeCommands(packageJsonScripts || {});
  }
  if (ecosystem === 'python') {
    return detectPythonCommands(fileList);
  }
  if (ecosystem === 'cpp') {
    return detectCppCommands(fileList);
  }

  return { install: null, build: null, test: null, lint: null, dev: null };
}

function detectNodeCommands(scripts: Record<string, string>): RepositoryCommands {
  return {
    install: null, // handled by package manager detector
    build: findScript(scripts, ['build', 'compile', 'tsc']),
    test: findScript(scripts, ['test', 'test:unit', 'jest', 'vitest', 'mocha']),
    lint: findScript(scripts, ['lint', 'lint:fix', 'eslint', 'prettier:check']),
    dev: findScript(scripts, ['dev', 'start:dev', 'develop', 'serve']),
  };
}

function detectPythonCommands(fileList: string[]): RepositoryCommands {
  const fileSet = new Set(fileList.map((f) => f.split('/').pop() || ''));

  let test: string | null = null;
  if (fileSet.has('pytest.ini') || fileSet.has('conftest.py') || fileSet.has('pyproject.toml')) {
    test = 'pytest';
  }

  let lint: string | null = null;
  if (fileSet.has('.flake8')) lint = 'flake8';
  if (fileSet.has('ruff.toml') || fileSet.has('.ruff.toml')) lint = 'ruff check .';
  if (fileSet.has('.pylintrc')) lint = 'pylint';

  return {
    install: null,
    build: null, // Python usually doesn't have a build step
    test,
    lint,
    dev: null,
  };
}

function detectCppCommands(fileList: string[]): RepositoryCommands {
  const fileSet = new Set(fileList.map((f) => f.split('/').pop() || ''));

  let build: string | null = null;
  if (fileSet.has('CMakeLists.txt')) {
    build = 'cmake -B build && cmake --build build';
  } else if (fileSet.has('Makefile')) {
    build = 'make';
  } else if (fileSet.has('meson.build')) {
    build = 'meson setup build && meson compile -C build';
  }

  let test: string | null = null;
  if (fileSet.has('CMakeLists.txt')) {
    test = 'cd build && ctest';
  } else if (fileSet.has('Makefile')) {
    test = 'make test';
  }

  return {
    install: null,
    build,
    test,
    lint: null,
    dev: null,
  };
}

/**
 * Find the first matching npm script from a list of candidates.
 * Returns the full `npm run <script>` command.
 */
function findScript(scripts: Record<string, string>, candidates: string[]): string | null {
  for (const name of candidates) {
    if (scripts[name]) {
      return `npm run ${name}`;
    }
  }
  return null;
}
