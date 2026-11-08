# AGENTS.md — AI Agent Operating Instructions for Dressly

> **CRITICAL DIRECTIVE**: Every AI agent operating in this repository MUST read and adhere to these guidelines before executing any changes, code modifications, or refactoring.

---

## 1. Absolute Priority: Documentation Maintenance Rule

Whenever **ANY** modification is made to the software (including features, architectural adjustments, API endpoints, database entities, UI components, configurations, tools, scripts, or workflows):

1. **Mandatory Scope**:
   - `README.md` (English documentation portal)
   - `README.it.md` (Italian documentation portal)
   - Relevant files in `docs/` (`API_REFERENCE.md`, `ARCHITECTURE.md`, `AUTHENTICATION.md`, `DATA_MODEL.md`, `DEPLOYMENT_AND_DEVOPS.md`, `FRONTEND_ARCHITECTURE.md`, `OFFLINE_SYNC.md`, `WARDROBE_FEATURES.md`, `LLM_GUIDELINES.md`)
2. **STRICT FORMAT CONSTRAINT (Non-negotiable)**:
   - **DO NOT** document modifications as a "changelog", "recent changes", "history", "release notes", or list of changes made.
   - **DO** directly modify and update the existing descriptions, architecture diagrams, data models, tables, endpoints, and specifications in place.
   - The documentation must always read as the **current, single source of truth** representing the active state of the application.

---

## 2. Project Overview & Monorepo Architecture

**Dressly** is a private-first digital wardrobe, outfit composition planner, and laundry management system with offline-first PWA resilience and bi-directional synchronization.

- **Backend**: NestJS 12, TypeORM 1.1 with `better-sqlite3` v12 (WAL mode enabled), `sharp` for image compression (WebP), `jose` for OIDC/PKCE verification.
- **Frontend**: Angular 22 standalone components (no `NgModule`), Angular Signals (`signal`, `computed`, `effect`), IndexedDB (`OfflineStorageService`), custom Service Worker (`sw.js`).
- **Container**: Unified multi-stage Docker container running Nginx and NestJS managed by `supervisord`.

### Directory Map
```text
/
├── backend/                  # NestJS API, TypeORM entities, services, controllers, seed
│   ├── src/
│   │   ├── common/           # Auth guards, decorators, sync types, tag code utility
│   │   ├── controllers/      # REST API controllers (clothes, outfits, sync, domains)
│   │   ├── entities/         # TypeORM entity definitions
│   │   ├── services/         # Domain services and SQLite repositories
│   │   └── database/         # Database dataSource and seed runner
│   └── package.json
├── frontend/                 # Angular 22 Single-Page Application (PWA)
│   ├── src/app/
│   │   ├── core/             # Services: api, auth, sync, offline-storage, laundry, pwa
│   │   ├── features/         # Features: wardrobe, outfits, reference-data, auth, errors
│   │   ├── layout/           # AppShellComponent with navigation header & counters
│   │   └── shared/           # Reusable UI components (modals, dropdowns, buttons)
│   ├── public/               # Static assets, manifest.webmanifest, and sw.js
│   └── package.json
├── deploy/                   # Container configurations (supervisord.conf, nginx.unified.conf)
├── docs/                     # Comprehensive technical documentation suite
├── AGENTS.md                 # Universal AI Agent guidelines (this file)
└── README.md / README.it.md  # Primary bilingual documentation portals
```

---

## 3. Core Architectural Invariants (Never Violate)

1. **Strict Data Isolation by `userId`**:
   - Every entity query and mutation (`find`, `findOne`, `save`, `update`, `delete`, `count`) across `Clothes`, `Outfit`, `WashingItem`, `IroningItem`, and reference catalogs MUST explicitly filter by `where: { userId: user.id }`.
   - Never permit cross-tenant data access or unauthenticated mutations.

2. **BFF Security Pattern & Token Protection**:
   - Never store access, refresh, or ID tokens in `localStorage`, `sessionStorage`, or JavaScript memory variables.
   - All browser HTTP requests must use credential forwarding (`credentials: 'include'`).
   - Authenticated endpoints must use `@UseGuards(BearerJwtGuard)` and retrieve user claims with `@CurrentUser() user: AuthUser`.

3. **3-Character Tag Code Specification**:
   - Tag codes must be exactly 3 characters drawn strictly from the unambiguous charset:
     ```typescript
     TAG_CODE_CHARSET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
     ```
   - Ambiguous characters (`0`, `O`, `1`, `I`, `L`, `U`) are strictly forbidden. Always use `normalizeTagCode()`.

4. **Mandatory Tombstone Tracking for Deletions**:
   - Whenever an entity is deleted from SQLite (`Clothes`, `Outfit`, reference data items), a corresponding record MUST be written to `SyncTombstone` with `userId`, `entityType`, `entityId`, and `deletedAt`. Without tombstones, offline clients cannot reconcile deletions.

5. **Cumulative Items vs Single Items in Laundry Queues**:
   - Non-cumulative items (`cloth.isCumulative === false`): quantity in `WashingItem` or `IroningItem` is always 1.
   - Cumulative items (`cloth.isCumulative === true`): the laundry queue tracks the number of items queued, capped at `cloth.quantity`. Deleting with `?all=true` removes the entire stack.

6. **100% Standalone Angular Components & Signals**:
   - Never use `NgModule`. All Angular components, pipes, and directives must be `standalone: true`.
   - Use Angular Signals (`signal()`, `computed()`, `effect()`) for reactive state management.

7. **Synchronized 10MB Image Upload Ceiling**:
   - Keep the 10MB upload threshold synchronized across:
     - `deploy/nginx.unified.conf` (`client_max_body_size 10m`)
     - `backend/src/controllers/clothes.controller.ts` (`limits: { fileSize: 10 * 1024 * 1024 }`)
     - Frontend file size validators.

---

## 4. Verification and Test Protocol

Before finalizing any task, run the appropriate validation commands:

| Scope | Command | Purpose |
| :--- | :--- | :--- |
| **All Tests** | `npm run test` | Executes both frontend and backend test suites |
| **Frontend Tests** | `npm --prefix frontend run test` | Vitest headless execution in JSDOM |
| **Backend Tests** | `npm --prefix backend run test` | Backend unit & sync tests via `tsx` |
| **Linting** | `npm run lint` | ESLint verification on backend code |
| **Build** | `npm run build` | Verifies full production build of frontend and backend |

---

## 5. Agent Workflow Checklist

When performing work on this codebase, follow this sequence:

1. [ ] **Analyze**: Inspect existing code, entities, and relevant files in `docs/`.
2. [ ] **Implement**: Write minimal, clean, type-safe code upholding the invariants in Section 3.
3. [ ] **Verify**: Run lint, tests, and build commands. Fix any regressions immediately.
4. [ ] **Update Documentation In-Place**: Directly update `README.md`, `README.it.md`, and affected `docs/*.md` files to reflect the new software state. **Do not add a changelog section.**
