import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { loadPrompt } from '../services/prompt.service';
import { createLogger } from '../services/logging.service';
import { createSessionLLMClient, resolveLLMConfig, getModelRateLimitInfo, ModelRateLimitInfo } from '../services/llm.service';
import { createToolsForAgent } from '../tools/tool-manager';
import { emitToSession } from '../services/socket.service';
import { AgentLLMConfig } from '../shared/types';
import { LLMError } from '../shared/errors';
import { AGENT_EVENTS } from '../shared/events';
import { config } from '../config';

const log = createLogger('AgentRuntime');

/**
 * Build the system prompt for an agent by combining system + agent-specific prompts
 * and injecting dynamic model rate limit & token budget instructions.
 */
function buildSystemPrompt(
  agentName: string,
  context: Record<string, string>,
  rateLimitInfo: ModelRateLimitInfo,
  modelName: string
): string {
  const systemPrompt = loadPrompt('system');
  const agentPrompt = loadPrompt(agentName);

  let fullPrompt = `${systemPrompt}\n\n---\n\n${agentPrompt}`;

  // Dynamically inject rate limit and token compliance instructions
  fullPrompt += `\n\n---\n\n## Rate Limit & Token Budget Instructions\n`;
  fullPrompt += `- Operating Model: \`${modelName}\`\n`;
  fullPrompt += `- Max Response Output Tokens: ${rateLimitInfo.maxOutputTokens}\n`;
  if (rateLimitInfo.tpm) {
    fullPrompt += `- Tokens Per Minute (TPM) Limit: ${rateLimitInfo.tpm}\n`;
    fullPrompt += `- COMPLIANCE MANDATE: You MUST comply with the ${rateLimitInfo.tpm} TPM limit. Keep your responses concise, focused, and avoid generating massive unneeded text or duplicate code blocks in a single turn.\n`;
  } else {
    fullPrompt += `- COMPLIANCE MANDATE: Keep your responses concise, focused, and within standard provider rate limits.\n`;
  }

  // Inject context sections (trimmable if needed)
  const sections: Array<[string, string]> = [
    ['agentSkill', 'Agent Custom Skill & Guidelines'],
    ['repositoryContext', 'Repository Context'],
    ['issueContent', 'GitHub Issue'],
    ['specialInstructions', 'Special Instructions'],
    ['environmentReport', 'Environment Report'],
    ['planningReport', 'Planning Report'],
    ['implementationReport', 'Implementation Report'],
    ['validationReport', 'Validation Report'],
  ];

  // Calculate strict max character budget per context section based on TPM limit
  // For low TPM models (e.g. 12,000 TPM), budget ~2,500 tokens (~10,000 chars) per section to keep total payload strictly < TPM limit
  const maxCharBudget = rateLimitInfo.tpm
    ? Math.min(15_000, Math.floor(rateLimitInfo.tpm * 0.25 * 4))
    : 30_000;

  for (const [key, title] of sections) {
    if (context[key]) {
      let content = context[key];
      if (content.length > maxCharBudget) {
        content = content.slice(0, maxCharBudget) + '\n...[context trimmed to stay strictly under model TPM rate limits]...';
      }
      fullPrompt += `\n\n---\n\n## ${title}\n${content}`;
    }
  }

  return fullPrompt;
}

/**
 * Run an agent with the given configuration and context.
 * Streams observable execution events (tool calls) via WebSocket.
 */
export async function runAgent(params: {
  agentName: string;
  llmConfig: AgentLLMConfig;
  containerId: string;
  repositoryProfile: any;
  repositoryContext: string;
  buildCommand: string | null;
  testCommand: string | null;
  lintCommand: string | null;
  tavilyApiKey: string;
  context: Record<string, string>;
  userMessage: string;
  sessionId?: string;
}): Promise<string> {
  const {
    agentName, llmConfig, containerId, repositoryProfile,
    repositoryContext, buildCommand, testCommand, lintCommand,
    tavilyApiKey, context, userMessage, sessionId,
  } = params;

  log.info(`Running agent: ${agentName}`);

  // 1. Resolve configuration & request rate limit info FIRST
  const resolvedLLMCfg = resolveLLMConfig(llmConfig, agentName);
  const rateLimitInfo = await getModelRateLimitInfo(resolvedLLMCfg.model, config.litellm.baseUrl);

  log.info(`Rate limit info for agent ${agentName}`, {
    model: resolvedLLMCfg.model,
    maxOutputTokens: rateLimitInfo.maxOutputTokens,
    tpm: rateLimitInfo.tpm,
  });

  // 2. Create LLM client via the centralized factory
  const llm = await createSessionLLMClient(llmConfig, agentName);

  // 3. Create tools for this agent
  const tools = createToolsForAgent({
    agentName: agentName as any,
    containerId,
    repositoryProfile,
    repositoryContext,
    buildCommand,
    testCommand,
    lintCommand,
    tavilyApiKey,
  });

  // 4. Build system prompt with dynamic rate limit compliance instructions
  const systemPrompt = buildSystemPrompt(agentName, context, rateLimitInfo, resolvedLLMCfg.model);

  // 5. Create react agent
  const agent = createReactAgent({
    llm,
    tools,
    prompt: systemPrompt,
  });

  // Helper to emit observable events
  const emitActivity = (type: string, data: Record<string, any>) => {
    if (sessionId) {
      emitToSession(sessionId, AGENT_EVENTS.ACTIVITY, {
        sessionId,
        agent: agentName,
        type,
        timestamp: new Date().toISOString(),
        ...data,
      });
    }
  };

  try {
    // Emit agent started
    emitActivity('agent_started', { message: `${agentName} started` });

    // 6. Stream the agent execution to capture tool calls
    const stream = await agent.stream(
      { messages: [{ role: 'user', content: userMessage }] },
      { recursionLimit: 100, streamMode: 'updates' }
    );

    let lastResponse = '';

    for await (const update of stream) {
      // Each update is { nodeName: { messages: [...] } }
      for (const [nodeName, stateUpdate] of Object.entries(update)) {
        const messages = (stateUpdate as any)?.messages;
        if (!messages || !Array.isArray(messages)) continue;

        for (const msg of messages) {
          // Tool call requests from the LLM
          if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
            for (const toolCall of msg.tool_calls) {
              emitActivity('tool_invoked', {
                tool: toolCall.name,
                args: toolCall.args,
                message: `Invoking ${toolCall.name}`,
              });
            }
          }

          // Tool results
          if (msg.name && (msg.constructor?.name === 'ToolMessage' || msg._getType?.() === 'tool')) {
            const resultPreview = typeof msg.content === 'string'
              ? msg.content.slice(0, 200)
              : JSON.stringify(msg.content).slice(0, 200);

            emitActivity('tool_completed', {
              tool: msg.name,
              result: resultPreview,
              message: `${msg.name} completed`,
            });
          }

          // Final AI message
          if (typeof msg.content === 'string' && msg.content.length > 0 && !msg.name) {
            lastResponse = msg.content;
          }
        }
      }
    }

    // Emit agent completed
    emitActivity('agent_completed', { message: `${agentName} completed` });

    log.info(`Agent ${agentName} completed`, { responseLength: lastResponse.length });
    return lastResponse;
  } catch (error: any) {
    emitActivity('agent_failed', { message: `${agentName} failed: ${error.message}` });
    log.error(`Agent ${agentName} failed`, { error: error.message });
    throw new LLMError(`Agent '${agentName}' failed: ${error.message}`);
  }
}
