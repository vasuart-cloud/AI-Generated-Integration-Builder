import crypto from 'node:crypto';
import {
  AgentId,
  AgentStep,
  Approval,
  ApprovalStage,
  CodeArtifact,
  DocumentationValidation,
  FailureInjectionType,
  GenerationRun,
  Integration,
  RunStatus,
  TraceEvent,
} from '../shared/types';
import { generateIntegrationFileSpecs, verifyCodeArtifacts } from './codeGenerator';
import { generateAgentSummaryWithGemini } from './modelRegistry';
import { redactSensitiveData } from './security';

export const ALLOWED_RUN_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  draft: ['validating', 'awaiting_model', 'cancelled'],
  validating: ['awaiting_model', 'failed', 'cancelled'],
  awaiting_model: ['queued', 'cancelled'],
  queued: ['running', 'paused', 'cancelled', 'failed'],
  running: ['awaiting_approval', 'paused', 'generated', 'validated', 'ready_for_review', 'failed', 'blocked', 'cancelled'],
  awaiting_approval: ['running', 'paused', 'blocked', 'cancelled'],
  paused: ['running', 'cancelled'],
  generated: ['validated', 'failed', 'blocked', 'cancelled'],
  validated: ['ready_for_review', 'running', 'failed', 'blocked'],
  ready_for_review: ['running', 'failed', 'blocked'],
  failed: ['running', 'queued', 'cancelled'],
  blocked: ['running', 'cancelled'],
  cancelled: [],
};

export function canTransitionRunStatus(from: RunStatus, to: RunStatus): boolean {
  if (from === to) return true;
  return ALLOWED_RUN_TRANSITIONS[from]?.includes(to) ?? false;
}

export const AGENT_PIPELINE: Array<{
  agentId: AgentId;
  agentName: string;
  sequenceOrder: number;
  dependsOn: AgentId[];
  usesModel: boolean;
  approvalAfter?: ApprovalStage;
}> = [
  {
    agentId: 'doc_ingestion',
    agentName: 'Documentation Ingestion Agent',
    sequenceOrder: 1,
    dependsOn: [],
    usesModel: false,
  },
  {
    agentId: 'capability_discovery',
    agentName: 'Capability Discovery Agent',
    sequenceOrder: 2,
    dependsOn: ['doc_ingestion'],
    usesModel: true,
  },
  {
    agentId: 'integration_planner',
    agentName: 'Integration Planning Agent',
    sequenceOrder: 3,
    dependsOn: ['capability_discovery'],
    usesModel: true,
    approvalAfter: 'capabilities_scope',
  },
  {
    agentId: 'auth_client_agent',
    agentName: 'Authentication and API Client Agent',
    sequenceOrder: 4,
    dependsOn: ['integration_planner'],
    usesModel: true,
    approvalAfter: 'auth_permissions',
  },
  {
    agentId: 'user_usage_agent',
    agentName: 'User and Usage Code Generation Agent',
    sequenceOrder: 5,
    dependsOn: ['auth_client_agent'],
    usesModel: true,
  },
  {
    agentId: 'error_pagination_agent',
    agentName: 'Error Handling and Pagination Agent',
    sequenceOrder: 6,
    dependsOn: ['user_usage_agent'],
    usesModel: true,
  },
  {
    agentId: 'security_testing_agent',
    agentName: 'Security and Testing Agent',
    sequenceOrder: 7,
    dependsOn: ['error_pagination_agent'],
    usesModel: false,
    approvalAfter: 'code_security_review',
  },
];

export function createInitialAgentSteps(run: GenerationRun): AgentStep[] {
  return AGENT_PIPELINE.map((spec) => ({
    id: `step-${run.id}-${spec.agentId}`,
    runId: run.id,
    agentId: spec.agentId,
    agentName: spec.agentName,
    sequenceOrder: spec.sequenceOrder,
    dependsOn: spec.dependsOn,
    status: 'queued',
    executionEngine: spec.usesModel
      ? `${run.modelProvider}:${run.modelId}`
      : 'deterministic-policy-engine',
    isSimulatedEngine: spec.usesModel ? run.isSimulatedModel : false,
    inputsRef: [],
    outputsRef: [],
    activitySummary: 'Queued — waiting for upstream stage checkpoint.',
    evidenceLinks: [],
    decisionStatus: 'Pending execution',
  }));
}

function makeTrace(params: {
  run: GenerationRun;
  stepId?: string;
  agentId?: AgentId;
  level: TraceEvent['level'];
  type: TraceEvent['type'];
  message: string;
  durationMs?: number;
  errorClassification?: string;
  recommendedAction?: string;
  metadata?: Record<string, unknown>;
  usesModel?: boolean;
}): TraceEvent {
  return {
    id: `trc-${crypto.randomUUID().slice(0, 10)}`,
    runId: params.run.id,
    integrationId: params.run.integrationId,
    stepId: params.stepId,
    agentId: params.agentId,
    level: params.level,
    type: params.type,
    message: params.message,
    requestId: `req-${crypto.randomUUID().slice(0, 8)}`,
    providerModel: params.usesModel ? `${params.run.modelProvider}:${params.run.modelId}` : undefined,
    isSimulated: params.usesModel ? params.run.isSimulatedModel : undefined,
    durationMs: params.durationMs,
    errorClassification: params.errorClassification,
    recommendedAction: params.recommendedAction,
    sanitizedMetadata: redactSensitiveData(params.metadata ?? {}),
    timestamp: new Date().toISOString(),
  };
}

function buildApprovalCard(params: {
  stage: ApprovalStage;
  run: GenerationRun;
  validation: DocumentationValidation;
  artifacts: CodeArtifact[];
}): Approval {
  const { stage, run, validation, artifacts } = params;
  const now = new Date().toISOString();
  const endpointsList = validation.evidence.documentedEndpoints.map((e) => `${e.method} ${e.path}`);

  if (stage === 'capabilities_scope') {
    return {
      id: `apr-${run.id}-1`,
      runId: run.id,
      integrationId: run.integrationId,
      stage,
      title: 'Approval #1 — API Capabilities, Derived Proxy & Unavailable Fields',
      gateAgentId: 'integration_planner',
      requestedAction:
        'Confirm documented endpoints, accept 30-day scheduled-events count strictly as a derived activity proxy, and acknowledge excluded unavailable fields before auth/code synthesis.',
      riskLevel: 'medium',
      evidenceItems: [
        `Validated Source (${validation.mode}): ${validation.sourceUrl}`,
        `Documented Endpoints (${endpointsList.length}): ${endpointsList.join(', ')}`,
        `Pagination Contract: ${validation.evidence.paginationEvidence.mechanism}`,
      ],
      affectedArtifacts: ['src/types.ts', 'src/mapping.ts', 'src/users.ts', 'src/usage.ts'],
      unavailableDisclosures: [
        'Interactive user login timestamps / SSO sign-in logs — NOT available in source API; excluded.',
        'Paid-license utilization, purchased seat caps & billed usage — NOT available in source API; excluded.',
        '30-day scheduled-events count will be explicitly typed as derived_scheduling_activity_proxy.',
      ],
      requestedBy: 'Integration Planning Agent',
      status: 'pending',
      requestedAt: now,
    };
  }

  if (stage === 'auth_permissions') {
    return {
      id: `apr-${run.id}-2`,
      runId: run.id,
      integrationId: run.integrationId,
      stage,
      title: 'Approval #2 — Authentication Method & Least-Privilege Read-Only Scopes',
      gateAgentId: 'auth_client_agent',
      requestedAction: `Approve ${run.collectorConfig.authType} configuration via environment variable injection with strictly read-only scopes (${run.collectorConfig.scopes.join(', ')}) before generating client/auth code.`,
      riskLevel: 'high',
      evidenceItems: [
        `Auth Header Contract: ${validation.evidence.authEvidence.headerFormat}`,
        `Requested Scopes (Read-Only): ${run.collectorConfig.scopes.join(', ')}`,
        'Zero write/admin/webhook-mutation scopes requested.',
        'Credential storage: process.env reference only (no secret literals in generated code).',
      ],
      affectedArtifacts: ['src/auth.ts', 'src/apiClient.ts', '.env.example'],
      unavailableDisclosures: [
        'Write/delete scopes are disallowed in CloudEagle Developer Integration Studio MVP.',
      ],
      requestedBy: 'Authentication and API Client Agent',
      status: 'pending',
      requestedAt: now,
    };
  }

  return {
    id: `apr-${run.id}-3`,
    runId: run.id,
    integrationId: run.integrationId,
    stage: 'code_security_review',
    title: 'Approval #3 — Generated Code & Security Review Sign-Off',
    gateAgentId: 'security_testing_agent',
    requestedAction:
      'Review static SSRF, pagination host-allowlist, secret-redaction, and generated TypeScript modules before running fixture validation & final packaging.',
    riskLevel: 'medium',
    evidenceItems: [
      `Generated ${artifacts.length} source files at checkpoint v${run.checkpointVersion}.`,
      `Security Reviewer verified 0 hardcoded tokens and strict HTTPS host guard (${
        validation.evidence.paginationEvidence.hostConstraint || 'api.calendly.com'
      }).`,
      `Bounded pagination (maxPages=${run.collectorConfig.maxPages}) and bounded retries (maxRetries=${run.collectorConfig.maxRetries}).`,
    ],
    affectedArtifacts: artifacts.map((a) => a.path),
    unavailableDisclosures: [
      'Approval marks package eligible for sandbox verification & ZIP export—it does NOT trigger production deployment.',
    ],
    requestedBy: 'Security and Testing Agent',
    status: 'pending',
    requestedAt: now,
  };
}

function shouldFailAgentForInjection(
  agentId: AgentId,
  injection: FailureInjectionType
): {
  code: string;
  title: string;
  message: string;
  remediation: string;
  classification: string;
} | null {
  switch (injection) {
    case 'model_unavailable':
      if (
        agentId === 'capability_discovery' ||
        agentId === 'integration_planner' ||
        agentId === 'user_usage_agent' ||
        agentId === 'doc_analyst' ||
        agentId === 'client_code_agent'
      ) {
        return {
          code: 'MODEL_UNAVAILABLE_503',
          title: 'Simulated Fault: Selected LLM Provider Unavailable',
          message:
            'Demo Lab Simulation: Company LLM endpoint returned 503 Service Unavailable before completing stage.',
          remediation:
            'Clear the "Model Unavailable" fault in Demo Lab and click Retry Step to resume from the last durable checkpoint.',
          classification: 'PROVIDER_503_UNAVAILABLE',
        };
      }
      return null;
    case 'provider_500':
      if (agentId === 'user_usage_agent' || agentId === 'client_code_agent') {
        return {
          code: 'UPSTREAM_500',
          title: 'Simulated Fault: Provider 500 Internal Error',
          message:
            'Demo Lab Simulation: Model gateway encountered HTTP 500 during Code synthesis after bounded retries.',
          remediation:
            'Clear the 5xx fault toggle in Demo Lab and click Retry Step; prior checkpoints and approvals are preserved.',
          classification: 'UPSTREAM_5XX_ERROR',
        };
      }
      return null;
    case 'interrupted_run':
      if (agentId === 'error_pagination_agent' || agentId === 'resilience_agent') {
        return {
          code: 'RUN_INTERRUPTED',
          title: 'Simulated Fault: Worker Connection Interrupted Mid-Stage',
          message:
            'Demo Lab Simulation: Execution worker interrupted before Error Handling & Pagination checkpoint finalized.',
          remediation:
            'Clear the "Interrupted Run" toggle and click Resume or Retry Step to rerun only the unfinished stage.',
          classification: 'EXECUTION_INTERRUPTED',
        };
      }
      return null;
    case 'auth_401':
      if (agentId === 'auth_client_agent' || agentId === 'auth_agent') {
        return {
          code: 'AUTH_401_SIMULATED',
          title: 'Simulated Fault: HTTP 401 Invalid / Expired Token Contract',
          message:
            'Demo Lab Simulation: Sandbox token probe returned HTTP 401 Unauthorized (Bearer token expired or malformed).',
          remediation:
            'Verify CALENDLY_ACCESS_TOKEN environment configuration (non-retryable 401), clear fault in Demo Lab, and click Retry Step.',
          classification: 'HTTP_401_UNAUTHORIZED',
        };
      }
      return null;
    case 'permission_403':
      if (agentId === 'auth_client_agent' || agentId === 'auth_agent') {
        return {
          code: 'PERMISSION_403_SIMULATED',
          title: 'Simulated Fault: HTTP 403 Missing Organization Read Scope',
          message:
            'Demo Lab Simulation: Upstream rejected request with HTTP 403 Forbidden — scope organizations:read is required for /organization_memberships.',
          remediation:
            'Ensure organizations:read is included in read-only scopes, clear fault in Demo Lab, and click Retry Step.',
          classification: 'HTTP_403_FORBIDDEN',
        };
      }
      return null;
    case 'unsafe_pagination_redirect':
      if (agentId === 'security_testing_agent' || agentId === 'security_reviewer') {
        return {
          code: 'SECURITY_UNSAFE_PAGINATION_HOST',
          title: 'Blocking Security Issue: Cross-Origin Pagination Redirect',
          message:
            'Demo Lab Simulation: Pagination next_page URL pointed to untrusted host https://exfil-proxy.example.net/next — blocked to prevent Bearer token leakage.',
          remediation:
            'Enforce strict host allowlist (api.calendly.com) in src/pagination.ts, clear the Demo Lab fault, and click Retry Step.',
          classification: 'SECURITY_SSRF_PAGINATION_BLOCK',
        };
      }
      return null;
    case 'security_blocking_issue':
      if (agentId === 'security_testing_agent' || agentId === 'security_reviewer') {
        return {
          code: 'SECURITY_HARDCODED_SECRET',
          title: 'Blocking Security Issue: Secret Literal / Unsafe Pattern Detected',
          message:
            'Demo Lab Simulation: Security Reviewer blocked package due to a simulated hardcoded credential pattern in client configuration.',
          remediation:
            'Remove hardcoded secrets (use process.env references only), clear the Demo Lab fault, and click Retry Step.',
          classification: 'SECURITY_POLICY_VIOLATION',
        };
      }
      return null;
    case 'rate_limit_429':
      if (agentId === 'security_testing_agent' || agentId === 'test_packaging_agent') {
        return {
          code: 'RATE_LIMIT_429_EXHAUSTED',
          title: 'Simulated Fault: HTTP 429 Rate Limit Exhausted in Fixture Validation',
          message:
            'Demo Lab Simulation: Upstream returned persistent HTTP 429 Too Many Requests with Retry-After: 12s across all 3 bounded retry attempts.',
          remediation:
            'Inspect Retry-After backoff trace, clear the 429 fault in Demo Lab, and click Retry Step.',
          classification: 'HTTP_429_RATE_LIMITED',
        };
      }
      return null;
    case 'invalid_schema':
      if (agentId === 'security_testing_agent' || agentId === 'test_packaging_agent') {
        return {
          code: 'INVALID_RESPONSE_SCHEMA',
          title: 'Simulated Fault: Upstream JSON Schema Mismatch',
          message:
            'Demo Lab Simulation: Fixture payload returned malformed JSON (missing collection[] array on /scheduled_events).',
          remediation:
            'Inspect schema validation error in trace details, clear the Invalid Schema fault in Demo Lab, and click Retry Step.',
          classification: 'SCHEMA_VALIDATION_ERROR',
        };
      }
      return null;
    default:
      return null;
  }
}

export interface AdvanceRunContext {
  integration: Integration;
  ownerName: string;
  validation: DocumentationValidation;
  run: GenerationRun;
  steps: AgentStep[];
  approvals: Approval[];
  artifacts: CodeArtifact[];
  traces: TraceEvent[];
}

/**
 * Executes the resumable multi-agent state machine forward from the current durable checkpoint
 * until it hits a mandatory human approval gate, a user-requested pause, a failure, or completion.
 */
export async function advanceGenerationRun(ctx: AdvanceRunContext): Promise<void> {
  const { integration, ownerName, validation, run, steps, approvals, artifacts, traces } = ctx;

  if (run.status === 'cancelled') {
    return;
  }

  const allowedHost = (() => {
    try {
      return new URL(validation.evidence.baseUrlCandidates[0] || 'https://api.calendly.com').hostname;
    } catch {
      return 'api.calendly.com';
    }
  })();

  const allFileSpecs = generateIntegrationFileSpecs({
    integration,
    validation,
    run,
    ownerName,
  });

  run.status = 'running';
  run.failureBanner = undefined;
  run.updatedAt = new Date().toISOString();
  integration.status = 'generating';
  integration.updatedAt = run.updatedAt;

  for (const stageSpec of AGENT_PIPELINE) {
    const step = steps.find((s) => s.agentId === stageSpec.agentId);
    if (!step) continue;

    // Skip already succeeded or waiting_approval stages without restarting completed work!
    if (step.status === 'succeeded' || step.status === 'waiting_approval') {
      if (stageSpec.approvalAfter) {
        const existingApproval = approvals.find((a) => a.stage === stageSpec.approvalAfter);
        if (existingApproval && existingApproval.status === 'approved') {
          step.status = 'succeeded';
          step.decisionStatus = 'Checkpoint persisted';
          continue;
        }
        if (existingApproval && existingApproval.status === 'pending') {
          run.status = 'awaiting_approval';
          run.currentStage = stageSpec.agentId;
          step.status = 'waiting_approval';
          step.decisionStatus = 'Awaiting mandatory developer approval';
          integration.status = 'awaiting_approval';
          return;
        }
      } else if (step.status === 'succeeded') {
        continue;
      }
    }

    // Check if developer clicked Pause before starting a new stage
    if (run.pauseRequested) {
      run.status = 'paused';
      run.pauseRequested = false;
      run.currentStage = stageSpec.agentId;
      if (step.status === 'queued' || step.status === 'running') {
        step.status = 'paused';
        step.decisionStatus = 'Paused cleanly before starting stage; ready to resume from checkpoint.';
      }
      integration.status = 'paused';
      traces.push(
        makeTrace({
          run,
          stepId: step.id,
          agentId: step.agentId,
          level: 'info',
          type: 'state_transition',
          message: `Run paused at durable checkpoint v${run.checkpointVersion} prior to ${step.agentName}.`,
          metadata: {
            checkpointVersion: run.checkpointVersion,
            nextAgentToResume: step.agentName,
            completedSubtasksCount: run.completedSubtasks.length,
          },
        })
      );
      return;
    }

    // Begin stage execution
    const startedMs = Date.now();
    run.currentStage = stageSpec.agentId;
    step.status = 'running';
    step.startedAt = new Date(startedMs).toISOString();
    step.errorDetail = undefined;

    // Check deterministic Demo Lab failure injection for this stage
    const injectedFault = shouldFailAgentForInjection(stageSpec.agentId, run.activeFailureInjection);
    if (injectedFault) {
      const elapsed = Math.max(18, Date.now() - startedMs);
      step.status = 'failed';
      step.completedAt = new Date().toISOString();
      step.durationMs = elapsed;
      step.decisionStatus = `Blocked: ${injectedFault.code}`;
      step.activitySummary = injectedFault.message;
      step.errorDetail = {
        code: injectedFault.code,
        message: injectedFault.message,
        remediation: injectedFault.remediation,
      };

      const isSecurityBlock = run.activeFailureInjection === 'unsafe_pagination_redirect' || run.activeFailureInjection === 'security_blocking_issue';
      run.status = isSecurityBlock ? 'blocked' : 'failed';
      integration.status = isSecurityBlock ? 'blocked' : 'failed';

      const errTrace = makeTrace({
        run,
        stepId: step.id,
        agentId: step.agentId,
        level: isSecurityBlock ? 'security' : 'error',
        type: 'error_event',
        message: `${step.agentName} halted: ${injectedFault.message}`,
        durationMs: elapsed,
        errorClassification: injectedFault.classification,
        recommendedAction: injectedFault.remediation,
        usesModel: stageSpec.usesModel,
        metadata: {
          errorCode: injectedFault.code,
          demoSimulation: true,
          sampleAuthHeaderScrubbed: 'Bearer pat_live_demo_secret_token_for_redaction_check',
          checkpointPreserved: run.checkpointVersion,
        },
      });
      traces.push(errTrace);

      run.failureBanner = {
        code: injectedFault.code,
        title: injectedFault.title,
        message: injectedFault.message,
        failedAgentId: step.agentId,
        remediation: injectedFault.remediation,
        traceId: errTrace.id,
      };
      run.updatedAt = new Date().toISOString();
      return;
    }

    // Execute stage-specific logic & optionally invoke configured Company Gemini model
    let defaultSummary = '';
    let inputsRef: string[] = [];
    let outputsRef: string[] = [];
    let evidenceLinks: string[] = validation.evidence.sourceLinks.slice(0, 2);

    if (stageSpec.agentId === 'doc_ingestion' || stageSpec.agentId === 'orchestrator') {
      inputsRef = [validation.sourceUrl, `sha256:${validation.hash}`];
      outputsRef = ['normalized_api_spec', `endpoints:${validation.evidence.documentedEndpoints.length}`];
      defaultSummary = `Ingested API documentation from ${validation.sourceUrl} (${validation.mode}). Verified HTTPS safety, SSRF guards, and bounded extraction.`;
    } else if (stageSpec.agentId === 'capability_discovery' || stageSpec.agentId === 'doc_analyst') {
      inputsRef = validation.evidence.documentedEndpoints.map((e) => `${e.method} ${e.path}`);
      outputsRef = ['capability_matrix', 'schema_definitions', 'field_mappings'];
      defaultSummary = `Discovered ${validation.evidence.documentedEndpoints.length} grounded endpoints: /users/me (current user context), /organization_memberships (member inventory), and /scheduled_events (scheduling activity).`;
    } else if (stageSpec.agentId === 'integration_planner' || stageSpec.agentId === 'capability_agent') {
      inputsRef = ['capability_matrix', 'schema_definitions'];
      outputsRef = ['architecture_plan', 'derived_proxy_disclosure', 'unsupported_fields_list'];
      defaultSummary =
        'Mapped /organization_memberships for member inventory and /scheduled_events as a 30-day derived scheduling-activity proxy; marked login timestamps and paid seat utilization unavailable in source.';
    } else if (stageSpec.agentId === 'auth_client_agent' || stageSpec.agentId === 'auth_agent') {
      const authSpecs = allFileSpecs.filter(
        (f) =>
          f.path.includes('auth.ts') ||
          f.path.includes('apiClient.ts') ||
          f.path.includes('.env.example')
      );
      inputsRef = [validation.evidence.authEvidence.headerFormat, ...run.collectorConfig.scopes];
      outputsRef = authSpecs.map((f) => f.path);
      for (const spec of authSpecs) {
        upsertArtifact(artifacts, integration.id, run, spec.path, spec.language, spec.content);
        markSubtask(run, `file:${spec.path}`);
      }
      defaultSummary = `Generated typed API client and ${run.collectorConfig.authType} authentication modules (${outputsRef.join(
        ', '
      )}) with least-privilege read-only scopes (${run.collectorConfig.scopes.join(', ')}).`;
    } else if (stageSpec.agentId === 'user_usage_agent' || stageSpec.agentId === 'client_code_agent') {
      const userUsageSpecs = allFileSpecs.filter(
        (f) =>
          // The connector entry point must be emitted before verification.
          f.path === 'src/index.ts' ||
          f.path.includes('types.ts') ||
          f.path.includes('users.ts') ||
          f.path.includes('usage.ts') ||
          f.path.includes('mapping.ts')
      );
      inputsRef = ['src/apiClient.ts', 'derived_proxy_contract'];
      outputsRef = userUsageSpecs.map((f) => f.path);
      for (const spec of userUsageSpecs) {
        upsertArtifact(artifacts, integration.id, run, spec.path, spec.language, spec.content);
        markSubtask(run, `file:${spec.path}`);
      }
      defaultSummary = `Generated user and usage data retrieval modules (${outputsRef.join(
        ', '
      )}) implementing canonical mapping and explicit 30-day scheduled-events derived activity proxy.`;
    } else if (stageSpec.agentId === 'error_pagination_agent' || stageSpec.agentId === 'resilience_agent') {
      const errorPaginationSpecs = allFileSpecs.filter(
        (f) =>
          f.path.includes('errors.ts') ||
          f.path.includes('pagination.ts') ||
          f.path.includes('logger.ts')
      );
      inputsRef = ['src/apiClient.ts', `host:${allowedHost}`];
      outputsRef = errorPaginationSpecs.map((f) => f.path);
      for (const spec of errorPaginationSpecs) {
        upsertArtifact(artifacts, integration.id, run, spec.path, spec.language, spec.content);
        markSubtask(run, `file:${spec.path}`);
      }
      defaultSummary = `Implemented typed 400/401/403/404/429/5xx error taxonomy, Retry-After + jitter backoff, ${allowedHost} pagination host guard, cycle detection, and PII/token-redacted JSON logger.`;
    } else if (stageSpec.agentId === 'security_testing_agent' || stageSpec.agentId === 'security_reviewer' || stageSpec.agentId === 'test_packaging_agent') {
      const testSpecs = allFileSpecs.filter(
        (f) =>
          // Recover persisted runs created before the code agent emitted the entry point.
          // upsertArtifact preserves developer edits when this file already exists.
          f.path === 'src/index.ts' ||
          f.path.includes('test') ||
          f.path.includes('manifest') ||
          f.path.includes('README') ||
          f.path.includes('package.json') ||
          f.path.includes('tsconfig.json')
      );
      for (const spec of testSpecs) {
        upsertArtifact(artifacts, integration.id, run, spec.path, spec.language, spec.content);
        markSubtask(run, `file:${spec.path}`);
      }
      const verifications = verifyCodeArtifacts(artifacts, allowedHost, run.activeFailureInjection);
      run.verificationResults = verifications;
      const blockingSec = verifications.find((c) => c.category === 'security_guard' && !c.passed);
      if (blockingSec) {
        step.status = 'failed';
        step.completedAt = new Date().toISOString();
        step.durationMs = Math.max(15, Date.now() - startedMs);
        step.activitySummary = blockingSec.detail;
        step.decisionStatus = 'Blocked by Security Reviewer';
        step.errorDetail = {
          code: 'SECURITY_REVIEW_BLOCKED',
          message: blockingSec.detail,
          remediation: 'Remove hardcoded secrets or untrusted hosts in Code Workspace and click Retry Step.',
        };
        run.status = 'blocked';
        integration.status = 'blocked';
        const secTrace = makeTrace({
          run,
          stepId: step.id,
          agentId: step.agentId,
          level: 'security',
          type: 'error_event',
          message: blockingSec.detail,
          errorClassification: 'SECURITY_REVIEW_FAILURE',
          recommendedAction: 'Remediate security violation in generated files and retry Security & Testing Agent.',
          metadata: { failedCheck: blockingSec.name },
        });
        traces.push(secTrace);
        run.failureBanner = {
          code: 'SECURITY_REVIEW_BLOCKED',
          title: 'Security Reviewer Blocked Package',
          message: blockingSec.detail,
          failedAgentId: step.agentId,
          remediation: 'Fix the security finding in the Code Workspace and retry.',
          traceId: secTrace.id,
        };
        return;
      }
      const failedCheck = verifications.find((v) => !v.passed);
      if (failedCheck) {
        step.status = 'failed';
        step.completedAt = new Date().toISOString();
        step.durationMs = Math.max(20, Date.now() - startedMs);
        step.activitySummary = failedCheck.detail;
        step.decisionStatus = 'Verification Failed';
        step.errorDetail = {
          code: 'VERIFICATION_FAILED',
          message: failedCheck.detail,
          remediation: 'Inspect failing verification check in Code Workspace or Traces and click Retry Step.',
        };
        run.status = 'failed';
        integration.status = 'failed';
        const failTrace = makeTrace({
          run,
          stepId: step.id,
          agentId: step.agentId,
          level: 'error',
          type: 'verification',
          message: failedCheck.detail,
          errorClassification: 'VERIFICATION_CHECK_FAILED',
          recommendedAction: 'Fix failing contract/fixture check and retry Security & Testing Agent.',
          metadata: { checkName: failedCheck.name },
        });
        traces.push(failTrace);
        run.failureBanner = {
          code: 'VERIFICATION_FAILED',
          title: 'Verification Check Failed',
          message: failedCheck.detail,
          failedAgentId: step.agentId,
          remediation: 'Review trace and verification panel, then retry step.',
          traceId: failTrace.id,
        };
        return;
      }
      inputsRef = artifacts.map((a) => a.path);
      outputsRef = ['tests/connector.test.ts', 'integration.manifest.json', 'README.md', 'ZIP archive ready'];
      defaultSummary = `Passed ${verifications.length}/${verifications.length} static contract, security, and fixture unit checks; packaged ${artifacts.length} files (v${run.codeVersion}) for review, sandbox testing, and ZIP export.`;
    }

    // If a real non-simulated Company Gemini model was chosen for a model-backed stage, invoke it on the server!
    let finalSummary = defaultSummary;
    if (stageSpec.usesModel && !run.isSimulatedModel && run.modelProvider === 'google_gemini') {
      const modelCall = await generateAgentSummaryWithGemini({
        modelId: run.modelId,
        agentName: stageSpec.agentName,
        integrationName: integration.name,
        contextFacts: [defaultSummary, `Source: ${validation.sourceUrl}`],
      });

      if (modelCall.error) {
        // Never invent a successful provider invocation if Gemini fails! Surface the real error honestly.
        const elapsed = Math.max(25, Date.now() - startedMs);
        step.status = 'failed';
        step.completedAt = new Date().toISOString();
        step.durationMs = elapsed;
        step.activitySummary = `Gemini provider call failed: ${modelCall.error}`;
        step.decisionStatus = 'Provider Error';
        step.errorDetail = {
          code: 'GEMINI_PROVIDER_ERROR',
          message: modelCall.error,
          remediation:
            'Verify GEMINI_API_KEY in Settings > Secrets, or create a new run using Deterministic Demo Engine (Simulated).',
        };
        run.status = 'failed';
        integration.status = 'failed';
        const providerTrace = makeTrace({
          run,
          stepId: step.id,
          agentId: step.agentId,
          level: 'error',
          type: 'model_invocation',
          message: `Company Gemini (${run.modelId}) invocation failed during ${step.agentName}: ${modelCall.error}`,
          durationMs: elapsed,
          errorClassification: 'LLM_PROVIDER_INVOCATION_ERROR',
          recommendedAction:
            'Check API key quota/validity in Settings > Secrets and click Retry Step, or start a run with Deterministic Demo Engine.',
          usesModel: true,
          metadata: { modelId: run.modelId },
        });
        traces.push(providerTrace);
        run.failureBanner = {
          code: 'GEMINI_PROVIDER_ERROR',
          title: `Company Gemini (${run.modelId}) Error`,
          message: modelCall.error,
          failedAgentId: step.agentId,
          remediation:
            'Check server GEMINI_API_KEY configuration and click Retry Step, or start a new run with Deterministic Demo Engine.',
          traceId: providerTrace.id,
        };
        return;
      }

      if (modelCall.summary) {
        finalSummary = modelCall.summary;
      }
    }

    const durationMs = Math.max(24, Date.now() - startedMs);
    run.checkpointVersion += 1;
    markSubtask(run, `agent:${stageSpec.agentId}`);

    step.inputsRef = inputsRef;
    step.outputsRef = outputsRef;
    step.evidenceLinks = evidenceLinks;
    step.activitySummary = finalSummary;
    step.checkpointKey = `ckpt-${run.id}-v${run.checkpointVersion}`;
    step.completedAt = new Date().toISOString();
    step.durationMs = durationMs;

    traces.push(
      makeTrace({
        run,
        stepId: step.id,
        agentId: step.agentId,
        level: 'info',
        type: stageSpec.usesModel ? 'model_invocation' : 'agent_action',
        message: `${step.agentName}: ${finalSummary}`,
        durationMs,
        usesModel: stageSpec.usesModel,
        metadata: {
          inputs: inputsRef,
          outputs: outputsRef,
          checkpoint: step.checkpointKey,
        },
      })
    );

    // Check if this stage requires a mandatory Human-in-the-Loop Approval Gate
    if (stageSpec.approvalAfter) {
      let approval = approvals.find((a) => a.stage === stageSpec.approvalAfter);
      if (!approval) {
        approval = buildApprovalCard({
          stage: stageSpec.approvalAfter,
          run,
          validation,
          artifacts,
        });
        approvals.push(approval);
      } else if (approval.status === 'changes_requested' || approval.status === 'rejected') {
        approval.status = 'pending';
        approval.requestedAt = new Date().toISOString();
        approval.affectedArtifacts =
          stageSpec.approvalAfter === 'code_security_review'
            ? artifacts.map((a) => a.path)
            : approval.affectedArtifacts;
      }

      if (approval.status !== 'approved') {
        step.status = 'waiting_approval';
        step.decisionStatus = 'Awaiting mandatory developer approval';
        run.status = 'awaiting_approval';
        run.updatedAt = new Date().toISOString();
        integration.status = 'awaiting_approval';
        integration.updatedAt = run.updatedAt;

        traces.push(
          makeTrace({
            run,
            stepId: step.id,
            agentId: step.agentId,
            level: 'info',
            type: 'approval_gate',
            message: `Run paused at mandatory human checkpoint: ${approval.title}`,
            recommendedAction: 'Review evidence and unavailable field disclosures, then Approve, Request Changes, or Reject.',
            metadata: {
              approvalId: approval.id,
              stage: approval.stage,
              riskLevel: approval.riskLevel,
            },
          })
        );
        return;
      }
    }

    step.status = 'succeeded';
    step.decisionStatus = 'Checkpoint persisted';
  }

  // All 8 stages and 3 mandatory human approvals succeeded!
  run.status = 'ready_for_review';
  run.completedAt = new Date().toISOString();
  run.updatedAt = run.completedAt;
  integration.status = 'validated_fixtures';
  integration.updatedAt = run.completedAt;

  traces.push(
    makeTrace({
      run,
      level: 'info',
      type: 'state_transition',
      message: `Integration package generated, human-approved across all 3 gates, and fixture-validated (${artifacts.length} files, code v${run.codeVersion}).`,
      metadata: {
        status: run.status,
        filesProduced: artifacts.length,
        codeVersion: run.codeVersion,
        deploymentNote: 'Generated & fixture-validated only; production deployment is not automatic.',
      },
    })
  );
}

function markSubtask(run: GenerationRun, key: string): void {
  if (!run.completedSubtasks.includes(key)) {
    run.completedSubtasks.push(key);
  }
}

function upsertArtifact(
  artifacts: CodeArtifact[],
  integrationId: string,
  run: GenerationRun,
  filePath: string,
  language: CodeArtifact['language'],
  content: string
): void {
  const now = new Date().toISOString();
  const existing = artifacts.find((a) => a.runId === run.id && a.path === filePath);
  if (existing) {
    // Preserve developer manual edits if resuming unless stage was explicitly re-requested
    if (!existing.isModifiedByDeveloper) {
      existing.content = content;
      existing.generatedContent = content;
      existing.savedAt = now;
    }
    return;
  }

  artifacts.push({
    id: `art-${crypto.randomUUID().slice(0, 8)}`,
    integrationId,
    runId: run.id,
    path: filePath,
    language,
    content,
    generatedContent: content,
    isModifiedByDeveloper: false,
    version: run.codeVersion,
    savedBy: 'agent-pipeline',
    savedAt: now,
  });
}
