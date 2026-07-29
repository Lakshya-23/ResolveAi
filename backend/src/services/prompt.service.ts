import fs from 'fs';
import path from 'path';
import { createLogger } from './logging.service';

const log = createLogger('PromptLoader');

const PROMPTS_DIR = path.join(__dirname, '..', 'prompts');

// Cache loaded prompts in memory
const promptCache = new Map<string, string>();

/**
 * Load a prompt template from the prompts/ directory.
 * Caches in memory after first load.
 */
export function loadPrompt(name: string): string {
  if (promptCache.has(name)) {
    return promptCache.get(name)!;
  }

  const filePath = path.join(PROMPTS_DIR, `${name}.md`);

  if (!fs.existsSync(filePath)) {
    log.error('Prompt file not found', { name, filePath });
    throw new Error(`Prompt file not found: ${name}.md`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  promptCache.set(name, content);
  log.info('Prompt loaded', { name });

  return content;
}

/**
 * Load a prompt and inject context variables.
 * Variables in the template use {{variableName}} syntax.
 */
export function loadPromptWithContext(
  name: string,
  context: Record<string, string>
): string {
  let prompt = loadPrompt(name);

  for (const [key, value] of Object.entries(context)) {
    prompt = prompt.replaceAll(`{{${key}}}`, value);
  }

  return prompt;
}

/**
 * Clear the prompt cache (useful for development hot-reloading).
 */
export function clearPromptCache(): void {
  promptCache.clear();
  log.info('Prompt cache cleared');
}

/**
 * List all available prompt templates.
 */
export function listPrompts(): string[] {
  const files = fs.readdirSync(PROMPTS_DIR);
  return files
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace('.md', ''));
}
