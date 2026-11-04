import {
  AgentStep,
  Approval,
  AuditEvent,
  CapabilityItem,
  Category,
  CodeArtifact,
  CollectorConfig,
  Developer,
  DeveloperPreferences,
  DocInputMode,
  DocumentationValidation,
  FailureInjectionType,
  FieldMappingItem,
  GenerationRun,
  Integration,
  ModelOption,
  TraceEvent,
  UILayer,
} from '../shared/types';

export interface IntegrationWithAccess extends Integration {
  access: {
    canView: boolean;
    canEdit: boolean;
    canArchiveOrDelete: boolean;
    reason: string;
  };
}

export interface BootstrapPayload {
  currentDeveloper: Developer;
  developers: Developer[];
  categories: Category[];
  integrations: IntegrationWithAccess[];
  models: ModelOption[];
  runs: GenerationRun[];
  audits: AuditEvent[];
}

export interface RunDetailPayload {
  run: GenerationRun;
  integration?: IntegrationWithAccess;
  steps: AgentStep[];
  approvals: Approval[];
  artifacts: CodeArtifact[];
  traces: TraceEvent[];
}

export class ClientApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ClientApiError';
  }
}

async function requestJson<T>(
  url: string,
  actorId: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  headers.set('x-developer-id', actorId);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...init,
    headers,
  });

  if (!res.ok) {
    let code = `HTTP_${res.status}`;
    let message = `Request failed with status ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody?.error) {
        code = errBody.error.code || code;
        message = errBody.error.message || message;
      }
    } catch {
      // Fallback to status message
    }
    throw new ClientApiError(res.status, code, message);
  }

  return (await res.json()) as T;
}

export const studioApi = {
  bootstrap(actorId: string, includeArchived = false): Promise<BootstrapPayload> {
    return requestJson(`/api/bootstrap?includeArchived=${includeArchived}`, actorId);
  },

  updatePreferences(
    actorId: string,
    patch: Partial<DeveloperPreferences>
  ): Promise<{ developer: Developer }> {
    return requestJson('/api/developers/me/preferences', actorId, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  createCategory(
    actorId: string,
    input: { name: string; description: string }
  ): Promise<{ category: Category }> {
    return requestJson('/api/categories', actorId, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  getIntegrationDetail(
    actorId: string,
    integrationId: string
  ): Promise<{
    integration: IntegrationWithAccess;
    validations: DocumentationValidation[];
    latestValidValidation: DocumentationValidation | null;
    discovery: {
      capabilities: CapabilityItem[];
      fieldMappings: FieldMappingItem[];
      defaultConfig: CollectorConfig;
    } | null;
    runs: GenerationRun[];
  }> {
    return requestJson(`/api/integrations/${encodeURIComponent(integrationId)}`, actorId);
  },

  createIntegrationDraft(
    actorId: string,
    input: {
      name: string;
      description: string;
      categoryId: string;
      uiLayers: UILayer[];
    }
  ): Promise<{ integration: IntegrationWithAccess }> {
    return requestJson('/api/integrations', actorId, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateIntegration(
    actorId: string,
    integrationId: string,
    patch: {
      name?: string;
      description?: string;
      categoryId?: string;
      uiLayers?: UILayer[];
    }
  ): Promise<{ integration: IntegrationWithAccess }> {
    return requestJson(`/api/integrations/${encodeURIComponent(integrationId)}`, actorId, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  deleteOrArchiveIntegration(
    actorId: string,
    integrationId: string,
    mode: 'archive' | 'soft_delete'
  ): Promise<{ integration: Integration }> {
    return requestJson(
      `/api/integrations/${encodeURIComponent(integrationId)}?mode=${mode}`,
      actorId,
      { method: 'DELETE' }
    );
  },

  validateDocs(
    actorId: string,
    integrationId: string,
    input: {
      mode: DocInputMode;
      url?: string;
      rawSpec?: string;
      failureInjection?: FailureInjectionType;
    }
  ): Promise<{
    validation: DocumentationValidation;
    discovery: {
      capabilities: CapabilityItem[];
      fieldMappings: FieldMappingItem[];
      defaultConfig: CollectorConfig;
    } | null;
    integration: Integration;
  }> {
    return requestJson(
      `/api/integrations/${encodeURIComponent(integrationId)}/validate-docs`,
      actorId,
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
  },

  startRun(
    actorId: string,
    integrationId: string,
    input: {
      modelProvider: ModelOption['provider'];
      modelId: string;
      collectorConfig: CollectorConfig;
      operationId?: string;
      failureInjection?: FailureInjectionType;
      pauseAfterFirstCheckpoint?: boolean;
    }
  ): Promise<RunDetailPayload> {
    return requestJson(`/api/integrations/${encodeURIComponent(integrationId)}/runs`, actorId, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  getRun(actorId: string, runId: string): Promise<RunDetailPayload> {
    return requestJson(`/api/runs/${encodeURIComponent(runId)}`, actorId);
  },

  controlRun(
    actorId: string,
    runId: string,
    command: 'pause' | 'resume' | 'cancel' | 'retry',
    options: { failureInjection?: FailureInjectionType; operationId?: string } = {}
  ): Promise<RunDetailPayload> {
    return requestJson(`/api/runs/${encodeURIComponent(runId)}/control`, actorId, {
      method: 'POST',
      body: JSON.stringify({ command, ...options }),
    });
  },

  injectRunFault(
    actorId: string,
    runId: string,
    failureInjection: FailureInjectionType
  ): Promise<RunDetailPayload> {
    return requestJson(`/api/runs/${encodeURIComponent(runId)}/inject-fault`, actorId, {
      method: 'POST',
      body: JSON.stringify({ failureInjection }),
    });
  },

  submitApproval(
    actorId: string,
    runId: string,
    approvalId: string,
    decision: 'approve' | 'request_changes' | 'reject',
    feedback?: string
  ): Promise<RunDetailPayload> {
    return requestJson(
      `/api/runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approvalId)}`,
      actorId,
      {
        method: 'POST',
        body: JSON.stringify({ decision, feedback }),
      }
    );
  },

  saveArtifact(
    actorId: string,
    runId: string,
    input: { path: string; content: string; restoreGenerated?: boolean }
  ): Promise<{
    artifact: CodeArtifact;
    run: GenerationRun;
    artifacts: CodeArtifact[];
    traces: TraceEvent[];
  }> {
    return requestJson(`/api/runs/${encodeURIComponent(runId)}/artifacts`, actorId, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  async downloadRunZip(actorId: string, runId: string, fallbackFilename: string): Promise<void> {
    const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/zip`, {
      headers: { 'x-developer-id': actorId },
    });
    if (!res.ok) {
      throw new ClientApiError(res.status, 'ZIP_DOWNLOAD_FAILED', 'Unable to download integration ZIP package.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fallbackFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  getTraces(
    actorId: string,
    filters: {
      runId?: string;
      integrationId?: string;
      agentId?: string;
      level?: string;
      search?: string;
    } = {}
  ): Promise<{ traces: TraceEvent[] }> {
    const qs = new URLSearchParams();
    if (filters.runId) qs.set('runId', filters.runId);
    if (filters.integrationId) qs.set('integrationId', filters.integrationId);
    if (filters.agentId) qs.set('agentId', filters.agentId);
    if (filters.level) qs.set('level', filters.level);
    if (filters.search) qs.set('search', filters.search);
    return requestJson(`/api/traces?${qs.toString()}`, actorId);
  },

  resetWorkspace(actorId: string): Promise<{ ok: boolean }> {
    return requestJson('/api/workspace/reset', actorId, { method: 'POST' });
  },
};

export const UI_LAYER_OPTIONS: Array<{ value: UILayer; label: string; hint: string }> = [
  {
    value: 'developer_console',
    label: 'Developer Console',
    hint: 'Admin & developer inspection views inside CloudEagle platform',
  },
  {
    value: 'api_only',
    label: 'API-only',
    hint: 'Headless backend collector invoked by scheduled sync pipelines',
  },
  {
    value: 'workflow_automation',
    label: 'Workflow Automation',
    hint: 'Provisioning/deprovisioning & SaaS governance playbooks',
  },
  {
    value: 'embedded_ui',
    label: 'Embedded End-User UI',
    hint: 'Self-service app catalog & access request widgets',
  },
  {
    value: 'chatbot',
    label: 'Chatbot',
    hint: 'Conversational Slack/Teams assistant status & lookup actions',
  },
];

export function formatUiLayer(layer: UILayer): string {
  return UI_LAYER_OPTIONS.find((o) => o.value === layer)?.label ?? layer;
}

export function formatIntegrationStatus(status: Integration['status']): string {
  const map: Record<Integration['status'], string> = {
    catalog_reference: 'Catalog Reference',
    draft: 'Draft',
    docs_validated: 'Docs Validated',
    generating: 'Generating',
    awaiting_approval: 'Awaiting Approval',
    paused: 'Paused at Checkpoint',
    generated: 'Generated',
    validated_fixtures: 'Validated (Fixtures)',
    failed: 'Failed',
    blocked: 'Blocked',
    archived: 'Archived',
  };
  return map[status] ?? status;
}

export function formatRunStatus(status: GenerationRun['status']): string {
  const map: Record<GenerationRun['status'], string> = {
    draft: 'Draft',
    validating: 'Validating Docs',
    awaiting_model: 'Awaiting Model',
    queued: 'Queued',
    running: 'Running',
    awaiting_approval: 'Waiting Human Approval',
    paused: 'Paused (Durable Checkpoint)',
    generated: 'Code Generated',
    validated: 'Fixture Validated',
    ready_for_review: 'Generated & Fixture-Validated',
    failed: 'Failed',
    cancelled: 'Cancelled',
    blocked: 'Blocked',
  };
  return map[status] ?? status;
}

export function formatShortDate(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}
