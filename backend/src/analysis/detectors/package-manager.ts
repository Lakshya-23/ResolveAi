import { SupportedEcosystem } from '../../shared/types';

interface PackageManagerResult {
  name: string;
  lockFile: string | null;
  installCommand: string;
}

const NODE_PACKAGE_MANAGERS: Array<{ name: string; lockFile: string; installCmd: string }> = [
  { name: 'pnpm', lockFile: 'pnpm-lock.yaml', installCmd: 'pnpm install' },
  { name: 'yarn', lockFile: 'yarn.lock', installCmd: 'yarn install' },
  { name: 'bun', lockFile: 'bun.lockb', installCmd: 'bun install' },
  { name: 'npm', lockFile: 'package-lock.json', installCmd: 'npm install' },
];

const PYTHON_PACKAGE_MANAGERS: Array<{ name: string; lockFile: string | null; marker: string; installCmd: string }> = [
  { name: 'uv', lockFile: 'uv.lock', marker: 'uv.lock', installCmd: 'uv sync' },
  { name: 'poetry', lockFile: 'poetry.lock', marker: 'poetry.lock', installCmd: 'poetry install' },
  { name: 'pipenv', lockFile: 'Pipfile.lock', marker: 'Pipfile', installCmd: 'pipenv install' },
  { name: 'pip', lockFile: null, marker: 'requirements.txt', installCmd: 'pip install -r requirements.txt' },
];

/**
 * Detect the package manager for a given ecosystem.
 */
export function detectPackageManager(
  ecosystem: SupportedEcosystem,
  fileList: string[]
): PackageManagerResult {
  const fileSet = new Set(fileList.map((f) => f.split('/').pop() || ''));

  if (ecosystem === 'nodejs') {
    for (const pm of NODE_PACKAGE_MANAGERS) {
      if (fileSet.has(pm.lockFile)) {
        return { name: pm.name, lockFile: pm.lockFile, installCommand: pm.installCmd };
      }
    }
    // Default to npm if package.json exists but no lock file
    if (fileSet.has('package.json')) {
      return { name: 'npm', lockFile: null, installCommand: 'npm install' };
    }
  }

  if (ecosystem === 'python') {
    for (const pm of PYTHON_PACKAGE_MANAGERS) {
      if (fileSet.has(pm.marker)) {
        return { name: pm.name, lockFile: pm.lockFile, installCommand: pm.installCmd };
      }
    }
    // Check pyproject.toml - could be poetry, pip, or uv
    if (fileSet.has('pyproject.toml')) {
      return { name: 'pip', lockFile: null, installCommand: 'pip install -e .' };
    }
  }

  if (ecosystem === 'cpp') {
    if (fileSet.has('conanfile.txt') || fileSet.has('conanfile.py')) {
      return { name: 'conan', lockFile: null, installCommand: 'conan install .' };
    }
    if (fileSet.has('vcpkg.json')) {
      return { name: 'vcpkg', lockFile: null, installCommand: 'vcpkg install' };
    }
    // C++ often has no package manager
    return { name: 'none', lockFile: null, installCommand: '' };
  }

  return { name: 'unknown', lockFile: null, installCommand: '' };
}
