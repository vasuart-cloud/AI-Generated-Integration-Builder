import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { discoverCapabilitiesFromValidation } from './src/server/calendlyFixture';
import { buildArtifactsZipBuffer } from './src/server/codeGenerator';
import { validateApiDocumentation } from './src/server/docValidator';
import { getModelRegistry } from './src/server/modelRegistry';
import { evaluateIntegrationAccess, redactSensitiveData } from './src/server/security';
import { StudioHttpError, StudioStore } from './src/server/store';

const PORT = 3000;
const store = new StudioStore();

function getActorIdFromRequest(req: Request): string {
  const headerActor = req.header('x-developer-id')?.trim();
  return headerActor || 'dev-asha';
}

export function createApiApp(activeStore: StudioStore = store) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Session & Workspace Bootstrap
  app.get('/api/bootstrap', (req, res, next) => {
    try {
      const actorId = getActorIdFromRequest(req);
      const currentDeveloper = activeStore.getDeveloperOrThrow(actorId);
      const includeArchived = req.query.includeArchived === 'true';
      const integrations = activeStore.listIntegrations(includeArchived).map((item) => ({
        ...item,
        access: evaluateIntegrationAccess(currentDeveloper.id, item),
      }));

      res.json({
        currentDeveloper,
        developers: activeStore.getDevelopers(),
        categories: activeStore.getCategories(),
        integrations,
        models: getModelRegistry(),
        runs: activeStore.listRuns(),
        audits: activeStore.getAudits(40),
      });
    } catch (err) {
      next(err);
    }
  });

  // Update developer preferences (onboarding step/completion, catalog view mode)
  app.patch('/api/developers/me/preferences', (req, res, next) => {
    try {
      const actorId = getActorIdFromRequest(req);
      const updated = activeStore.updateDeveloperPreferences(actorId, req.body ?? {});
      res.json({ developer: updated });
    } catch (err) {
      next(err);
    }
  });

  // Model Registry
  app.get('/api/models', (_req, res) => {
    res.json({ models: getModelRegistry() });
  });

  // Categories
  app.get('/api/categories', (_req, res) => {
    res.json({ categories: activeStore.getCategories() });
  });

  app.post('/api/categories', (req, res, next) => {
    try {
      const actorId = getActorIdFromRequest(req);
      const category = activeStore.createCategory(actorId, {
        name: req.body?.name,
        description: req.body?.description,
      });
      res.status(201).json({ category });
    } catch (err) {
      next(err);
    }
  });

  // Integrations Catalog & RBAC CRUD
  app.get('/api/integrations', (req, res, next) => {
    try {
      const actorId = getActorIdFromRequest(req);
      const dev = activeStore.getDeveloperOrThrow(actorId);
      const includeArchived = req.query.includeArchived === 'true';
      const items = activeStore.listIntegrations(includeArchived).map((item) => ({
        ...item,
        access: evaluateIntegrationAccess(dev.id, item),
      }));
      res.json({ integrations: items });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/integrations/:id', (req, res, next) => {
    try {
      const actorId = getActorIdFromRequest(req);
      const dev = activeStore.getDeveloperOrThrow(actorId);
      const integration = activeStore.getIntegrationOrThrow(req.params.id);
      const validations = activeStore.listValidationsForIntegration(integration.id);
      const latestValid = activeStore.getLatestValidValidation(integration.id);
      const discovery = latestValid ? discoverCapabilitiesFromValidation(latestValid) : null;
      const runs = activeStore.listRuns(integration.id);

      res.json({
        integration: {
          ...integration,
          access: evaluateIntegrationAccess(dev.id, integration),
        },
        validations,
        latestValidValidation: latestValid ?? null,
        discovery,
        runs,
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/integrations', (req, res, next) => {
    try {
      // Security rule: derive owner strictly from session header, never from req.body.ownerId
      const actorId = getActorIdFromRequest(req);
      const integration = activeStore.createCustomIntegrationDraft(actorId, {
        name: req.body?.name,
        description: req.body?.description,
        categoryId: req.body?.categoryId,
        uiLayers: req.body?.uiLayers,
      });
      res.status(201).json({
        integration: {
          ...integration,
          access: evaluateIntegrationAccess(actorId, integration),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/integrations/:id', (req, res, next) => {
    try {
      const actorId = getActorIdFromRequest(req);
      const updated = activeStore.updateCustomIntegration(actorId, req.params.id, {
        name: req.body?.name,
        description: req.body?.description,
        categoryId: req.body?.categoryId,
        uiLayers: req.body?.uiLayers,
      });
      res.json({
        integration: {
          ...updated,
          access: evaluateIntegrationAccess(actorId, updated),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/integrations/:id', (req, res, next) => {
    try {
      const actorId = getActorIdFromRequest(req);
      const mode = req.query.mode === 'archive' ? 'archive' : 'soft_delete';
      const archived = activeStore.archiveOrSoftDeleteIntegration(actorId, req.params.id, mode);
      res.json({ integration: archived });
    } catch (err) {
      next(err);
    }
  });

  // Documentation Validation Gate
  app.post('/api/integrations/:id/validate-docs', async (req, res, next) => {
    try {
      const actorId = getActorIdFromRequest(req);
      const dev = activeStore.getDeveloperOrThrow(actorId);
      const integration = activeStore.getIntegrationOrThrow(req.params.id);
      const access = evaluateIntegrationAccess(dev.id, integration);
      if (!access.canEdit) {
        throw new StudioHttpError(403, 'FORBIDDEN_VALIDATE_DOCS', access.reason);
      }

      const validation = await validateApiDocumentation({
        integrationId: integration.id,
        mode: req.body?.mode ?? 'url',
        url: req.body?.url,
        rawSpec: req.body?.rawSpec,
        failureInjection: req.body?.failureInjection ?? 'none',
      });

      const saved = activeStore.saveValidationResult(actorId, validation);
      res.json({
        validation: saved.validation,
        discovery: saved.capabilities ?? null,
        integration: activeStore.getIntegrationOrThrow(integration.id),
      });
    } catch (err) {
      next(err);
    }
  });

  // Capability Discovery Endpoint
  app.get('/api/integrations/:id/capabilities', (req, res, next) => {
    try {
      const actorId = getActorIdFromRequest(req);
      activeStore.getDeveloperOrThrow(actorId);
      const integration = activeStore.getIntegrationOrThrow(req.params.id);
      const latestValid = activeStore.getLatestValidValidation(integration.id);
      if (!latestValid) {
        throw new StudioHttpError(
          422,
          'DOCS_NOT_VALIDATED',
          'Validate API documentation before inspecting capabilities.'
        );
      }
      const discovery = discoverCapabilitiesFromValidation(latestValid);
      res.json({
        validation: latestValid,
        discovery,
        models: getModelRegistry(),
      });
    } catch (err) {
      next(err);
    }
  });

  // Generation Runs & Multi-Agent Workbench
  app.post('/api/integrations/:id/runs', async (req, res, next) => {
    try {
      const actorId = getActorIdFromRequest(req);
      const run = await activeStore.startGenerationRun(actorId, {
        integrationId: req.params.id,
        modelProvider: req.body?.modelProvider,
        modelId: req.body?.modelId,
        collectorConfig: req.body?.collectorConfig,
        operationId: req.body?.operationId,
        failureInjection: req.body?.failureInjection,
        pauseAfterFirstCheckpoint: Boolean(req.body?.pauseAfterFirstCheckpoint),
      });

      res.status(201).json({
        run,
        steps: activeStore.getRunSteps(run.id),
        approvals: activeStore.getRunApprovals(run.id),
        artifacts: activeStore.getRunArtifacts(run.id),
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/runs/:runId', (req, res, next) => {
    try {
      const actorId = getActorIdFromRequest(req);
      const dev = activeStore.getDeveloperOrThrow(actorId);
      const run = activeStore.getRunOrThrow(req.params.runId);
      const integration = activeStore.getIntegrationOrThrow(run.integrationId);

      res.json({
        run,
        integration: {
          ...integration,
          access: evaluateIntegrationAccess(dev.id, integration),
        },
        steps: activeStore.getRunSteps(run.id),
        approvals: activeStore.getRunApprovals(run.id),
        artifacts: activeStore.getRunArtifacts(run.id),
        traces: activeStore.getTraces({ runId: run.id }),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/runs/:runId/control', async (req, res, next) => {
    try {
      const actorId = getActorIdFromRequest(req);
      const command = req.body?.command as 'pause' | 'resume' | 'cancel' | 'retry';
      if (!['pause', 'resume', 'cancel', 'retry'].includes(command)) {
        throw new StudioHttpError(400, 'INVALID_RUN_COMMAND', `Unsupported command "${String(command)}".`);
      }

      const run = await activeStore.controlRun(actorId, req.params.runId, command, {
        failureInjection: req.body?.failureInjection,
        operationId: req.body?.operationId,
      });

      res.json({
        run,
        steps: activeStore.getRunSteps(run.id),
        approvals: activeStore.getRunApprovals(run.id),
        artifacts: activeStore.getRunArtifacts(run.id),
        traces: activeStore.getTraces({ runId: run.id }),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/runs/:runId/inject-fault', async (req, res, next) => {
    try {
      const actorId = getActorIdFromRequest(req);
      const run = await activeStore.setRunFailureInjection(
        actorId,
        req.params.runId,
        req.body?.failureInjection ?? 'none'
      );

      res.json({
        run,
        steps: activeStore.getRunSteps(run.id),
        approvals: activeStore.getRunApprovals(run.id),
        artifacts: activeStore.getRunArtifacts(run.id),
        traces: activeStore.getTraces({ runId: run.id }),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/runs/:runId/approvals/:approvalId', async (req, res, next) => {
    try {
      const actorId = getActorIdFromRequest(req);
      const decision = req.body?.decision as 'approve' | 'request_changes' | 'reject';
      if (!['approve', 'request_changes', 'reject'].includes(decision)) {
        throw new StudioHttpError(400, 'INVALID_APPROVAL_DECISION', 'Invalid approval decision.');
      }

      const run = await activeStore.submitApprovalDecision(
        actorId,
        req.params.runId,
        req.params.approvalId,
        decision,
        req.body?.feedback
      );

      res.json({
        run,
        steps: activeStore.getRunSteps(run.id),
        approvals: activeStore.getRunApprovals(run.id),
        artifacts: activeStore.getRunArtifacts(run.id),
        traces: activeStore.getTraces({ runId: run.id }),
      });
    } catch (err) {
      next(err);
    }
  });

  // Code Workspace: Save / Restore Versioned Artifact
  app.put('/api/runs/:runId/artifacts', (req, res, next) => {
    try {
      const actorId = getActorIdFromRequest(req);
      const filePath = String(req.body?.path ?? '').trim();
      if (!filePath) {
        throw new StudioHttpError(400, 'PATH_REQUIRED', 'Artifact file path is required.');
      }
      const result = activeStore.saveEditedArtifact(
        actorId,
        req.params.runId,
        filePath,
        String(req.body?.content ?? ''),
        Boolean(req.body?.restoreGenerated)
      );

      res.json({
        artifact: result.artifact,
        run: result.run,
        artifacts: activeStore.getRunArtifacts(result.run.id),
        traces: activeStore.getTraces({ runId: result.run.id }),
      });
    } catch (err) {
      next(err);
    }
  });

  // Download Generated Code ZIP Archive
  app.get('/api/runs/:runId/zip', async (req, res, next) => {
    try {
      const actorId = getActorIdFromRequest(req);
      activeStore.getDeveloperOrThrow(actorId);
      const run = activeStore.getRunOrThrow(req.params.runId);
      const integration = activeStore.getIntegrationOrThrow(run.integrationId);
      const artifacts = activeStore.getRunArtifacts(run.id);

      if (artifacts.length === 0) {
        throw new StudioHttpError(409, 'NO_ARTIFACTS_TO_EXPORT', 'No generated code files exist for this run yet.');
      }

      const folderName = `${integration.slug}-connector-v${run.codeVersion}`;
      const zipBuffer = await buildArtifactsZipBuffer(artifacts, folderName);

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${folderName}.zip"`);
      res.send(zipBuffer);
    } catch (err) {
      next(err);
    }
  });

  // Traces & Sanitized Log Export
  app.get('/api/traces', (req, res, next) => {
    try {
      const actorId = getActorIdFromRequest(req);
      activeStore.getDeveloperOrThrow(actorId);
      const traces = activeStore.getTraces({
        runId: typeof req.query.runId === 'string' ? req.query.runId : undefined,
        integrationId: typeof req.query.integrationId === 'string' ? req.query.integrationId : undefined,
        agentId: typeof req.query.agentId === 'string' ? req.query.agentId : undefined,
        level: typeof req.query.level === 'string' ? req.query.level : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
      });
      res.json({ traces: redactSensitiveData(traces) });
    } catch (err) {
      next(err);
    }
  });

  // Reset Demo Workspace
  app.post('/api/workspace/reset', (req, res, next) => {
    try {
      const actorId = getActorIdFromRequest(req);
      activeStore.resetDemoWorkspace(actorId);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Global API Error Handler
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof StudioHttpError) {
      res.status(err.statusCode).json({
        error: {
          code: err.errorCode,
          message: err.message,
        },
      });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: redactSensitiveData(msg),
      },
    });
  });

  return app;
}

async function startServer() {
  const app = createApiApp(store);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CloudEagle Developer Integration Studio running on http://0.0.0.0:${PORT}`);
  });
}

// Only start HTTP listener when executed directly (not imported by unit tests)
const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(process.cwd(), 'server.ts');

if (isDirectExecution) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
