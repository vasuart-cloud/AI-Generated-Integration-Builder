import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  evaluateIntegrationAccess,
  isPrivateOrReservedIp,
  redactSensitiveData,
  validateUrlSafety,
} from '../security';
import { parseOpenApiSpecContent, validateApiDocumentation } from '../docValidator';
import { buildArtifactsZipBuffer } from '../codeGenerator';
import { canTransitionRunStatus } from '../stateMachine';
import { StudioHttpError, StudioStore } from '../store';

test('SSRF & URL safety guard blocks insecure protocols, credentials, localhost, private/metadata IPs, and IP literals', () => {
  assert.equal(validateUrlSafety('').safe, false);
  assert.equal(validateUrlSafety('http://developer.calendly.com/api-docs').errorCode, 'INSECURE_PROTOCOL');
  assert.equal(validateUrlSafety('https://admin:secret@developer.calendly.com/docs').errorCode, 'CREDENTIALS_IN_URL');
  assert.equal(validateUrlSafety('https://localhost:8080/openapi.json').errorCode, 'LOCALHOST_FORBIDDEN');
  assert.equal(validateUrlSafety('https://metadata.google.internal/computeMetadata/v1').errorCode, 'LOCALHOST_FORBIDDEN');
  assert.equal(validateUrlSafety('https://169.254.169.254/latest/meta-data').errorCode, 'PRIVATE_IP_FORBIDDEN');
  assert.equal(validateUrlSafety('https://127.0.0.1/spec.json').errorCode, 'PRIVATE_IP_FORBIDDEN');
  assert.equal(validateUrlSafety('https://8.8.8.8/spec.json').errorCode, 'IP_LITERAL_FORBIDDEN');

  assert.equal(isPrivateOrReservedIp('10.0.1.5'), true);
  assert.equal(isPrivateOrReservedIp('172.20.0.1'), true);
  assert.equal(isPrivateOrReservedIp('192.168.1.10'), true);
  assert.equal(isPrivateOrReservedIp('::1'), true);
  assert.equal(isPrivateOrReservedIp('93.184.216.34'), false);

  const valid = validateUrlSafety('https://developer.calendly.com/api-docs/overview/api/reference');
  assert.equal(valid.safe, true);
  assert.equal(valid.hostname, 'developer.calendly.com');
});

test('Secret & PII redactor scrubs Bearer headers, PATs, Gemini keys, query secrets, and email PII', () => {
  const input = {
    Authorization: 'Bearer pat_live_supersecret987654321',
    nested: {
      apiKey: 'AIzaSyDummyKeyValue1234567890123456',
      logLine: 'Request with Bearer eyJhbGciOiJIUzI1NiJ9 for user asha.patel@cloudeagle.dev at ?access_token=xyz123',
    },
  };

  const sanitized = redactSensitiveData(input);
  assert.equal(sanitized.Authorization, '[REDACTED_SECRET]');
  assert.equal(sanitized.nested.apiKey, '[REDACTED_SECRET]');
  assert.ok(!sanitized.nested.logLine.includes('eyJhbGciOiJIUzI1NiJ9'));
  assert.ok(!sanitized.nested.logLine.includes('xyz123'));
  assert.ok(sanitized.nested.logLine.includes('a***@cloudeagle.dev'));
});

test('RBAC enforces system default immutability for all users and custom ownership between Asha and Ravi', () => {
  const store = new StudioStore({ filePath: null });

  // System default integrations cannot be edited or deleted by anyone
  assert.throws(
    () => store.updateCustomIntegration('dev-asha', 'sys-salesforce', { description: 'Hacked description' }),
    (err: unknown) => err instanceof StudioHttpError && err.statusCode === 403
  );
  assert.throws(
    () => store.archiveOrSoftDeleteIntegration('dev-asha', 'sys-salesforce', 'soft_delete'),
    (err: unknown) => err instanceof StudioHttpError && err.statusCode === 403
  );

  // Asha creates custom Calendly draft
  const calendly = store.createCustomIntegrationDraft('dev-asha', {
    name: 'Calendly',
    description: 'Sync organization memberships and scheduled event activity proxies.',
    categoryId: 'cat-scheduling',
    uiLayers: ['developer_console', 'api_only'],
  });
  assert.equal(calendly.ownerId, 'dev-asha');
  assert.equal(calendly.sourceType, 'custom');

  // Duplicate name blocked
  assert.throws(
    () =>
      store.createCustomIntegrationDraft('dev-ravi', {
        name: 'calendly',
        description: 'Duplicate name attempt by Ravi.',
        categoryId: 'cat-scheduling',
        uiLayers: ['api_only'],
      }),
    (err: unknown) => err instanceof StudioHttpError && err.statusCode === 409
  );

  // Ravi (Developer B) has view-only access and receives 403 on edit/delete
  const raviAccess = evaluateIntegrationAccess('dev-ravi', calendly);
  assert.equal(raviAccess.canView, true);
  assert.equal(raviAccess.canEdit, false);

  assert.throws(
    () => store.updateCustomIntegration('dev-ravi', calendly.id, { description: 'Unauthorized edit by Ravi' }),
    (err: unknown) => err instanceof StudioHttpError && err.statusCode === 403
  );
  assert.throws(
    () => store.archiveOrSoftDeleteIntegration('dev-ravi', calendly.id, 'archive'),
    (err: unknown) => err instanceof StudioHttpError && err.statusCode === 403
  );

  // Asha (Creator) can update metadata cleanly
  const updated = store.updateCustomIntegration('dev-asha', calendly.id, {
    description: 'Updated Calendly membership and 30-day event proxy collector.',
  });
  assert.equal(updated.version, 2);
});

test('OpenAPI parser & Curated Calendly Fixture distinguish partial, invalid, and grounded valid specs', async () => {
  const invalidSpec = parseOpenApiSpecContent('not valid: [yaml: {{{', 'uploaded://bad');
  assert.equal(invalidSpec.valid, false);

  const partialSpec = parseOpenApiSpecContent(
    JSON.stringify({
      openapi: '3.0.3',
      info: { title: 'Partial API', version: '1.0' },
      paths: { '/users': { get: { summary: 'List users' } } },
    }),
    'uploaded://partial'
  );
  assert.equal(partialSpec.valid, false);
  assert.equal(partialSpec.partial, true);

  const completeSpec = parseOpenApiSpecContent(
    JSON.stringify({
      openapi: '3.1.0',
      info: { title: 'Acme Directory API', version: '2.1.0' },
      servers: [{ url: 'https://api.acme.example.com/v2' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
      paths: {
        '/users': { get: { summary: 'List directory users' } },
      },
    }),
    'uploaded://complete'
  );
  assert.equal(completeSpec.valid, true);
  assert.equal(completeSpec.evidence.documentedEndpoints.length, 1);

  const fixtureVal = await validateApiDocumentation({
    integrationId: 'int-test',
    mode: 'curated_fixture',
  });
  assert.equal(fixtureVal.result, 'valid');
  assert.equal(fixtureVal.mode, 'curated_fixture');
  assert.equal(fixtureVal.evidence.classifierMode, 'curated_fixture_sandbox');
  assert.equal(fixtureVal.evidence.documentedEndpoints.length, 4);
});

test('Multi-agent state machine enforces docs gate, 3 mandatory human approvals, pause/resume, code versioning, security checks, and ZIP export', async () => {
  const store = new StudioStore({ filePath: null });

  const calendly = store.createCustomIntegrationDraft('dev-asha', {
    name: 'Calendly',
    description: 'Calendly API v2 organization memberships and 30-day scheduled event proxy.',
    categoryId: 'cat-scheduling',
    uiLayers: ['developer_console', 'api_only'],
  });

  // Cannot start run before documentation validation
  await assert.rejects(
    () =>
      store.startGenerationRun('dev-asha', {
        integrationId: calendly.id,
        modelProvider: 'deterministic_demo',
        modelId: 'deterministic-demo-v1',
        collectorConfig: {
          language: 'typescript',
          selectedEndpoints: ['GET /users/me'],
          authType: 'personal_access_token',
          scopes: ['users:read', 'organizations:read', 'scheduled_events:read'],
          collectionWindowDays: 30,
          pageSize: 50,
          maxPages: 20,
          maxRetries: 3,
          timeoutMs: 10000,
          logVerbosity: 'info',
          rateLimitPolicy: 'respect_retry_after_exponential_jitter',
        },
      }),
    (err: unknown) => err instanceof StudioHttpError && err.statusCode === 422
  );

  // Validate with curated Calendly fixture
  const fixtureValidation = await validateApiDocumentation({
    integrationId: calendly.id,
    mode: 'curated_fixture',
  });
  const savedVal = store.saveValidationResult('dev-asha', fixtureValidation);
  assert.ok(savedVal.capabilities);

  // Start run with pauseAfterFirstCheckpoint = true to verify durable pause & resume
  let run = await store.startGenerationRun('dev-asha', {
    integrationId: calendly.id,
    modelProvider: 'deterministic_demo',
    modelId: 'deterministic-demo-v1',
    collectorConfig: savedVal.capabilities!.defaultConfig,
    pauseAfterFirstCheckpoint: true,
    operationId: 'op-start-1',
  });
  assert.equal(run.status, 'paused');
  assert.equal(run.checkpointVersion, 1);

  // Idempotent duplicate operationId returns same run without double-generating
  const idempotentRun = await store.startGenerationRun('dev-asha', {
    integrationId: calendly.id,
    modelProvider: 'deterministic_demo',
    modelId: 'deterministic-demo-v1',
    collectorConfig: savedVal.capabilities!.defaultConfig,
    operationId: 'op-start-1',
  });
  assert.equal(idempotentRun.id, run.id);

  // Resume advances until Mandatory Approval #1 (capabilities_scope)
  run = await store.controlRun('dev-asha', run.id, 'resume');
  assert.equal(run.status, 'awaiting_approval');
  let approvals = store.getRunApprovals(run.id);
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].stage, 'capabilities_scope');

  // Cannot bypass approval via resume
  await assert.rejects(
    () => store.controlRun('dev-asha', run.id, 'resume'),
    (err: unknown) => err instanceof StudioHttpError && err.statusCode === 409
  );

  // Approve #1 -> advances to Mandatory Approval #2 (auth_permissions)
  run = await store.submitApprovalDecision('dev-asha', run.id, approvals[0].id, 'approve', 'Proxy disclosure verified.');
  assert.equal(run.status, 'awaiting_approval');
  approvals = store.getRunApprovals(run.id);
  const apr2 = approvals.find((a) => a.stage === 'auth_permissions');
  assert.ok(apr2);

  // Approve #2 -> generates Client & Resilience code and pauses at Mandatory Approval #3 (code_security_review)
  run = await store.submitApprovalDecision('dev-asha', run.id, apr2!.id, 'approve', 'Least-privilege read-only scopes confirmed.');
  assert.equal(run.status, 'awaiting_approval');
  approvals = store.getRunApprovals(run.id);
  const apr3 = approvals.find((a) => a.stage === 'code_security_review');
  assert.ok(apr3);

  // Regression: code-generation stage emits an entry point, not just its dependencies.
  assert.ok(store.getRunArtifacts(run.id).some((a) => a.path === 'src/index.ts'));

  // Simulate an existing persisted run created before the missing-entrypoint fix.
  // Verification must repair this known omission on retry without re-running earlier agents.
  const legacyState = (store as unknown as {
    state: { artifacts: Array<{ path: string; runId: string }> };
  }).state;
  legacyState.artifacts = legacyState.artifacts.filter(
    (a) => !(a.runId === run.id && a.path === 'src/index.ts')
  );
  assert.ok(!store.getRunArtifacts(run.id).some((a) => a.path === 'src/index.ts'));

  // Approve #3 -> the verifier repairs the entry point, then reaches ready_for_review!
  run = await store.submitApprovalDecision('dev-asha', run.id, apr3!.id, 'approve', 'Security checks clean.');
  assert.equal(run.status, 'ready_for_review');

  const artifacts = store.getRunArtifacts(run.id);
  assert.ok(artifacts.length >= 13);
  assert.ok(artifacts.some((a) => a.path === 'src/pagination.ts'));
  assert.ok(artifacts.some((a) => a.path === 'src/usage.ts'));
  assert.ok(artifacts.some((a) => a.path === 'src/index.ts'), 'Entry point should be restored');
  assert.ok(run.verificationResults?.every((v) => v.passed), 'All code checks should pass');

  // Edit a file with a hardcoded token -> Security Reviewer blocks!
  const authArtifact = artifacts.find((a) => a.path === 'src/auth.ts')!;
  const blockedSave = store.saveEditedArtifact(
    'dev-asha',
    run.id,
    'src/auth.ts',
    authArtifact.content + '\nconst BAD = "pat_live_hardcoded_secret_99999";\n'
  );
  assert.equal(blockedSave.run.status, 'blocked');

  // Restore generated version -> recovers to ready_for_review!
  const restoredSave = store.saveEditedArtifact('dev-asha', run.id, 'src/auth.ts', '', true);
  assert.equal(restoredSave.run.status, 'ready_for_review');
  assert.equal(restoredSave.artifact.isModifiedByDeveloper, false);

  // Inject simulated 429 fault -> fails Test & Packaging Agent with trace, then clear & retry!
  const faultedRun = await store.setRunFailureInjection('dev-asha', run.id, 'rate_limit_429');
  assert.equal(faultedRun.status, 'failed');
  assert.ok(faultedRun.failureBanner?.traceId);

  const retriedRun = await store.controlRun('dev-asha', run.id, 'retry', { failureInjection: 'none' });
  assert.equal(retriedRun.status, 'ready_for_review');

  // Build real ZIP buffer and verify contents
  const zipBuf = await buildArtifactsZipBuffer(store.getRunArtifacts(run.id), 'calendly-connector-v3');
  const loadedZip = await JSZip.loadAsync(zipBuf);
  const zipPaths = Object.keys(loadedZip.files);
  assert.ok(zipPaths.some((p) => p.endsWith('src/apiClient.ts')));
  assert.ok(zipPaths.some((p) => p.endsWith('src/index.ts')));
  assert.ok(zipPaths.some((p) => p.endsWith('integration.manifest.json')));

  // State machine transition check
  assert.equal(canTransitionRunStatus('cancelled', 'running'), false);
});

test('Audit regression: pause/resume at approval gate never restarts completed stages, request_changes/reject recover cleanly, and RBAC blocks non-owner across all endpoints', async () => {
  const store = new StudioStore({ filePath: null });

  const newCat = store.createCategory('dev-asha', {
    name: 'Meeting Automation',
    description: 'Automated meeting and scheduling intelligence connectors.',
  });

  const calendly = store.createCustomIntegrationDraft('dev-asha', {
    name: 'Calendly',
    description: 'Calendly API v2 organization memberships and 30-day scheduled event proxy.',
    categoryId: newCat.id,
    uiLayers: ['developer_console', 'api_only'],
  });

  // Reject google.com as invalid documentation
  const invalidGoogle = await validateApiDocumentation({
    integrationId: calendly.id,
    mode: 'url',
    url: 'https://google.com',
  });
  store.saveValidationResult('dev-asha', invalidGoogle);
  assert.notEqual(invalidGoogle.result, 'valid');

  // Non-owner Ravi cannot validate docs
  const validFixture = await validateApiDocumentation({
    integrationId: calendly.id,
    mode: 'curated_fixture',
  });
  assert.throws(
    () => store.saveValidationResult('dev-ravi', validFixture),
    (err: unknown) => err instanceof StudioHttpError && err.statusCode === 403
  );

  // Owner Asha saves valid fixture
  const savedVal = store.saveValidationResult('dev-asha', validFixture);
  assert.ok(savedVal.capabilities);

  // Start run -> reaches Approval #1 (checkpointVersion === 3: orchestrator, doc_analyst, capability_agent)
  let run = await store.startGenerationRun('dev-asha', {
    integrationId: calendly.id,
    modelProvider: 'deterministic_demo',
    modelId: 'deterministic-demo-v1',
    collectorConfig: savedVal.capabilities!.defaultConfig,
  });
  assert.equal(run.status, 'awaiting_approval');
  const ckptBeforePause = run.checkpointVersion;
  const subtasksBeforePause = [...run.completedSubtasks];

  // Active-run dependency blocks soft_delete with 409
  assert.throws(
    () => store.archiveOrSoftDeleteIntegration('dev-asha', calendly.id, 'soft_delete'),
    (err: unknown) => err instanceof StudioHttpError && err.statusCode === 409
  );

  // Pause while at Approval #1, then Resume -> MUST restore awaiting_approval WITHOUT restarting capability_agent!
  run = await store.controlRun('dev-asha', run.id, 'pause');
  assert.equal(run.status, 'paused');
  run = await store.controlRun('dev-asha', run.id, 'resume');
  assert.equal(run.status, 'awaiting_approval');
  assert.equal(run.checkpointVersion, ckptBeforePause);
  assert.deepEqual(run.completedSubtasks, subtasksBeforePause);

  // Non-owner Ravi cannot submit approvals or control run
  const apr1 = store.getRunApprovals(run.id)[0];
  await assert.rejects(
    () => store.submitApprovalDecision('dev-ravi', run.id, apr1.id, 'approve'),
    (err: unknown) => err instanceof StudioHttpError && err.statusCode === 403
  );
  await assert.rejects(
    () => store.controlRun('dev-ravi', run.id, 'pause'),
    (err: unknown) => err instanceof StudioHttpError && err.statusCode === 403
  );

  // Request Changes without feedback -> 400
  await assert.rejects(
    () => store.submitApprovalDecision('dev-asha', run.id, apr1.id, 'request_changes', ''),
    (err: unknown) => err instanceof StudioHttpError && err.statusCode === 400
  );

  // Request Changes with feedback -> re-runs ONLY capability_agent (orchestrator & doc_analyst stay succeeded)
  const orchCompletedAt = store.getRunSteps(run.id).find((s) => s.agentId === 'orchestrator')?.completedAt;
  run = await store.submitApprovalDecision(
    'dev-asha',
    run.id,
    apr1.id,
    'request_changes',
    'Confirm 30-day scheduled event proxy wording.'
  );
  assert.equal(run.status, 'awaiting_approval');
  assert.equal(
    store.getRunSteps(run.id).find((s) => s.agentId === 'orchestrator')?.completedAt,
    orchCompletedAt
  );

  // Reject & Block -> run becomes blocked; Retry Step -> resets approval card back to 'pending' cleanly!
  run = await store.submitApprovalDecision('dev-asha', run.id, apr1.id, 'reject', 'Temporary hold');
  assert.equal(run.status, 'blocked');
  run = await store.controlRun('dev-asha', run.id, 'retry');
  assert.equal(run.status, 'awaiting_approval');
  assert.equal(store.getRunApprovals(run.id)[0].status, 'pending');
});

