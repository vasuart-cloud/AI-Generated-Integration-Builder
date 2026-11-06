export type UILayer =
  | 'developer_console'
  | 'embedded_ui'
  | 'chatbot'
  | 'workflow_automation'
  | 'api_only';

export type SourceType = 'system' | 'custom';

export type IntegrationStatus =
  | 'catalog_reference'
  | 'draft'
  | 'docs_validated'
  | 'generating'
  | 'awaiting_approval'
  | 'paused'
  | 'generated'
  | 'validated_fixtures'
  | 'failed'
  | 'blocked'
  | 'archived';

export type DocInputMode = 'url' | 'openapi_paste' | 'curated_fixture';

export type ValidationResultStatus =
  | 'valid'
  | 'partial'
  | 'invalid'
  | 'unverifiable_live';

export type CapabilityStatus = 'documented' | 'derived' | 'unavailable';

export type AuthType = 'oauth2' | 'personal_access_token' | 'api_key';

export type RunStatus =
  | 'draft'
  | 'validating'
  | 'awaiting_model'
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'paused'
  | 'generated'
  | 'validated'
  | 'ready_for_review'
  | 'failed'
  | 'cancelled'
  | 'blocked';

export type AgentId =
  | 'doc_ingestion'
  | 'capability_discovery'
  | 'integration_planner'
  | 'auth_client_agent'
  | 'user_usage_agent'
  | 'error_pagination_agent'
  | 'security_testing_agent'
  // Backward-compatibility aliases
  | 'orchestrator'
  | 'doc_analyst'
  | 'capability_agent'
  | 'auth_agent'
  | 'client_code_agent'
  | 'resilience_agent'
  | 'security_reviewer'
  | 'test_packaging_agent';

export type SandboxScenarioId =
  | 'successful_authentication'
  | 'expired_token_401'
  | 'missing_permissions_403'
  | 'invalid_endpoint_404'
  | 'rate_limiting_429'
  | 'server_errors_500_503'
  | 'network_timeout'
  | 'invalid_response_schema'
  | 'empty_missing_data'
  | 'pagination_loop'
  | 'unsafe_pagination_redirect'
  | 'secret_leakage_detection';

export type SandboxTestStatus = 'pass' | 'fail' | 'not_run' | 'simulated';

export interface SandboxTestCase {
  id: SandboxScenarioId;
  name: string;
  category: 'authentication' | 'resilience' | 'schema' | 'security' | 'pagination';
  status: SandboxTestStatus;
  logs: string[];
  traceId: string;
  errorExplanation?: string;
  recommendedRemediation?: string;
  isCriticalSecurity: boolean;
  executedAt?: string;
}

export const SANDBOX_SCENARIO_DEFINITIONS: Array<{
  id: SandboxScenarioId;
  name: string;
  category: SandboxTestCase['category'];
  description: string;
  isCriticalSecurity: boolean;
}> = [
  {
    id: 'successful_authentication',
    name: 'Successful Authentication',
    category: 'authentication',
    description: 'Verifies Bearer token header injection and HTTP 200 user profile parsing.',
    isCriticalSecurity: true,
  },
  {
    id: 'expired_token_401',
    name: 'Expired Token (HTTP 401)',
    category: 'authentication',
    description: 'Simulates expired/invalid Bearer token; verifies non-retryable AuthenticationError is thrown.',
    isCriticalSecurity: true,
  },
  {
    id: 'missing_permissions_403',
    name: 'Missing Permissions (HTTP 403)',
    category: 'authentication',
    description: 'Simulates missing required OAuth scopes; verifies PermissionDeniedError with scope disclosure.',
    isCriticalSecurity: true,
  },
  {
    id: 'invalid_endpoint_404',
    name: 'Invalid Endpoint (HTTP 404)',
    category: 'resilience',
    description: 'Simulates non-existent API subresource; verifies NotFoundError without unhandled crash.',
    isCriticalSecurity: false,
  },
  {
    id: 'rate_limiting_429',
    name: 'Rate Limiting (HTTP 429)',
    category: 'resilience',
    description: 'Simulates 429 response with Retry-After header; verifies backoff and bounded retry policy.',
    isCriticalSecurity: false,
  },
  {
    id: 'server_errors_500_503',
    name: 'Server Errors (HTTP 500 / 503)',
    category: 'resilience',
    description: 'Simulates upstream transient outages; verifies bounded exponential retry before halting.',
    isCriticalSecurity: false,
  },
  {
    id: 'network_timeout',
    name: 'Network Timeout Guard',
    category: 'resilience',
    description: 'Simulates stalled network response; verifies AbortSignal terminates within configured timeoutMs.',
    isCriticalSecurity: false,
  },
  {
    id: 'invalid_response_schema',
    name: 'Invalid Response Schema',
    category: 'schema',
    description: 'Simulates unexpected JSON payload; verifies SchemaValidationError with actionable message.',
    isCriticalSecurity: false,
  },
  {
    id: 'empty_missing_data',
    name: 'Empty / Missing Data Handling',
    category: 'schema',
    description: 'Simulates empty collection ([]); verifies safe default handling without null pointer exceptions.',
    isCriticalSecurity: false,
  },
  {
    id: 'pagination_loop',
    name: 'Pagination Loop Detection',
    category: 'pagination',
    description: 'Simulates cyclic cursor token; verifies visited-token detector terminates without infinite loop.',
    isCriticalSecurity: true,
  },
  {
    id: 'unsafe_pagination_redirect',
    name: 'Unsafe Cross-Origin Pagination Redirect',
    category: 'pagination',
    description: 'Simulates malicious cross-host next_page link; verifies host-allowlist blocks SSRF exfiltration.',
    isCriticalSecurity: true,
  },
  {
    id: 'secret_leakage_detection',
    name: 'Secret Leakage Detection & PII Redaction',
    category: 'security',
    description: 'Scans telemetry and exception traces; verifies tokens, keys, and email PII are completely redacted.',
    isCriticalSecurity: true,
  },
];

export type ProductionReadinessStatus =
  | 'draft'
  | 'docs_accepted'
  | 'code_generated'
  | 'pending_review'
  | 'sandbox_testing'
  | 'tests_failed'
  | 'ready_for_production_review';

export interface ProductionReadinessCheck {
  id: string;
  title: string;
  passed: boolean;
  detail: string;
  category: 'documentation' | 'permissions' | 'credentials' | 'security_scan' | 'sandbox' | 'code_review' | 'approval' | 'operations';
}

export interface ProductionReadinessReport {
  status: ProductionReadinessStatus;
  checks: ProductionReadinessCheck[];
  allChecksPassed: boolean;
  canMarkReadyForReview: boolean;
  markedReadyAt?: string;
  markedReadyBy?: string;
}

export type AgentStepStatus =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'paused'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type ApprovalStage =
  | 'capabilities_scope'
  | 'auth_permissions'
  | 'code_security_review';

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'changes_requested'
  | 'rejected';

export type FailureInjectionType =
  | 'none'
  | 'malformed_docs'
  | 'general_website'
  | 'doc_404'
  | 'suspicious_redirect'
  | 'auth_401'
  | 'permission_403'
  | 'rate_limit_429'
  | 'provider_500'
  | 'invalid_schema'
  | 'unsafe_pagination_redirect'
  | 'model_unavailable'
  | 'security_blocking_issue'
  | 'interrupted_run';

export interface DeveloperPreferences {
  onboardingCompleted: boolean;
  onboardingStep: number;
  preferredLanguage: 'typescript';
  preferredEditor: 'studio_code' | 'monaco_compat';
  catalogViewMode: 'tile' | 'list';
  workspaceName: string;
}

export interface Developer {
  id: string;
  name: string;
  email: string;
  roleTitle: string;
  team: string;
  avatarInitials: string;
  preferences: DeveloperPreferences;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  createdBy: string | null;
  createdAt: string;
}

export interface ApiDocSource {
  mode: DocInputMode;
  url?: string;
  specFormat?: 'json' | 'yaml';
  specPreview?: string;
  validatedValidationId?: string;
  validatedHash?: string;
}

export interface Integration {
  id: string;
  name: string;
  slug: string;
  iconKey: string;
  description: string;
  categoryId: string;
  uiLayers?: UILayer[];
  ownerId: string | null;
  sourceType: SourceType;
  isDefault: boolean;
  status: IntegrationStatus;
  apiDocSource?: ApiDocSource;
  collectorConfig?: CollectorConfig;
  latestRunId?: string;
  productionReadinessStatus?: ProductionReadinessStatus;
  productionApprovedBy?: string;
  productionApprovedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface DocumentedEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  summary: string;
  requiredScopes: string[];
  paginationStyle?: string;
  citationUrl: string;
  responseFields: string[];
}

export interface ValidationCheckItem {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface ValidationEvidence {
  providerName: string;
  apiVersion: string;
  baseUrlCandidates: string[];
  documentedEndpoints: DocumentedEndpoint[];
  authEvidence: {
    methods: AuthType[];
    headerFormat: string;
    tokenUrl?: string;
    scopes: string[];
    summary: string;
  };
  paginationEvidence: {
    supported: boolean;
    mechanism: string;
    nextLinkField?: string;
    hostConstraint?: string;
  };
  sourceLinks: string[];
  checks: ValidationCheckItem[];
  warnings: string[];
  reasons: string[];
  limitations: string[];
  classifierMode: 'live_gemini_grounded' | 'live_structural' | 'curated_fixture_sandbox';
}

export interface DocumentationValidation {
  id: string;
  integrationId: string;
  sourceUrl: string;
  hash: string;
  result: ValidationResultStatus;
  summaryMessage: string;
  evidence: ValidationEvidence;
  checkedAt: string;
  mode: DocInputMode;
  prototypeConfirmed?: boolean;
  validationMode?: 'live_url' | 'prototype_mode' | 'curated_fixture' | 'openapi_spec';
}

export interface CapabilityItem {
  id: string;
  taskName: string;
  category:
    | 'client'
    | 'auth'
    | 'users'
    | 'activity'
    | 'errors'
    | 'pagination'
    | 'logging'
    | 'unsupported_metric';
  status: CapabilityStatus;
  endpointEvidence: string[];
  requiredScopes: string[];
  rationale: string;
  proxyDisclosure?: string;
}

export interface FieldMappingItem {
  canonicalField: string;
  sourceExpression: string;
  entity: 'user' | 'membership' | 'activity_summary';
  status: CapabilityStatus;
  note: string;
}

export interface CollectorConfig {
  language: 'typescript';
  selectedEndpoints: string[];
  authType: AuthType;
  scopes: string[];
  collectionWindowDays: number;
  pageSize: number;
  maxPages: number;
  maxRetries: number;
  timeoutMs: number;
  logVerbosity: 'info' | 'debug' | 'warn';
  rateLimitPolicy: 'respect_retry_after_exponential_jitter' | 'strict_backoff';
}

export interface ModelOption {
  provider: 'google_gemini' | 'openai' | 'anthropic' | 'deterministic_demo';
  providerLabel: string;
  modelId: string;
  label: string;
  configured: boolean;
  allowed: boolean;
  isSimulated: boolean;
  complianceLabel: string;
  latencyNote: string;
  costTier: string;
  strengths: string[];
  disabledReason?: string;
}

export interface AgentStep {
  id: string;
  runId: string;
  agentId: AgentId;
  agentName: string;
  sequenceOrder: number;
  dependsOn: AgentId[];
  status: AgentStepStatus;
  executionEngine: string;
  isSimulatedEngine: boolean;
  inputsRef: string[];
  outputsRef: string[];
  activitySummary: string;
  evidenceLinks: string[];
  decisionStatus: string;
  checkpointKey?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  errorDetail?: {
    code: string;
    message: string;
    remediation: string;
  };
}

export interface Approval {
  id: string;
  runId: string;
  integrationId: string;
  stage: ApprovalStage;
  title: string;
  gateAgentId: AgentId;
  requestedAction: string;
  riskLevel: 'low' | 'medium' | 'high';
  evidenceItems: string[];
  affectedArtifacts: string[];
  unavailableDisclosures: string[];
  requestedBy: string;
  reviewedBy?: string;
  status: ApprovalStatus;
  feedback?: string;
  requestedAt: string;
  decisionAt?: string;
}

export interface CodeArtifact {
  id: string;
  integrationId: string;
  runId: string;
  path: string;
  language: 'typescript' | 'json' | 'markdown' | 'dotenv';
  content: string;
  generatedContent: string;
  isModifiedByDeveloper: boolean;
  version: number;
  savedBy: string;
  savedAt: string;
}

export interface VerificationCheckResult {
  category: 'static_contract' | 'type_safety' | 'security_guard' | 'fixture_unit_test';
  name: string;
  passed: boolean;
  detail: string;
  isFixtureTest: boolean;
}

export interface GenerationRun {
  id: string;
  integrationId: string;
  actorId: string;
  validationId: string;
  modelProvider: ModelOption['provider'];
  modelId: string;
  modelLabel: string;
  isSimulatedModel: boolean;
  status: RunStatus;
  pauseRequested: boolean;
  currentStage: AgentId;
  checkpointVersion: number;
  completedSubtasks: string[];
  collectorConfig: CollectorConfig;
  codeVersion: number;
  activeFailureInjection: FailureInjectionType;
  failureBanner?: {
    code: string;
    title: string;
    message: string;
    failedAgentId: AgentId;
    remediation: string;
    traceId: string;
  };
  verificationResults: VerificationCheckResult[];
  sandboxResults?: SandboxTestCase[];
  productionReadiness?: ProductionReadinessReport;
  operationTokens: string[];
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TraceEvent {
  id: string;
  runId: string;
  integrationId: string;
  stepId?: string;
  agentId?: AgentId;
  level: 'info' | 'warn' | 'error' | 'security';
  type:
    | 'state_transition'
    | 'doc_validation'
    | 'agent_action'
    | 'model_invocation'
    | 'checkpoint_saved'
    | 'approval_gate'
    | 'code_artifact'
    | 'verification'
    | 'error_event';
  message: string;
  requestId: string;
  providerModel?: string;
  isSimulated?: boolean;
  durationMs?: number;
  errorClassification?: string;
  recommendedAction?: string;
  sanitizedMetadata: Record<string, unknown>;
  timestamp: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetType: 'integration' | 'category' | 'validation' | 'run' | 'approval' | 'artifact';
  targetId: string;
  summary: string;
  time: string;
}
