import { Integration } from '../shared/types';

export interface UrlSafetyResult {
  safe: boolean;
  normalizedUrl?: string;
  hostname?: string;
  reason?: string;
  errorCode?:
    | 'EMPTY_URL'
    | 'MALFORMED_URL'
    | 'INSECURE_PROTOCOL'
    | 'CREDENTIALS_IN_URL'
    | 'LOCALHOST_FORBIDDEN'
    | 'PRIVATE_IP_FORBIDDEN'
    | 'IP_LITERAL_FORBIDDEN'
    | 'SUSPICIOUS_HOST';
}

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isPrivateOrReservedIp(ip: string): boolean {
  const trimmed = ip.trim().toLowerCase();

  // Handle IPv4-mapped IPv6 addresses like ::ffff:127.0.0.1
  if (trimmed.startsWith('::ffff:')) {
    const mappedV4 = trimmed.slice('::ffff:'.length);
    if (IPV4_REGEX.test(mappedV4)) {
      return isPrivateOrReservedIp(mappedV4);
    }
  }

  const v4Match = trimmed.match(IPV4_REGEX);
  if (v4Match) {
    const octets = v4Match.slice(1, 5).map((n) => Number(n));
    if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b, c] = octets;
    if (a === 0) return true; // 0.0.0.0/8 current network
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
    if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
    if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
    if (a >= 224) return true; // multicast & reserved
    return false;
  }

  // IPv6 checks
  if (trimmed.includes(':')) {
    if (trimmed === '::' || trimmed === '::1') return true;
    if (trimmed.startsWith('fc') || trimmed.startsWith('fd')) return true; // Unique local fc00::/7
    if (
      trimmed.startsWith('fe8') ||
      trimmed.startsWith('fe9') ||
      trimmed.startsWith('fea') ||
      trimmed.startsWith('feb')
    ) {
      return true; // Link-local fe80::/10
    }
    if (trimmed.startsWith('ff')) return true; // Multicast
    if (trimmed.startsWith('2001:db8')) return true; // Documentation
    return false;
  }

  return false;
}

export function validateUrlSafety(rawUrl: string): UrlSafetyResult {
  const trimmed = (rawUrl ?? '').trim();
  if (!trimmed) {
    return {
      safe: false,
      errorCode: 'EMPTY_URL',
      reason: 'API documentation URL is required.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      safe: false,
      errorCode: 'MALFORMED_URL',
      reason: 'Syntactically invalid URL. Provide a complete HTTPS URL such as https://developer.calendly.com/api-docs/overview/api/reference.',
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      safe: false,
      errorCode: 'INSECURE_PROTOCOL',
      reason: `Unsupported or insecure protocol "${parsed.protocol.replace(':', '')}". Only HTTPS documentation URLs are allowed.`,
    };
  }

  if (parsed.username || parsed.password) {
    return {
      safe: false,
      errorCode: 'CREDENTIALS_IN_URL',
      reason: 'Embedded credentials (username/password) in URLs are prohibited for security.',
    };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal' ||
    hostname === 'instance-data'
  ) {
    return {
      safe: false,
      errorCode: 'LOCALHOST_FORBIDDEN',
      reason: `Host "${hostname}" resolves to a local or internal metadata domain and is blocked by SSRF policy.`,
    };
  }

  if (IPV4_REGEX.test(hostname) || hostname.includes(':')) {
    if (isPrivateOrReservedIp(hostname)) {
      return {
        safe: false,
        errorCode: 'PRIVATE_IP_FORBIDDEN',
        reason: `IP address "${hostname}" is in a private, loopback, or cloud-metadata range and is blocked by SSRF policy.`,
      };
    }
    return {
      safe: false,
      errorCode: 'IP_LITERAL_FORBIDDEN',
      reason: 'Direct IP-literal URLs are disallowed for API documentation fetching; use a verified public HTTPS domain.',
    };
  }

  if (!hostname.includes('.') || hostname.length < 4) {
    return {
      safe: false,
      errorCode: 'SUSPICIOUS_HOST',
      reason: `Hostname "${hostname}" is not a valid public domain name.`,
    };
  }

  parsed.hash = '';
  return {
    safe: true,
    normalizedUrl: parsed.toString(),
    hostname,
  };
}

const SENSITIVE_KEY_PATTERN =
  /^(authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|password|secret|private[-_]?key|cookie|set-cookie|x-api-key)$/i;

const TOKEN_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replacement: 'Bearer [REDACTED_TOKEN]' },
  { pattern: /Basic\s+[A-Za-z0-9+/=]{8,}/gi, replacement: 'Basic [REDACTED_CREDENTIALS]' },
  { pattern: /\b(pat|sk|rk|pk|ghp|xoxb|xoxp)_[A-Za-z0-9_\-]{8,}\b/g, replacement: '$1_[REDACTED]' },
  { pattern: /\bAIza[0-9A-Za-z\-_]{20,}\b/g, replacement: 'AIza[REDACTED_GEMINI_KEY]' },
  { pattern: /([?&](?:access_token|api_key|key|token|code|client_secret)=)[^&\s]+/gi, replacement: '$1[REDACTED]' },
  {
    pattern: /\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g,
    replacement: '$1***@$2',
  },
];

export function sanitizeString(value: string): string {
  let result = value;
  for (const { pattern, replacement } of TOKEN_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function redactSensitiveData<T>(input: T, depth = 0): T {
  if (depth > 8) {
    return '[MAX_DEPTH_REDACTED]' as unknown as T;
  }
  if (input === null || input === undefined) {
    return input;
  }
  if (typeof input === 'string') {
    return sanitizeString(input) as unknown as T;
  }
  if (typeof input !== 'object') {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveData(item, depth + 1)) as unknown as T;
  }

  const output: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = '[REDACTED_SECRET]';
    } else {
      output[key] = redactSensitiveData(val, depth + 1);
    }
  }
  return output as unknown as T;
}

export interface AccessDecision {
  canView: boolean;
  canEdit: boolean;
  canArchiveOrDelete: boolean;
  reason: string;
}

export function evaluateIntegrationAccess(
  actorId: string,
  integration: Pick<Integration, 'sourceType' | 'isDefault' | 'ownerId' | 'name'>
): AccessDecision {
  if (integration.sourceType === 'system' || integration.isDefault) {
    return {
      canView: true,
      canEdit: false,
      canArchiveOrDelete: false,
      reason: 'Managed by CloudEagle: system default integrations are immutable and view-only for all developers.',
    };
  }

  if (!actorId || integration.ownerId !== actorId) {
    return {
      canView: true,
      canEdit: false,
      canArchiveOrDelete: false,
      reason: `View only: "${integration.name}" is owned by another developer (${integration.ownerId ?? 'unknown'}). Only the creator can edit, archive, or delete it.`,
    };
  }

  return {
    canView: true,
    canEdit: true,
    canArchiveOrDelete: true,
    reason: 'Creator/owner access granted.',
  };
}
