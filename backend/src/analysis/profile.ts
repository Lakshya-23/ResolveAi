import { RepositoryProfile, RepositoryCommands, SupportedEcosystem } from '../shared/types';
import { FrameworkResults } from './detectors/frameworks';

/**
 * Build a machine-readable Repository Profile from all detector results.
 */
export function buildProfile(params: {
  ecosystem: SupportedEcosystem;
  packageManager: string;
  commands: RepositoryCommands;
  frameworks: FrameworkResults;
  fileList: string[];
  readmeSummary: string | null;
}): RepositoryProfile {
  const { ecosystem, packageManager, commands, frameworks, fileList, readmeSummary } = params;

  // Merge install command from package manager
  const finalCommands: RepositoryCommands = {
    ...commands,
    install: commands.install || getDefaultInstallCommand(packageManager),
  };

  return {
    ecosystem,
    packageManager,
    projectType: frameworks.projectType,
    buildTool: frameworks.buildTool,
    testFramework: frameworks.testFramework,
    formatter: frameworks.formatter,
    linter: frameworks.linter,
    commands: finalCommands,
    structure: extractStructure(fileList),
    importantFiles: extractImportantFiles(ecosystem, fileList),
    ciSummary: frameworks.ci,
    dockerMetadata: extractDockerMetadata(fileList),
    readmeSummary,
  };
}

function getDefaultInstallCommand(pm: string): string | null {
  const commands: Record<string, string> = {
    npm: 'npm install',
    yarn: 'yarn install',
    pnpm: 'pnpm install',
    bun: 'bun install',
    pip: 'pip install -r requirements.txt',
    poetry: 'poetry install',
    uv: 'uv sync',
    pipenv: 'pipenv install',
    conan: 'conan install .',
    vcpkg: 'vcpkg install',
  };
  return commands[pm] || null;
}

function extractStructure(fileList: string[]): string[] {
  const dirs = new Set<string>();
  for (const file of fileList) {
    const parts = file.split('/');
    if (parts.length > 1) {
      dirs.add(parts[0] + '/');
      if (parts.length > 2) {
        dirs.add(parts[0] + '/' + parts[1] + '/');
      }
    }
  }
  return Array.from(dirs).sort();
}

function extractImportantFiles(ecosystem: SupportedEcosystem, fileList: string[]): string[] {
  const important = new Set<string>();
  const rootFiles = fileList.filter((f) => !f.includes('/'));

  const alwaysImportant = [
    'README.md', 'readme.md', 'README.rst',
    'LICENSE', 'LICENSE.md',
    'CONTRIBUTING.md',
    'CHANGELOG.md',
    '.gitignore',
    'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  ];

  const ecosystemFiles: Record<string, string[]> = {
    nodejs: ['package.json', 'tsconfig.json', 'next.config.ts', 'next.config.js', 'vite.config.ts', 'eslint.config.mjs', '.prettierrc'],
    python: ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile', 'tox.ini', 'pytest.ini'],
    cpp: ['CMakeLists.txt', 'Makefile', 'meson.build', 'conanfile.txt'],
  };

  for (const name of [...alwaysImportant, ...(ecosystemFiles[ecosystem] || [])]) {
    if (rootFiles.includes(name)) {
      important.add(name);
    }
  }

  return Array.from(important);
}

function extractDockerMetadata(fileList: string[]): string | null {
  const dockerFiles = fileList.filter(
    (f) => f.includes('Dockerfile') || f.includes('docker-compose')
  );
  if (dockerFiles.length === 0) return null;
  return `Docker files found: ${dockerFiles.join(', ')}`;
}
