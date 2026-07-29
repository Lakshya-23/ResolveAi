import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

// Ensure log directory exists
if (!fs.existsSync(config.logging.dir)) {
  fs.mkdirSync(config.logging.dir, { recursive: true });
}

// ─── Secret Masking ───

/** Patterns that match sensitive values in log output. */
const SECRET_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  // API keys
  { regex: /sk-[A-Za-z0-9_-]{20,}/g,        replacement: 'sk-***REDACTED***' },
  { regex: /sk-ant-[A-Za-z0-9_-]{20,}/g,     replacement: 'sk-ant-***REDACTED***' },
  { regex: /sk-proj-[A-Za-z0-9_-]{20,}/g,    replacement: 'sk-proj-***REDACTED***' },
  { regex: /tvly-[A-Za-z0-9_-]{20,}/g,       replacement: 'tvly-***REDACTED***' },
  { regex: /gsk_[A-Za-z0-9_-]{20,}/g,        replacement: 'gsk_***REDACTED***' },
  { regex: /AIza[A-Za-z0-9_-]{30,}/g,        replacement: 'AIza***REDACTED***' },

  // GitHub tokens
  { regex: /ghp_[A-Za-z0-9]{36,}/g,          replacement: 'ghp_***REDACTED***' },
  { regex: /github_pat_[A-Za-z0-9_]{60,}/g,  replacement: 'github_pat_***REDACTED***' },
  { regex: /gho_[A-Za-z0-9]{36,}/g,          replacement: 'gho_***REDACTED***' },

  // Bearer tokens in URLs/headers
  { regex: /Bearer\s+[A-Za-z0-9._\-]{20,}/gi, replacement: 'Bearer ***REDACTED***' },

  // Generic long tokens (catch-all for unknown key formats)
  { regex: /"apiKey"\s*:\s*"[^"]{8,}"/g,      replacement: '"apiKey": "***REDACTED***"' },
  { regex: /"api_key"\s*:\s*"[^"]{8,}"/g,     replacement: '"api_key": "***REDACTED***"' },
  { regex: /"token"\s*:\s*"[^"]{8,}"/g,       replacement: '"token": "***REDACTED***"' },
  { regex: /"password"\s*:\s*"[^"]{4,}"/g,    replacement: '"password": "***REDACTED***"' },
];

/**
 * Mask all secrets in a string.
 */
function maskSecrets(input: string): string {
  let masked = input;
  for (const { regex, replacement } of SECRET_PATTERNS) {
    masked = masked.replace(regex, replacement);
  }
  return masked;
}

/**
 * Deep-clone and mask secrets in any serializable value.
 */
function maskValue(value: unknown): unknown {
  if (typeof value === 'string') return maskSecrets(value);
  if (Array.isArray(value)) return value.map(maskValue);
  if (value && typeof value === 'object') {
    const masked: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      // Redact values of known-sensitive keys entirely
      if (/apiKey|api_key|token|password|secret/i.test(k) && typeof v === 'string') {
        masked[k] = v.length > 4 ? v.slice(0, 4) + '***' : '***';
      } else {
        masked[k] = maskValue(v);
      }
    }
    return masked;
  }
  return value;
}

/**
 * Winston format that masks secrets from all log entries.
 */
const secretMaskingFormat = winston.format((info) => {
  // Mask the message
  if (typeof info.message === 'string') {
    info.message = maskSecrets(info.message);
  }

  // Mask all metadata values
  for (const key of Object.keys(info)) {
    if (['level', 'message', 'timestamp', 'service', 'component'].includes(key)) continue;
    info[key] = maskValue(info[key]);
  }

  return info;
})();

// ─── Formats ───

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  secretMaskingFormat,
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  secretMaskingFormat,
  winston.format.printf(({ timestamp, level, message, component, ...meta }) => {
    const comp = component ? `[${component}]` : '';
    const extra = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level} ${comp} ${message}${extra}`;
  })
);

// ─── Logger ───

export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { service: 'resolveai' },
  transports: [
    // Console output (pretty for development)
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join(config.logging.dir, 'combined.log'),
      maxsize: 10_000_000, // 10MB
      maxFiles: 5,
    }),
    // Error-only log file
    new winston.transports.File({
      filename: path.join(config.logging.dir, 'error.log'),
      level: 'error',
      maxsize: 10_000_000,
      maxFiles: 5,
    }),
  ],
});

/**
 * Create a child logger with a component name attached to every entry.
 */
export function createLogger(component: string) {
  return logger.child({ component });
}
