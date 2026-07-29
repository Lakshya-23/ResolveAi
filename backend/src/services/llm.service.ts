import { ChatOpenAI } from '@langchain/openai';
import { config } from '../config';
import { createLogger } from './logging.service';
import { AgentLLMConfig, LLMConfig } from '../shared/types';
import { LLMError } from '../shared/errors';

const log = createLogger('LLMService');

/**
 * Get provider API key from process.env
 */
export function getProviderApiKey(provider: string): string {
  const p = (provider || '').toLowerCase();
  if (p === 'openai') return process.env.OPENAI_API_KEY || '';
  if (p === 'anthropic') return process.env.ANTHROPIC_API_KEY || '';
  if (p === 'google' || p === 'gemini') return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (p === 'groq') return process.env.GROQ_API_KEY || '';
  return process.env.OPENAI_API_KEY || '';
}

/**
 * Resolve which LLM config to use for a given agent.
 * Priority: agent-specific → shared → .env agent defaults → .env global default.
 */
export function resolveLLMConfig(llmConfig: AgentLLMConfig, agentName: string): LLMConfig {
  const agentKey = agentName.toLowerCase();
  const envModel = process.env[`${agentKey.toUpperCase()}_MODEL`];
  const envProvider = (process.env[`${agentKey.toUpperCase()}_PROVIDER`] || 'openai') as any;

  // Session-wide fallback models
  const sessionFallbackModel = llmConfig.shared?.fallbackModel;
  const sessionFallbackModels = llmConfig.shared?.fallbackModels || (sessionFallbackModel ? [sessionFallbackModel] : undefined);

  const agentSpecific = (llmConfig as any)[agentName] as LLMConfig | undefined;
  if (agentSpecific?.model) {
    const provider = agentSpecific.provider || 'openai';
    const apiKey = agentSpecific.apiKey || getProviderApiKey(provider);
    const fallbackModels = agentSpecific.fallbackModels || (agentSpecific.fallbackModel ? [agentSpecific.fallbackModel] : sessionFallbackModels);
    return { ...agentSpecific, provider, apiKey, fallbackModels };
  }

  if (llmConfig.shared?.model) {
    const provider = llmConfig.shared.provider || 'openai';
    const apiKey = llmConfig.shared.apiKey || getProviderApiKey(provider);
    const fallbackModels = llmConfig.shared.fallbackModels || (llmConfig.shared.fallbackModel ? [llmConfig.shared.fallbackModel] : undefined);
    return { ...llmConfig.shared, provider, apiKey, fallbackModels };
  }

  if (envModel) {
    const apiKey = getProviderApiKey(envProvider);
    return { provider: envProvider, model: envModel, apiKey, fallbackModels: sessionFallbackModels };
  }

  // Final fallback default
  const defaultProvider = 'openai';
  const defaultModel = 'openai/gpt-4o';
  const apiKey = getProviderApiKey(defaultProvider);
  return { provider: defaultProvider, model: defaultModel, apiKey, fallbackModels: sessionFallbackModels };
}

/**
 * Create a ChatOpenAI instance that routes through LiteLLM Proxy.
 *
 * BYOK flow:
 *   - LiteLLM config has `configurable_clientside_auth_params: ["api_key"]`
 *   - We pass the user's API key in `modelKwargs.api_key`
 *   - LiteLLM reads `api_key` from the request body and uses it for the provider
 *   - The `openAIApiKey` ("sk-litellm-proxy") is just for proxy transport (no master_key auth)
 *
 * This means:
 *   - If user provides BYOK key → LiteLLM forwards it to the provider
 *   - If user doesn't provide key → LiteLLM falls back to its configured env var key
 *   - LiteLLM always handles model routing, retries, and logging
 */
export interface ModelRateLimitInfo {
  maxOutputTokens: number;
  tpm?: number | null;
  rpm?: number | null;
}

const modelRateLimitCache = new Map<string, ModelRateLimitInfo>();

/**
 * Request rate limit and token info (TPM, RPM, maxOutputTokens) for a model dynamically.
 */
export async function getModelRateLimitInfo(modelName: string, proxyBaseUrl: string): Promise<ModelRateLimitInfo> {
  const normalizedModel = modelName.trim().toLowerCase();

  if (modelRateLimitCache.has(normalizedModel)) {
    return modelRateLimitCache.get(normalizedModel)!;
  }

  let tpm: number | null = null;
  let rpm: number | null = null;

  try {
    const res = await fetch(`${proxyBaseUrl}/model/info`);
    if (res.ok) {
      const data: any = await res.json();
      if (Array.isArray(data?.data)) {
        for (const item of data.data) {
          const name = item.model_name?.toLowerCase();
          if (name && (name === normalizedModel || (name.includes('/') && normalizedModel.endsWith(name.split('/').slice(1).join('/'))))) {
            const info = item.model_info;
            if (info?.tpm) tpm = info.tpm;
            if (info?.rpm) rpm = info.rpm;
          }
        }
      }
    }
  } catch (err: any) {
    log.warn('Could not query model rate limit info from LiteLLM proxy', { error: err.message });
  }

  // Model-specific pattern heuristics if LiteLLM dictionary doesn't specify TPM
  if (!tpm) {
    if (normalizedModel.includes('groq')) {
      if (normalizedModel.includes('70b')) {
        tpm = 12000;
        rpm = 30;
      } else {
        tpm = 30000;
        rpm = 30;
      }
    }
  }

  const maxOutputTokens = await getMaxOutputTokens(modelName, proxyBaseUrl);
  const result: ModelRateLimitInfo = { maxOutputTokens, tpm, rpm };
  modelRateLimitCache.set(normalizedModel, result);
  return result;
}

/**
 * Dynamically look up the max output token limit for a model from LiteLLM proxy's /model/info.
 * Fallbacks to model pattern heuristics, and finally default 4096.
 */
export async function getMaxOutputTokens(modelName: string, proxyBaseUrl: string): Promise<number> {
  const normalizedModel = modelName.trim().toLowerCase();

  if (modelRateLimitCache.has(normalizedModel)) {
    return modelRateLimitCache.get(normalizedModel)!.maxOutputTokens;
  }

  try {
    const res = await fetch(`${proxyBaseUrl}/model/info`);
    if (res.ok) {
      const data: any = await res.json();
      if (Array.isArray(data?.data)) {
        for (const item of data.data) {
          const name = item.model_name?.toLowerCase();
          const info = item.model_info;
          const rawLimit = info?.max_output_tokens || info?.max_tokens;
          const limit = typeof rawLimit === 'number' && rawLimit > 0 ? (rawLimit > 16384 ? 16384 : rawLimit) : null;
          if (name && limit) {
            const existing = modelRateLimitCache.get(name) || { maxOutputTokens: limit };
            existing.maxOutputTokens = limit;
            modelRateLimitCache.set(name, existing);
            if (name.includes('/')) {
              const stripped = name.split('/').slice(1).join('/');
              const existingStripped = modelRateLimitCache.get(stripped) || { maxOutputTokens: limit };
              existingStripped.maxOutputTokens = limit;
              modelRateLimitCache.set(stripped, existingStripped);
            }
          }
        }
      }
    }
  } catch (err: any) {
    log.warn('Could not query model info from LiteLLM proxy', { error: err.message });
  }

  if (modelRateLimitCache.has(normalizedModel)) {
    return modelRateLimitCache.get(normalizedModel)!.maxOutputTokens;
  }
  if (normalizedModel.includes('/')) {
    const stripped = normalizedModel.split('/').slice(1).join('/');
    if (modelRateLimitCache.has(stripped)) {
      return modelRateLimitCache.get(stripped)!.maxOutputTokens;
    }
  }

  // Model-specific pattern heuristics for fallback
  if (normalizedModel.includes('groq')) {
    return 8192;
  }
  if (
    normalizedModel.includes('claude-3-5') ||
    normalizedModel.includes('claude-3') ||
    normalizedModel.includes('claude-3-7')
  ) {
    return 8192;
  }
  if (
    normalizedModel.includes('gemini-2.5') ||
    normalizedModel.includes('gemini-1.5') ||
    normalizedModel.includes('gemini-3.6')
  ) {
    return 8192;
  }
  if (normalizedModel.includes('gpt-4o')) {
    return 16384;
  }

  // Default fallback requested: 4096
  return 4096;
}

/**
 * Create a ChatOpenAI instance that routes through LiteLLM Proxy.
 */
export async function createLLMClient(llmCfg: LLMConfig): Promise<ChatOpenAI> {
  const proxyBaseUrl = config.litellm.baseUrl;
  const maxTokens = await getMaxOutputTokens(llmCfg.model, proxyBaseUrl);

  const apiKey = llmCfg.apiKey || getProviderApiKey(llmCfg.provider);

  log.info('Creating LLM client', {
    model: llmCfg.model,
    provider: llmCfg.provider,
    proxyBaseUrl,
    hasApiKey: !!apiKey,
    hasFallback: !!llmCfg.fallbackModel,
    maxTokens,
  });

  const modelKwargs: Record<string, unknown> = {};
  if (apiKey) {
    modelKwargs.api_key = apiKey;
  }

  // Construct fallbacks array for LiteLLM
  const fallbackList = llmCfg.fallbackModels?.length
    ? llmCfg.fallbackModels
    : (llmCfg.fallbackModel ? [llmCfg.fallbackModel] : []);

  if (fallbackList.length > 0) {
    const fallbacks: Array<{ model: string; api_key: string }> = [];
    for (const fb of fallbackList) {
      if (fb.model && fb.model.trim()) {
        const fbKey = fb.apiKey || getProviderApiKey(fb.provider);
        fallbacks.push({
          model: fb.model.trim(),
          api_key: fbKey,
        });
      }
    }
    if (fallbacks.length > 0) {
      modelKwargs.fallbacks = fallbacks;
    }
  }

  const isGemini3 = (llmCfg.model || '').toLowerCase().includes('gemini-3');

  return new ChatOpenAI({
    modelName: llmCfg.model,
    apiKey: apiKey || 'sk-litellm-passthrough',
    configuration: {
      baseURL: `${proxyBaseUrl}/v1`,
    },
    modelKwargs,
    temperature: isGemini3 ? undefined : 0,
    maxTokens,
    maxRetries: 3, // LiteLLM / LangChain retry count with exponential backoff
  });
}

/**
 * Create a session-scoped LLM client from a session's LLM config.
 */
export async function createSessionLLMClient(
  llmConfig: AgentLLMConfig,
  agentName: string
): Promise<ChatOpenAI> {
  const resolved = resolveLLMConfig(llmConfig, agentName);
  return await createLLMClient(resolved);
}

/**
 * Format raw error messages from LiteLLM / LangChain into clean, human-readable feedback.
 */
function cleanLLMErrorMessage(rawMessage: string, provider: string, model: string): string {
  if (!rawMessage) return 'Unknown LLM error';

  let innerMsg = '';
  // Match {"error":{"message":"..."}} or {"message":"..."}
  const jsonMatch = rawMessage.match(/\{"error":\s*\{.*?\}/s) || rawMessage.match(/\{"message":.*?\}/s);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.error?.message) {
        innerMsg = parsed.error.message;
      } else if (parsed.message) {
        innerMsg = parsed.message;
      }
    } catch {
      // Ignore JSON parse error
    }
  }

  const textToAnalyze = (innerMsg || rawMessage).toLowerCase();

  const formatHints: Record<string, string> = {
    groq: 'groq/<model_id> (e.g., groq/llama-3.3-70b-versatile or groq/openai/gpt-oss-120b)',
    google: 'google_genai/<model_id> or gemini/<model_id> (e.g., google_genai/gemini-2.5-flash)',
    openai: 'openai/<model_id> (e.g., openai/gpt-4o or gpt-4o)',
    anthropic: 'anthropic/<model_id> (e.g., anthropic/claude-3-5-sonnet-20241022)',
  };
  const hint = formatHints[provider.toLowerCase()] || `${provider}/<model_name>`;

  if (
    textToAnalyze.includes('model_not_found') ||
    textToAnalyze.includes('notfounderror') ||
    textToAnalyze.includes('does not exist') ||
    textToAnalyze.includes('404')
  ) {
    return `Model '${model}' was not found on ${provider}. Ensure the model name format is correct: ${hint}`;
  }

  if (
    textToAnalyze.includes('invalid_api_key') ||
    textToAnalyze.includes('authenticationerror') ||
    textToAnalyze.includes('unauthorized') ||
    textToAnalyze.includes('missing credentials') ||
    textToAnalyze.includes('401')
  ) {
    return `Invalid API key for provider '${provider}'. Please check your API key.`;
  }

  if (
    textToAnalyze.includes('contextwindowexceedederror') ||
    textToAnalyze.includes('context_window_exceeded')
  ) {
    return `Context window exceeded for model '${model}'. Consider reducing prompt/context size.`;
  }

  if (
    textToAnalyze.includes('contentpolicyviolationerror') ||
    textToAnalyze.includes('content_filter')
  ) {
    return `Request flagged or blocked by ${provider}'s content safety policy.`;
  }

  if (
    textToAnalyze.includes('permissiondeniederror') ||
    textToAnalyze.includes('403')
  ) {
    return `Permission denied for provider '${provider}'. Verify account permissions for model '${model}'.`;
  }

  if (
    textToAnalyze.includes('serviceunavailableerror') ||
    textToAnalyze.includes('503')
  ) {
    return `${provider} service is currently unavailable. Please try again later.`;
  }

  if (
    textToAnalyze.includes('tpm') ||
    textToAnalyze.includes('tokens per minute') ||
    (textToAnalyze.includes('requested') && textToAnalyze.includes('limit'))
  ) {
    const limitMatch = rawMessage.match(/limit\s*:?\s*(\d[\d,]*)/i) || rawMessage.match(/limit\s+of\s+(\d[\d,]*)/i);
    const reqMatch = rawMessage.match(/requested\s*:?\s*(\d[\d,]*)/i) || rawMessage.match(/requested\s+(\d[\d,]*)/i);

    const limitVal = limitMatch ? limitMatch[1] : null;
    const reqVal = reqMatch ? reqMatch[1] : null;

    let details = '';
    if (limitVal && reqVal) {
      details = ` Requested ${reqVal} tokens, but the limit is ${limitVal} TPM.`;
    } else if (limitVal) {
      details = ` (Provider TPM Limit: ${limitVal}).`;
    }

    const providerLower = (provider || '').toLowerCase();
    let advice = 'Try reducing prompt size or selecting a model with higher throughput.';
    if (providerLower.includes('groq') || textToAnalyze.includes('groq')) {
      advice = 'Groq on-demand tier enforces strict TPM limits per model. Consider using groq/llama-3.1-8b-instant or upgrading your Groq tier at console.groq.com.';
    } else if (providerLower.includes('openai') || textToAnalyze.includes('openai')) {
      advice = 'Check your OpenAI rate limits or tier allocation in the OpenAI dashboard.';
    } else if (providerLower.includes('google') || textToAnalyze.includes('gemini')) {
      advice = 'Check your Gemini API quota limits in Google AI Studio.';
    }

    return `TPM (Tokens Per Minute) limit exceeded for model '${model}' on ${provider}.${details} ${advice}`;
  }

  if (textToAnalyze.includes('ratelimiterror') || textToAnalyze.includes('rate_limit') || textToAnalyze.includes('429') || textToAnalyze.includes('quota')) {
    const providerLower = (provider || '').toLowerCase();
    let advice = 'Please try again later.';
    if (providerLower.includes('groq')) {
      advice = 'Groq rate limit reached. Consider using groq/llama-3.1-8b-instant or waiting 60s.';
    }
    return `Rate limit or quota exceeded for ${provider}. ${advice}`;
  }

  if (textToAnalyze.includes('timeout') || textToAnalyze.includes('apitimeouterror') || textToAnalyze.includes('econnrefused')) {
    return `Connection timeout or proxy server unreachable. Ensure LiteLLM proxy is running on port 4000.`;
  }

  if (innerMsg) {
    return innerMsg;
  }

  let cleaned = rawMessage
    .replace(/^\d{3}\s+litellm\.\w+:\s*/i, '')
    .replace(/Available Model Group Fallbacks=.*$/is, '')
    .replace(/Troubleshooting URL:.*$/is, '')
    .replace(/\b(https?:\/\/\S+)/gi, '')
    .trim();

  return cleaned || `Validation failed for model '${model}'`;
}

/**
 * Validate an LLM configuration by running format regex checks
 * and performing a lightweight test completion call through LiteLLM.
 */
export async function validateLLMConfig(llmCfg: LLMConfig): Promise<{ valid: boolean; message: string; rateLimitInfo?: ModelRateLimitInfo }> {
  if (!llmCfg.model || !llmCfg.model.trim()) {
    return { valid: false, message: 'Model name is required' };
  }

  const apiKey = llmCfg.apiKey || getProviderApiKey(llmCfg.provider);
  if (!apiKey || !apiKey.trim()) {
    return { valid: false, message: `No API key found in backend process.env for provider '${llmCfg.provider}'. Please add ${llmCfg.provider.toUpperCase()}_API_KEY to backend .env` };
  }

  // Request rate limit & model info first
  const rateLimitInfo = await getModelRateLimitInfo(llmCfg.model, config.litellm.baseUrl);

  // Live completion probe via LiteLLM
  try {
    const testClient = new ChatOpenAI({
      modelName: llmCfg.model,
      apiKey: apiKey,
      configuration: {
        baseURL: `${config.litellm.baseUrl}/v1`,
      },
      modelKwargs: { api_key: apiKey },
      temperature: 0,
      maxTokens: 5,
      timeout: 10_000,
    });

    await testClient.invoke('test');

    let extraInfo = '';
    if (rateLimitInfo.tpm) {
      extraInfo = ` [Limits: ${rateLimitInfo.tpm} TPM, max output: ${rateLimitInfo.maxOutputTokens} tokens]`;
    } else {
      extraInfo = ` [Max output: ${rateLimitInfo.maxOutputTokens} tokens]`;
    }

    return {
      valid: true,
      message: `Model '${llmCfg.model}' verified successfully!${extraInfo}`,
      rateLimitInfo,
    };
  } catch (error: any) {
    log.error('LLM validation failed', { provider: llmCfg.provider, model: llmCfg.model, error: error.message });
    const cleanMsg = cleanLLMErrorMessage(error.message, llmCfg.provider || '', llmCfg.model || '');
    return { valid: false, message: cleanMsg, rateLimitInfo };
  }
}
