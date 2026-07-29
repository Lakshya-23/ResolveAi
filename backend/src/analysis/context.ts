import { RepositoryProfile } from '../shared/types';

/**
 * Build a natural language Repository Context from the Repository Profile.
 * This is injected into agent prompts so the LLM understands the project.
 */
export function buildContext(profile: RepositoryProfile, repoFullName: string): string {
  const lines: string[] = [];

  lines.push(`## Repository: ${repoFullName}`);
  lines.push('');

  // Ecosystem & Type
  lines.push(`**Ecosystem:** ${profile.ecosystem}`);
  if (profile.projectType) lines.push(`**Project Type:** ${profile.projectType}`);
  lines.push(`**Package Manager:** ${profile.packageManager}`);
  lines.push('');

  // Tools
  if (profile.buildTool) lines.push(`**Build Tool:** ${profile.buildTool}`);
  if (profile.testFramework) lines.push(`**Test Framework:** ${profile.testFramework}`);
  if (profile.formatter) lines.push(`**Formatter:** ${profile.formatter}`);
  if (profile.linter) lines.push(`**Linter:** ${profile.linter}`);
  if (profile.ciSummary) lines.push(`**CI:** ${profile.ciSummary}`);
  lines.push('');

  // Commands
  lines.push('### Available Commands');
  const cmds = profile.commands;
  if (cmds.install) lines.push(`- **Install:** \`${cmds.install}\``);
  if (cmds.build) lines.push(`- **Build:** \`${cmds.build}\``);
  if (cmds.test) lines.push(`- **Test:** \`${cmds.test}\``);
  if (cmds.lint) lines.push(`- **Lint:** \`${cmds.lint}\``);
  if (cmds.dev) lines.push(`- **Dev:** \`${cmds.dev}\``);
  if (!cmds.install && !cmds.build && !cmds.test && !cmds.lint) {
    lines.push('- No commands detected. Check project configuration manually.');
  }
  lines.push('');

  // Structure
  if (profile.structure.length > 0) {
    lines.push('### Directory Structure (top 2 levels)');
    for (const dir of profile.structure.slice(0, 30)) {
      lines.push(`- ${dir}`);
    }
    lines.push('');
  }

  // Important Files
  if (profile.importantFiles.length > 0) {
    lines.push('### Important Files');
    for (const file of profile.importantFiles) {
      lines.push(`- ${file}`);
    }
    lines.push('');
  }

  // Docker
  if (profile.dockerMetadata) {
    lines.push(`### Docker`);
    lines.push(profile.dockerMetadata);
    lines.push('');
  }

  // README summary
  if (profile.readmeSummary) {
    lines.push('### README Summary');
    lines.push(profile.readmeSummary);
    lines.push('');
  }

  return lines.join('\n');
}
