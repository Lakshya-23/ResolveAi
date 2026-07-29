import { SupportedEcosystem } from '../../shared/types';

/**
 * File markers that indicate an ecosystem.
 * Checked in order — first match wins.
 */
const ECOSYSTEM_MARKERS: Array<{ ecosystem: SupportedEcosystem; files: string[] }> = [
  {
    ecosystem: 'nodejs',
    files: ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'],
  },
  {
    ecosystem: 'python',
    files: [
      'pyproject.toml', 'setup.py', 'setup.cfg', 'Pipfile', 'requirements.txt',
      'poetry.lock', 'uv.lock', 'conda.yaml', 'environment.yml',
    ],
  },
  {
    ecosystem: 'cpp',
    files: [
      'CMakeLists.txt', 'Makefile', 'meson.build', 'configure.ac',
      'conanfile.txt', 'conanfile.py', 'vcpkg.json',
    ],
  },
];

/**
 * Detect the primary ecosystem of a repository.
 * Returns null if no supported ecosystem is detected.
 */
export function detectEcosystem(fileList: string[]): SupportedEcosystem | null {
  const fileSet = new Set(fileList.map(normalizeFileName));

  for (const marker of ECOSYSTEM_MARKERS) {
    if (marker.files.some((f) => fileSet.has(f))) {
      return marker.ecosystem;
    }
  }

  // Fallback: check file extensions
  const hasTS = fileList.some((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
  const hasJS = fileList.some((f) => f.endsWith('.js') || f.endsWith('.jsx'));
  if (hasTS || hasJS) return 'nodejs';

  const hasPy = fileList.some((f) => f.endsWith('.py'));
  if (hasPy) return 'python';

  const hasCpp = fileList.some((f) =>
    f.endsWith('.cpp') || f.endsWith('.cc') || f.endsWith('.c') ||
    f.endsWith('.h') || f.endsWith('.hpp')
  );
  if (hasCpp) return 'cpp';

  return null;
}

function normalizeFileName(filePath: string): string {
  const parts = filePath.split('/');
  return parts[parts.length - 1];
}
