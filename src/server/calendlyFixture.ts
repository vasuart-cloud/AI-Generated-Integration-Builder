import {
  CapabilityItem,
  Category,
  CollectorConfig,
  Developer,
  DocumentationValidation,
  FieldMappingItem,
  Integration,
  ValidationEvidence,
} from '../shared/types';

export const CALENDLY_SAMPLE_DOC_URL =
  'https://developer.calendly.com/api-docs/overview/api/reference';

export const SEEDED_DEVELOPERS: Developer[] = [
  {
    id: 'dev-asha',
    name: 'Asha Patel',
    email: 'asha.patel@cloudeagle.dev',
    roleTitle: 'Staff Integration Engineer',
    team: 'SaaS Connectors',
    avatarInitials: 'AP',
    preferences: {
      onboardingCompleted: false,
      onboardingStep: 1,
      preferredLanguage: 'typescript',
      preferredEditor: 'studio_code',
      catalogViewMode: 'tile',
      workspaceName: 'cloudeagle-integrations-prod-prep',
    },
  },
  {
    id: 'dev-ravi',
    name: 'Ravi Menon',
    email: 'ravi.menon@cloudeagle.dev',
    roleTitle: 'Senior Platform Developer',
    team: 'Core Governance',
    avatarInitials: 'RM',
    preferences: {
      onboardingCompleted: true,
      onboardingStep: 3,
      preferredLanguage: 'typescript',
      preferredEditor: 'studio_code',
      catalogViewMode: 'list',
      workspaceName: 'cloudeagle-integrations-prod-prep',
    },
  },
];

export const SEEDED_CATEGORIES: Category[] = [
  {
    id: 'cat-crm',
    name: 'CRM',
    description: 'Customer relationship management, account hierarchy, and sales seat inventory.',
    createdBy: null,
    createdAt: '2026-09-12T09:00:00.000Z',
  },
  {
    id: 'cat-messaging',
    name: 'Messaging',
    description: 'Programmable SMS, transactional messaging channels, and enterprise chat gateways.',
    createdBy: null,
    createdAt: '2026-09-12T09:00:00.000Z',
  },
  {
    id: 'cat-collaboration',
    name: 'Collaboration',
    description: 'Team workspaces, video conferencing, and enterprise communication directories.',
    createdBy: null,
    createdAt: '2026-09-12T09:00:00.000Z',
  },
  {
    id: 'cat-scheduling',
    name: 'Scheduling',
    description: 'Meeting automation, external booking links, and calendar coordination platforms.',
    createdBy: null,
    createdAt: '2026-09-12T09:00:00.000Z',
  },
];

export const SEEDED_SYSTEM_INTEGRATIONS: Integration[] = [
  {
    id: 'sys-salesforce',
    name: 'Salesforce',
    slug: 'salesforce',
    iconKey: 'salesforce',
    description: 'System catalog template for Salesforce REST User, PermissionSetAssignment, and LoginHistory metadata.',
    categoryId: 'cat-crm',
    uiLayers: ['developer_console', 'workflow_automation', 'api_only'],
    ownerId: null,
    sourceType: 'system',
    isDefault: true,
    status: 'catalog_reference',
    createdAt: '2026-09-15T14:20:00.000Z',
    updatedAt: '2026-10-18T11:10:00.000Z',
    version: 3,
  },
  {
    id: 'sys-hubspot',
    name: 'HubSpot',
    slug: 'hubspot',
    iconKey: 'hubspot',
    description: 'System catalog template for HubSpot Settings v3 user provisioning and team role read metadata.',
    categoryId: 'cat-crm',
    uiLayers: ['developer_console', 'embedded_ui'],
    ownerId: null,
    sourceType: 'system',
    isDefault: true,
    status: 'catalog_reference',
    createdAt: '2026-09-16T10:00:00.000Z',
    updatedAt: '2026-10-20T16:45:00.000Z',
    version: 2,
  },
  {
    id: 'sys-twilio-sms',
    name: 'SMS (Twilio)',
    slug: 'twilio-sms',
    iconKey: 'twilio',
    description: 'System catalog template for Twilio Account subresource inventory and programmable messaging usage records.',
    categoryId: 'cat-messaging',
    uiLayers: ['api_only', 'workflow_automation'],
    ownerId: null,
    sourceType: 'system',
    isDefault: true,
    status: 'catalog_reference',
    createdAt: '2026-09-18T08:30:00.000Z',
    updatedAt: '2026-10-12T09:15:00.000Z',
    version: 2,
  },
  {
    id: 'sys-whatsapp-business',
    name: 'WhatsApp Business',
    slug: 'whatsapp-business',
    iconKey: 'whatsapp',
    description: 'System catalog template for Meta Graph WhatsApp Business Account phone numbers and template metadata.',
    categoryId: 'cat-messaging',
    uiLayers: ['chatbot', 'workflow_automation', 'api_only'],
    ownerId: null,
    sourceType: 'system',
    isDefault: true,
    status: 'catalog_reference',
    createdAt: '2026-09-19T13:15:00.000Z',
    updatedAt: '2026-10-14T15:00:00.000Z',
    version: 1,
  },
  {
    id: 'sys-ms-teams',
    name: 'Microsoft Teams',
    slug: 'microsoft-teams',
    iconKey: 'teams',
    description: 'System catalog template for Microsoft Graph joinedTeams, channel directory, and read-only activity summaries.',
    categoryId: 'cat-collaboration',
    uiLayers: ['developer_console', 'chatbot', 'workflow_automation'],
    ownerId: null,
    sourceType: 'system',
    isDefault: true,
    status: 'catalog_reference',
    createdAt: '2026-09-20T11:00:00.000Z',
    updatedAt: '2026-10-25T10:30:00.000Z',
    version: 4,
  },
  {
    id: 'sys-slack',
    name: 'Slack',
    slug: 'slack',
    iconKey: 'slack',
    description: 'System catalog template for Slack Web API users.list, team.accessLogs, and workspace member status.',
    categoryId: 'cat-collaboration',
    uiLayers: ['chatbot', 'embedded_ui', 'workflow_automation'],
    ownerId: null,
    sourceType: 'system',
    isDefault: true,
    status: 'catalog_reference',
    createdAt: '2026-09-21T09:40:00.000Z',
    updatedAt: '2026-10-28T17:20:00.000Z',
    version: 3,
  },
  {
    id: 'sys-google-meet',
    name: 'Google Meet',
    slug: 'google-meet',
    iconKey: 'meet',
    description: 'System catalog template for Google Workspace Meet conferenceRecords and participant session metadata.',
    categoryId: 'cat-collaboration',
    uiLayers: ['developer_console', 'api_only'],
    ownerId: null,
    sourceType: 'system',
    isDefault: true,
    status: 'catalog_reference',
    createdAt: '2026-09-22T16:10:00.000Z',
    updatedAt: '2026-10-29T12:00:00.000Z',
    version: 2,
  },
];

export function buildCuratedCalendlyEvidence(): ValidationEvidence {
  return {
    providerName: 'Calendly API',
    apiVersion: 'v2 (Curated Demo Fixture)',
    baseUrlCandidates: ['https://api.calendly.com'],
    documentedEndpoints: [
      {
        method: 'GET',
        path: '/users/me',
        summary: 'Retrieve current authenticated user profile and parent organization URI context.',
        requiredScopes: ['users:read'],
        citationUrl: 'https://developer.calendly.com/api-docs/d7755e2f9e5fe-get-current-user',
        responseFields: [
          'resource.uri',
          'resource.name',
          'resource.email',
          'resource.current_organization',
          'resource.scheduling_url',
          'resource.timezone',
          'resource.created_at',
          'resource.updated_at',
        ],
      },
      {
        method: 'GET',
        path: '/organization_memberships',
        summary: 'List organization memberships to enumerate member inventory, roles, and user URIs.',
        requiredScopes: ['organizations:read'],
        paginationStyle: 'cursor (page_token + pagination.next_page)',
        citationUrl: 'https://developer.calendly.com/api-docs/eaed6e61a6bc3-list-organization-memberships',
        responseFields: [
          'collection[].uri',
          'collection[].role',
          'collection[].user.uri',
          'collection[].user.name',
          'collection[].user.email',
          'collection[].organization',
          'collection[].created_at',
          'pagination.count',
          'pagination.next_page',
          'pagination.next_page_token',
        ],
      },
      {
        method: 'GET',
        path: '/users/{uuid}',
        summary: 'Fetch detailed user metadata for a specific Calendly user UUID.',
        requiredScopes: ['users:read'],
        citationUrl: 'https://developer.calendly.com/api-docs/ff9832c5a6640-get-user',
        responseFields: [
          'resource.uri',
          'resource.name',
          'resource.slug',
          'resource.email',
          'resource.timezone',
          'resource.avatar_url',
          'resource.current_organization',
        ],
      },
      {
        method: 'GET',
        path: '/scheduled_events',
        summary: 'List scheduled events for an organization or user within min_start_time / max_start_time.',
        requiredScopes: ['scheduled_events:read'],
        paginationStyle: 'cursor (page_token + pagination.next_page)',
        citationUrl: 'https://developer.calendly.com/api-docs/25a4ece03c2bc-list-events',
        responseFields: [
          'collection[].uri',
          'collection[].name',
          'collection[].status',
          'collection[].start_time',
          'collection[].end_time',
          'collection[].event_memberships[].user',
          'pagination.count',
          'pagination.next_page',
          'pagination.next_page_token',
        ],
      },
    ],
    authEvidence: {
      methods: ['oauth2', 'personal_access_token'],
      headerFormat: 'Authorization: Bearer <CALENDLY_ACCESS_TOKEN>',
      tokenUrl: 'https://auth.calendly.com/oauth/token',
      scopes: ['users:read', 'organizations:read', 'scheduled_events:read'],
      summary:
        'Calendly API v2 authenticates via OAuth 2.0 Bearer tokens (auth.calendly.com) or Personal Access Tokens passed in the Authorization header.',
    },
    paginationEvidence: {
      supported: true,
      mechanism: 'Cursor pagination using count (1–100) and page_token query parameter or pagination.next_page URL.',
      nextLinkField: 'pagination.next_page',
      hostConstraint: 'api.calendly.com',
    },
    sourceLinks: [
      CALENDLY_SAMPLE_DOC_URL,
      'https://developer.calendly.com/api-docs/d7755e2f9e5fe-get-current-user',
      'https://developer.calendly.com/api-docs/eaed6e61a6bc3-list-organization-memberships',
      'https://developer.calendly.com/api-docs/25a4ece03c2bc-list-events',
    ],
    checks: [
      {
        id: 'fixture-provenance',
        label: 'Curated Sandbox Fixture Provenance',
        passed: true,
        detail: 'Pre-reviewed Calendly API v2 endpoint specification loaded explicitly for sandbox/demo mode (not a live network scan).',
      },
      {
        id: 'endpoints-present',
        label: 'Substantive Endpoint Contracts',
        passed: true,
        detail: '4 read-only REST endpoints verified (/users/me, /organization_memberships, /users/{uuid}, /scheduled_events).',
      },
      {
        id: 'auth-documented',
        label: 'Authentication & Least-Privilege Scopes',
        passed: true,
        detail: 'OAuth 2.0 / Personal Access Token Bearer scheme with read-only scopes documented.',
      },
      {
        id: 'pagination-documented',
        label: 'Cursor Pagination Evidence',
        passed: true,
        detail: 'pagination.next_page and next_page_token documented with count limit <= 100.',
      },
    ],
    warnings: [
      'Loaded from curated Calendly API v2 demo fixture. Marked as Sandbox Fixture Mode rather than live HTTP verification.',
      'Calendly API v2 does not expose user login timestamps, SSO sign-in logs, total purchased seat count, or billed license utilization.',
    ],
    reasons: [
      'Contains complete endpoint paths, OAuth2/PAT authentication, cursor pagination contract, and response schemas for user and event collection.',
    ],
    limitations: [
      '30-day scheduled event counts represent a derived scheduling-activity proxy only—never equate to login activity or commercial seat utilization.',
    ],
    classifierMode: 'curated_fixture_sandbox',
  };
}

export function discoverCapabilitiesFromValidation(
  validation: DocumentationValidation
): {
  capabilities: CapabilityItem[];
  fieldMappings: FieldMappingItem[];
  defaultConfig: CollectorConfig;
} {
  const endpoints = validation.evidence.documentedEndpoints;
  const baseHost = (() => {
    try {
      return new URL(validation.evidence.baseUrlCandidates[0] || 'https://api.calendly.com').hostname;
    } catch {
      return 'api.calendly.com';
    }
  })();

  const isCalendly =
    validation.evidence.providerName.toLowerCase().includes('calendly') ||
    baseHost.includes('calendly.com') ||
    endpoints.some((e) => e.path.includes('/organization_memberships'));

  if (isCalendly) {
    const capabilities: CapabilityItem[] = [
      {
        id: 'cap-api-client',
        taskName: 'Typed HTTPS API Client',
        category: 'client',
        status: 'documented',
        endpointEvidence: ['https://api.calendly.com'],
        requiredScopes: [],
        rationale:
          'Base URL https://api.calendly.com with strict HTTPS enforcement, configurable request timeout, and JSON content-type validation.',
      },
      {
        id: 'cap-auth',
        taskName: 'Authentication Setup (OAuth 2.0 / PAT)',
        category: 'auth',
        status: 'documented',
        endpointEvidence: ['GET /users/me', 'https://auth.calendly.com/oauth/token'],
        requiredScopes: ['users:read', 'organizations:read', 'scheduled_events:read'],
        rationale:
          'Bearer token injected strictly via environment variables (CALENDLY_ACCESS_TOKEN) with least-privilege read-only scopes.',
      },
      {
        id: 'cap-users',
        taskName: 'Retrieve Users & Organization Memberships',
        category: 'users',
        status: 'documented',
        endpointEvidence: ['GET /users/me', 'GET /organization_memberships', 'GET /users/{uuid}'],
        requiredScopes: ['users:read', 'organizations:read'],
        rationale:
          'Resolves current organization URI via /users/me, enumerates member inventory via /organization_memberships, and enriches user details via /users/{uuid}.',
      },
      {
        id: 'cap-activity-proxy',
        taskName: 'Retrieve Available Scheduling Activity (30-Day Event Proxy)',
        category: 'activity',
        status: 'derived',
        endpointEvidence: ['GET /scheduled_events'],
        requiredScopes: ['scheduled_events:read'],
        rationale:
          'Aggregates active scheduled events per member over the configured 30-day window from event_memberships[].user.',
        proxyDisclosure:
          'DERIVED PROXY ONLY: 30-day scheduled-events count measures calendar booking participation. It is NOT login activity, paid-license utilization, total seat allocation, or actual billed usage.',
      },
      {
        id: 'cap-unavailable-login',
        taskName: 'Last Login Timestamp & Interactive Sign-In History',
        category: 'unsupported_metric',
        status: 'unavailable',
        endpointEvidence: [],
        requiredScopes: [],
        rationale:
          'Not available in source: Calendly REST API v2 does not expose interactive login timestamps or SSO authentication logs. Excluded from code generation to prevent fabrication.',
      },
      {
        id: 'cap-unavailable-license',
        taskName: 'Paid-License Utilization, Seat Allocation & Billed Usage',
        category: 'unsupported_metric',
        status: 'unavailable',
        endpointEvidence: [],
        requiredScopes: [],
        rationale:
          'Not available in source: Subscription tier, purchased seat caps, and commercial billing utilization are absent from Calendly public v2 endpoints.',
      },
      {
        id: 'cap-pagination',
        taskName: 'Bounded Cursor Pagination & Host Validation',
        category: 'pagination',
        status: 'documented',
        endpointEvidence: ['pagination.next_page', 'pagination.next_page_token'],
        requiredScopes: [],
        rationale:
          'Follows cursor tokens up to configured maxPages with visited-token cycle detection and strict host allowlist (api.calendly.com) on next_page URLs.',
      },
      {
        id: 'cap-errors',
        taskName: 'Typed Error Handling, Rate-Limit Retry-After & Jitter Backoff',
        category: 'errors',
        status: 'documented',
        endpointEvidence: ['HTTP 400 / 401 / 403 / 404 / 429 / 5xx'],
        requiredScopes: [],
        rationale:
          'Classifies non-retryable auth/client errors (400/401/403/404) separately from retryable rate-limit (429 Retry-After) and transient 5xx responses with bounded exponential backoff + jitter.',
      },
      {
        id: 'cap-logging',
        taskName: 'Structured Redacted Logging & Correlation IDs',
        category: 'logging',
        status: 'documented',
        endpointEvidence: ['Connector Observability Contract'],
        requiredScopes: [],
        rationale:
          'Emits JSON-structured telemetry with per-run correlation IDs while automatically redacting Authorization headers, tokens, secrets, and member email PII.',
      },
    ];

    const fieldMappings: FieldMappingItem[] = [
      {
        canonicalField: 'member.externalUserId',
        sourceExpression: 'collection[].user.uri (UUID segment)',
        entity: 'membership',
        status: 'documented',
        note: 'Extracted from GET /organization_memberships',
      },
      {
        canonicalField: 'member.email',
        sourceExpression: 'collection[].user.email',
        entity: 'membership',
        status: 'documented',
        note: 'Redacted in logs; preserved in typed collector output',
      },
      {
        canonicalField: 'member.role',
        sourceExpression: 'collection[].role ("user" | "admin" | "owner")',
        entity: 'membership',
        status: 'documented',
        note: 'Organization role from membership resource',
      },
      {
        canonicalField: 'user.timezone',
        sourceExpression: 'resource.timezone',
        entity: 'user',
        status: 'documented',
        note: 'Fetched from GET /users/{uuid}',
      },
      {
        canonicalField: 'activity.derivedScheduledEvents30d',
        sourceExpression: 'COUNT(scheduled_events where status="active" in 30d window)',
        entity: 'activity_summary',
        status: 'derived',
        note: 'Explicitly typed as derivedSchedulingEventsCount30d (proxy metric, not login/license)',
      },
      {
        canonicalField: 'activity.lastLoginAt',
        sourceExpression: 'UNSUPPORTED_IN_SOURCE',
        entity: 'activity_summary',
        status: 'unavailable',
        note: 'Omitted — not exposed by Calendly API v2',
      },
      {
        canonicalField: 'license.paidSeatUtilization',
        sourceExpression: 'UNSUPPORTED_IN_SOURCE',
        entity: 'activity_summary',
        status: 'unavailable',
        note: 'Omitted — commercial seat billing is not in Calendly API v2',
      },
    ];

    const defaultConfig: CollectorConfig = {
      language: 'typescript',
      selectedEndpoints: endpoints.map((e) => `${e.method} ${e.path}`),
      authType: 'personal_access_token',
      scopes: ['users:read', 'organizations:read', 'scheduled_events:read'],
      collectionWindowDays: 30,
      pageSize: 50,
      maxPages: 20,
      maxRetries: 3,
      timeoutMs: 10000,
      logVerbosity: 'info',
      rateLimitPolicy: 'respect_retry_after_exponential_jitter',
    };

    return { capabilities, fieldMappings, defaultConfig };
  }

  // Generic grounded capability discovery for non-Calendly validated OpenAPI / REST docs
  const userEndpoints = endpoints.filter((e) =>
    /user|member|account|people|directory/i.test(e.path + ' ' + e.summary)
  );
  const activityEndpoints = endpoints.filter((e) =>
    /event|activity|audit|usage|log|meeting|message/i.test(e.path + ' ' + e.summary)
  );
  const allScopes = Array.from(new Set(endpoints.flatMap((e) => e.requiredScopes)));

  const capabilities: CapabilityItem[] = [
    {
      id: 'cap-api-client',
      taskName: 'Typed HTTPS API Client',
      category: 'client',
      status: 'documented',
      endpointEvidence: validation.evidence.baseUrlCandidates,
      requiredScopes: [],
      rationale: `Grounded against base URL ${validation.evidence.baseUrlCandidates[0] ?? 'HTTPS endpoint'} with strict timeout and TLS checks.`,
    },
    {
      id: 'cap-auth',
      taskName: 'Authentication Setup',
      category: 'auth',
      status: validation.evidence.authEvidence.methods.length > 0 ? 'documented' : 'unavailable',
      endpointEvidence: [validation.evidence.authEvidence.headerFormat],
      requiredScopes: allScopes,
      rationale: validation.evidence.authEvidence.summary,
    },
    {
      id: 'cap-users',
      taskName: 'Retrieve Users / Directory Inventory',
      category: 'users',
      status: userEndpoints.length > 0 ? 'documented' : 'unavailable',
      endpointEvidence: userEndpoints.map((e) => `${e.method} ${e.path}`),
      requiredScopes: Array.from(new Set(userEndpoints.flatMap((e) => e.requiredScopes))),
      rationale:
        userEndpoints.length > 0
          ? `Documented via ${userEndpoints.map((e) => e.path).join(', ')}.`
          : 'No user inventory endpoint found in validated documentation.',
    },
    {
      id: 'cap-activity',
      taskName: 'Retrieve Available Activity / Event Proxy',
      category: 'activity',
      status: activityEndpoints.length > 0 ? 'derived' : 'unavailable',
      endpointEvidence: activityEndpoints.map((e) => `${e.method} ${e.path}`),
      requiredScopes: Array.from(new Set(activityEndpoints.flatMap((e) => e.requiredScopes))),
      rationale:
        activityEndpoints.length > 0
          ? `Derived event count from ${activityEndpoints.map((e) => e.path).join(', ')}.`
          : 'No activity, event, or usage endpoint documented in source.',
      proxyDisclosure:
        activityEndpoints.length > 0
          ? 'Derived event count from documented endpoints only; commercial seat billing is not inferred unless explicitly documented.'
          : undefined,
    },
    {
      id: 'cap-unavailable-billing',
      taskName: 'Commercial Seat Allocation & Billed License Count',
      category: 'unsupported_metric',
      status: 'unavailable',
      endpointEvidence: [],
      requiredScopes: [],
      rationale:
        'Not available in source documentation unless a dedicated billing/subscription schema is verified.',
    },
    {
      id: 'cap-pagination',
      taskName: 'Bounded Pagination & Host Validation',
      category: 'pagination',
      status: validation.evidence.paginationEvidence.supported ? 'documented' : 'derived',
      endpointEvidence: [validation.evidence.paginationEvidence.mechanism],
      requiredScopes: [],
      rationale: validation.evidence.paginationEvidence.mechanism,
    },
    {
      id: 'cap-errors',
      taskName: 'Typed Error Handling & Bounded Retries',
      category: 'errors',
      status: 'documented',
      endpointEvidence: ['HTTP 400 / 401 / 403 / 404 / 429 / 5xx'],
      requiredScopes: [],
      rationale: 'Standard HTTP error classification with Retry-After and exponential backoff with jitter.',
    },
    {
      id: 'cap-logging',
      taskName: 'Structured Redacted Logging',
      category: 'logging',
      status: 'documented',
      endpointEvidence: ['Redacted JSON Logger'],
      requiredScopes: [],
      rationale: 'Correlation IDs and automatic token/PII redaction.',
    },
  ];

  const fieldMappings: FieldMappingItem[] = [
    {
      canonicalField: 'member.externalUserId',
      sourceExpression: userEndpoints[0] ? `${userEndpoints[0].path} -> id` : 'UNSUPPORTED_IN_SOURCE',
      entity: 'user',
      status: userEndpoints.length > 0 ? 'documented' : 'unavailable',
      note: userEndpoints[0] ? 'Primary identifier from user endpoint' : 'No user endpoint in spec',
    },
    {
      canonicalField: 'activity.derivedEventCountWindow',
      sourceExpression: activityEndpoints[0]
        ? `COUNT(${activityEndpoints[0].path})`
        : 'UNSUPPORTED_IN_SOURCE',
      entity: 'activity_summary',
      status: activityEndpoints.length > 0 ? 'derived' : 'unavailable',
      note: activityEndpoints[0] ? 'Derived event count proxy' : 'No activity endpoint in spec',
    },
  ];

  const defaultConfig: CollectorConfig = {
    language: 'typescript',
    selectedEndpoints: endpoints.map((e) => `${e.method} ${e.path}`),
    authType: validation.evidence.authEvidence.methods[0] ?? 'personal_access_token',
    scopes: allScopes.length > 0 ? allScopes : ['read'],
    collectionWindowDays: 30,
    pageSize: 50,
    maxPages: 15,
    maxRetries: 3,
    timeoutMs: 10000,
    logVerbosity: 'info',
    rateLimitPolicy: 'respect_retry_after_exponential_jitter',
  };

  return { capabilities, fieldMappings, defaultConfig };
}
