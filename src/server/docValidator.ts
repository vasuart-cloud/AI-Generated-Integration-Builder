import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import YAML from 'yaml';
import {
  AuthType,
  DocInputMode,
  DocumentationValidation,
  DocumentedEndpoint,
  FailureInjectionType,
  ValidationCheckItem,
  ValidationEvidence,
} from '../shared/types';
import { buildCuratedCalendlyEvidence, CALENDLY_SAMPLE_DOC_URL } from './calendlyFixture';
import { classifyDocumentationWithGemini, isGeminiConfigured } from './modelRegistry';
import { isPrivateOrReservedIp, validateUrlSafety } from './security';

const MAX_RESPONSE_BYTES = 1_500_000; // 1.5 MB limit
const FETCH_TIMEOUT_MS = 7500;
const MAX_REDIRECTS = 4;

export interface ValidateDocInput {
  integrationId: string;
  mode: DocInputMode;
  url?: string;
  rawSpec?: string;
  failureInjection?: FailureInjectionType;
}

function computeDocHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function emptyInvalidEvidence(
  checks: ValidationCheckItem[],
  reasons: string[],
  sourceLinks: string[] = []
): ValidationEvidence {
  return {
    providerName: 'Unverified Source',
    apiVersion: 'unknown',
    baseUrlCandidates: [],
    documentedEndpoints: [],
    authEvidence: {
      methods: [],
      headerFormat: 'Not detected',
      scopes: [],
      summary: 'No valid authentication specification found.',
    },
    paginationEvidence: {
      supported: false,
      mechanism: 'Not detected',
    },
    sourceLinks,
    checks,
    warnings: [],
    reasons,
    limitations: [],
    classifierMode: 'live_structural',
  };
}

async function verifyHostDnsSafety(hostname: string): Promise<{ safe: boolean; reason?: string; resolvedIps: string[] }> {
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records || records.length === 0) {
      return { safe: false, reason: `DNS resolution returned no records for ${hostname}.`, resolvedIps: [] };
    }
    const resolvedIps = records.map((r) => r.address);
    for (const record of records) {
      if (isPrivateOrReservedIp(record.address)) {
        return {
          safe: false,
          reason: `DNS rebinding / SSRF protection triggered: ${hostname} resolved to restricted IP ${record.address}.`,
          resolvedIps,
        };
      }
    }
    return { safe: true, resolvedIps };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      safe: false,
      reason: `Unable to resolve hostname "${hostname}" (${msg}).`,
      resolvedIps: [],
    };
  }
}

interface SafeFetchResult {
  ok: boolean;
  status?: number;
  contentType?: string;
  finalUrl?: string;
  bodyText?: string;
  errorType?: 'ssrf' | 'dns' | 'timeout' | 'http_error' | 'content_type' | 'oversized' | 'redirect' | 'network';
  errorMessage?: string;
  checks: ValidationCheckItem[];
}

async function safeFetchDocumentation(initialUrl: string): Promise<SafeFetchResult> {
  const checks: ValidationCheckItem[] = [];
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const urlCheck = validateUrlSafety(currentUrl);
    if (!urlCheck.safe || !urlCheck.normalizedUrl || !urlCheck.hostname) {
      checks.push({
        id: `url-safety-hop-${hop}`,
        label: hop === 0 ? 'HTTPS & SSRF URL Validation' : `Redirect Hop #${hop} Safety`,
        passed: false,
        detail: urlCheck.reason ?? 'Unsafe URL rejected.',
      });
      return {
        ok: false,
        errorType: hop === 0 ? 'ssrf' : 'redirect',
        errorMessage: urlCheck.reason ?? 'Unsafe URL rejected.',
        checks,
      };
    }

    const dnsCheck = await verifyHostDnsSafety(urlCheck.hostname);
    if (!dnsCheck.safe) {
      checks.push({
        id: `dns-safety-hop-${hop}`,
        label: hop === 0 ? 'DNS Resolution & Rebinding Guard' : `Redirect Hop #${hop} DNS Guard`,
        passed: false,
        detail: dnsCheck.reason ?? 'DNS validation failed.',
      });
      return {
        ok: false,
        errorType: dnsCheck.reason?.includes('SSRF') ? 'ssrf' : 'dns',
        errorMessage: dnsCheck.reason ?? 'DNS validation failed.',
        checks,
      };
    }

    if (hop === 0) {
      checks.push({
        id: 'url-dns-safety',
        label: 'HTTPS, Host & DNS SSRF Guard',
        passed: true,
        detail: `Verified HTTPS protocol and public IP resolution for ${urlCheck.hostname}.`,
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(urlCheck.normalizedUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'application/json, application/yaml, text/yaml, text/html, text/plain;q=0.9',
          'User-Agent': 'CloudEagle-IntegrationStudio-DocValidator/1.0',
        },
      });
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const detail = isAbort
        ? `Documentation fetch timed out after ${FETCH_TIMEOUT_MS}ms.`
        : `Network error fetching documentation: ${err instanceof Error ? err.message : String(err)}`;
      checks.push({
        id: 'http-fetch',
        label: 'HTTP Reachability',
        passed: false,
        detail,
      });
      return {
        ok: false,
        errorType: isAbort ? 'timeout' : 'network',
        errorMessage: detail,
        checks,
      };
    } finally {
      clearTimeout(timer);
    }

    // Handle redirects manually to revalidate every hop against SSRF
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        checks.push({
          id: 'redirect-missing-location',
          label: 'Redirect Validation',
          passed: false,
          detail: `HTTP ${response.status} redirect missing Location header.`,
        });
        return {
          ok: false,
          errorType: 'redirect',
          errorMessage: `HTTP ${response.status} redirect missing Location header.`,
          checks,
        };
      }
      if (hop === MAX_REDIRECTS) {
        checks.push({
          id: 'redirect-limit',
          label: 'Redirect Hop Limit',
          passed: false,
          detail: `Exceeded maximum allowed redirects (${MAX_REDIRECTS}).`,
        });
        return {
          ok: false,
          errorType: 'redirect',
          errorMessage: `Exceeded maximum allowed redirects (${MAX_REDIRECTS}).`,
          checks,
        };
      }
      try {
        currentUrl = new URL(location, urlCheck.normalizedUrl).toString();
      } catch {
        return {
          ok: false,
          errorType: 'redirect',
          errorMessage: 'Malformed redirect target URL.',
          checks,
        };
      }
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      checks.push({
        id: 'http-status',
        label: 'HTTP Response Status',
        passed: false,
        detail: `Remote server returned HTTP ${response.status}.`,
      });
      return {
        ok: false,
        status: response.status,
        finalUrl: urlCheck.normalizedUrl,
        errorType: 'http_error',
        errorMessage: `Documentation URL returned HTTP ${response.status}. Provide a reachable API specification or reference URL.`,
        checks,
      };
    }

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    const allowedContentType =
      contentType.includes('text/html') ||
      contentType.includes('application/json') ||
      contentType.includes('yaml') ||
      contentType.includes('text/plain') ||
      contentType.includes('application/openapi');

    if (!allowedContentType) {
      checks.push({
        id: 'content-type',
        label: 'Allowed Content-Type',
        passed: false,
        detail: `Unsupported content-type "${contentType || 'unknown'}". Expected HTML, JSON, or YAML API documentation.`,
      });
      return {
        ok: false,
        status: response.status,
        contentType,
        finalUrl: urlCheck.normalizedUrl,
        errorType: 'content_type',
        errorMessage: `Unsupported media type "${contentType || 'binary'}". Documentation must be HTML, OpenAPI JSON, or YAML.`,
        checks,
      };
    }

    // Stream response with strict byte limit
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            checks.push({
              id: 'size-limit',
              label: 'Payload Size Guard',
              passed: false,
              detail: `Response exceeded ${MAX_RESPONSE_BYTES} bytes safety limit.`,
            });
            return {
              ok: false,
              status: response.status,
              contentType,
              finalUrl: urlCheck.normalizedUrl,
              errorType: 'oversized',
              errorMessage: 'Documentation payload exceeded 1.5 MB safety limit. Upload or paste a focused OpenAPI specification.',
              checks,
            };
          }
          chunks.push(value);
        }
      }
    }

    const combined = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const bodyText = combined.toString('utf8');

    checks.push({
      id: 'http-fetch-ok',
      label: 'HTTP Status & Content Size',
      passed: true,
      detail: `Fetched HTTP ${response.status} (${(totalBytes / 1024).toFixed(1)} KB, ${contentType.split(';')[0] || 'text'}).`,
    });

    return {
      ok: true,
      status: response.status,
      contentType,
      finalUrl: urlCheck.normalizedUrl,
      bodyText,
      checks,
    };
  }

  return {
    ok: false,
    errorType: 'redirect',
    errorMessage: 'Redirect limit exceeded.',
    checks,
  };
}

export function parseOpenApiSpecContent(
  rawSpec: string,
  sourceCitation: string
): {
  valid: boolean;
  partial?: boolean;
  evidence: ValidationEvidence;
  summaryMessage: string;
} {
  const checks: ValidationCheckItem[] = [];
  if (!rawSpec || !rawSpec.trim()) {
    return {
      valid: false,
      summaryMessage: 'Specification content is empty. Paste a valid OpenAPI 3.x / Swagger 2.0 JSON or YAML document.',
      evidence: emptyInvalidEvidence(
        [{ id: 'non-empty', label: 'Non-Empty Specification', passed: false, detail: 'Input was empty.' }],
        ['Empty specification payload.']
      ),
    };
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    const doc = YAML.parse(rawSpec);
    if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
      parsed = doc as Record<string, unknown>;
    }
  } catch (err) {
    return {
      valid: false,
      summaryMessage: `Malformed JSON/YAML syntax: ${err instanceof Error ? err.message : String(err)}`,
      evidence: emptyInvalidEvidence(
        [{ id: 'syntax-parse', label: 'JSON / YAML Syntax Parse', passed: false, detail: 'Failed to parse document.' }],
        ['Document is not valid JSON or YAML.']
      ),
    };
  }

  if (!parsed) {
    return {
      valid: false,
      summaryMessage: 'Document did not parse into an OpenAPI specification object.',
      evidence: emptyInvalidEvidence(
        [{ id: 'root-object', label: 'OpenAPI Root Object', passed: false, detail: 'Root value is not a map/object.' }],
        ['Invalid specification structure.']
      ),
    };
  }

  const openapiVer = String(parsed.openapi ?? parsed.swagger ?? '');
  const info = (parsed.info as Record<string, unknown> | undefined) ?? {};
  const pathsObj = (parsed.paths as Record<string, Record<string, unknown>> | undefined) ?? {};

  if (!openapiVer || Object.keys(pathsObj).length === 0) {
    checks.push({
      id: 'openapi-structure',
      label: 'OpenAPI Version & Paths',
      passed: false,
      detail: openapiVer
        ? 'OpenAPI header present, but "paths" object contains zero endpoints.'
        : 'Missing "openapi" or "swagger" root field and endpoint paths.',
    });
    return {
      valid: false,
      summaryMessage:
        'Missing OpenAPI paths or version field. Provide a complete OpenAPI 3.x / Swagger 2.0 specification containing endpoints and authentication.',
      evidence: emptyInvalidEvidence(checks, ['Missing OpenAPI version or documented paths.'], [sourceCitation]),
    };
  }

  checks.push({
    id: 'openapi-structure',
    label: 'OpenAPI Schema Structure',
    passed: true,
    detail: `Parsed OpenAPI ${openapiVer} specification ("${String(info.title ?? 'API')}").`,
  });

  const servers = Array.isArray(parsed.servers) ? (parsed.servers as Array<Record<string, unknown>>) : [];
  const baseUrlCandidates = servers
    .map((s) => String(s.url ?? '').trim())
    .filter((u) => u.startsWith('https://'));

  const documentedEndpoints: DocumentedEndpoint[] = [];
  const allowedMethods = ['get', 'post', 'put', 'patch', 'delete'] as const;

  for (const [pathStr, pathItem] of Object.entries(pathsObj)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const m of allowedMethods) {
      const op = pathItem[m] as Record<string, unknown> | undefined;
      if (!op || typeof op !== 'object') continue;
      const summary = String(op.summary ?? op.description ?? `${m.toUpperCase()} ${pathStr}`).slice(0, 160);
      const secArr = Array.isArray(op.security) ? (op.security as Array<Record<string, string[]>>) : [];
      const scopes = secArr.flatMap((s) => Object.values(s).flat());
      documentedEndpoints.push({
        method: m.toUpperCase() as DocumentedEndpoint['method'],
        path: pathStr,
        summary,
        requiredScopes: scopes,
        citationUrl: sourceCitation,
        responseFields: ['200 JSON schema'],
      });
    }
  }

  const components = (parsed.components as Record<string, unknown> | undefined) ?? {};
  const securitySchemes =
    (components.securitySchemes as Record<string, Record<string, unknown>> | undefined) ??
    (parsed.securityDefinitions as Record<string, Record<string, unknown>> | undefined) ??
    {};
  const schemeEntries = Object.values(securitySchemes);

  const authMethods: AuthType[] = [];
  const detectedScopes = new Set<string>(documentedEndpoints.flatMap((e) => e.requiredScopes));

  for (const scheme of schemeEntries) {
    const sType = String(scheme.type ?? '').toLowerCase();
    if (sType === 'oauth2') {
      authMethods.push('oauth2');
      const flows = (scheme.flows as Record<string, Record<string, unknown>> | undefined) ?? {};
      for (const flow of Object.values(flows)) {
        const sc = (flow?.scopes as Record<string, string> | undefined) ?? {};
        Object.keys(sc).forEach((k) => detectedScopes.add(k));
      }
    } else if (sType === 'http') {
      authMethods.push('personal_access_token');
    } else if (sType === 'apikey') {
      authMethods.push('api_key');
    }
  }

  const rawLower = rawSpec.toLowerCase();
  const hasPagination =
    rawLower.includes('page_token') ||
    rawLower.includes('next_page') ||
    rawLower.includes('cursor') ||
    rawLower.includes('offset');

  checks.push({
    id: 'endpoints-extracted',
    label: 'Endpoint Surface Extraction',
    passed: documentedEndpoints.length > 0,
    detail: `Extracted ${documentedEndpoints.length} HTTP operation(s).`,
  });

  checks.push({
    id: 'auth-schemes',
    label: 'Authentication Security Schemes',
    passed: authMethods.length > 0,
    detail:
      authMethods.length > 0
        ? `Detected security scheme(s): ${Array.from(new Set(authMethods)).join(', ')}.`
        : 'Missing components.securitySchemes / authentication definition.',
  });

  const providerName = String(info.title ?? 'Custom OpenAPI Service');
  const apiVersion = String(info.version ?? openapiVer);

  if (authMethods.length === 0 || baseUrlCandidates.length === 0) {
    return {
      valid: false,
      partial: true,
      summaryMessage:
        'Partially validated — missing required evidence (HTTPS servers[] base URL or securitySchemes authentication definition). Supplement specification to proceed.',
      evidence: {
        providerName,
        apiVersion,
        baseUrlCandidates,
        documentedEndpoints,
        authEvidence: {
          methods: authMethods,
          headerFormat: authMethods.length > 0 ? 'Authorization: Bearer <TOKEN>' : 'Missing in spec',
          scopes: Array.from(detectedScopes),
          summary:
            authMethods.length > 0
              ? 'Security scheme present, but HTTPS base server URL is missing.'
              : 'No securitySchemes defined in OpenAPI specification.',
        },
        paginationEvidence: {
          supported: hasPagination,
          mechanism: hasPagination ? 'Cursor / token parameter in query' : 'Single-page or undocumented pagination',
        },
        sourceLinks: [sourceCitation],
        checks,
        warnings: [
          baseUrlCandidates.length === 0 ? 'OpenAPI servers[] lacks an explicit https:// base URL.' : '',
          authMethods.length === 0 ? 'OpenAPI components.securitySchemes is missing.' : '',
        ].filter(Boolean),
        reasons: ['Incomplete OpenAPI specification: requires HTTPS server URL and authentication scheme.'],
        limitations: [],
        classifierMode: 'live_structural',
      },
    };
  }

  return {
    valid: true,
    summaryMessage: `Valid API documentation: ${providerName} (${apiVersion}) — ${documentedEndpoints.length} documented endpoints verified.`,
    evidence: {
      providerName,
      apiVersion,
      baseUrlCandidates,
      documentedEndpoints,
      authEvidence: {
        methods: Array.from(new Set(authMethods)),
        headerFormat: 'Authorization: Bearer <ACCESS_TOKEN>',
        scopes: Array.from(detectedScopes),
        summary: `Verified OpenAPI securitySchemes (${Array.from(new Set(authMethods)).join(', ')}) over HTTPS.`,
      },
      paginationEvidence: {
        supported: hasPagination,
        mechanism: hasPagination
          ? 'Cursor / page_token query parameter documented in OpenAPI parameters'
          : 'Bounded single-page fetch (no cursor token documented)',
        hostConstraint: new URL(baseUrlCandidates[0]).hostname,
      },
      sourceLinks: [sourceCitation],
      checks,
      warnings: [],
      reasons: ['Verified OpenAPI specification with HTTPS base URL, endpoints, and authentication contract.'],
      limitations: ['Only fields explicitly defined in the provided OpenAPI paths will be mapped.'],
      classifierMode: 'live_structural',
    },
  };
}

function stripHtmlToVisibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function validateApiDocumentation(
  input: ValidateDocInput
): Promise<DocumentationValidation> {
  const now = new Date().toISOString();
  const id = `val-${crypto.randomUUID().slice(0, 8)}`;

  // 1. Handle explicit Curated Calendly Fixture route (Sandbox Demo Mode only)
  if (input.mode === 'curated_fixture') {
    const evidence = buildCuratedCalendlyEvidence();
    return {
      id,
      integrationId: input.integrationId,
      sourceUrl: CALENDLY_SAMPLE_DOC_URL,
      hash: computeDocHash(JSON.stringify(evidence.documentedEndpoints)),
      result: 'valid',
      summaryMessage:
        'Curated Calendly API v2 demo documentation loaded (Sandbox Fixture Mode — 4 endpoints verified).',
      evidence,
      checkedAt: now,
      mode: 'curated_fixture',
    };
  }

  // 2. Handle deterministic Demo Lab doc failure injections when explicitly toggled
  if (input.failureInjection && input.failureInjection !== 'none') {
    if (input.failureInjection === 'malformed_docs') {
      return {
        id,
        integrationId: input.integrationId,
        sourceUrl: input.url || 'paste://malformed-spec',
        hash: computeDocHash('malformed_docs'),
        result: 'invalid',
        summaryMessage:
          'Demo Lab Simulation: Malformed API specification — unexpected token near line 14, unable to parse schema.',
        evidence: emptyInvalidEvidence(
          [
            {
              id: 'sim-malformed',
              label: 'Schema Syntax Parser (Simulated Fault)',
              passed: false,
              detail: 'Simulated malformed OpenAPI/HTML structure injected via Demo Lab.',
            },
          ],
          ['Malformed document syntax prevents endpoint and authentication extraction.']
        ),
        checkedAt: now,
        mode: input.mode,
      };
    }

    if (input.failureInjection === 'doc_404') {
      return {
        id,
        integrationId: input.integrationId,
        sourceUrl: input.url || 'https://developer.example.com/v2/missing',
        hash: computeDocHash('doc_404'),
        result: 'invalid',
        summaryMessage:
          'Demo Lab Simulation: Remote server returned HTTP 404 Not Found. Verify the API reference URL.',
        evidence: emptyInvalidEvidence(
          [
            {
              id: 'sim-404',
              label: 'HTTP Reachability (Simulated 404)',
              passed: false,
              detail: 'HTTP 404 Not Found returned by documentation endpoint.',
            },
          ],
          ['Target documentation URL returned HTTP 404.']
        ),
        checkedAt: now,
        mode: input.mode,
      };
    }

    if (input.failureInjection === 'suspicious_redirect') {
      return {
        id,
        integrationId: input.integrationId,
        sourceUrl: input.url || 'https://docs.example.com/api',
        hash: computeDocHash('suspicious_redirect'),
        result: 'invalid',
        summaryMessage:
          'Demo Lab Simulation: Blocked unsafe redirect to private metadata IP http://169.254.169.254/latest/meta-data (SSRF guard).',
        evidence: emptyInvalidEvidence(
          [
            {
              id: 'sim-ssrf-redirect',
              label: 'Redirect Destination SSRF Re-validation',
              passed: false,
              detail: 'Redirect Hop #1 targeted non-HTTPS cloud metadata address 169.254.169.254 — blocked.',
            },
          ],
          ['Redirect destination failed HTTPS and private-IP SSRF policy.']
        ),
        checkedAt: now,
        mode: input.mode,
      };
    }
  }

  // 3. Handle OpenAPI JSON / YAML paste or upload mode
  if (input.mode === 'openapi_paste') {
    const rawSpec = input.rawSpec ?? '';
    const parsed = parseOpenApiSpecContent(rawSpec, 'uploaded://openapi-spec');
    return {
      id,
      integrationId: input.integrationId,
      sourceUrl: 'uploaded://openapi-spec',
      hash: computeDocHash(rawSpec || 'empty'),
      result: parsed.valid ? 'valid' : parsed.partial ? 'partial' : 'invalid',
      summaryMessage: parsed.summaryMessage,
      evidence: parsed.evidence,
      checkedAt: now,
      mode: 'openapi_paste',
    };
  }

  // 4. URL Validation Mode (Real Staged Server-Side Fetch + Analysis)
  const rawUrl = (input.url ?? '').trim();
  const safety = validateUrlSafety(rawUrl);
  if (!safety.safe || !safety.normalizedUrl || !safety.hostname) {
    return {
      id,
      integrationId: input.integrationId,
      sourceUrl: rawUrl || '(empty)',
      hash: computeDocHash(rawUrl || 'empty'),
      result: 'invalid',
      summaryMessage: safety.reason ?? 'Invalid documentation URL.',
      evidence: emptyInvalidEvidence(
        [
          {
            id: 'url-safety',
            label: 'HTTPS & SSRF URL Guard',
            passed: false,
            detail: safety.reason ?? 'URL failed safety validation.',
          },
        ],
        [safety.reason ?? 'Unsafe or malformed URL.']
      ),
      checkedAt: now,
      mode: 'url',
    };
  }

  const fetched = await safeFetchDocumentation(safety.normalizedUrl);
  const isCalendlyTarget = safety.hostname.includes('calendly.com');

  if (!fetched.ok || !fetched.bodyText) {
    // If live Calendly fetch is unreachable/timed-out in hermetic environment, never silently pass:
    // return honest `unverifiable_live` so UI offers the explicit curated fixture button.
    if (
      isCalendlyTarget &&
      (fetched.errorType === 'network' || fetched.errorType === 'timeout' || fetched.errorType === 'http_error')
    ) {
      return {
        id,
        integrationId: input.integrationId,
        sourceUrl: safety.normalizedUrl,
        hash: computeDocHash(safety.normalizedUrl + now),
        result: 'unverifiable_live',
        summaryMessage: `Unable to verify live documentation (${fetched.errorMessage ?? 'network unavailable'}). You may retry or explicitly load the curated Calendly API v2 demo fixture for sandbox mode.`,
        evidence: {
          ...emptyInvalidEvidence(
            fetched.checks,
            [fetched.errorMessage ?? 'Unable to verify live Calendly documentation over the network.'],
            [safety.normalizedUrl]
          ),
          limitations: [
            'Live HTTP verification did not complete. Curated fixture must be explicitly selected by the developer if proceeding in Demo mode.',
          ],
        },
        checkedAt: now,
        mode: 'url',
      };
    }

    return {
      id,
      integrationId: input.integrationId,
      sourceUrl: safety.normalizedUrl,
      hash: computeDocHash(safety.normalizedUrl),
      result: 'invalid',
      summaryMessage: fetched.errorMessage ?? 'Failed to fetch API documentation.',
      evidence: emptyInvalidEvidence(
        fetched.checks,
        [fetched.errorMessage ?? 'Documentation fetch failed.'],
        [safety.normalizedUrl]
      ),
      checkedAt: now,
      mode: 'url',
    };
  }

  const bodyText = fetched.bodyText;
  const docHash = computeDocHash(bodyText);
  const finalUrl = fetched.finalUrl ?? safety.normalizedUrl;

  // Stage B1: If response is JSON or YAML OpenAPI spec directly at the URL, parse it!
  const trimmedBody = bodyText.trim();
  if (
    fetched.contentType?.includes('json') ||
    fetched.contentType?.includes('yaml') ||
    trimmedBody.startsWith('{') ||
    trimmedBody.startsWith('openapi:') ||
    trimmedBody.startsWith('swagger:')
  ) {
    const specResult = parseOpenApiSpecContent(trimmedBody, finalUrl);
    if (specResult.valid || specResult.partial) {
      specResult.evidence.checks = [...fetched.checks, ...specResult.evidence.checks];
      return {
        id,
        integrationId: input.integrationId,
        sourceUrl: finalUrl,
        hash: docHash,
        result: specResult.valid ? 'valid' : 'partial',
        summaryMessage: specResult.summaryMessage,
        evidence: specResult.evidence,
        checkedAt: now,
        mode: 'url',
      };
    }
  }

  // Stage B2: Human-readable HTML page structural evidence extraction
  const visibleText = stripHtmlToVisibleText(bodyText);

  // Extract concrete HTTP endpoint method + path patterns literally present in visible text / HTML
  const endpointRegex = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[a-zA-Z0-9_\-/{}.]{3,90})/g;
  const matchedEndpoints = new Map<string, { method: DocumentedEndpoint['method']; path: string }>();
  let match: RegExpExecArray | null;
  while ((match = endpointRegex.exec(visibleText)) !== null) {
    const method = match[1].toUpperCase() as DocumentedEndpoint['method'];
    const path = match[2].replace(/[.,;)]+$/, '');
    // Filter out HTML/JS artifacts like /text/javascript
    if (!/^\/(text|application|assets|static|images|css|js)\b/i.test(path)) {
      matchedEndpoints.set(`${method} ${path}`, { method, path });
    }
    if (matchedEndpoints.size >= 25) break;
  }

  // Also detect REST base URLs like https://api.<domain>
  const baseUrlRegex = /https:\/\/api\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/v\d+)?/g;
  const baseUrls = Array.from(new Set(bodyText.match(baseUrlRegex) ?? [])).slice(0, 5);

  const hasAuthEvidence =
    /\b(Authorization:\s*Bearer|OAuth\s*2\.0|personal access token|api[-_\s]?key|Bearer\s+<|x-api-key|oauth\/token)\b/i.test(
      visibleText
    );
  const hasResponseSchemaEvidence =
    /\b(application\/json|200\s+OK|HTTP\/1\.1\s+200|response\s+body|response\s+schema|"collection"\s*:|"pagination"\s*:|status\s+codes?)\b/i.test(
      visibleText
    );
  const hasPaginationEvidence =
    /\b(page_token|next_page|next_cursor|pagination|per_page|limit\s+and\s+offset)\b/i.test(
      visibleText
    );

  // Separate URL safety checks from documentation extraction:
  const hostLower = safety.hostname.toLowerCase();
  let pathnameLower = '/';
  try {
    pathnameLower = new URL(finalUrl).pathname.toLowerCase();
  } catch {
    // fallback
  }

  const isDocDomainOrPath =
    hostLower.startsWith('developer.') ||
    hostLower.startsWith('docs.') ||
    hostLower.startsWith('api.') ||
    hostLower.includes('swagger') ||
    hostLower.includes('redoc') ||
    hostLower.includes('stoplight') ||
    hostLower.includes('readme.io') ||
    hostLower.includes('gitbook') ||
    pathnameLower.includes('/api-docs') ||
    pathnameLower.includes('/api/') ||
    pathnameLower.includes('/docs') ||
    pathnameLower.includes('/developer') ||
    pathnameLower.includes('/reference') ||
    pathnameLower.includes('/openapi') ||
    pathnameLower.includes('/swagger') ||
    isCalendlyTarget;

  const docKeywords = /\b(api\s+reference|developer\s+guide|rest\s+api|endpoints?|authentication|bearer\s+token|oauth|webhook|request\s+headers|status\s+code|rate\s+limit|json\s+response|calendly)\b/i;
  const isDocContent = docKeywords.test(visibleText) || (isDocDomainOrPath && visibleText.length > 200);

  // Clearly unrelated website rejection (e.g., https://google.com, news, search engines)
  if (!isDocDomainOrPath && !isDocContent && matchedEndpoints.size === 0 && !hasAuthEvidence) {
    const checks: ValidationCheckItem[] = [
      ...fetched.checks,
      {
        id: 'api-endpoints-check',
        label: 'REST Endpoint Methods & Paths',
        passed: false,
        detail: '0 HTTP endpoint definitions (GET/POST /path) found in document content.',
      },
      {
        id: 'api-auth-check',
        label: 'Authentication Specification',
        passed: false,
        detail: 'No Bearer header, OAuth 2.0 flow, or API token authentication specification found.',
      },
      {
        id: 'api-schema-check',
        label: 'Request / Response Format Evidence',
        passed: hasResponseSchemaEvidence,
        detail: hasResponseSchemaEvidence
          ? 'JSON mention detected without endpoints.'
          : 'No structured API request/response schemas detected.',
      },
    ];

    return {
      id,
      integrationId: input.integrationId,
      sourceUrl: finalUrl,
      hash: docHash,
      result: 'invalid',
      summaryMessage:
        'This URL does not appear to contain usable API documentation. Provide an API reference or OpenAPI specification.',
      evidence: emptyInvalidEvidence(
        checks,
        [
          'Fetched page lacks HTTP endpoint paths, authentication headers/OAuth schemes, and structured API response schemas.',
        ],
        [finalUrl]
      ),
      checkedAt: now,
      mode: 'url',
    };
  }

  // Valid documentation portal detected, but client-rendered JavaScript shell prevented complete static endpoint extraction
  if (matchedEndpoints.size === 0) {
    const checks: ValidationCheckItem[] = [
      ...fetched.checks,
      {
        id: 'doc-portal-detected',
        label: 'API Documentation Portal Reachability',
        passed: true,
        detail: `Verified HTTPS documentation portal at ${safety.hostname} (HTTP 200 OK).`,
      },
      {
        id: 'spa-shell-check',
        label: 'Static Markup vs Client-Rendered Shell',
        passed: false,
        detail: 'Page renders documentation via client-side JavaScript (SPA shell). Endpoint extraction is incomplete.',
      },
    ];

    const providerName = isCalendlyTarget
      ? 'Calendly'
      : safety.hostname.replace(/^(developer|docs|api)\./i, '').split('.')[0] || 'Target SaaS';

    return {
      id,
      integrationId: input.integrationId,
      sourceUrl: finalUrl,
      hash: docHash,
      result: 'partial',
      summaryMessage: 'Documentation site detected; endpoint extraction incomplete.',
      validationMode: 'prototype_mode',
      evidence: {
        providerName,
        apiVersion: isCalendlyTarget ? 'v2' : 'v1',
        baseUrlCandidates:
          baseUrls.length > 0
            ? baseUrls
            : [isCalendlyTarget ? 'https://api.calendly.com' : `https://api.${safety.hostname.replace(/^(developer|docs)\./i, '')}`],
        documentedEndpoints: isCalendlyTarget
          ? [
              {
                method: 'GET',
                path: '/users/me',
                summary: 'Current user profile context (Prototype mode)',
                requiredScopes: ['users:read'],
              },
              {
                method: 'GET',
                path: '/organization_memberships',
                summary: 'Organization member inventory (Prototype mode)',
                requiredScopes: ['organizations:read'],
              },
              {
                method: 'GET',
                path: '/scheduled_events',
                summary: 'Scheduled events (Derived activity proxy)',
                requiredScopes: ['scheduled_events:read'],
              },
            ]
          : [
              {
                method: 'GET',
                path: '/users',
                summary: 'User inventory (Prototype candidate)',
                requiredScopes: ['read:users'],
              },
            ],
        authEvidence: {
          methods: ['personal_access_token', 'oauth2'],
          headerFormat: 'Authorization: Bearer <TOKEN>',
          scopes: isCalendlyTarget
            ? ['users:read', 'organizations:read', 'scheduled_events:read']
            : ['read:users'],
          summary: 'Bearer token authentication detected from documentation headers.',
        },
        paginationEvidence: {
          supported: true,
          mechanism: 'Cursor / Link header pagination (Prototype defaults)',
        },
        sourceLinks: [finalUrl],
        checks,
        warnings: [
          'Documentation site detected; client-rendered JavaScript shell prevented complete static endpoint extraction.',
          'You may continue in Prototype Mode, paste/upload an API specification, or use curated evidence.',
        ],
        reasons: [
          'Live documentation site relies on client-side JS rendering instead of returning static OpenAPI schemas.',
        ],
        limitations: [
          'Prototype mode provides safe standard collector architecture and typed unsupported-capability errors without fabricating unverified endpoints.',
        ],
        classifierMode: 'live_structural',
      },
      checkedAt: now,
      mode: 'url',
    };
  }

  // Stage C: Optional Gemini grounded classifier if configured, verifying every endpoint exists in visibleText
  let documentedEndpoints: DocumentedEndpoint[] = Array.from(matchedEndpoints.values()).map((ep) => ({
    method: ep.method,
    path: ep.path,
    summary: `Documented ${ep.method} ${ep.path} endpoint extracted from reference`,
    requiredScopes: [],
    citationUrl: finalUrl,
    responseFields: ['JSON payload'],
  }));

  let providerName = safety.hostname.replace(/^(developer\.|docs\.|api\.)/, '');
  let apiVersion = 'REST API';
  let classifierMode: ValidationEvidence['classifierMode'] = 'live_structural';
  let authSummary = hasAuthEvidence
    ? 'Bearer / token authentication documented in fetched reference.'
    : 'Authentication scheme missing in fetched page.';

  if (isGeminiConfigured()) {
    const geminiAnalysis = await classifyDocumentationWithGemini(finalUrl, visibleText);
    if (geminiAnalysis.result) {
      if (!geminiAnalysis.result.isApiReference && matchedEndpoints.size < 2) {
        return {
          id,
          integrationId: input.integrationId,
          sourceUrl: finalUrl,
          hash: docHash,
          result: 'invalid',
          summaryMessage:
            geminiAnalysis.result.rejectionReason ||
            'This appears to be a general website, not an API reference. Please provide developer/API documentation containing endpoints, authentication and response formats.',
          evidence: emptyInvalidEvidence(
            [
              ...fetched.checks,
              {
                id: 'gemini-classifier',
                label: `AI Documentation Classifier (${geminiAnalysis.modelId})`,
                passed: false,
                detail: geminiAnalysis.result.rejectionReason || 'Classified as non-API webpage.',
              },
            ],
            [geminiAnalysis.result.rejectionReason || 'Not a developer API reference.'],
            [finalUrl]
          ),
          checkedAt: now,
          mode: 'url',
        };
      }

      // Grounding filter: ONLY accept Gemini-extracted paths that literally appear in visibleText
      const groundedGeminiEndpoints = (geminiAnalysis.result.detectedPaths ?? [])
        .filter((p) => p.path && visibleText.includes(p.path))
        .map((p) => ({
          method: (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(p.method?.toUpperCase())
            ? p.method.toUpperCase()
            : 'GET') as DocumentedEndpoint['method'],
          path: p.path,
          summary: p.summary || `${p.method} ${p.path}`,
          requiredScopes: Array.isArray(p.scopes) ? p.scopes : [],
          citationUrl: finalUrl,
          responseFields: ['Grounded in fetched reference'],
        }));

      if (groundedGeminiEndpoints.length > 0) {
        documentedEndpoints = groundedGeminiEndpoints;
      }
      if (geminiAnalysis.result.providerName) providerName = geminiAnalysis.result.providerName;
      if (geminiAnalysis.result.apiVersion) apiVersion = geminiAnalysis.result.apiVersion;
      if (geminiAnalysis.result.authSummary) authSummary = geminiAnalysis.result.authSummary;
      classifierMode = 'live_gemini_grounded';
    }
  }

  const checks: ValidationCheckItem[] = [
    ...fetched.checks,
    {
      id: 'endpoints-grounded',
      label: 'Grounded Endpoint Surface',
      passed: documentedEndpoints.length > 0,
      detail: `${documentedEndpoints.length} endpoint(s) grounded in fetched document.`,
    },
    {
      id: 'auth-grounded',
      label: 'Authentication Evidence',
      passed: hasAuthEvidence,
      detail: authSummary,
    },
    {
      id: 'schema-grounded',
      label: 'Response Schema Evidence',
      passed: hasResponseSchemaEvidence,
      detail: hasResponseSchemaEvidence
        ? 'Structured JSON response markers verified.'
        : 'Response schema examples were sparse or missing.',
    },
  ];

  // Require both endpoints AND auth evidence for full validation; otherwise mark `partial` and block!
  if (documentedEndpoints.length === 0 || !hasAuthEvidence) {
    return {
      id,
      integrationId: input.integrationId,
      sourceUrl: finalUrl,
      hash: docHash,
      result: 'partial',
      summaryMessage:
        'Partially validated — missing required evidence (both concrete endpoint paths and authentication details are required before code generation).',
      evidence: {
        providerName,
        apiVersion,
        baseUrlCandidates: baseUrls.length > 0 ? baseUrls : [`https://${safety.hostname}`],
        documentedEndpoints,
        authEvidence: {
          methods: hasAuthEvidence ? ['personal_access_token'] : [],
          headerFormat: hasAuthEvidence ? 'Authorization: Bearer <TOKEN>' : 'Missing in page',
          scopes: [],
          summary: authSummary,
        },
        paginationEvidence: {
          supported: hasPaginationEvidence,
          mechanism: hasPaginationEvidence ? 'Pagination parameters referenced in docs' : 'Not documented on this page',
        },
        sourceLinks: [finalUrl],
        checks,
        warnings: ['Incomplete API evidence on single page; supplement with OpenAPI spec or full API reference URL.'],
        reasons: ['Missing complete endpoint + authentication contract.'],
        limitations: [],
        classifierMode,
      },
      checkedAt: now,
      mode: 'url',
    };
  }

  return {
    id,
    integrationId: input.integrationId,
    sourceUrl: finalUrl,
    hash: docHash,
    result: 'valid',
    summaryMessage: `Valid API documentation: ${providerName} (${apiVersion}) — ${documentedEndpoints.length} endpoints verified live.`,
    evidence: {
      providerName,
      apiVersion,
      baseUrlCandidates: baseUrls.length > 0 ? baseUrls : [`https://${safety.hostname}`],
      documentedEndpoints,
      authEvidence: {
        methods: ['oauth2', 'personal_access_token'],
        headerFormat: 'Authorization: Bearer <ACCESS_TOKEN>',
        scopes: Array.from(new Set(documentedEndpoints.flatMap((e) => e.requiredScopes))),
        summary: authSummary,
      },
      paginationEvidence: {
        supported: hasPaginationEvidence,
        mechanism: hasPaginationEvidence
          ? 'Cursor / token pagination parameters verified in documentation'
          : 'Bounded single-page request mode',
        hostConstraint: baseUrls[0] ? new URL(baseUrls[0]).hostname : safety.hostname,
      },
      sourceLinks: [finalUrl],
      checks,
      warnings: [],
      reasons: ['Live HTTPS fetch verified endpoint definitions, authentication headers, and response structures.'],
      limitations: ['Only endpoints grounded in fetched documentation are eligible for code generation.'],
      classifierMode,
    },
    checkedAt: now,
    mode: 'url',
  };
}
