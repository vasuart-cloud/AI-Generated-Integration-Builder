# CloudEagle Developer Integration Studio

> **From API documentation to trustworthy integration code—with developers in control.**

CloudEagle Developer Integration Studio is an interactive, full-stack developer workbench for creating, validating, supervising, reviewing, and packaging enterprise SaaS API connectors in TypeScript.

---

## 1. Architecture Overview

- **Frontend (`src/`):** React 19 + TypeScript + Tailwind CSS v4 modular SPA featuring:
  - **Screen 1 (`OnboardingModal.tsx`):** Dismissible, resumable 3-step developer onboarding persisted per developer profile (`?autostart=1` supported for direct entry).
  - **Screen 2 (`CatalogView.tsx`):** Seeded immutable CloudEagle system catalog references (Salesforce, HubSpot, SMS/Twilio, WhatsApp Business, Microsoft Teams, Slack, Google Meet) + unseeded Scheduling category for custom Calendly creation, with persisted Tile/List modes, search, category counts, sorting, and RBAC enforcement.
  - **Screen 3 (`CreateIntegrationFlow.tsx` — Step 1):** Conversational split-pane assistant + synchronized live Integration Definition form + custom category creation.
  - **Screen 4 (`CreateIntegrationFlow.tsx` — Step 2):** Hard server-side API Documentation Validation Gate supporting HTTPS URLs, OpenAPI 3.x / Swagger 2.0 JSON & YAML paste/upload, and an explicitly labeled Curated Calendly API v2 Sandbox Fixture.
  - **Screen 5 (`CreateIntegrationFlow.tsx` — Step 3):** Grounded Capability Discovery (`Documented`, `Derived`, `Not available in source`), explicit derived activity proxy disclosures, server Model Registry picker, and collector parameter configuration.
  - **Screen 6 (`AgentWorkbenchView.tsx`):** 8-stage sequential Multi-Agent Workbench (`Orchestrator` → `Documentation Analyst` → `Capability & Mapping Agent` → `Authentication Agent` → `Client Code Agent` → `Resilience Agent` → `Security Reviewer` → `Test & Packaging Agent`) with 3 mandatory human-in-the-loop approval checkpoints, Pause/Resume/Cancel/Retry controls, and a deterministic Demo Failure Lab.
  - **Screen 7 (`CodeWorkspaceView.tsx`):** IDE file explorer, open tabs, line-numbered code editor with Undo/Redo, unified Diff view against generated baseline, versioned Save/Restore, static/security vs. fixture test inspector, and downloadable `.zip` export.
  - **Screen 8 (`TracesView.tsx`):** Searchable, filterable trace timeline with automatic token/PII redaction, trace ID copy, sanitized log JSON download, and deep-link retry recovery.
- **Backend (`server.ts`, `src/server/*`):** Express + TypeScript API server with durable JSON persistence (`.data/studio-store.json`), server-enforced RBAC, SSRF/DNS-rebinding guards, `@google/genai` server proxy, state machine enforcement, and `JSZip` archive packaging.

---

## 2. Configuring Company-Approved Models

All LLM credentials and provider invocations stay strictly on the server—no API keys are ever requested or exposed in the browser.

Configure environment variables on the server (or via AI Studio **Settings > Secrets**):

- `GEMINI_API_KEY`: Enables **Company Google Gemini** via the official `@google/genai` SDK (`User-Agent: aistudio-build`).
- `COMPANY_GEMINI_MODEL`: Optional administrator model override (defaults to `gemini-3.8-flash`).
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`: Optional enterprise provider credentials. When unset, **Company OpenAI** and **Company Claude** appear in the Model Registry as disabled with *"Contact admin to configure"*.
- **Deterministic Demo Engine (`deterministic-demo-v1`):** Always available for credential-free sandbox runs and explicitly labeled `(simulated)` in every run, agent step, and trace event. Never fabricates live provider invocations.

---

## 3. Security Limits & Trust Boundaries

1. **System Immutability & Creator RBAC:** Seeded default integrations (`sourceType=system, isDefault=true`) return HTTP `403` on any edit/delete attempt by any user. Custom integrations derive `ownerId` strictly from the server session actor (`x-developer-id` in demo mode; authentication session in production) and return `403` to non-owners.
2. **SSRF & Untrusted Documentation Handling:** Documentation URL validation runs server-side over HTTPS only, rejecting embedded credentials, `localhost`, private/loopback/link-local/cloud-metadata IP ranges (`127.0.0.0/8`, `10.0.0.0/8`, `169.254.169.254`, IPv6 `::1`/`fe80::`), raw IP literals, DNS rebinding, unsafe redirects, and responses over 1.5 MB. External docs are treated as untrusted data.
3. **Zero Fabricated Metrics:** For Calendly API v2, `GET /scheduled_events` over a 30-day window is explicitly typed and disclosed as `derived_scheduling_activity_proxy`—never presented as interactive login activity, paid-license utilization, purchased seat caps, or billed usage.
4. **Redacted Observability:** `redactSensitiveData` scrubs `Bearer` headers, `pat_*`/`sk_*`/`AIza*` keys, query secrets, and email PII across trace metadata before storage or log download.

---

## 4. What Is Real vs. Simulated & Explicit MVP Boundaries

- **Real:** Server-side RBAC, persistent state store across page reloads, SSRF/DNS URL validation, live HTTPS fetching & OpenAPI JSON/YAML parsing, `@google/genai` server calls when `GEMINI_API_KEY` is configured, 8-stage checkpointed state machine, mandatory human approval gates, real coherent downloadable TypeScript files, static secret/host security scanning on user edits, and ZIP generation.
- **Simulated (Explicitly Labeled):**
  - **Curated Calendly API v2 Demo Fixture:** Offered when `developer.calendly.com` serves a client-rendered SPA shell without static OpenAPI markup or when outbound internet is restricted; badged as *Sandbox Fixture Mode*, never as a live scan.
  - **Deterministic Demo Engine (`deterministic-demo-v1`):** Clearly labeled simulated execution engine for demos without live LLM keys.
  - **Demo Lab Fault Toggles:** Deterministic error injections (`401`, `403`, `429`, `500`, invalid schema, unsafe pagination redirect, model unavailable, security block, interrupted run) labeled as Demo Simulations.
- **Out of Scope in MVP (Not Claimed):**
  - **No Automatic Production Deployment:** Completed packages are marked *Generated & Validated with Fixtures*, never *Deployed*.
  - **No Arbitrary Runtime Code Execution:** Generated code undergoes static contract, security regex/AST-pattern, and deterministic fixture checks rather than executing untrusted code in the host process.
  - **Connector Language:** TypeScript is fully supported end-to-end; Python connector synthesis is not enabled in this MVP.

---

## 5. Running & Verifying the Application

```bash
# Run unit & state-machine acceptance tests
npm test

# Typecheck full-stack codebase
npm run lint

# Build production bundle
npm run build

# Start development server on port 3000
npm run dev
```

### Quick Demo Verification Checklist
1. Open the app as **Asha Patel** → step through or skip the **3-step Onboarding Wizard** (replayable from **Help > Replay Onboarding Wizard**).
2. In **Integration Catalog**, toggle **Tile / List**, filter categories, and open **Salesforce** to verify the `Managed by CloudEagle: view only` lock.
3. Click **+ Add Integration** → create **Calendly** in **Scheduling** (`Developer Console` + `API-only`).
4. In **Step 2 (Validate Docs)**, test `https://google.com` → verify rejection and disabled **Proceed** button. Click **Load Curated Calendly Demo Documentation (Fixture)** (or validate live URL) → **Proceed** unlocks.
5. In **Step 3**, review Documented vs. Derived Proxy vs. Unavailable capabilities, select **Deterministic Demo Engine** (or **Company Gemini**), and click **Generate Integration Code**.
6. Supervise the **8-Agent Workbench**, test **Pause** → refresh browser → **Resume**, approve all **3 Mandatory Checkpoints**, edit/save a file in **Code Workspace**, test a **429** fault in **Demo Lab** → **View Trace** → **Retry Step**, download the `.zip`, and switch to **Ravi Menon** in the **Demo identity switcher** to verify View-Only access on Asha's custom integration.
