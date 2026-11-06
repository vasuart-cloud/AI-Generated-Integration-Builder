import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  AgentStep,
  Approval,
  AuditEvent,
  Category,
  CodeArtifact,
  CollectorConfig,
  Developer,
  DeveloperPreferences,
  DocumentationValidation,
  FailureInjectionType,
  GenerationRun,
  Integration,
  TraceEvent,
  UILayer,
} from '../shared/types';
import {
  discoverCapabilitiesFromValidation,
  SEEDED_CATEGORIES,
  SEEDED_DEVELOPERS,
  SEEDED_SYSTEM_INTEGRATIONS,
} from './calendlyFixture';
import { verifyCodeArtifacts } from './codeGenerator';
import { getModelRegistry } from './modelRegistry';
import { executeSandboxTests, evaluateProductionReadiness } from './sandboxRunner';
import { evaluateIntegrationAccess, redactSensitiveData } from './security';
import {
  advanceGenerationRun,
  AGENT_PIPELINE,
  canTransitionRunStatus,
  createInitialAgentSteps,
} from './stateMachine';

export class StudioHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    message: string
  ) {
    super(message);
    this.name = 'StudioHttpError';
  }
}

export interface PersistedState {
  developers: Developer[];
  categories: Category[];
  integrations: Integration[];
  validations: DocumentationValidation[];
  runs: GenerationRun[];
  agentSteps: AgentStep[];
  approvals: Approval[];
  artifacts: CodeArtifact[];
  traces: TraceEvent[];
  audits: AuditEvent[];
}

function createInitialSeedState(): PersistedState {
  return {
    developers: structuredClone(SEEDED_DEVELOPERS),
    categories: structuredClone(SEEDED_CATEGORIES),
    integrations: structuredClone(SEEDED_SYSTEM_INTEGRATIONS),
    validations: [],
    runs: [],
    agentSteps: [],
    approvals: [],
    artifacts: [],
    traces: [],
    audits: [
      {
        id: 'aud-seed-init',
        actorId: 'system',
        actorName: 'CloudEagle Platform',
        action: 'catalog.seeded',
        targetType: 'integration',
        targetId: 'catalog',
        summary: 'Seeded 7 immutable system catalog integrations across CRM, Messaging, and Collaboration.',
        time: '2026-10-30T08:00:00.000Z',
      },
    ],
  };
}

export class StudioStore {
  private state: PersistedState;
  private readonly filePath: string | null;

  constructor(options: { filePath?: string | null } = {}) {
    this.filePath =
      options.filePath === undefined
        ? path.resolve(process.cwd(), '.data', 'studio-store.json')
        : options.filePath;

    if (this.filePath && fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw) as PersistedState;
        this.state = {
          ...createInitialSeedState(),
          ...parsed,
        };
        // Ensure seeded system integrations always remain intact and immutable
        for (const sysInt of SEEDED_SYSTEM_INTEGRATIONS) {
          const idx = this.state.integrations.findIndex((i) => i.id === sysInt.id);
          if (idx === -1) {
            this.state.integrations.unshift(structuredClone(sysInt));
          } else {
            this.state.integrations[idx] = {
              ...structuredClone(sysInt),
            };
          }
        }
      } catch {
        this.state = createInitialSeedState();
        this.persist();
      }
    } else {
      this.state = createInitialSeedState();
      this.persist();
    }
  }

  private persist(): void {
    if (!this.filePath) return;
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.filePath);
  }

  public resetDemoWorkspace(actorId: string): void {
    const actor = this.getDeveloperOrThrow(actorId);
    this.state = createInitialSeedState();
    this.recordAudit(actor, 'workspace.reset', 'integration', 'workspace', 'Reset demo workspace to clean initial seed.');
    this.persist();
  }

  public getDevelopers(): Developer[] {
    return this.state.developers;
  }

  public getDeveloperOrThrow(actorId: string): Developer {
    const dev = this.state.developers.find((d) => d.id === actorId);
    if (!dev) {
      throw new StudioHttpError(401, 'UNKNOWN_DEVELOPER', `Unrecognized developer session "${actorId}".`);
    }
    return dev;
  }

  public updateDeveloperPreferences(
    actorId: string,
    patch: Partial<DeveloperPreferences>
  ): Developer {
    const dev = this.getDeveloperOrThrow(actorId);
    dev.preferences = {
      ...dev.preferences,
      ...patch,
    };
    this.persist();
    return dev;
  }

  private recordAudit(
    actor: Developer,
    action: string,
    targetType: AuditEvent['targetType'],
    targetId: string,
    summary: string
  ): void {
    this.state.audits.unshift({
      id: `aud-${crypto.randomUUID().slice(0, 8)}`,
      actorId: actor.id,
      actorName: actor.name,
      action,
      targetType,
      targetId,
      summary,
      time: new Date().toISOString(),
    });
  }

  public getCategories(): Category[] {
    return this.state.categories;
  }

  public createCategory(
    actorId: string,
    input: { name: string; description: string }
  ): Category {
    const actor = this.getDeveloperOrThrow(actorId);
    const trimmedName = (input.name ?? '').trim();
    const trimmedDesc = (input.description ?? '').trim();

    if (!trimmedName || trimmedName.length < 2) {
      throw new StudioHttpError(400, 'INVALID_CATEGORY_NAME', 'Category name must be at least 2 characters.');
    }
    if (!trimmedDesc) {
      throw new StudioHttpError(400, 'INVALID_CATEGORY_DESC', 'Category description is required.');
    }

    const duplicate = this.state.categories.some(
      (c) => c.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      throw new StudioHttpError(
        409,
        'DUPLICATE_CATEGORY',
        `A category named "${trimmedName}" already exists in this workspace.`
      );
    }

    const category: Category = {
      id: `cat-${trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID().slice(0, 4)}`,
      name: trimmedName,
      description: trimmedDesc,
      createdBy: actor.id,
      createdAt: new Date().toISOString(),
    };

    this.state.categories.push(category);
    this.recordAudit(actor, 'category.created', 'category', category.id, `Created category "${category.name}".`);
    this.persist();
    return category;
  }

  public listIntegrations(includeArchived = false): Integration[] {
    return this.state.integrations.filter((i) => includeArchived || i.status !== 'archived');
  }

  public getIntegrationOrThrow(id: string): Integration {
    const found = this.state.integrations.find((i) => i.id === id);
    if (!found) {
      throw new StudioHttpError(404, 'INTEGRATION_NOT_FOUND', `Integration "${id}" was not found.`);
    }
    return found;
  }

  public createCustomIntegrationDraft(
    actorId: string,
    input: {
      name: string;
      description: string;
      categoryId: string;
      uiLayers?: UILayer[];
    }
  ): Integration {
    // CRITICAL: Owner is ALWAYS derived from server session actorId, ignoring any client ownerId payload.
    const actor = this.getDeveloperOrThrow(actorId);
    const name = (input.name ?? '').trim();
    const description = (input.description ?? '').trim();
    const categoryId = (input.categoryId ?? '').trim();
    const uiLayers = Array.isArray(input.uiLayers) ? Array.from(new Set(input.uiLayers)) : [];

    if (!name) {
      throw new StudioHttpError(400, 'NAME_REQUIRED', 'Integration name is required.');
    }
    if (name.length > 64) {
      throw new StudioHttpError(400, 'NAME_TOO_LONG', 'Integration name must be 64 characters or fewer.');
    }
    if (!description || description.length < 8) {
      throw new StudioHttpError(
        400,
        'DESCRIPTION_REQUIRED',
        'Provide a clear description (at least 8 characters) of what app/capability this integration connects.'
      );
    }
    const category = this.state.categories.find((c) => c.id === categoryId);
    if (!category) {
      throw new StudioHttpError(400, 'INVALID_CATEGORY', 'Selected category does not exist.');
    }

    const duplicate = this.state.integrations.find(
      (i) => i.status !== 'archived' && i.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      throw new StudioHttpError(
        409,
        'DUPLICATE_INTEGRATION_NAME',
        `An active integration named "${duplicate.name}" already exists in this workspace.`
      );
    }

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const now = new Date().toISOString();

    const integration: Integration = {
      id: `int-${slug}-${crypto.randomUUID().slice(0, 6)}`,
      name,
      slug,
      iconKey: slug.includes('calendly') ? 'calendly' : 'custom',
      description,
      categoryId,
      uiLayers,
      ownerId: actor.id,
      sourceType: 'custom',
      isDefault: false,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    this.state.integrations.unshift(integration);
    this.recordAudit(
      actor,
      'integration.draft_created',
      'integration',
      integration.id,
      `Created custom draft integration "${integration.name}" in ${category.name}.`
    );
    this.persist();
    return integration;
  }

  public updateCustomIntegration(
    actorId: string,
    integrationId: string,
    patch: {
      name?: string;
      description?: string;
      categoryId?: string;
      uiLayers?: UILayer[];
    }
  ): Integration {
    const actor = this.getDeveloperOrThrow(actorId);
    const integration = this.getIntegrationOrThrow(integrationId);
    const access = evaluateIntegrationAccess(actor.id, integration);

    if (!access.canEdit) {
      throw new StudioHttpError(403, 'FORBIDDEN_INTEGRATION_MUTATION', access.reason);
    }

    if (patch.name !== undefined) {
      const nextName = patch.name.trim();
      if (!nextName) {
        throw new StudioHttpError(400, 'NAME_REQUIRED', 'Integration name cannot be empty.');
      }
      const dup = this.state.integrations.find(
        (i) =>
          i.id !== integration.id &&
          i.status !== 'archived' &&
          i.name.toLowerCase() === nextName.toLowerCase()
      );
      if (dup) {
        throw new StudioHttpError(409, 'DUPLICATE_INTEGRATION_NAME', `Integration "${nextName}" already exists.`);
      }
      integration.name = nextName;
    }

    if (patch.description !== undefined) {
      const nextDesc = patch.description.trim();
      if (nextDesc.length < 8) {
        throw new StudioHttpError(400, 'DESCRIPTION_REQUIRED', 'Description must be at least 8 characters.');
      }
      integration.description = nextDesc;
    }

    if (patch.categoryId !== undefined) {
      const cat = this.state.categories.find((c) => c.id === patch.categoryId);
      if (!cat) {
        throw new StudioHttpError(400, 'INVALID_CATEGORY', 'Selected category does not exist.');
      }
      integration.categoryId = patch.categoryId;
    }

    if (patch.uiLayers !== undefined) {
      if (patch.uiLayers.length === 0) {
        throw new StudioHttpError(400, 'UI_LAYER_REQUIRED', 'At least one UI layer is required.');
      }
      integration.uiLayers = Array.from(new Set(patch.uiLayers));
    }

    integration.version += 1;
    integration.updatedAt = new Date().toISOString();

    this.recordAudit(
      actor,
      'integration.metadata_updated',
      'integration',
      integration.id,
      `Updated metadata for "${integration.name}" (v${integration.version}).`
    );
    this.persist();
    return integration;
  }

  public archiveOrSoftDeleteIntegration(
    actorId: string,
    integrationId: string,
    mode: 'archive' | 'soft_delete'
  ): Integration {
    const actor = this.getDeveloperOrThrow(actorId);
    const integration = this.getIntegrationOrThrow(integrationId);
    const access = evaluateIntegrationAccess(actor.id, integration);

    if (!access.canArchiveOrDelete) {
      throw new StudioHttpError(403, 'FORBIDDEN_INTEGRATION_DELETE', access.reason);
    }

    const activeRun = this.state.runs.find(
      (r) =>
        r.integrationId === integration.id &&
        (r.status === 'running' || r.status === 'queued' || r.status === 'awaiting_approval')
    );

    if (activeRun && mode === 'soft_delete') {
      throw new StudioHttpError(
        409,
        'ACTIVE_RUN_DEPENDENCY',
        `Cannot delete "${integration.name}" while generation run ${activeRun.id} is active (${activeRun.status}). Cancel the run first or archive instead.`
      );
    }

    integration.status = 'archived';
    integration.updatedAt = new Date().toISOString();
    integration.version += 1;

    this.recordAudit(
      actor,
      mode === 'archive' ? 'integration.archived' : 'integration.soft_deleted',
      'integration',
      integration.id,
      `${mode === 'archive' ? 'Archived' : 'Soft-deleted'} custom integration "${integration.name}" while retaining audit & run history.`
    );
    this.persist();
    return integration;
  }

  public saveValidationResult(
    actorId: string,
    validation: DocumentationValidation
  ): {
    validation: DocumentationValidation;
    capabilities?: ReturnType<typeof discoverCapabilitiesFromValidation>;
  } {
    const actor = this.getDeveloperOrThrow(actorId);
    const integration = this.getIntegrationOrThrow(validation.integrationId);
    const access = evaluateIntegrationAccess(actor.id, integration);
    if (!access.canEdit) {
      throw new StudioHttpError(403, 'FORBIDDEN_VALIDATION', access.reason);
    }

    this.state.validations.unshift(validation);

    let capabilities: ReturnType<typeof discoverCapabilitiesFromValidation> | undefined;
    if (validation.result === 'valid') {
      capabilities = discoverCapabilitiesFromValidation(validation);
      integration.apiDocSource = {
        mode: validation.mode,
        url: validation.sourceUrl,
        validatedValidationId: validation.id,
        validatedHash: validation.hash,
      };
      integration.collectorConfig = integration.collectorConfig ?? capabilities.defaultConfig;
      if (integration.status === 'draft') {
        integration.status = 'docs_validated';
      }
      integration.updatedAt = new Date().toISOString();
    }

    // Record validation trace event for observability
    this.state.traces.unshift({
      id: `trc-${crypto.randomUUID().slice(0, 10)}`,
      runId: integration.latestRunId ?? `doccheck-${integration.id}`,
      integrationId: integration.id,
      level: validation.result === 'valid' ? 'info' : validation.result === 'partial' ? 'warn' : 'error',
      type: 'doc_validation',
      message: `Documentation check (${validation.mode}): ${validation.summaryMessage}`,
      requestId: `req-${crypto.randomUUID().slice(0, 8)}`,
      errorClassification:
        validation.result === 'valid' ? undefined : `DOC_VALIDATION_${validation.result.toUpperCase()}`,
      recommendedAction:
        validation.result === 'valid'
          ? 'Proceed to Capability Discovery and select an approved Company LLM.'
          : 'Provide a valid HTTPS API reference URL, paste an OpenAPI specification, or select the curated Calendly demo fixture.',
      sanitizedMetadata: redactSensitiveData({
        sourceUrl: validation.sourceUrl,
        hash: validation.hash,
        result: validation.result,
        endpointsCount: validation.evidence.documentedEndpoints.length,
      }),
      timestamp: validation.checkedAt,
    });

    this.recordAudit(
      actor,
      `docs.validated_${validation.result}`,
      'validation',
      validation.id,
      `Validated documentation for "${integration.name}" (${validation.mode} -> ${validation.result}).`
    );
    this.persist();
    return { validation, capabilities };
  }

  public confirmPrototypeMode(
    actorId: string,
    integrationId: string
  ): {
    validation: DocumentationValidation;
    capabilities: ReturnType<typeof discoverCapabilitiesFromValidation>;
    integration: Integration;
  } {
    const actor = this.getDeveloperOrThrow(actorId);
    const integration = this.getIntegrationOrThrow(integrationId);
    const access = evaluateIntegrationAccess(actor.id, integration);
    if (!access.canEdit) {
      throw new StudioHttpError(403, 'FORBIDDEN_PROTOTYPE_CONFIRM', access.reason);
    }

    const latest = this.listValidationsForIntegration(integration.id)[0];
    if (!latest) {
      throw new StudioHttpError(404, 'NO_VALIDATION_FOUND', 'Validate documentation before confirming prototype mode.');
    }

    latest.result = 'valid';
    latest.validationMode = 'prototype_mode';
    latest.prototypeConfirmed = true;
    latest.summaryMessage =
      'Prototype Mode active: Endpoint extraction incomplete; standard prototype capabilities approved with developer oversight.';

    const capabilities = discoverCapabilitiesFromValidation(latest);
    integration.apiDocSource = {
      mode: latest.mode,
      url: latest.sourceUrl,
      validatedValidationId: latest.id,
      validatedHash: latest.hash,
    };
    integration.collectorConfig = integration.collectorConfig ?? capabilities.defaultConfig;
    integration.status = 'docs_validated';
    integration.updatedAt = new Date().toISOString();

    this.state.traces.unshift({
      id: `trc-${crypto.randomUUID().slice(0, 10)}`,
      runId: integration.latestRunId ?? `doccheck-${integration.id}`,
      integrationId: integration.id,
      level: 'info',
      type: 'doc_validation',
      message: `${actor.name} confirmed Prototype Mode for "${integration.name}". Endpoint extraction incomplete; continuing with documented prototype capabilities under developer oversight.`,
      requestId: `req-${crypto.randomUUID().slice(0, 8)}`,
      sanitizedMetadata: {
        sourceUrl: latest.sourceUrl,
        mode: latest.mode,
        prototypeConfirmed: true,
      },
      timestamp: new Date().toISOString(),
    });

    this.recordAudit(
      actor,
      'docs.prototype_confirmed',
      'validation',
      latest.id,
      `Confirmed prototype mode for "${integration.name}".`
    );
    this.persist();
    return { validation: latest, capabilities, integration };
  }

  public getLatestValidValidation(integrationId: string): DocumentationValidation | undefined {
    const integration = this.getIntegrationOrThrow(integrationId);
    if (integration.apiDocSource?.validatedValidationId) {
      return this.state.validations.find((v) => v.id === integration.apiDocSource?.validatedValidationId);
    }
    return this.state.validations.find(
      (v) => v.integrationId === integrationId && v.result === 'valid'
    );
  }

  public listValidationsForIntegration(integrationId: string): DocumentationValidation[] {
    return this.state.validations.filter((v) => v.integrationId === integrationId);
  }

  public async startGenerationRun(
    actorId: string,
    input: {
      integrationId: string;
      modelProvider: GenerationRun['modelProvider'];
      modelId: string;
      collectorConfig: CollectorConfig;
      operationId?: string;
      failureInjection?: FailureInjectionType;
      pauseAfterFirstCheckpoint?: boolean;
    }
  ): Promise<GenerationRun> {
    const actor = this.getDeveloperOrThrow(actorId);
    const integration = this.getIntegrationOrThrow(input.integrationId);
    const access = evaluateIntegrationAccess(actor.id, integration);
    if (!access.canEdit) {
      throw new StudioHttpError(403, 'FORBIDDEN_START_RUN', access.reason);
    }

    // Hard gate: validated documentation is mandatory
    const validation = this.getLatestValidValidation(integration.id);
    if (!validation || validation.result !== 'valid') {
      throw new StudioHttpError(
        422,
        'DOCS_NOT_VALIDATED',
        'Cannot start code generation until API documentation passes validation.'
      );
    }

    // Idempotency check via operationId
    if (input.operationId) {
      const existingByOp = this.state.runs.find((r) =>
        r.operationTokens.includes(input.operationId as string)
      );
      if (existingByOp) {
        return existingByOp;
      }
    }

    // Model Registry enforcement: must be an allowed, configured model!
    const registry = getModelRegistry();
    const selectedModel = registry.find(
      (m) => m.provider === input.modelProvider && m.modelId === input.modelId
    );
    if (!selectedModel) {
      throw new StudioHttpError(
        400,
        'UNKNOWN_MODEL',
        `Model "${input.modelProvider}:${input.modelId}" is not in the server Model Registry.`
      );
    }
    if (!selectedModel.configured || !selectedModel.allowed) {
      throw new StudioHttpError(
        422,
        'MODEL_NOT_CONFIGURED',
        selectedModel.disabledReason || `Model "${selectedModel.label}" is not configured by your administrator.`
      );
    }

    // Scope safety: read-only scopes only in MVP
    const unsafeScope = input.collectorConfig.scopes.find((s) =>
      /\b(write|delete|admin:write|manage|destroy)\b/i.test(s)
    );
    if (unsafeScope) {
      throw new StudioHttpError(
        422,
        'UNSAFE_WRITE_SCOPE',
        `Scope "${unsafeScope}" violates least-privilege read-only MVP policy.`
      );
    }

    const now = new Date().toISOString();
    const runId = `run-${crypto.randomUUID().slice(0, 8)}`;

    const run: GenerationRun = {
      id: runId,
      integrationId: integration.id,
      actorId: actor.id,
      validationId: validation.id,
      modelProvider: selectedModel.provider,
      modelId: selectedModel.modelId,
      modelLabel: selectedModel.label,
      isSimulatedModel: selectedModel.isSimulated,
      status: 'queued',
      pauseRequested: Boolean(input.pauseAfterFirstCheckpoint),
      currentStage: 'orchestrator',
      checkpointVersion: 0,
      completedSubtasks: [],
      collectorConfig: input.collectorConfig,
      codeVersion: 1,
      activeFailureInjection: input.failureInjection ?? 'none',
      verificationResults: [],
      operationTokens: input.operationId ? [input.operationId] : [],
      startedAt: now,
      updatedAt: now,
    };

    const steps = createInitialAgentSteps(run);
    this.state.runs.unshift(run);
    this.state.agentSteps.push(...steps);

    integration.collectorConfig = input.collectorConfig;
    integration.latestRunId = run.id;
    integration.updatedAt = now;

    this.recordAudit(
      actor,
      'run.started',
      'run',
      run.id,
      `Started multi-agent generation run ${run.id} for "${integration.name}" with ${selectedModel.label}.`
    );

    // If pauseAfterFirstCheckpoint is requested, complete Orchestrator checkpoint then pause cleanly!
    if (input.pauseAfterFirstCheckpoint) {
      run.pauseRequested = false;
      const firstOnlySteps = steps.slice(0, 1);
      // Let orchestrator complete and pause before doc_analyst
      const runProxy = run;
      const stepsForRun = this.getRunSteps(run.id);
      const approvalsForRun = this.getRunApprovals(run.id);
      const artifactsForRun = this.getRunArtifacts(run.id);
      const tempTraces: TraceEvent[] = [];

      // Complete Orchestrator step then set pauseRequested = true before step 2
      firstOnlySteps[0].status = 'succeeded';
      firstOnlySteps[0].startedAt = now;
      firstOnlySteps[0].completedAt = new Date().toISOString();
      firstOnlySteps[0].durationMs = 32;
      firstOnlySteps[0].inputsRef = [`validation:${validation.id}`, `model:${run.modelId}`];
      firstOnlySteps[0].outputsRef = ['execution_dag_v1', 'checkpoint_manifest'];
      firstOnlySteps[0].checkpointKey = `ckpt-${run.id}-v1`;
      firstOnlySteps[0].decisionStatus = 'Checkpoint persisted';
      firstOnlySteps[0].activitySummary = `Initialized 8-stage execution graph for ${integration.name} and persisted checkpoint v1.`;
      runProxy.checkpointVersion = 1;
      runProxy.completedSubtasks.push('agent:orchestrator');
      runProxy.pauseRequested = true;

      await advanceGenerationRun({
        integration,
        ownerName: actor.name,
        validation,
        run: runProxy,
        steps: stepsForRun,
        approvals: approvalsForRun,
        artifacts: artifactsForRun,
        traces: tempTraces,
      });

      this.syncRunCollections(run.id, approvalsForRun, artifactsForRun, tempTraces);
      this.persist();
      return run;
    }

    await this.driveRun(run, integration, actor, validation);
    this.persist();
    return run;
  }

  private async driveRun(
    run: GenerationRun,
    integration: Integration,
    actor: Developer,
    validation: DocumentationValidation
  ): Promise<void> {
    const stepsForRun = this.getRunSteps(run.id);
    const approvalsForRun = this.getRunApprovals(run.id);
    const artifactsForRun = this.getRunArtifacts(run.id);
    const newTraces: TraceEvent[] = [];

    await advanceGenerationRun({
      integration,
      ownerName: actor.name,
      validation,
      run,
      steps: stepsForRun,
      approvals: approvalsForRun,
      artifacts: artifactsForRun,
      traces: newTraces,
    });

    this.syncRunCollections(run.id, approvalsForRun, artifactsForRun, newTraces);
  }

  private syncRunCollections(
    runId: string,
    approvalsForRun: Approval[],
    artifactsForRun: CodeArtifact[],
    newTraces: TraceEvent[]
  ): void {
    this.state.approvals = [
      ...this.state.approvals.filter((a) => a.runId !== runId),
      ...approvalsForRun,
    ];
    this.state.artifacts = [
      ...this.state.artifacts.filter((a) => a.runId !== runId),
      ...artifactsForRun,
    ];
    if (newTraces.length > 0) {
      this.state.traces.unshift(...newTraces.reverse());
    }
  }

  public getRunOrThrow(runId: string): GenerationRun {
    const run = this.state.runs.find((r) => r.id === runId);
    if (!run) {
      throw new StudioHttpError(404, 'RUN_NOT_FOUND', `Generation run "${runId}" was not found.`);
    }
    return run;
  }

  public listRuns(integrationId?: string): GenerationRun[] {
    if (!integrationId) return this.state.runs;
    return this.state.runs.filter((r) => r.integrationId === integrationId);
  }

  public getRunSteps(runId: string): AgentStep[] {
    return this.state.agentSteps
      .filter((s) => s.runId === runId)
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  }

  public getRunApprovals(runId: string): Approval[] {
    return this.state.approvals.filter((a) => a.runId === runId);
  }

  public getRunArtifacts(runId: string): CodeArtifact[] {
    return this.state.artifacts.filter((a) => a.runId === runId);
  }

  public async controlRun(
    actorId: string,
    runId: string,
    command: 'pause' | 'resume' | 'cancel' | 'retry',
    options: { failureInjection?: FailureInjectionType; operationId?: string } = {}
  ): Promise<GenerationRun> {
    const actor = this.getDeveloperOrThrow(actorId);
    const run = this.getRunOrThrow(runId);
    const integration = this.getIntegrationOrThrow(run.integrationId);
    const access = evaluateIntegrationAccess(actor.id, integration);
    if (!access.canEdit) {
      throw new StudioHttpError(403, 'FORBIDDEN_RUN_CONTROL', access.reason);
    }

    if (options.operationId && run.operationTokens.includes(options.operationId)) {
      return run;
    }
    if (options.operationId) {
      run.operationTokens.push(options.operationId);
    }

    if (options.failureInjection !== undefined) {
      run.activeFailureInjection = options.failureInjection;
    }

    const validation = this.state.validations.find((v) => v.id === run.validationId);
    if (!validation) {
      throw new StudioHttpError(404, 'VALIDATION_MISSING', 'Associated documentation validation record missing.');
    }

    if (command === 'pause') {
      if (run.status === 'cancelled' || run.status === 'ready_for_review') {
        throw new StudioHttpError(409, 'INVALID_PAUSE_STATE', `Cannot pause a run in "${run.status}" state.`);
      }
      if (!canTransitionRunStatus(run.status, 'paused')) {
        throw new StudioHttpError(409, 'INVALID_STATE_TRANSITION', `Transition ${run.status} -> paused is not allowed.`);
      }
      run.status = 'paused';
      run.pauseRequested = false;
      integration.status = 'paused';
      run.updatedAt = new Date().toISOString();
      const steps = this.getRunSteps(run.id);
      const currentStep = steps.find((s) => s.agentId === run.currentStage);
      if (currentStep && currentStep.status === 'queued') {
        currentStep.status = 'paused';
      }
      this.state.traces.unshift({
        id: `trc-${crypto.randomUUID().slice(0, 10)}`,
        runId: run.id,
        integrationId: integration.id,
        agentId: run.currentStage,
        level: 'info',
        type: 'state_transition',
        message: `Developer paused run ${run.id} at checkpoint v${run.checkpointVersion}. Completed files and approvals are durably retained.`,
        requestId: `req-${crypto.randomUUID().slice(0, 8)}`,
        sanitizedMetadata: { checkpointVersion: run.checkpointVersion, currentStage: run.currentStage },
        timestamp: run.updatedAt,
      });
      this.recordAudit(actor, 'run.paused', 'run', run.id, `Paused run ${run.id} at checkpoint v${run.checkpointVersion}.`);
      this.persist();
      return run;
    }

    if (command === 'cancel') {
      if (run.status === 'cancelled') {
        return run;
      }
      run.status = 'cancelled';
      run.pauseRequested = false;
      run.updatedAt = new Date().toISOString();
      for (const s of this.getRunSteps(run.id)) {
        if (s.status === 'queued' || s.status === 'running' || s.status === 'paused' || s.status === 'waiting_approval') {
          s.status = 'cancelled';
          s.decisionStatus = 'Cancelled by developer';
        }
      }
      integration.status = this.getRunArtifacts(run.id).length > 0 ? 'generated' : 'docs_validated';
      this.state.traces.unshift({
        id: `trc-${crypto.randomUUID().slice(0, 10)}`,
        runId: run.id,
        integrationId: integration.id,
        level: 'warn',
        type: 'state_transition',
        message: `Run ${run.id} permanently cancelled by ${actor.name}. Pending stages aborted; ${this.getRunArtifacts(run.id).length} draft artifact(s) and audit history retained.`,
        requestId: `req-${crypto.randomUUID().slice(0, 8)}`,
        sanitizedMetadata: { retainedArtifacts: this.getRunArtifacts(run.id).length },
        timestamp: run.updatedAt,
      });
      this.recordAudit(actor, 'run.cancelled', 'run', run.id, `Permanently cancelled run ${run.id}.`);
      this.persist();
      return run;
    }

    if (command === 'resume') {
      if (run.status === 'cancelled') {
        throw new StudioHttpError(409, 'CANNOT_RESUME_CANCELLED', 'Cancelled runs are permanently terminated and cannot be resumed.');
      }
      if (run.status === 'awaiting_approval') {
        throw new StudioHttpError(
          409,
          'APPROVAL_REQUIRED_BEFORE_RESUME',
          'Run is waiting at a mandatory human approval gate. Submit an approval decision to continue.'
        );
      }
      if (run.status !== 'paused') {
        throw new StudioHttpError(409, 'RUN_NOT_PAUSED', `Run is currently "${run.status}", not paused.`);
      }

      for (const s of this.getRunSteps(run.id)) {
        if (s.status === 'paused') {
          s.status = 'queued';
        }
      }

      this.state.traces.unshift({
        id: `trc-${crypto.randomUUID().slice(0, 10)}`,
        runId: run.id,
        integrationId: integration.id,
        agentId: run.currentStage,
        level: 'info',
        type: 'state_transition',
        message: `Resuming run ${run.id} from durable checkpoint v${run.checkpointVersion} (${run.completedSubtasks.length} completed subtasks preserved).`,
        requestId: `req-${crypto.randomUUID().slice(0, 8)}`,
        sanitizedMetadata: { checkpointVersion: run.checkpointVersion, resumeStage: run.currentStage },
        timestamp: new Date().toISOString(),
      });
      this.recordAudit(actor, 'run.resumed', 'run', run.id, `Resumed run ${run.id} from checkpoint v${run.checkpointVersion}.`);

      await this.driveRun(run, integration, actor, validation);
      this.persist();
      return run;
    }

    // command === 'retry'
    if (run.status !== 'failed' && run.status !== 'blocked') {
      throw new StudioHttpError(409, 'RUN_NOT_FAILED', `Retry Step is only valid for failed or blocked runs (current: ${run.status}).`);
    }

    const steps = this.getRunSteps(run.id);
    for (const s of steps) {
      if (s.status === 'failed') {
        s.status = 'queued';
        s.errorDetail = undefined;
      }
    }
    run.status = 'running';
    run.failureBanner = undefined;

    this.state.traces.unshift({
      id: `trc-${crypto.randomUUID().slice(0, 10)}`,
      runId: run.id,
      integrationId: integration.id,
      agentId: run.currentStage,
      level: 'info',
      type: 'state_transition',
      message: `Retrying failed stage (${run.currentStage}) from checkpoint v${run.checkpointVersion} with previous stages preserved.`,
      requestId: `req-${crypto.randomUUID().slice(0, 8)}`,
      sanitizedMetadata: {
        checkpointVersion: run.checkpointVersion,
        activeFailureInjection: run.activeFailureInjection,
      },
      timestamp: new Date().toISOString(),
    });
    this.recordAudit(actor, 'run.step_retried', 'run', run.id, `Retried stage ${run.currentStage} on run ${run.id}.`);

    await this.driveRun(run, integration, actor, validation);
    this.persist();
    return run;
  }

  public async setRunFailureInjection(
    actorId: string,
    runId: string,
    failureInjection: FailureInjectionType
  ): Promise<GenerationRun> {
    const actor = this.getDeveloperOrThrow(actorId);
    const run = this.getRunOrThrow(runId);
    const integration = this.getIntegrationOrThrow(run.integrationId);
    const access = evaluateIntegrationAccess(actor.id, integration);
    if (!access.canEdit) {
      throw new StudioHttpError(403, 'FORBIDDEN_FAULT_INJECTION', access.reason);
    }

    run.activeFailureInjection = failureInjection;
    run.updatedAt = new Date().toISOString();

    // If the run was already completed (`ready_for_review`) and the developer injects a runtime/test/security fault in Demo Lab,
    // genuinely re-run the affected verification/security stage so the run transitions to failed/blocked with a trace!
    if (failureInjection !== 'none' && (run.status === 'ready_for_review' || run.status === 'validated')) {
      const steps = this.getRunSteps(run.id);
      // Resolve fault scenarios to CURRENT pipeline agent IDs. Legacy IDs
      // (security_reviewer, test_packaging_agent, etc.) do not exist in the
      // seven-stage pipeline and previously caused simulated failures to be
      // silently skipped, leaving runs incorrectly marked ready_for_review.
      const targetAgent =
        failureInjection === 'auth_401' || failureInjection === 'permission_403'
          ? 'auth_client_agent'
          : failureInjection === 'provider_500' || failureInjection === 'model_unavailable'
          ? 'user_usage_agent'
          : failureInjection === 'interrupted_run'
          ? 'error_pagination_agent'
          : 'security_testing_agent';

      const targetOrder = AGENT_PIPELINE.find((p) => p.agentId === targetAgent)?.sequenceOrder;
      if (!targetOrder) {
        throw new StudioHttpError(500, 'INVALID_AGENT_PIPELINE', 'Could not resolve a current agent for fault injection.');
      }
      for (const s of steps) {
        if (s.sequenceOrder >= targetOrder) {
          s.status = 'queued';
          s.errorDetail = undefined;
        }
      }
      const validation = this.state.validations.find((v) => v.id === run.validationId);
      if (validation) {
        await this.driveRun(run, integration, actor, validation);
      }
    }

    this.persist();
    return run;
  }

  public async submitApprovalDecision(
    actorId: string,
    runId: string,
    approvalId: string,
    decision: 'approve' | 'request_changes' | 'reject',
    feedback?: string
  ): Promise<GenerationRun> {
    const actor = this.getDeveloperOrThrow(actorId);
    const run = this.getRunOrThrow(runId);
    const integration = this.getIntegrationOrThrow(run.integrationId);
    const access = evaluateIntegrationAccess(actor.id, integration);
    if (!access.canEdit) {
      throw new StudioHttpError(403, 'FORBIDDEN_APPROVAL', access.reason);
    }

    const approval = this.state.approvals.find((a) => a.id === approvalId && a.runId === run.id);
    if (!approval) {
      throw new StudioHttpError(404, 'APPROVAL_NOT_FOUND', `Approval gate "${approvalId}" not found.`);
    }
    if (approval.status === 'approved') {
      return run;
    }

    const now = new Date().toISOString();
    approval.reviewedBy = actor.name;
    approval.decisionAt = now;
    approval.feedback = feedback?.trim() || undefined;

    const steps = this.getRunSteps(run.id);
    const gateStep = steps.find((s) => s.agentId === approval.gateAgentId);

    const validation = this.state.validations.find((v) => v.id === run.validationId);
    if (!validation) {
      throw new StudioHttpError(404, 'VALIDATION_MISSING', 'Validation record missing for run.');
    }

    if (decision === 'reject') {
      approval.status = 'rejected';
      run.status = 'blocked';
      integration.status = 'blocked';
      run.updatedAt = now;
      if (gateStep) {
        gateStep.status = 'failed';
        gateStep.decisionStatus = 'Rejected by human reviewer';
      }
      const rejTrace: TraceEvent = {
        id: `trc-${crypto.randomUUID().slice(0, 10)}`,
        runId: run.id,
        integrationId: integration.id,
        agentId: approval.gateAgentId,
        level: 'warn',
        type: 'approval_gate',
        message: `${actor.name} rejected ${approval.title}${approval.feedback ? `: "${approval.feedback}"` : '.'}`,
        requestId: `req-${crypto.randomUUID().slice(0, 8)}`,
        errorClassification: 'HUMAN_APPROVAL_REJECTED',
        recommendedAction: 'Adjust configuration or retry gate if rejection was resolved.',
        sanitizedMetadata: redactSensitiveData({ approvalId: approval.id, stage: approval.stage, feedback: approval.feedback }),
        timestamp: now,
      };
      this.state.traces.unshift(rejTrace);
      run.failureBanner = {
        code: 'APPROVAL_REJECTED',
        title: `Human Review Rejected (${approval.stage})`,
        message: approval.feedback || 'Reviewer rejected checkpoint; downstream code generation blocked.',
        failedAgentId: approval.gateAgentId,
        remediation: 'Start a revised run or retry after updating parameters.',
        traceId: rejTrace.id,
      };
      this.recordAudit(actor, 'approval.rejected', 'approval', approval.id, `Rejected ${approval.title}.`);
      this.persist();
      return run;
    }

    if (decision === 'request_changes') {
      if (!approval.feedback) {
        throw new StudioHttpError(400, 'FEEDBACK_REQUIRED', 'Provide change feedback so the affected agent stage can re-run.');
      }
      approval.status = 'changes_requested';
      // Re-run ONLY the affected stage (and unstarted downstream stages), preserving upstream stages!
      if (gateStep) {
        gateStep.status = 'queued';
        gateStep.decisionStatus = 'Re-running with reviewer feedback';
      }
      if (approval.stage === 'code_security_review') {
        // Also re-queue client_code_agent & resilience_agent if code changes requested
        for (const s of steps) {
          if (
            s.agentId === 'client_code_agent' ||
            s.agentId === 'resilience_agent' ||
            s.agentId === 'security_reviewer'
          ) {
            s.status = 'queued';
          }
        }
      }

      this.state.traces.unshift({
        id: `trc-${crypto.randomUUID().slice(0, 10)}`,
        runId: run.id,
        integrationId: integration.id,
        agentId: approval.gateAgentId,
        level: 'info',
        type: 'approval_gate',
        message: `${actor.name} requested changes on ${approval.title}: "${approval.feedback}". Re-running affected stage only.`,
        requestId: `req-${crypto.randomUUID().slice(0, 8)}`,
        sanitizedMetadata: redactSensitiveData({ approvalId: approval.id, feedback: approval.feedback }),
        timestamp: now,
      });
      this.recordAudit(actor, 'approval.changes_requested', 'approval', approval.id, `Requested changes on ${approval.title}.`);

      await this.driveRun(run, integration, actor, validation);
      this.persist();
      return run;
    }

    // decision === 'approve'
    approval.status = 'approved';
    if (gateStep) {
      gateStep.status = 'succeeded';
      gateStep.decisionStatus = `Approved by ${actor.name}`;
    }

    this.state.traces.unshift({
      id: `trc-${crypto.randomUUID().slice(0, 10)}`,
      runId: run.id,
      integrationId: integration.id,
      agentId: approval.gateAgentId,
      level: 'info',
      type: 'approval_gate',
      message: `${actor.name} approved ${approval.title}. Advancing pipeline.`,
      requestId: `req-${crypto.randomUUID().slice(0, 8)}`,
      sanitizedMetadata: redactSensitiveData({
        approvalId: approval.id,
        stage: approval.stage,
        feedback: approval.feedback,
      }),
      timestamp: now,
    });
    this.recordAudit(actor, 'approval.approved', 'approval', approval.id, `Approved ${approval.title}.`);

    await this.driveRun(run, integration, actor, validation);
    this.persist();
    return run;
  }

  public saveEditedArtifact(
    actorId: string,
    runId: string,
    artifactPath: string,
    nextContent: string,
    restoreGenerated = false
  ): { artifact: CodeArtifact; run: GenerationRun } {
    const actor = this.getDeveloperOrThrow(actorId);
    const run = this.getRunOrThrow(runId);
    const integration = this.getIntegrationOrThrow(run.integrationId);
    const access = evaluateIntegrationAccess(actor.id, integration);
    if (!access.canEdit) {
      throw new StudioHttpError(403, 'FORBIDDEN_CODE_SAVE', access.reason);
    }

    const artifact = this.state.artifacts.find(
      (a) => a.runId === run.id && a.path === artifactPath
    );
    if (!artifact) {
      throw new StudioHttpError(404, 'ARTIFACT_NOT_FOUND', `File "${artifactPath}" not found in run ${run.id}.`);
    }

    const now = new Date().toISOString();
    run.codeVersion += 1;

    if (restoreGenerated) {
      artifact.content = artifact.generatedContent;
      artifact.isModifiedByDeveloper = false;
    } else {
      artifact.content = nextContent;
      artifact.isModifiedByDeveloper = nextContent !== artifact.generatedContent;
    }

    artifact.version = run.codeVersion;
    artifact.savedBy = actor.name;
    artifact.savedAt = now;
    run.updatedAt = now;

    // Re-evaluate static/security/fixture checks on the updated file set!
    const validation = this.state.validations.find((v) => v.id === run.validationId);
    const allowedHost = (() => {
      try {
        return new URL(validation?.evidence.baseUrlCandidates[0] || 'https://api.calendly.com').hostname;
      } catch {
        return 'api.calendly.com';
      }
    })();

    const allRunArtifacts = this.getRunArtifacts(run.id);
    run.verificationResults = verifyCodeArtifacts(
      allRunArtifacts,
      allowedHost,
      run.activeFailureInjection
    );

    const blockingFinding = run.verificationResults.find((v) => !v.passed);
    if (blockingFinding) {
      const isSecurity = blockingFinding.category === 'security_guard';
      run.status = isSecurity ? 'blocked' : 'failed';
      integration.status = isSecurity ? 'blocked' : 'failed';
      const secTrace: TraceEvent = {
        id: `trc-${crypto.randomUUID().slice(0, 10)}`,
        runId: run.id,
        integrationId: integration.id,
        level: isSecurity ? 'security' : 'error',
        type: 'code_artifact',
        message: `Saved edit to ${artifact.path} (v${run.codeVersion}) triggered verification failure: ${blockingFinding.detail}`,
        requestId: `req-${crypto.randomUUID().slice(0, 8)}`,
        errorClassification: isSecurity ? 'SECURITY_GUARD_VIOLATION' : 'CONTRACT_CHECK_FAILURE',
        recommendedAction: 'Fix or restore the modified file in Code Workspace and save again.',
        sanitizedMetadata: redactSensitiveData({
          file: artifact.path,
          codeVersion: run.codeVersion,
          failedCheck: blockingFinding.name,
        }),
        timestamp: now,
      };
      this.state.traces.unshift(secTrace);
      run.failureBanner = {
        code: 'SAVED_EDIT_BLOCKED',
        title: isSecurity ? 'Security Policy Blocked Modified Code' : 'Verification Failed After Edit',
        message: blockingFinding.detail,
        failedAgentId: isSecurity ? 'security_reviewer' : 'test_packaging_agent',
        remediation: 'Remove unsafe code/secrets or click "Restore Generated" and Save.',
        traceId: secTrace.id,
      };
    } else if (run.status === 'blocked' || run.status === 'failed' || run.status === 'ready_for_review') {
      run.failureBanner = undefined;
      if (this.getRunSteps(run.id).every((s) => s.status === 'succeeded')) {
        run.status = 'ready_for_review';
        integration.status = 'validated_fixtures';
      }
      this.state.traces.unshift({
        id: `trc-${crypto.randomUUID().slice(0, 10)}`,
        runId: run.id,
        integrationId: integration.id,
        level: 'info',
        type: 'code_artifact',
        message: `${actor.name} ${restoreGenerated ? 'restored generated baseline for' : 'saved changes to'} ${artifact.path} (code v${run.codeVersion}). All static & security checks passed.`,
        requestId: `req-${crypto.randomUUID().slice(0, 8)}`,
        sanitizedMetadata: {
          file: artifact.path,
          codeVersion: run.codeVersion,
          isModifiedByDeveloper: artifact.isModifiedByDeveloper,
        },
        timestamp: now,
      });
    }

    this.recordAudit(
      actor,
      restoreGenerated ? 'artifact.restored' : 'artifact.saved',
      'artifact',
      artifact.id,
      `${restoreGenerated ? 'Restored' : 'Saved'} ${artifact.path} at code version v${run.codeVersion}.`
    );
    this.persist();
    return { artifact, run };
  }

  public runSandboxTests(
    actorId: string,
    runId: string,
    targetScenarioId?: string
  ): {
    results: any[];
    allPassed: boolean;
    hasCriticalFailure: boolean;
    productionReadiness: any;
  } {
    const actor = this.getDeveloperOrThrow(actorId);
    const run = this.getRunOrThrow(runId);
    const integration = this.getIntegrationOrThrow(run.integrationId);
    const access = evaluateIntegrationAccess(actor.id, integration);
    if (!access.canView) {
      throw new StudioHttpError(403, 'FORBIDDEN_SANDBOX_RUN', access.reason);
    }

    const artifacts = this.getRunArtifacts(run.id);
    if (artifacts.length === 0) {
      throw new StudioHttpError(
        422,
        'NO_ARTIFACTS_FOR_TEST',
        'Code generation must complete before running sandbox tests.'
      );
    }

    const validation = this.state.validations.find((v) => v.id === run.validationId);
    const allowedHost = (() => {
      try {
        return new URL(validation?.evidence.baseUrlCandidates[0] || 'https://api.calendly.com').hostname;
      } catch {
        return 'api.calendly.com';
      }
    })();

    const testExecution = executeSandboxTests({
      run,
      artifacts,
      allowedHost,
      targetScenarioId,
    });

    run.sandboxResults = testExecution.results;

    const readinessReport = evaluateProductionReadiness({
      integration,
      run,
      artifacts,
      sandboxResults: testExecution.results,
    });
    run.productionReadiness = readinessReport;
    integration.productionReadinessStatus = readinessReport.status;

    this.state.traces.unshift({
      id: `trc-${crypto.randomUUID().slice(0, 10)}`,
      runId: run.id,
      integrationId: integration.id,
      level: testExecution.hasCriticalFailure ? 'security' : testExecution.allPassed ? 'info' : 'warn',
      type: 'verification',
      message: targetScenarioId
        ? `Retried sandbox test scenario "${targetScenarioId}": ${testExecution.results.find((r) => r.id === targetScenarioId)?.status.toUpperCase()}`
        : `Executed 12 Simulated Sandbox Tests: ${testExecution.results.filter((r) => r.status === 'pass').length}/12 passed.`,
      requestId: `req-${crypto.randomUUID().slice(0, 8)}`,
      sanitizedMetadata: {
        allPassed: testExecution.allPassed,
        hasCriticalFailure: testExecution.hasCriticalFailure,
      },
      timestamp: new Date().toISOString(),
    });

    this.persist();
    return {
      results: testExecution.results,
      allPassed: testExecution.allPassed,
      hasCriticalFailure: testExecution.hasCriticalFailure,
      productionReadiness: readinessReport,
    };
  }

  public markProductionReady(
    actorId: string,
    integrationId: string,
    runId: string
  ): {
    integration: Integration;
    report: any;
  } {
    const actor = this.getDeveloperOrThrow(actorId);
    const integration = this.getIntegrationOrThrow(integrationId);
    const run = this.getRunOrThrow(runId);
    const access = evaluateIntegrationAccess(actor.id, integration);
    if (!access.canEdit) {
      throw new StudioHttpError(403, 'FORBIDDEN_PRODUCTION_APPROVAL', access.reason);
    }

    const artifacts = this.getRunArtifacts(run.id);
    const report = evaluateProductionReadiness({
      integration,
      run,
      artifacts,
      sandboxResults: run.sandboxResults ?? [],
    });

    if (!report.canMarkReadyForReview) {
      throw new StudioHttpError(
        400,
        'READINESS_CHECKS_INCOMPLETE',
        'Cannot mark ready for production review: one or more security or sandbox criteria failed.'
      );
    }

    const now = new Date().toISOString();
    integration.productionApprovedBy = actor.id;
    integration.productionApprovedAt = now;
    integration.productionReadinessStatus = 'ready_for_production_review';
    integration.updatedAt = now;

    report.status = 'ready_for_production_review';
    report.markedReadyAt = now;
    report.markedReadyBy = actor.id;
    run.productionReadiness = report;

    this.recordAudit(
      actor,
      'integration.production_ready_demo',
      'integration',
      integration.id,
      `Marked "${integration.name}" Ready for Production Review (Demo Only). All 12 sandbox tests and safeguards confirmed.`
    );

    this.state.traces.unshift({
      id: `trc-${crypto.randomUUID().slice(0, 10)}`,
      runId: run.id,
      integrationId: integration.id,
      level: 'info',
      type: 'agent_action',
      message: `${actor.name} approved Production Readiness (Demo Only) for "${integration.name}". Package is prepared for Enterprise Review.`,
      requestId: `req-${crypto.randomUUID().slice(0, 8)}`,
      sanitizedMetadata: {
        approvedBy: actor.name,
        approvedAt: now,
      },
      timestamp: now,
    });

    this.persist();
    return { integration, report };
  }

  public getTraces(filters: {
    runId?: string;
    integrationId?: string;
    agentId?: string;
    level?: string;
    search?: string;
  }): TraceEvent[] {
    return this.state.traces.filter((t) => {
      if (filters.runId && t.runId !== filters.runId) return false;
      if (filters.integrationId && t.integrationId !== filters.integrationId) return false;
      if (filters.agentId && filters.agentId !== 'all' && t.agentId !== filters.agentId) return false;
      if (filters.level && filters.level !== 'all' && t.level !== filters.level) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = `${t.id} ${t.runId} ${t.requestId} ${t.message} ${t.errorClassification ?? ''} ${t.providerModel ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  public getAudits(limit = 50): AuditEvent[] {
    return this.state.audits.slice(0, limit);
  }
}
