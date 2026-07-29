import { createLogger } from '../services/logging.service';
import { RepositoryProfile } from '../shared/types';
import { UnsupportedEcosystemError, RepositoryAnalysisError } from '../shared/errors';
import { detectEcosystem } from './detectors/ecosystem';
import { detectPackageManager } from './detectors/package-manager';
import { detectCommands } from './detectors/commands';
import { detectFrameworks } from './detectors/frameworks';
import { buildProfile } from './profile';
import { buildContext } from './context';

const log = createLogger('RepositoryAnalysis');

export interface AnalysisResult {
  profile: RepositoryProfile;
  context: string;
}

/**
 * Run the full deterministic repository analysis pipeline.
 *
 * @param fileList - List of relative file paths in the repository
 * @param packageJson - Parsed package.json contents (null for non-Node projects)
 * @param readmeContent - Raw README content (null if not found)
 * @param repoFullName - Full repo name (e.g., "owner/repo")
 */
export function analyzeRepository(params: {
  fileList: string[];
  packageJson: any | null;
  readmeContent: string | null;
  repoFullName: string;
}): AnalysisResult {
  const { fileList, packageJson, readmeContent, repoFullName } = params;

  log.info('Starting repository analysis', { repoFullName, fileCount: fileList.length });

  // 1. Detect ecosystem
  const ecosystem = detectEcosystem(fileList);
  if (!ecosystem) {
    log.warn('Unsupported ecosystem', { repoFullName });
    throw new UnsupportedEcosystemError('unknown');
  }
  log.info('Ecosystem detected', { ecosystem });

  // 2. Detect package manager
  const packageManagerResult = detectPackageManager(ecosystem, fileList);
  log.info('Package manager detected', { name: packageManagerResult.name });

  // 3. Extract package.json data for Node.js projects
  const packageJsonScripts = packageJson?.scripts || null;
  const packageJsonDeps = {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {}),
  };

  // 4. Detect commands
  const commands = detectCommands(ecosystem, packageJsonScripts, fileList);
  log.info('Commands detected', { commands });

  // 5. Detect frameworks, tools, CI
  const frameworks = detectFrameworks(ecosystem, fileList, packageJsonDeps);
  log.info('Frameworks detected', { frameworks });

  // 6. Extract README summary (first 500 chars)
  const readmeSummary = readmeContent
    ? readmeContent.slice(0, 500).trim() + (readmeContent.length > 500 ? '...' : '')
    : null;

  // 7. Build profile
  const profile = buildProfile({
    ecosystem,
    packageManager: packageManagerResult.name,
    commands: {
      ...commands,
      install: packageManagerResult.installCommand || commands.install,
    },
    frameworks,
    fileList,
    readmeSummary,
  });

  // 8. Build context
  const context = buildContext(profile, repoFullName);

  log.info('Repository analysis complete', {
    ecosystem: profile.ecosystem,
    projectType: profile.projectType,
    packageManager: profile.packageManager,
  });

  return { profile, context };
}
