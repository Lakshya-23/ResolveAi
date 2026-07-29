import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as toolFunctions from './tool-functions';
import { createLogger } from '../services/logging.service';
import { AGENT_NAMES } from '../shared/constants';

const log = createLogger('ToolManager');

type AgentName = (typeof AGENT_NAMES)[keyof typeof AGENT_NAMES];

/**
 * Tool permissions per agent.
 * Each agent only gets access to the tools it needs.
 */
const AGENT_PERMISSIONS: Record<AgentName, string[]> = {
  supervisor: [], // Supervisor uses pure reasoning, no repository tools
  planner: [
    'get_repository_profile', 'get_repository_context',
    'list_directory', 'tree', 'stat',
    'read_file', 'write_file', 'create_file', 'replace_file_content',
    'search_text', 'find_files',
    'git_log', 'web_search',
  ],
  writer: [
    'get_repository_profile', 'get_repository_context',
    'list_directory', 'tree', 'stat',
    'read_file', 'write_file', 'create_file', 'replace_file_content', 'delete_file',
    'search_text', 'find_files',
    'terminal', 'build', 'linter',
    'git_diff', 'git_status',
  ],
  tester: [
    'get_repository_profile',
    'list_directory', 'tree', 'stat',
    'read_file', 'write_file', 'create_file', 'replace_file_content', 'delete_file',
    'build', 'test', 'linter',
    'terminal', 'git_diff', 'git_status', 'web_search',
  ],
  reviewer: [
    'get_repository_profile', 'get_repository_context',
    'list_directory', 'tree', 'stat',
    'read_file', 'write_file', 'create_file', 'replace_file_content',
    'search_text', 'find_files',
    'git_diff', 'git_status', 'git_log',
  ],
};

/**
 * Create LangChain-compatible tools for a specific agent.
 * Tools are scoped to a container and filtered by agent permissions.
 */
export function createToolsForAgent(params: {
  agentName: AgentName;
  containerId: string;
  repositoryProfile: any;
  repositoryContext: string;
  buildCommand: string | null;
  testCommand: string | null;
  lintCommand: string | null;
  tavilyApiKey: string;
}): any[] {
  const {
    agentName, containerId, repositoryProfile, repositoryContext,
    buildCommand, testCommand, lintCommand, tavilyApiKey,
  } = params;

  const allowedTools = AGENT_PERMISSIONS[agentName] || [];
  const tools: any[] = [];

  // ─── Repository Tools ───
  if (allowedTools.includes('get_repository_profile')) {
    tools.push(tool(
      async () => JSON.stringify(repositoryProfile, null, 2),
      {
        name: 'get_repository_profile',
        description: 'Get structured metadata about the repository (ecosystem, package manager, commands, structure, etc.)',
        schema: z.object({}),
      }
    ));
  }

  if (allowedTools.includes('get_repository_context')) {
    tools.push(tool(
      async () => repositoryContext,
      {
        name: 'get_repository_context',
        description: 'Get a natural language summary of the repository for understanding the project',
        schema: z.object({}),
      }
    ));
  }

  // ─── Directory & Metadata Tools ───
  if (allowedTools.includes('list_directory')) {
    tools.push(tool(
      async ({ path }) => toolFunctions.listDirectory(containerId, path),
      {
        name: 'list_directory',
        description: 'List contents of a directory (files, subdirectories, sizes)',
        schema: z.object({ path: z.string().optional().describe('Relative directory path (defaults to root .)') }),
      }
    ));
  }

  if (allowedTools.includes('tree')) {
    tools.push(tool(
      async ({ path, maxDepth }) => toolFunctions.tree(containerId, path, maxDepth),
      {
        name: 'tree',
        description: 'Get a structured tree view of directory hierarchy',
        schema: z.object({
          path: z.string().optional().describe('Relative directory path (defaults to root .)'),
          maxDepth: z.number().optional().describe('Max depth level (defaults to 2)'),
        }),
      }
    ));
  }

  if (allowedTools.includes('stat')) {
    tools.push(tool(
      async ({ path }) => toolFunctions.stat(containerId, path),
      {
        name: 'stat',
        description: 'Get lightweight metadata for a file or directory (size, permissions, timestamps)',
        schema: z.object({ path: z.string().describe('Relative file or directory path') }),
      }
    ));
  }

  // ─── File Tools ───
  if (allowedTools.includes('read_file')) {
    tools.push(tool(
      async ({ path }) => toolFunctions.readFile(containerId, path),
      {
        name: 'read_file',
        description: 'Read the contents of a file in the repository',
        schema: z.object({ path: z.string().describe('Relative file path from repository root') }),
      }
    ));
  }

  if (allowedTools.includes('write_file')) {
    tools.push(tool(
      async ({ path, content }) => toolFunctions.writeFile(containerId, path, content),
      {
        name: 'write_file',
        description: 'Write content to a file (creates or replaces the entire file)',
        schema: z.object({
          path: z.string().describe('Relative file path'),
          content: z.string().describe('Complete file content to write'),
        }),
      }
    ));
  }

  if (allowedTools.includes('create_file')) {
    tools.push(tool(
      async ({ path, content }) => toolFunctions.createFile(containerId, path, content),
      {
        name: 'create_file',
        description: 'Create a new file with the specified content in the repository',
        schema: z.object({
          path: z.string().describe('Relative file path to create'),
          content: z.string().describe('File content to write'),
        }),
      }
    ));
  }

  if (allowedTools.includes('replace_file_content')) {
    tools.push(tool(
      async ({ path, targetContent, replacementContent }) =>
        toolFunctions.replaceFileContent(containerId, path, targetContent, replacementContent),
      {
        name: 'replace_file_content',
        description: 'Replace a target text string or block in an existing file with replacement content',
        schema: z.object({
          path: z.string().describe('Relative file path'),
          targetContent: z.string().describe('Exact target text string or code block to find and replace'),
          replacementContent: z.string().describe('Replacement text string or code block'),
        }),
      }
    ));
  }

  if (allowedTools.includes('delete_file')) {
    tools.push(tool(
      async ({ path }) => toolFunctions.deleteFile(containerId, path),
      {
        name: 'delete_file',
        description: 'Delete a file from the repository',
        schema: z.object({ path: z.string().describe('Relative file path to delete') }),
      }
    ));
  }

  if (allowedTools.includes('search_text')) {
    tools.push(tool(
      async ({ pattern, path, caseSensitive }) =>
        toolFunctions.searchText(containerId, pattern, { path, caseSensitive }),
      {
        name: 'search_text',
        description: 'Search for a text pattern in files using ripgrep',
        schema: z.object({
          pattern: z.string().describe('Search pattern (regex supported)'),
          path: z.string().optional().describe('Directory to search in (default: .)'),
          caseSensitive: z.boolean().optional().describe('Case sensitive search (default: true)'),
        }),
      }
    ));
  }

  if (allowedTools.includes('find_files')) {
    tools.push(tool(
      async ({ pattern, path }) => toolFunctions.findFiles(containerId, pattern, { path }),
      {
        name: 'find_files',
        description: 'Find files by name pattern using fd',
        schema: z.object({
          pattern: z.string().describe('File name pattern to search for'),
          path: z.string().optional().describe('Directory to search in (default: .)'),
        }),
      }
    ));
  }

  // ─── Execution Tools ───
  if (allowedTools.includes('terminal')) {
    tools.push(tool(
      async ({ command }) => {
        const result = await toolFunctions.runTerminal(containerId, command);
        return `Exit code: ${result.exitCode}\n${result.output}`;
      },
      {
        name: 'terminal',
        description: 'Run a shell command in the repository container',
        schema: z.object({ command: z.string().describe('Shell command to execute') }),
      }
    ));
  }

  if (allowedTools.includes('build')) {
    tools.push(tool(
      async () => {
        if (!buildCommand) return 'No build command configured for this repository. Build step skipped.';
        const result = await toolFunctions.runBuild(containerId, buildCommand);
        return `Exit code: ${result.exitCode}\n${result.output}`;
      },
      {
        name: 'build',
        description: buildCommand
          ? `Run the project build command: ${buildCommand}`
          : 'Run the project build command (no build command configured for repository)',
        schema: z.object({}),
      }
    ));
  }

  if (allowedTools.includes('test')) {
    tools.push(tool(
      async () => {
        if (!testCommand) return 'No test command configured for this repository. Test step skipped.';
        const result = await toolFunctions.runTests(containerId, testCommand);
        return `Exit code: ${result.exitCode}\n${result.output}`;
      },
      {
        name: 'test',
        description: testCommand
          ? `Run the project tests: ${testCommand}`
          : 'Run the project tests (no test command configured for repository)',
        schema: z.object({}),
      }
    ));
  }

  if (allowedTools.includes('linter')) {
    tools.push(tool(
      async () => {
        if (!lintCommand) return 'No linter command configured for this repository. Lint step skipped.';
        const result = await toolFunctions.runLinter(containerId, lintCommand);
        return `Exit code: ${result.exitCode}\n${result.output}`;
      },
      {
        name: 'linter',
        description: lintCommand
          ? `Run the project linter: ${lintCommand}`
          : 'Run the project linter (no linter command configured for repository)',
        schema: z.object({}),
      }
    ));
  }

  // ─── Git Tools ───
  if (allowedTools.includes('git_status')) {
    tools.push(tool(
      async () => toolFunctions.gitStatus(containerId),
      { name: 'git_status', description: 'Show git status (modified/untracked files)', schema: z.object({}) }
    ));
  }

  if (allowedTools.includes('git_diff')) {
    tools.push(tool(
      async () => toolFunctions.gitDiff(containerId),
      { name: 'git_diff', description: 'Show git diff of all changes', schema: z.object({}) }
    ));
  }

  if (allowedTools.includes('git_log')) {
    tools.push(tool(
      async ({ count }) => toolFunctions.gitLog(containerId, count),
      {
        name: 'git_log',
        description: 'Show recent git log',
        schema: z.object({ count: z.number().optional().describe('Number of commits (default: 10)') }),
      }
    ));
  }

  // ─── Web Search (Tavily) ───
  if (allowedTools.includes('web_search')) {
    const effectiveKey = (tavilyApiKey === 'false' || tavilyApiKey === 'disabled')
      ? ''
      : (tavilyApiKey && tavilyApiKey !== 'true' && tavilyApiKey !== 'enabled' && tavilyApiKey !== 'ENV' ? tavilyApiKey : process.env.TAVILY_API_KEY || '');

    if (effectiveKey) {
      tools.push(tool(
        async ({ query }) => {
          try {
            const { tavily } = await import('@tavily/core');
            const client = tavily({ apiKey: effectiveKey });
            const result = await client.search(query, { maxResults: 5 });
            return result.results
              .map((r: any) => `**${r.title}**\n${r.url}\n${r.content}`)
              .join('\n\n---\n\n');
          } catch (err: any) {
            return `Web search failed: ${err.message}. Tavily API key in backend .env may be invalid.`;
          }
        },
        {
          name: 'web_search',
          description: 'Search the web for documentation, solutions, or best practices',
          schema: z.object({ query: z.string().describe('Search query') }),
        }
      ));
    } else {
      tools.push(tool(
        async () => 'Web search is disabled or unavailable — no TAVILY_API_KEY configured in backend .env. Proceed without web search results.',
        {
          name: 'web_search',
          description: 'Search the web (DISABLED / UNAVAILABLE — no Tavily API key configured in backend .env)',
          schema: z.object({ query: z.string().describe('Search query') }),
        }
      ));
    }
  }

  log.info(`Tools created for ${agentName}`, { count: tools.length, tools: tools.map((t: any) => t.name) });
  return tools;
}
