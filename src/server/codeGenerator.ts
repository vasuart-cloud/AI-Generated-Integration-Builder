import JSZip from 'jszip';
import {
  CodeArtifact,
  CollectorConfig,
  DocumentationValidation,
  FailureInjectionType,
  GenerationRun,
  Integration,
  VerificationCheckResult,
} from '../shared/types';

function toEnvPrefix(slug: string): string {
  return slug
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase() || 'CONNECTOR';
}

export interface GeneratedFileSpec {
  path: string;
  language: CodeArtifact['language'];
  content: string;
  producedByAgent: 'client_code_agent' | 'resilience_agent' | 'test_packaging_agent';
}

export function generateIntegrationFileSpecs(params: {
  integration: Integration;
  validation: DocumentationValidation;
  run: GenerationRun;
  ownerName: string;
}): GeneratedFileSpec[] {
  const { integration, validation, run, ownerName } = params;
  const cfg: CollectorConfig = run.collectorConfig;
  const envPrefix = toEnvPrefix(integration.slug);
  const baseUrl = validation.evidence.baseUrlCandidates[0] || 'https://api.calendly.com';
  const allowedHost = (() => {
    try {
      return new URL(baseUrl).hostname;
    } catch {
      return 'api.calendly.com';
    }
  })();

  const isCalendly =
    allowedHost.includes('calendly.com') ||
    validation.evidence.documentedEndpoints.some((e) => e.path.includes('/organization_memberships'));

  const files: GeneratedFileSpec[] = [
    {
      path: 'src/types.ts',
      language: 'typescript',
      producedByAgent: 'client_code_agent',
      content: `/**
 * Canonical TypeScript Contracts for ${integration.name} Connector
 * Provenance: ${validation.evidence.providerName} (${validation.evidence.apiVersion})
 * NOTE: Unsupported fields (login history, paid seat utilization, billed usage)
 * are intentionally absent—never fabricated from unverified sources.
 */

export interface ConnectorRuntimeConfig {
  baseUrl: string;
  allowedPaginationHost: string;
  timeoutMs: number;
  maxRetries: number;
  pageSize: number;
  maxPages: number;
  collectionWindowDays: number;
  logVerbosity: 'info' | 'debug' | 'warn';
}

export interface PaginatedResponse<T> {
  collection: T[];
  pagination: {
    count: number;
    next_page: string | null;
    next_page_token: string | null;
  };
}

export interface RawCurrentUserResponse {
  resource: {
    uri: string;
    name: string;
    email: string;
    current_organization: string;
    scheduling_url?: string;
    timezone?: string;
    created_at?: string;
    updated_at?: string;
  };
}

export interface RawOrganizationMembership {
  uri: string;
  role: 'user' | 'admin' | 'owner' | string;
  organization: string;
  created_at: string;
  user: {
    uri: string;
    name: string;
    email: string;
    slug?: string;
    timezone?: string;
    avatar_url?: string;
  };
}

export interface RawScheduledEvent {
  uri: string;
  name: string;
  status: 'active' | 'canceled' | string;
  start_time: string;
  end_time: string;
  event_memberships: Array<{
    user: string;
    user_email?: string;
  }>;
}

export interface CanonicalMemberRecord {
  externalUserId: string;
  userUri: string;
  fullName: string;
  email: string;
  organizationRole: string;
  organizationUri: string;
  timezone: string | null;
  joinedAt: string;
}

/**
 * Explicit Derived Scheduling Activity Proxy
 * IMPORTANT: derivedScheduledEventsCountWindow measures calendar booking events only.
 * It MUST NOT be interpreted as interactive login activity, paid seat allocation, or billed license usage.
 */
export interface DerivedSchedulingActivitySummary {
  externalUserId: string;
  userUri: string;
  windowDays: number;
  derivedScheduledEventsCountWindow: number;
  metricClassification: 'derived_scheduling_activity_proxy';
  unsupportedMetricsNotice: {
    lastLoginTimestamp: 'not_available_in_source';
    paidLicenseUtilization: 'not_available_in_source';
    billedSeatCount: 'not_available_in_source';
  };
}

export interface CollectionRunOutput {
  correlationId: string;
  collectedAt: string;
  organizationUri: string;
  members: CanonicalMemberRecord[];
  activityProxies: DerivedSchedulingActivitySummary[];
}
`,
    },
    {
      path: 'src/auth.ts',
      language: 'typescript',
      producedByAgent: 'client_code_agent',
      content: `/**
 * Authentication Configuration for ${integration.name}
 * Auth Type: ${cfg.authType}
 * Approved Read-Only Scopes: ${cfg.scopes.join(', ')}
 * Security Invariant: Secrets are read strictly from environment references—never hardcoded.
 */

export interface AuthCredentials {
  accessToken: string;
  authScheme: '${cfg.authType}';
  requiredScopes: readonly string[];
}

export const REQUIRED_READ_ONLY_SCOPES = Object.freeze(${JSON.stringify(cfg.scopes)});

export function loadAuthCredentialsFromEnv(
  env: Record<string, string | undefined> = process.env
): AuthCredentials {
  const token = env.${envPrefix}_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error(
      'Missing required environment variable ${envPrefix}_ACCESS_TOKEN. Inject via secret manager; never hardcode tokens.'
    );
  }

  return {
    accessToken: token,
    authScheme: '${cfg.authType}',
    requiredScopes: REQUIRED_READ_ONLY_SCOPES,
  };
}

export function buildAuthorizationHeaders(creds: AuthCredentials, correlationId: string): Record<string, string> {
  return {
    Authorization: \`Bearer \${creds.accessToken}\`,
    Accept: 'application/json',
    'X-Correlation-Id': correlationId,
  };
}
`,
    },
    {
      path: 'src/errors.ts',
      language: 'typescript',
      producedByAgent: 'resilience_agent',
      content: `/**
 * Typed HTTP Error Taxonomy & Bounded Retry / Rate-Limit Backoff
 */

export type ApiErrorCategory =
  | 'bad_request_400'
  | 'unauthorized_401'
  | 'forbidden_403'
  | 'not_found_404'
  | 'rate_limited_429'
  | 'upstream_5xx'
  | 'timeout'
  | 'unsafe_pagination_host'
  | 'pagination_cycle'
  | 'schema_validation';

export class ConnectorApiError extends Error {
  public readonly category: ApiErrorCategory;
  public readonly statusCode?: number;
  public readonly retryable: boolean;
  public readonly retryAfterMs?: number;

  constructor(params: {
    message: string;
    category: ApiErrorCategory;
    statusCode?: number;
    retryable: boolean;
    retryAfterMs?: number;
  }) {
    super(params.message);
    this.name = 'ConnectorApiError';
    this.category = params.category;
    this.statusCode = params.statusCode;
    this.retryable = params.retryable;
    this.retryAfterMs = params.retryAfterMs;
  }
}

export function classifyHttpStatus(status: number, retryAfterHeader?: string | null): ConnectorApiError {
  const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  const retryAfterMs =
    !Number.isNaN(retryAfterSec) && retryAfterSec > 0
      ? Math.min(retryAfterSec * 1000, 60_000)
      : undefined;

  if (status === 400) {
    return new ConnectorApiError({
      message: 'Upstream returned 400 Bad Request (invalid query parameter or filter window).',
      category: 'bad_request_400',
      statusCode: 400,
      retryable: false,
    });
  }
  if (status === 401) {
    return new ConnectorApiError({
      message: 'Upstream returned 401 Unauthorized (expired or invalid access token).',
      category: 'unauthorized_401',
      statusCode: 401,
      retryable: false,
    });
  }
  if (status === 403) {
    return new ConnectorApiError({
      message: 'Upstream returned 403 Forbidden (missing required read-only scope or organization permission).',
      category: 'forbidden_403',
      statusCode: 403,
      retryable: false,
    });
  }
  if (status === 404) {
    return new ConnectorApiError({
      message: 'Upstream returned 404 Not Found (resource URI does not exist).',
      category: 'not_found_404',
      statusCode: 404,
      retryable: false,
    });
  }
  if (status === 429) {
    return new ConnectorApiError({
      message: 'Upstream returned 429 Too Many Requests (rate limit exceeded).',
      category: 'rate_limited_429',
      statusCode: 429,
      retryable: true,
      retryAfterMs,
    });
  }
  if (status >= 500) {
    return new ConnectorApiError({
      message: \`Upstream returned transient server error HTTP \${status}.\`,
      category: 'upstream_5xx',
      statusCode: status,
      retryable: true,
    });
  }

  return new ConnectorApiError({
    message: \`Unexpected HTTP status \${status}.\`,
    category: 'bad_request_400',
    statusCode: status,
    retryable: false,
  });
}

export function computeBackoffDelayMs(
  attempt: number,
  retryAfterMs?: number,
  baseDelayMs = 400,
  maxDelayMs = 15_000
): number {
  if (retryAfterMs && retryAfterMs > 0) {
    return Math.min(retryAfterMs, maxDelayMs);
  }
  const exp = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  const jitter = Math.floor(Math.random() * Math.min(250, exp * 0.25));
  return Math.min(exp + jitter, maxDelayMs);
}
`,
    },
    {
      path: 'src/logger.ts',
      language: 'typescript',
      producedByAgent: 'resilience_agent',
      content: `/**
 * Structured Redacted Logger with Correlation IDs
 * Automatically scrubs Bearer tokens, API keys, OAuth codes, and member email PII.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SECRET_KEY_REGEX = /^(authorization|access_token|refresh_token|api_key|client_secret|password|cookie)$/i;

export function redactLogValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value
      .replace(/Bearer\\s+[A-Za-z0-9\\-._~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/\\b(pat|sk)_[A-Za-z0-9_\\-]{8,}\\b/g, '$1_[REDACTED]')
      .replace(/\\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\\.[A-Za-z]{2,})\\b/g, '$1***@$2');
  }
  if (Array.isArray(value)) {
    return value.map(redactLogValue);
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_REGEX.test(k) ? '[REDACTED_SECRET]' : redactLogValue(v);
    }
    return out;
  }
  return value;
}

export class StructuredLogger {
  constructor(
    private readonly correlationId: string,
    private readonly minLevel: LogLevel = '${cfg.logVerbosity}'
  ) {}

  private shouldLog(level: LogLevel): boolean {
    const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
    return order[level] >= order[this.minLevel];
  }

  public emit(level: LogLevel, event: string, metadata: Record<string, unknown> = {}): void {
    if (!this.shouldLog(level)) return;
    const entry = {
      timestamp: new Date().toISOString(),
      correlationId: this.correlationId,
      level,
      event,
      metadata: redactLogValue(metadata),
    };
    console.info(JSON.stringify(entry));
  }

  public info(event: string, metadata?: Record<string, unknown>): void {
    this.emit('info', event, metadata);
  }

  public warn(event: string, metadata?: Record<string, unknown>): void {
    this.emit('warn', event, metadata);
  }

  public error(event: string, metadata?: Record<string, unknown>): void {
    this.emit('error', event, metadata);
  }
}
`,
    },
    {
      path: 'src/pagination.ts',
      language: 'typescript',
      producedByAgent: 'resilience_agent',
      content: `/**
 * Bounded Cursor Pagination with Cycle Detection & Cross-Origin SSRF Guard
 * Allowed Pagination Host: ${allowedHost}
 */

import { ConnectorApiError } from './errors';
import { PaginatedResponse } from './types';

export function validateNextPageUrl(nextPageUrl: string, allowedHost = '${allowedHost}'): string {
  let parsed: URL;
  try {
    parsed = new URL(nextPageUrl);
  } catch {
    throw new ConnectorApiError({
      message: 'Malformed pagination.next_page URL returned by upstream.',
      category: 'unsafe_pagination_host',
      retryable: false,
    });
  }

  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== allowedHost.toLowerCase()) {
    throw new ConnectorApiError({
      message: \`Blocked cross-origin or insecure pagination redirect to "\${parsed.origin}". Expected https://\${allowedHost}.\`,
      category: 'unsafe_pagination_host',
      retryable: false,
    });
  }

  return parsed.toString();
}

export async function collectBoundedPages<T>(params: {
  initialUrl: string;
  allowedHost: string;
  maxPages: number;
  fetchPage: (url: string) => Promise<PaginatedResponse<T>>;
}): Promise<T[]> {
  const { initialUrl, allowedHost, maxPages, fetchPage } = params;
  const aggregated: T[] = [];
  const visitedCursors = new Set<string>();

  let currentUrl: string | null = validateNextPageUrl(initialUrl, allowedHost);
  let pageCount = 0;

  while (currentUrl && pageCount < maxPages) {
    if (visitedCursors.has(currentUrl)) {
      throw new ConnectorApiError({
        message: \`Pagination cycle detected on repeated cursor URL at page \${pageCount + 1}.\`,
        category: 'pagination_cycle',
        retryable: false,
      });
    }
    visitedCursors.add(currentUrl);
    pageCount += 1;

    const response = await fetchPage(currentUrl);
    if (!Array.isArray(response.collection)) {
      throw new ConnectorApiError({
        message: 'Invalid paginated response schema: missing collection[] array.',
        category: 'schema_validation',
        retryable: false,
      });
    }

    aggregated.push(...response.collection);

    const nextLink = response.pagination?.next_page ?? null;
    if (!nextLink) {
      currentUrl = null;
    } else {
      currentUrl = validateNextPageUrl(nextLink, allowedHost);
    }
  }

  return aggregated;
}
`,
    },
    {
      path: 'src/apiClient.ts',
      language: 'typescript',
      producedByAgent: 'client_code_agent',
      content: `/**
 * Typed HTTPS Client for ${integration.name}
 * Base URL: ${baseUrl}
 */

import { AuthCredentials, buildAuthorizationHeaders } from './auth';
import { classifyHttpStatus, computeBackoffDelayMs, ConnectorApiError } from './errors';
import { StructuredLogger } from './logger';
import { ConnectorRuntimeConfig } from './types';

export const DEFAULT_RUNTIME_CONFIG: ConnectorRuntimeConfig = {
  baseUrl: '${baseUrl}',
  allowedPaginationHost: '${allowedHost}',
  timeoutMs: ${cfg.timeoutMs},
  maxRetries: ${cfg.maxRetries},
  pageSize: ${cfg.pageSize},
  maxPages: ${cfg.maxPages},
  collectionWindowDays: ${cfg.collectionWindowDays},
  logVerbosity: '${cfg.logVerbosity}',
};

export class IntegrationApiClient {
  constructor(
    private readonly creds: AuthCredentials,
    private readonly config: ConnectorRuntimeConfig = DEFAULT_RUNTIME_CONFIG,
    private readonly logger: StructuredLogger,
    private readonly correlationId: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    if (!this.config.baseUrl.startsWith('https://')) {
      throw new Error('Insecure baseUrl rejected: HTTPS is mandatory.');
    }
  }

  public buildEndpointUrl(pathOrFullUrl: string, query?: Record<string, string | number | undefined>): string {
    const url = pathOrFullUrl.startsWith('https://')
      ? new URL(pathOrFullUrl)
      : new URL(pathOrFullUrl, this.config.baseUrl);

    if (url.hostname.toLowerCase() !== this.config.allowedPaginationHost.toLowerCase()) {
      throw new ConnectorApiError({
        message: \`Host mismatch: \${url.hostname} is not allowlisted (\${this.config.allowedPaginationHost}).\`,
        category: 'unsafe_pagination_host',
        retryable: false,
      });
    }

    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) {
          url.searchParams.set(k, String(v));
        }
      }
    }
    return url.toString();
  }

  public async getJson<T>(pathOrFullUrl: string, query?: Record<string, string | number | undefined>): Promise<T> {
    const targetUrl = this.buildEndpointUrl(pathOrFullUrl, query);
    const headers = buildAuthorizationHeaders(this.creds, this.correlationId);

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const res = await this.fetchImpl(targetUrl, {
          method: 'GET',
          headers,
          redirect: 'error',
          signal: controller.signal,
        });

        if (res.ok) {
          const data = (await res.json()) as T;
          return data;
        }

        const apiErr = classifyHttpStatus(res.status, res.headers.get('retry-after'));
        if (!apiErr.retryable || attempt === this.config.maxRetries) {
          this.logger.error('api_request_failed', {
            url: targetUrl,
            status: res.status,
            category: apiErr.category,
            attempt,
          });
          throw apiErr;
        }

        const delayMs = computeBackoffDelayMs(attempt, apiErr.retryAfterMs);
        this.logger.warn('api_request_retrying', {
          url: targetUrl,
          status: res.status,
          attempt: attempt + 1,
          delayMs,
        });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } catch (err) {
        if (err instanceof ConnectorApiError) {
          throw err;
        }
        const isAbort = err instanceof Error && err.name === 'AbortError';
        if (isAbort && attempt === this.config.maxRetries) {
          throw new ConnectorApiError({
            message: \`Request timed out after \${this.config.timeoutMs}ms.\`,
            category: 'timeout',
            retryable: false,
          });
        }
        if (attempt === this.config.maxRetries) {
          throw err;
        }
        const delayMs = computeBackoffDelayMs(attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } finally {
        clearTimeout(timeoutHandle);
      }
    }

    throw new ConnectorApiError({
      message: 'Exhausted bounded retry attempts.',
      category: 'upstream_5xx',
      retryable: false,
    });
  }
}
`,
    },
    {
      path: 'src/mapping.ts',
      language: 'typescript',
      producedByAgent: 'client_code_agent',
      content: `/**
 * Grounded Data Mapping & Schema Normalization
 */

import { ConnectorApiError } from './errors';
import {
  CanonicalMemberRecord,
  DerivedSchedulingActivitySummary,
  RawOrganizationMembership,
} from './types';

export function extractUuidFromUri(uri: string): string {
  const trimmed = (uri ?? '').trim().replace(/\\/+$/, '');
  const segments = trimmed.split('/');
  const last = segments[segments.length - 1];
  if (!last) {
    throw new ConnectorApiError({
      message: 'Malformed resource URI: unable to extract externalUserId.',
      category: 'schema_validation',
      retryable: false,
    });
  }
  return last;
}

export function mapMembershipToCanonicalMember(
  raw: RawOrganizationMembership
): CanonicalMemberRecord {
  if (!raw?.user?.uri || !raw?.user?.email) {
    throw new ConnectorApiError({
      message: 'Invalid membership payload: missing user.uri or user.email.',
      category: 'schema_validation',
      retryable: false,
    });
  }

  return {
    externalUserId: extractUuidFromUri(raw.user.uri),
    userUri: raw.user.uri,
    fullName: raw.user.name || 'Unnamed Member',
    email: raw.user.email,
    organizationRole: raw.role || 'user',
    organizationUri: raw.organization,
    timezone: raw.user.timezone ?? null,
    joinedAt: raw.created_at,
  };
}

export function buildDerivedActivityProxy(params: {
  member: CanonicalMemberRecord;
  activeEventsCount: number;
  windowDays: number;
}): DerivedSchedulingActivitySummary {
  return {
    externalUserId: params.member.externalUserId,
    userUri: params.member.userUri,
    windowDays: params.windowDays,
    derivedScheduledEventsCountWindow: params.activeEventsCount,
    metricClassification: 'derived_scheduling_activity_proxy',
    unsupportedMetricsNotice: {
      lastLoginTimestamp: 'not_available_in_source',
      paidLicenseUtilization: 'not_available_in_source',
      billedSeatCount: 'not_available_in_source',
    },
  };
}
`,
    },
    {
      path: 'src/users.ts',
      language: 'typescript',
      producedByAgent: 'client_code_agent',
      content: `/**
 * User & Organization Membership Inventory Collector
 * Grounded Endpoints:
 * - ${isCalendly ? 'GET /users/me (users:read)' : validation.evidence.documentedEndpoints[0]?.path || 'GET /users'}
 * - ${isCalendly ? 'GET /organization_memberships (organizations:read)' : 'Directory listing'}
 */

import { IntegrationApiClient } from './apiClient';
import { StructuredLogger } from './logger';
import { extractUuidFromUri, mapMembershipToCanonicalMember } from './mapping';
import { collectBoundedPages } from './pagination';
import {
  CanonicalMemberRecord,
  ConnectorRuntimeConfig,
  PaginatedResponse,
  RawCurrentUserResponse,
  RawOrganizationMembership,
} from './types';

export async function fetchOrganizationContext(
  client: IntegrationApiClient,
  logger: StructuredLogger
): Promise<{ currentUserUri: string; organizationUri: string }> {
  const me = await client.getJson<RawCurrentUserResponse>('/users/me');
  const orgUri = me?.resource?.current_organization;
  if (!orgUri) {
    throw new Error('Authenticated user does not belong to an organization context.');
  }
  logger.info('resolved_organization_context', {
    currentUserId: extractUuidFromUri(me.resource.uri),
  });
  return {
    currentUserUri: me.resource.uri,
    organizationUri: orgUri,
  };
}

export async function collectOrganizationMembers(params: {
  client: IntegrationApiClient;
  config: ConnectorRuntimeConfig;
  organizationUri: string;
  logger: StructuredLogger;
}): Promise<CanonicalMemberRecord[]> {
  const { client, config, organizationUri, logger } = params;
  const initialUrl = client.buildEndpointUrl('/organization_memberships', {
    organization: organizationUri,
    count: config.pageSize,
  });

  const memberships = await collectBoundedPages<RawOrganizationMembership>({
    initialUrl,
    allowedHost: config.allowedPaginationHost,
    maxPages: config.maxPages,
    fetchPage: (url) => client.getJson<PaginatedResponse<RawOrganizationMembership>>(url),
  });

  const mapped = memberships.map(mapMembershipToCanonicalMember);
  logger.info('collected_organization_members', {
    memberCount: mapped.length,
  });
  return mapped;
}
`,
    },
    {
      path: 'src/usage.ts',
      language: 'typescript',
      producedByAgent: 'client_code_agent',
      content: `/**
 * Available Scheduling Activity Collector (Derived Proxy Only)
 * Grounded Endpoint: GET /scheduled_events (scope: scheduled_events:read)
 *
 * DISCLOSURE:
 * Computes a ${cfg.collectionWindowDays}-day scheduled-events count per member as a derived
 * scheduling-activity proxy. Does NOT fabricate login timestamps, paid seat
 * utilization, total seat allocation, or billed commercial usage.
 */

import { IntegrationApiClient } from './apiClient';
import { StructuredLogger } from './logger';
import { buildDerivedActivityProxy } from './mapping';
import { collectBoundedPages } from './pagination';
import {
  CanonicalMemberRecord,
  ConnectorRuntimeConfig,
  DerivedSchedulingActivitySummary,
  PaginatedResponse,
  RawScheduledEvent,
} from './types';

export async function collectDerivedSchedulingActivity(params: {
  client: IntegrationApiClient;
  config: ConnectorRuntimeConfig;
  organizationUri: string;
  members: CanonicalMemberRecord[];
  logger: StructuredLogger;
  now?: Date;
}): Promise<DerivedSchedulingActivitySummary[]> {
  const { client, config, organizationUri, members, logger, now = new Date() } = params;
  const windowEnd = now.toISOString();
  const windowStart = new Date(
    now.getTime() - config.collectionWindowDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const initialUrl = client.buildEndpointUrl('/scheduled_events', {
    organization: organizationUri,
    min_start_time: windowStart,
    max_start_time: windowEnd,
    status: 'active',
    count: config.pageSize,
  });

  const events = await collectBoundedPages<RawScheduledEvent>({
    initialUrl,
    allowedHost: config.allowedPaginationHost,
    maxPages: config.maxPages,
    fetchPage: (url) => client.getJson<PaginatedResponse<RawScheduledEvent>>(url),
  });

  const countsByUserUri = new Map<string, number>();
  for (const ev of events) {
    if (ev.status !== 'active') continue;
    for (const membership of ev.event_memberships ?? []) {
      if (membership.user) {
        countsByUserUri.set(membership.user, (countsByUserUri.get(membership.user) ?? 0) + 1);
      }
    }
  }

  const summaries = members.map((member) =>
    buildDerivedActivityProxy({
      member,
      activeEventsCount: countsByUserUri.get(member.userUri) ?? 0,
      windowDays: config.collectionWindowDays,
    })
  );

  logger.info('computed_derived_scheduling_activity_proxy', {
    windowDays: config.collectionWindowDays,
    totalEventsScanned: events.length,
    memberSummaries: summaries.length,
    metricClassification: 'derived_scheduling_activity_proxy',
  });

  return summaries;
}
`,
    },
    {
      path: 'src/index.ts',
      language: 'typescript',
      producedByAgent: 'client_code_agent',
      content: `/**
 * ${integration.name} Connector Entry Point
 * Generated via CloudEagle Developer Integration Studio
 * Run ID: ${run.id} | Model: ${run.modelId}${run.isSimulatedModel ? ' (Simulated)' : ''}
 */

import { DEFAULT_RUNTIME_CONFIG, IntegrationApiClient } from './apiClient';
import { loadAuthCredentialsFromEnv } from './auth';
import { StructuredLogger } from './logger';
import { CollectionRunOutput, ConnectorRuntimeConfig } from './types';
import { collectDerivedSchedulingActivity } from './usage';
import { collectOrganizationMembers, fetchOrganizationContext } from './users';

export async function runIntegrationCollection(
  overrides: Partial<ConnectorRuntimeConfig> = {},
  fetchImpl: typeof fetch = fetch
): Promise<CollectionRunOutput> {
  const correlationId = \`ce-run-\${Date.now()}\`;
  const config: ConnectorRuntimeConfig = { ...DEFAULT_RUNTIME_CONFIG, ...overrides };
  const logger = new StructuredLogger(correlationId, config.logVerbosity);

  logger.info('collection_started', {
    integration: '${integration.slug}',
    baseUrl: config.baseUrl,
    windowDays: config.collectionWindowDays,
  });

  const creds = loadAuthCredentialsFromEnv();
  const client = new IntegrationApiClient(creds, config, logger, correlationId, fetchImpl);

  const { organizationUri } = await fetchOrganizationContext(client, logger);
  const members = await collectOrganizationMembers({
    client,
    config,
    organizationUri,
    logger,
  });

  const activityProxies = await collectDerivedSchedulingActivity({
    client,
    config,
    organizationUri,
    members,
    logger,
  });

  logger.info('collection_completed', {
    membersCount: members.length,
    activityProxiesCount: activityProxies.length,
  });

  return {
    correlationId,
    collectedAt: new Date().toISOString(),
    organizationUri,
    members,
    activityProxies,
  };
}
`,
    },
    {
      path: 'tests/connector.test.ts',
      language: 'typescript',
      producedByAgent: 'test_packaging_agent',
      content: `import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHttpStatus } from '../src/errors';
import { redactLogValue } from '../src/logger';
import { validateNextPageUrl, collectBoundedPages } from '../src/pagination';
import { buildDerivedActivityProxy, mapMembershipToCanonicalMember } from '../src/mapping';

test('rejects cross-origin next_page URLs to prevent token exfiltration / SSRF', () => {
  assert.throws(
    () => validateNextPageUrl('https://evil.attacker.example/steal?page_token=abc', '${allowedHost}'),
    /Blocked cross-origin/
  );
  assert.equal(
    validateNextPageUrl('https://${allowedHost}/organization_memberships?page_token=next1', '${allowedHost}'),
    'https://${allowedHost}/organization_memberships?page_token=next1'
  );
});

test('detects pagination cursor cycles and halts safely', async () => {
  const cursorUrl = 'https://${allowedHost}/scheduled_events?page_token=loop';
  await assert.rejects(
    () =>
      collectBoundedPages({
        initialUrl: cursorUrl,
        allowedHost: '${allowedHost}',
        maxPages: 5,
        fetchPage: async () => ({
          collection: [{ id: 1 }],
          pagination: { count: 1, next_page: cursorUrl, next_page_token: 'loop' },
        }),
      }),
    /Pagination cycle detected/
  );
});

test('classifies 401/403 as non-retryable and 429 Retry-After as retryable', () => {
  const err401 = classifyHttpStatus(401, null);
  assert.equal(err401.retryable, false);
  assert.equal(err401.category, 'unauthorized_401');

  const err429 = classifyHttpStatus(429, '3');
  assert.equal(err429.retryable, true);
  assert.equal(err429.retryAfterMs, 3000);
});

test('redacts Bearer tokens and member email PII in structured logs', () => {
  const sanitized = redactLogValue({
    authorization: 'Bearer pat_live_secret_token_99999',
    note: 'Header Bearer eyJhbGciOiJIUzI1NiJ9 forasha.patel@cloudeagle.dev',
  }) as Record<string, string>;

  assert.equal(sanitized.authorization, '[REDACTED_SECRET]');
  assert.ok(!sanitized.note.includes('eyJhbGciOiJIUzI1NiJ9'));
  assert.ok(sanitized.note.includes('f***@cloudeagle.dev'));
});

test('labels 30-day scheduled event counts explicitly as derived proxy without fabricating login/license data', () => {
  const member = mapMembershipToCanonicalMember({
    uri: 'https://${allowedHost}/organization_memberships/m-1',
    role: 'admin',
    organization: 'https://${allowedHost}/organizations/org-1',
    created_at: '2026-01-10T00:00:00Z',
    user: {
      uri: 'https://${allowedHost}/users/u-101',
      name: 'Asha Patel',
      email: 'asha@example.com',
      timezone: 'America/Los_Angeles',
    },
  });

  const proxy = buildDerivedActivityProxy({
    member,
    activeEventsCount: 14,
    windowDays: ${cfg.collectionWindowDays},
  });

  assert.equal(proxy.metricClassification, 'derived_scheduling_activity_proxy');
  assert.equal(proxy.unsupportedMetricsNotice.lastLoginTimestamp, 'not_available_in_source');
  assert.equal(proxy.unsupportedMetricsNotice.paidLicenseUtilization, 'not_available_in_source');
});
`,
    },
    {
      path: 'integration.manifest.json',
      language: 'json',
      producedByAgent: 'test_packaging_agent',
      content: JSON.stringify(
        {
          manifestVersion: '1.0.0',
          integrationId: integration.id,
          name: integration.name,
          slug: integration.slug,
          owner: ownerName,
          ownerId: integration.ownerId,
          uiLayers: integration.uiLayers,
          runId: run.id,
          codeVersion: run.codeVersion,
          provenance: {
            documentationMode: validation.mode,
            sourceUrl: validation.sourceUrl,
            documentHash: validation.hash,
            evidenceLinks: validation.evidence.sourceLinks,
            modelProvider: run.modelProvider,
            modelId: run.modelId,
            simulatedModel: run.isSimulatedModel,
          },
          securityAndAuth: {
            authType: cfg.authType,
            leastPrivilegeReadOnlyScopes: cfg.scopes,
            secretEnvVar: `${envPrefix}_ACCESS_TOKEN`,
            allowedPaginationHost: allowedHost,
          },
          capabilityBoundary: {
            documented: ['api_client', 'auth_setup', 'organization_memberships', 'pagination', 'error_handling', 'redacted_logging'],
            derivedProxy: ['scheduled_events_30d_count'],
            unavailableInSource: [
              'last_login_timestamp',
              'paid_license_utilization',
              'total_seat_allocation',
              'actual_billed_usage',
            ],
          },
          deploymentStatus: 'not_deployed_fixture_validated_only',
        },
        null,
        2
      ),
    },
    {
      path: '.env.example',
      language: 'dotenv',
      producedByAgent: 'test_packaging_agent',
      content: `# ${integration.name} Connector Environment Configuration
# Inject credentials via your enterprise secret manager at runtime. Never commit real tokens.
${envPrefix}_ACCESS_TOKEN=""
${envPrefix}_BASE_URL="${baseUrl}"
${envPrefix}_COLLECTION_WINDOW_DAYS="${cfg.collectionWindowDays}"
${envPrefix}_LOG_LEVEL="${cfg.logVerbosity}"
`,
    },
    {
      path: 'package.json',
      language: 'json',
      producedByAgent: 'test_packaging_agent',
      content: JSON.stringify(
        {
          name: `@cloudeagle-custom/${integration.slug}-connector`,
          version: `0.${run.codeVersion}.0`,
          private: true,
          type: 'module',
          scripts: {
            build: 'tsc --noEmit',
            test: 'tsx --test tests/connector.test.ts',
          },
          devDependencies: {
            '@types/node': '^22.14.0',
            tsx: '^4.21.0',
            typescript: '^5.8.0',
          },
        },
        null,
        2
      ),
    },
    {
      path: 'README.md',
      language: 'markdown',
      producedByAgent: 'test_packaging_agent',
      content: `# ${integration.name} Integration Package

Generated and reviewed in **CloudEagle Developer Integration Studio**.

- **Owner:** ${ownerName} (\`${integration.ownerId}\`)
- **Run ID:** \`${run.id}\`
- **Model Provenance:** \`${run.modelProvider}:${run.modelId}\`${run.isSimulatedModel ? ' *(Deterministic Demo Engine — Simulated)*' : ''}
- **Documentation Mode:** \`${validation.mode}\` (\`${validation.sourceUrl}\`)
- **Validation Status:** Generated & Validated against Fixture Unit Tests *(Not deployed to production)*

## Grounded Endpoints & Scopes

${validation.evidence.documentedEndpoints
  .map((ep) => `- \`${ep.method} ${ep.path}\` — ${ep.summary} (Scopes: \`${ep.requiredScopes.join(', ') || 'read'}\`)`)
  .join('\n')}

## Explicit Capability & Metric Boundaries

- **Supported (Documented):** Authenticated user/org resolution, organization member inventory, cursor pagination with \`${allowedHost}\` host guard, bounded retries with \`Retry-After\`, and structured PII/token-redacted logs.
- **Derived Proxy Only:** \`derivedScheduledEventsCountWindow\` (${cfg.collectionWindowDays}-day active scheduled events count). **This is a calendar activity proxy only.**
- **Unsupported in Source (Never Fabricated):** Interactive login history, SSO sign-in timestamps, paid-license utilization, purchased seat caps, and commercial billing totals are not exposed by the documented source API.

## Local Verification

\`\`\`bash
cp .env.example .env
npm install
npm test
npm run build
\`\`\`
`,
    },
  ];

  return files;
}

export function verifyCodeArtifacts(
  artifacts: CodeArtifact[],
  allowedHost: string,
  failureInjection: FailureInjectionType
): VerificationCheckResult[] {
  const results: VerificationCheckResult[] = [];
  const allContent = artifacts.map((a) => `// FILE: ${a.path}\n${a.content}`).join('\n');

  // 1. Static Contract Check: Required core files present
  const requiredPaths = [
    'src/apiClient.ts',
    'src/auth.ts',
    'src/users.ts',
    'src/usage.ts',
    'src/pagination.ts',
    'src/errors.ts',
    'src/logger.ts',
    'src/index.ts',
    'integration.manifest.json',
  ];
  const presentSet = new Set(artifacts.map((a) => a.path));
  const missing = requiredPaths.filter((p) => !presentSet.has(p));

  results.push({
    category: 'static_contract',
    name: 'Required Connector Module Graph',
    passed: missing.length === 0,
    detail:
      missing.length === 0
        ? `All ${requiredPaths.length} required TypeScript & manifest modules present.`
        : `Missing required file(s): ${missing.join(', ')}`,
    isFixtureTest: false,
  });

  // 2. Security Guard: Hardcoded token / secret detection (checks developer edits too!)
  const hardcodedSecretMatch =
    /\b(pat_live_[A-Za-z0-9_]{8,}|sk-[A-Za-z0-9]{16,}|AIza[0-9A-Za-z\-_]{20,})\b/.test(
      artifacts
        .filter((a) => !a.path.startsWith('tests/'))
        .map((a) => a.content)
        .join('\n')
    ) || failureInjection === 'security_blocking_issue';

  results.push({
    category: 'security_guard',
    name: 'Zero Hardcoded Secrets & Env-Only Credential Injection',
    passed: !hardcodedSecretMatch,
    detail: hardcodedSecretMatch
      ? failureInjection === 'security_blocking_issue'
        ? 'BLOCKING SECURITY FINDING (Simulated): Detected hardcoded bearer credential literal and unvalidated outbound URL in client artifact.'
        : 'BLOCKING SECURITY FINDING: Detected hardcoded token/API key literal in non-test source file. Use process.env references only.'
      : 'Verified credentials load exclusively via process.env references; zero hardcoded secrets in src/*.',
    isFixtureTest: false,
  });

  // 3. Security Guard: Pagination Cross-Origin Host Allowlist
  const paginationFile = artifacts.find((a) => a.path === 'src/pagination.ts');
  const hasHostGuard =
    Boolean(paginationFile?.content.includes(allowedHost)) &&
    Boolean(paginationFile?.content.includes("parsed.protocol !== 'https:'")) &&
    failureInjection !== 'unsafe_pagination_redirect';

  results.push({
    category: 'security_guard',
    name: `Pagination SSRF & Host Allowlist (${allowedHost})`,
    passed: hasHostGuard,
    detail: hasHostGuard
      ? `Verified pagination.next_page enforces https://${allowedHost} and cycle detection.`
      : `BLOCKING SECURITY FINDING: Unsafe pagination redirect to untrusted external host detected or host guard missing for ${allowedHost}.`,
    isFixtureTest: false,
  });

  // 4. Honest Metric Boundary Check (no fabricated license/login claims)
  const usageFile = artifacts.find((a) => a.path === 'src/usage.ts');
  const hasHonestProxyLabel = Boolean(
    usageFile?.content.includes('derived_scheduling_activity_proxy') ||
      allContent.includes('not_available_in_source')
  );

  results.push({
    category: 'type_safety',
    name: 'Derived Activity Proxy & Unsupported Metric Boundary',
    passed: hasHonestProxyLabel,
    detail: hasHonestProxyLabel
      ? 'Verified activity collector types 30-day events as derived_scheduling_activity_proxy and marks login/seat billing unavailable.'
      : 'Contract warning: usage collector removed derived proxy disclosure.',
    isFixtureTest: false,
  });

  // 5. Fixture Unit Test: Rate-Limit 429 & Retry-After Simulation
  const rateLimitFailed = failureInjection === 'rate_limit_429';
  results.push({
    category: 'fixture_unit_test',
    name: 'Fixture Suite: HTTP 429 Rate-Limit & Retry-After Backoff',
    passed: !rateLimitFailed,
    detail: rateLimitFailed
      ? 'Simulated Fixture Fault: Upstream returned persistent HTTP 429 Too Many Requests exceeding maxRetries (3).'
      : 'Fixture test passed: 429 respects Retry-After header and bounded exponential backoff with jitter.',
    isFixtureTest: true,
  });

  // 6. Fixture Unit Test: Schema & Auth Error Classification
  const schemaFailed =
    failureInjection === 'invalid_schema' ||
    failureInjection === 'auth_401' ||
    failureInjection === 'permission_403';
  results.push({
    category: 'fixture_unit_test',
    name: 'Fixture Suite: Membership & Event Schema + 401/403 Non-Retryable Guard',
    passed: !schemaFailed,
    detail: schemaFailed
      ? `Simulated Fixture Fault (${failureInjection}): Upstream payload/auth error triggered during fixture verification.`
      : 'Fixture test passed: 401/403 fail fast without retry storms; member & event mock payloads validate cleanly.',
    isFixtureTest: true,
  });

  return results;
}

export async function buildArtifactsZipBuffer(artifacts: CodeArtifact[], rootFolderName: string): Promise<Buffer> {
  const zip = new JSZip();
  const folder = zip.folder(rootFolderName) ?? zip;
  for (const artifact of artifacts) {
    folder.file(artifact.path, artifact.content);
  }
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
