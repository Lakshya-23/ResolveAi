import * as dockerService from '../services/docker.service';
import { config } from '../config';
import { createLogger } from '../services/logging.service';
import { ToolExecutionError } from '../shared/errors';

const log = createLogger('Tools');

/**
 * All tool functions take a containerId and execute inside the container.
 * They are "dumb" — no intelligence, just execute and return results.
 */

// ─── Directory & Metadata Tools ───

export async function listDirectory(containerId: string, dirPath?: string): Promise<string> {
  const target = dirPath || '.';
  const result = await dockerService.execInContainer(containerId, [`ls -la "${target}"`]);
  if (result.exitCode !== 0) {
    throw new ToolExecutionError('list_directory', `Cannot list directory ${target}: ${result.stderr}`);
  }
  return result.stdout || 'Directory is empty.';
}

export async function tree(containerId: string, dirPath?: string, maxDepth: number = 2): Promise<string> {
  const target = dirPath || '.';
  const result = await dockerService.execInContainer(containerId, [
    `tree -L ${maxDepth} -a -I ".git|node_modules|__pycache__|.venv|dist|build" "${target}" 2>/dev/null || find "${target}" -maxdepth ${maxDepth} -not -path '*/.*' | head -100`,
  ]);
  return result.stdout || 'Empty directory structure.';
}

export async function stat(containerId: string, targetPath: string): Promise<string> {
  const result = await dockerService.execInContainer(containerId, [
    `stat "${targetPath}" 2>/dev/null || ls -ld "${targetPath}"`,
  ]);
  if (result.exitCode !== 0) {
    throw new ToolExecutionError('stat', `Cannot stat path ${targetPath}: ${result.stderr}`);
  }
  return result.stdout;
}

export async function readFile(containerId: string, filePath: string): Promise<string> {
  const result = await dockerService.execInContainer(containerId, [`cat "${filePath}"`]);
  if (result.exitCode !== 0) {
    throw new ToolExecutionError('read_file', `Cannot read ${filePath}: ${result.stderr}`);
  }
  return result.stdout;
}

export async function writeFile(containerId: string, filePath: string, content: string): Promise<string> {
  // Ensure directory exists, then write file
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  if (dir) {
    await dockerService.execInContainer(containerId, [`mkdir -p "${dir}"`]);
  }

  // Use heredoc for safe multi-line content
  const escapedContent = content.replace(/'/g, "'\\''");
  const result = await dockerService.execInContainer(containerId, [
    `cat > "${filePath}" << 'RESOLVEAI_EOF'\n${content}\nRESOLVEAI_EOF`,
  ]);

  if (result.exitCode !== 0) {
    throw new ToolExecutionError('write_file', `Cannot write ${filePath}: ${result.stderr}`);
  }
  return `File written: ${filePath}`;
}

export async function createFile(containerId: string, filePath: string, content: string): Promise<string> {
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  if (dir) {
    await dockerService.execInContainer(containerId, [`mkdir -p "${dir}"`]);
  }
  const result = await dockerService.execInContainer(containerId, [
    `cat > "${filePath}" << 'RESOLVEAI_EOF'\n${content}\nRESOLVEAI_EOF`,
  ]);
  if (result.exitCode !== 0) {
    throw new ToolExecutionError('create_file', `Cannot create file ${filePath}: ${result.stderr}`);
  }
  return `File created: ${filePath}`;
}

export async function replaceFileContent(
  containerId: string,
  filePath: string,
  targetContent: string,
  replacementContent: string
): Promise<string> {
  const existingContent = await readFile(containerId, filePath);
  if (!existingContent.includes(targetContent)) {
    throw new ToolExecutionError(
      'replace_file_content',
      `Target content string not found in ${filePath}. Read the file first to inspect exact content.`
    );
  }

  const updatedContent = existingContent.replace(targetContent, replacementContent);
  await writeFile(containerId, filePath, updatedContent);
  return `Successfully replaced target content in ${filePath}`;
}

export async function deleteFile(containerId: string, filePath: string): Promise<string> {
  const result = await dockerService.execInContainer(containerId, [`rm -f "${filePath}"`]);
  if (result.exitCode !== 0) {
    throw new ToolExecutionError('delete_file', `Cannot delete ${filePath}: ${result.stderr}`);
  }
  return `File deleted: ${filePath}`;
}

export async function searchText(containerId: string, pattern: string, options?: { path?: string; caseSensitive?: boolean; maxResults?: number }): Promise<string> {
  const searchPath = options?.path || '.';
  const flags = options?.caseSensitive === false ? '-i' : '';
  const maxResults = options?.maxResults || 50;

  const result = await dockerService.execInContainer(containerId, [
    `rg ${flags} --max-count ${maxResults} --line-number --no-heading "${pattern}" ${searchPath} 2>/dev/null || true`,
  ]);
  return result.stdout || 'No matches found.';
}

export async function findFiles(containerId: string, pattern: string, options?: { path?: string; maxResults?: number }): Promise<string> {
  const searchPath = options?.path || '.';
  const maxResults = options?.maxResults || 100;

  // Use fd (available in all our Docker images)
  const result = await dockerService.execInContainer(containerId, [
    `fd "${pattern}" ${searchPath} --max-results ${maxResults} 2>/dev/null || rg --files ${searchPath} | head -${maxResults} | grep -i "${pattern}" || true`,
  ]);
  return result.stdout || 'No files found.';
}

// ─── Execution Tools ───

export async function runTerminal(containerId: string, command: string, options?: { timeout?: number }): Promise<{ exitCode: number; output: string }> {
  const result = await dockerService.execInContainer(containerId, [command], { timeout: options?.timeout });
  return {
    exitCode: result.exitCode,
    output: (result.stdout + '\n' + result.stderr).trim(),
  };
}

export async function runBuild(containerId: string, buildCommand: string): Promise<{ exitCode: number; output: string }> {
  const result = await dockerService.execInContainer(containerId, [buildCommand], {
    timeout: 300_000, // 5 minutes
  });
  return {
    exitCode: result.exitCode,
    output: (result.stdout + '\n' + result.stderr).trim(),
  };
}

export async function runTests(containerId: string, testCommand: string): Promise<{ exitCode: number; output: string }> {
  const result = await dockerService.execInContainer(containerId, [testCommand], {
    timeout: 300_000, // 5 minutes
  });
  return {
    exitCode: result.exitCode,
    output: (result.stdout + '\n' + result.stderr).trim(),
  };
}

export async function runLinter(containerId: string, lintCommand: string): Promise<{ exitCode: number; output: string }> {
  const result = await dockerService.execInContainer(containerId, [lintCommand], {
    timeout: 120_000, // 2 minutes
  });
  return {
    exitCode: result.exitCode,
    output: (result.stdout + '\n' + result.stderr).trim(),
  };
}

// ─── Git Tools ───

export async function gitStatus(containerId: string): Promise<string> {
  const result = await dockerService.execInContainer(containerId, ['git status --short']);
  return result.stdout || 'Working tree clean.';
}

export async function gitDiff(containerId: string): Promise<string> {
  const result = await dockerService.execInContainer(containerId, ['git diff']);
  return result.stdout || 'No changes.';
}

export async function gitLog(containerId: string, count = 10): Promise<string> {
  const result = await dockerService.execInContainer(containerId, [
    `git log --oneline -${count}`,
  ]);
  return result.stdout || 'No commits.';
}

export async function createBranch(containerId: string, branchName: string): Promise<string> {
  const result = await dockerService.execInContainer(containerId, [
    `git checkout -b "${branchName}"`,
  ]);
  if (result.exitCode !== 0) {
    throw new ToolExecutionError('create_branch', result.stderr);
  }
  return `Branch created: ${branchName}`;
}

export async function commitChanges(containerId: string, message: string): Promise<string> {
  // Ensure git identity is configured
  const authorName = config.git.authorName;
  const authorEmail = config.git.authorEmail;
  await dockerService.execInContainer(containerId, [
    `git config user.name "${authorName}" && git config user.email "${authorEmail}"`,
  ]);

  // Stage all changes
  await dockerService.execInContainer(containerId, ['git add -A']);

  const result = await dockerService.execInContainer(containerId, [
    `git commit -m "${message.replace(/"/g, '\\"')}"`,
  ]);
  if (result.exitCode !== 0) {
    throw new ToolExecutionError('commit_changes', result.stderr);
  }
  return result.stdout;
}

export async function pushBranch(containerId: string, branchName: string): Promise<string> {
  const result = await dockerService.execInContainer(containerId, [
    `git push origin "${branchName}"`,
  ], { timeout: 60_000 });
  if (result.exitCode !== 0) {
    throw new ToolExecutionError('push_branch', result.stderr);
  }
  return `Branch pushed: ${branchName}`;
}
