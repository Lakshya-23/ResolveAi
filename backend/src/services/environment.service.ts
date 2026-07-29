import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { createLogger } from './logging.service';
import { RepositoryProfile, EnvironmentReport } from '../shared/types';
import { DOCKER_IMAGES, DEPENDENCY_INSTALL_TIMEOUT_MS, BUILD_TIMEOUT_MS } from '../shared/constants';
import { EnvironmentError, DependencyInstallError } from '../shared/errors';
import * as dockerService from './docker.service';

const log = createLogger('EnvironmentService');

/**
 * Deterministic Environment Service — NO LLM.
 *
 * 1. Select Docker image based on ecosystem
 * 2. Create workspace directory
 * 3. Create & start container
 * 4. Clone repository
 * 5. Install dependencies
 * 6. Verify commands
 * 7. Generate Environment Report
 */
export async function prepareEnvironment(params: {
  sessionId: string;
  profile?: RepositoryProfile | null;
  cloneUrl: string;
  branch: string;
  githubToken: string;
  environmentVariables: Record<string, string>;
}): Promise<EnvironmentReport> {
  const { sessionId, profile, cloneUrl, branch, githubToken, environmentVariables } = params;
  const warnings: string[] = [];
  const errors: string[] = [];

  const targetEcosystem = profile?.ecosystem || 'nodejs';
  log.info('Preparing environment', { sessionId, ecosystem: targetEcosystem });

  // 1. Select image
  const image = DOCKER_IMAGES[targetEcosystem] || DOCKER_IMAGES.nodejs;
  if (!image) {
    throw new EnvironmentError(`No Docker image for ecosystem: ${targetEcosystem}`);
  }

  // Check image exists
  const exists = await dockerService.imageExists(image);
  if (!exists) {
    throw new EnvironmentError(`Docker image '${image}' not found. Build it first.`);
  }

  // 2. Create workspace directory
  const workspacePath = path.join(config.docker.workspaceBase, sessionId);
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }

  // 3. Create container
  const containerInfo = await dockerService.createContainer({
    image,
    name: `resolveai-${sessionId.slice(0, 8)}`,
    workspacePath,
    environmentVariables,
  });

  const containerId = containerInfo.id;

  try {
    // 4. Clone repository
    log.info('Cloning repository', { cloneUrl: cloneUrl.replace(githubToken, '***'), branch });
    const authenticatedUrl = cloneUrl.replace('https://', `https://${githubToken}@`);
    const cloneResult = await dockerService.execInContainer(containerId, [
      `git -c http.sslVerify=false clone --depth 1 --branch ${branch} ${authenticatedUrl} .`,
    ], { timeout: 120_000 });

    if (cloneResult.exitCode !== 0) {
      throw new EnvironmentError(`Git clone failed: ${cloneResult.stderr}`);
    }

    // 4.5. Configure Git Author Identity inside container
    log.info('Configuring Git identity inside container', { name: config.git.authorName, email: config.git.authorEmail });
    await dockerService.execInContainer(containerId, [
      `git config user.name "${config.git.authorName}" && git config user.email "${config.git.authorEmail}"`,
    ]);

    // 5. Install dependencies if profile is available
    let dependencyStatus: 'success' | 'failed' | 'skipped' = 'skipped';
    if (profile?.commands?.install) {
      log.info('Installing dependencies', { command: profile.commands.install });
      const installResult = await dockerService.execInContainer(containerId, [
        profile.commands.install,
      ], { timeout: DEPENDENCY_INSTALL_TIMEOUT_MS });

      if (installResult.exitCode === 0) {
        dependencyStatus = 'success';
        log.info('Dependencies installed successfully');
      } else {
        dependencyStatus = 'failed';
        errors.push(`Dependency install failed: ${installResult.stderr.slice(0, 500)}`);
        log.warn('Dependency install failed', { stderr: installResult.stderr.slice(0, 200) });
      }
    } else {
      warnings.push('No install command detected — skipping dependency installation');
    }

    // 6. Verify commands
    const availableCommands: Record<string, boolean> = {};

    if (profile?.commands) {
      for (const [name, cmd] of Object.entries(profile.commands)) {
        if (name === 'install' || !cmd) continue;
        const baseCmd = cmd.split(' ')[0];
        const whichResult = await dockerService.execInContainer(containerId, [
          `which ${baseCmd} || command -v ${baseCmd}`,
        ]);
        availableCommands[name] = whichResult.exitCode === 0;
      }
    }

    // 7. Build verification (quick check)
    let buildVerification: 'success' | 'failed' | 'skipped' = 'skipped';
    if (profile?.commands?.build && dependencyStatus === 'success') {
      log.info('Running build verification');
      const buildResult = await dockerService.execInContainer(containerId, [
        profile.commands.build,
      ], { timeout: BUILD_TIMEOUT_MS });

      buildVerification = buildResult.exitCode === 0 ? 'success' : 'failed';
      if (buildVerification === 'failed') {
        warnings.push(`Build verification failed: ${buildResult.stderr.slice(0, 300)}`);
      }
    }

    // 8. Check test availability
    let testVerification: 'available' | 'unavailable' = 'unavailable';
    if (profile?.commands?.test && availableCommands['test'] !== false) {
      testVerification = 'available';
    }

    const report: EnvironmentReport = {
      image,
      containerId,
      workspacePath: '/workspace',
      dependencyStatus,
      availableCommands,
      buildVerification,
      testVerification,
      environmentVariablesLoaded: Object.keys(environmentVariables).length,
      warnings,
      errors,
      timestamp: new Date().toISOString(),
    };

    log.info('Environment prepared', {
      containerId,
      dependencyStatus,
      buildVerification,
      testVerification,
    });

    return report;
  } catch (error) {
    // Cleanup on failure
    await dockerService.destroyContainer(containerId).catch(() => {});
    throw error;
  }
}

/**
 * Clean up a session's environment.
 */
export async function cleanupEnvironment(sessionId: string, containerId?: string): Promise<void> {
  if (containerId) {
    await dockerService.destroyContainer(containerId);
  }

  const workspacePath = path.join(config.docker.workspaceBase, sessionId);
  if (fs.existsSync(workspacePath)) {
    fs.rmSync(workspacePath, { recursive: true, force: true });
    log.info('Workspace cleaned up', { sessionId });
  }
}
