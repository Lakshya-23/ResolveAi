import Docker from 'dockerode';
import { createLogger } from './logging.service';
import { config } from '../config';
import { DockerError } from '../shared/errors';

const log = createLogger('DockerService');

const docker = new Docker({ socketPath: config.docker.socketPath });

export interface ContainerConfig {
  image: string;
  name: string;
  workspacePath: string;
  environmentVariables?: Record<string, string>;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  workspacePath: string;
}

/**
 * Resolve full local image tag (handles Podman localhost/ prefix & :latest tags).
 */
export async function resolveImageName(imageName: string): Promise<string> {
  // 1. Direct inspect
  try {
    await docker.getImage(imageName).inspect();
    return imageName;
  } catch {}

  // 2. Try with localhost/ prefix (Podman default)
  const localhostName = imageName.startsWith('localhost/') ? imageName : `localhost/${imageName}`;
  try {
    await docker.getImage(localhostName).inspect();
    return localhostName;
  } catch {}

  // 3. Fallback: scan listed images
  try {
    const images = await docker.listImages();
    for (const img of images) {
      for (const tag of img.RepoTags || []) {
        if (
          tag === imageName ||
          tag === `${imageName}:latest` ||
          tag === `localhost/${imageName}` ||
          tag === `localhost/${imageName}:latest` ||
          tag.endsWith(`/${imageName}`) ||
          tag.endsWith(`/${imageName}:latest`)
        ) {
          return tag;
        }
      }
    }
  } catch {}

  return imageName;
}

/**
 * Create and start a Docker container for a session.
 */
export async function createContainer(cfg: ContainerConfig): Promise<ContainerInfo> {
  const resolvedImage = await resolveImageName(cfg.image);

  // Check if container already exists and is actively running — reuse it!
  try {
    const existing = docker.getContainer(cfg.name);
    const inspectData = await existing.inspect();
    if (inspectData && inspectData.State?.Running) {
      log.info('Container already exists and is running — reusing active workspace container', {
        id: existing.id,
        name: cfg.name,
      });
      return {
        id: existing.id,
        name: cfg.name,
        image: inspectData.Config?.Image || resolvedImage,
        workspacePath: cfg.workspacePath,
      };
    }
    // If container exists but is not running, force remove it to prepare fresh startup
    if (inspectData) {
      await existing.remove({ force: true, v: true });
    }
  } catch {}

  log.info('Creating new container', { requestedImage: cfg.image, resolvedImage, name: cfg.name });

  const envVars = Object.entries(cfg.environmentVariables || {}).map(
    ([k, v]) => `${k}=${v}`
  );

  const containerParams = {
    Image: resolvedImage,
    name: cfg.name,
    Env: envVars,
    Tty: true,
    WorkingDir: '/workspace',
    HostConfig: {
      Binds: [`${cfg.workspacePath}:/workspace`],
      NetworkMode: 'bridge',
      Memory: 2 * 1024 * 1024 * 1024,  // 2GB
      NanoCpus: 2 * 1e9,                // 2 CPU cores
    },
    Cmd: ['tail', '-f', '/dev/null'], // Keep container alive
  };

  try {
    const container = await docker.createContainer(containerParams);
    await container.start();

    log.info('Container started', { id: container.id, name: cfg.name, image: resolvedImage });
    return {
      id: container.id,
      name: cfg.name,
      image: resolvedImage,
      workspacePath: cfg.workspacePath,
    };
  } catch (error: any) {
    log.warn('Initial container creation failed, attempting force cleanup and retry', { error: error.message });
    try {
      const existing = docker.getContainer(cfg.name);
      await existing.remove({ force: true, v: true });
      const retryContainer = await docker.createContainer(containerParams);
      await retryContainer.start();
      log.info('Container started after retry', { id: retryContainer.id, name: cfg.name });
      return {
        id: retryContainer.id,
        name: cfg.name,
        image: resolvedImage,
        workspacePath: cfg.workspacePath,
      };
    } catch (retryError: any) {
      log.error('Failed to create container after force retry', { error: retryError.message });
      throw new DockerError(`Failed to create container: ${retryError.message}`);
    }
  }
}

/**
 * Execute a command inside a running container.
 */
export async function execInContainer(
  containerId: string,
  command: string[],
  options: { timeout?: number; workDir?: string } = {}
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { timeout = config.session.commandTimeoutMs, workDir = '/workspace' } = options;

  try {
    const container = docker.getContainer(containerId);

    const exec = await container.exec({
      Cmd: ['sh', '-c', command.join(' ')],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: workDir,
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new DockerError(`Command timed out after ${timeout}ms`));
      }, timeout);

      exec.start({ hijack: true, stdin: false }, (err: any, stream: any) => {
        if (err) {
          clearTimeout(timer);
          return reject(new DockerError(`Exec start failed: ${err.message}`));
        }

        let stdout = '';
        let stderr = '';

        // Demux docker stream
        const stdoutStream = { write: (chunk: Buffer) => { stdout += chunk.toString(); return true; } };
        const stderrStream = { write: (chunk: Buffer) => { stderr += chunk.toString(); return true; } };

        docker.modem.demuxStream(stream, stdoutStream as any, stderrStream as any);

        stream.on('end', async () => {
          clearTimeout(timer);
          try {
            const inspectResult = await exec.inspect();
            resolve({
              exitCode: inspectResult.ExitCode ?? -1,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
            });
          } catch (inspectErr: any) {
            resolve({ exitCode: -1, stdout: stdout.trim(), stderr: stderr.trim() });
          }
        });

        stream.on('error', (streamErr: Error) => {
          clearTimeout(timer);
          reject(new DockerError(`Stream error: ${streamErr.message}`));
        });
      });
    });
  } catch (error: any) {
    if (error instanceof DockerError) throw error;
    throw new DockerError(`Exec failed: ${error.message}`);
  }
}

/**
 * Stop and remove a container.
 */
export async function destroyContainer(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    await container.stop({ t: 5 }).catch(() => {}); // ignore if already stopped
    await container.remove({ force: true });
    log.info('Container destroyed', { containerId });
  } catch (error: any) {
    log.warn('Failed to destroy container', { containerId, error: error.message });
  }
}

/**
 * Check if a Docker image exists locally.
 */
export async function imageExists(imageName: string): Promise<boolean> {
  const resolved = await resolveImageName(imageName);
  try {
    await docker.getImage(resolved).inspect();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Docker daemon is reachable.
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}
