# LLM & AI Agent Architecture Guidelines

This document provides concise, high-density technical instructions, architectural invariants, and directory mappings specifically optimized for **Large Language Models (LLMs)** and autonomous coding agents interacting with the **Dressly** repository.

---

## 1. Core Architectural Invariants (Never Break These)

When generating, modifying, or refactoring code in Dressly, you MUST uphold the following rules:

1. **Strict Data Isolation by `userId`**:
   - Every single entity query and mutation (`find`, `findOne`, `update`, `delete`, `count`) across `Clothes`, `Outfit`, `WashingItem`, `IroningItem`, and reference catalogs MUST include `where: { userId: user.id }`.
   - Never allow cross-tenant or unauthenticated queries.
2. **Backend-for-Frontend (BFF) Auth & No Client-Side Tokens**:
   - Never store access, refresh, or ID tokens in `localStorage`, `sessionStorage`, or JavaScript memory variables.
   - All browser HTTP calls MUST use standard credential forwarding (`credentials: 'include'`).
   - Any new authenticated endpoint must be decorated with `@UseGuards(BearerJwtGuard)` and read user claims via `@CurrentUser() user: AuthUser`.
3. **3-Character Tag Code Specification**:
   - Tag codes must be exactly 3 characters drawn strictly from:
     ```typescript
     TAG_CODE_CHARSET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
     ```
   - Never use ambiguous characters: `0`, `O`, `1`, `I`, `L`, `U`.
   - Always normalize tag codes using `normalizeTagCode()` (trim and uppercase).
4. **Mandatory Tombstone Tracking for Deletions**:
   - Whenever an entity is deleted from SQLite (`Clothes`, `Outfit`, or any reference data type), you MUST write a record to `SyncTombstone` with `userId`, `entityType`, `entityId`, and `deletedAt`. Without this, offline clients cannot discover deletions.
5. **Cumulative Clothes vs Single Items in Laundry**:
   - If `cloth.isCumulative` is `false`, quantity in `WashingItem` or `IroningItem` is always 1.
   - If `cloth.isCumulative` is `true`, the laundry queue quantity tracks how many units of the stack are queued, capped at `cloth.quantity`. Deleting with `?all=true` removes the entire stack.
6. **100% Standalone Angular Components**:
   - Never create or reference `NgModule`. All new components, pipes, and directives must be declared with `standalone: true`.
   - Use Angular Signals (`signal()`, `computed()`, `effect()`) for reactive component state.
7. **Consistent 10MB Image Upload Ceiling**:
   - Never alter the 10MB upload threshold in one layer without synchronizing all three: `deploy/nginx.unified.conf` (`client_max_body_size 10m`), `backend/src/controllers/clothes.controller.ts` (`limits: { fileSize: 10 * 1024 * 1024 }`), and frontend file size validators.
8. **Mandatory In-Place Documentation Synchronization (No Changelogs)**:
   - Any modification to software capabilities, models, endpoints, configuration, or architecture MUST be immediately updated across `README.md`, `README.it.md`, and affected files in `docs/`.
   - Never append updates as a "changelog", "recent changes", or "history" section. Update the actual descriptions, tables, and specifications in place so documentation remains the single current source of truth. Refer to [AGENTS.md](../AGENTS.md) for full instructions.

---

## 2. Codebase Directory Cheat-Sheet

```text
/
├── backend/
│   ├── src/
│   │   ├── auth.controller.ts            # OIDC PKCE login, callback, refresh, logout
│   │   ├── health.controller.ts          # /health probe
│   │   ├── public.controller.ts          # /oidc/config and /oidc/metadata
│   │   ├── common/
│   │   │   ├── auth/                     # BearerJwtGuard, CurrentUser decorator, AuthUser
│   │   │   ├── sync/                     # SyncPayloadDto, SyncResponseDto, SyncConflict
│   │   │   └── utils/                    # tag-code.util.ts (3-char charset, collision math)
│   │   ├── controllers/
│   │   │   ├── current-user.controller.ts# GET /api/me (triggers user provisioning & seed)
│   │   │   ├── clothes.controller.ts     # Clothes CRUD, laundry queues, attachments
│   │   │   ├── outfits.controller.ts     # Outfits CRUD, 2D canvas layout persistence
│   │   │   ├── reference-data.controller.ts # Catalogs CRUD (colors, brands, etc.)
│   │   │   └── sync.controller.ts        # POST /api/sync, GET /api/sync
│   │   ├── entities/                     # TypeORM SQLite entities
│   │   ├── services/                     # Business logic and database operations
│   │   └── seed/                         # Default catalog seeds (colors, types, etc.)
│   └── package.json                      # NestJS 12, TypeORM 1.1, better-sqlite3 12, sharp
├── frontend/
│   ├── src/app/
│   │   ├── app.config.ts                 # Standalone providers
│   │   ├── app.routes.ts                 # Route definitions and auth guards
│   │   ├── core/                         # ApiService, AuthService, SyncService, OfflineStorageService
│   │   ├── features/
│   │   │   ├── auth/                     # Login & callback components
│   │   │   ├── wardrobe/                 # Main inventory grid, detail view, wizard editor, care queues
│   │   │   ├── outfits/                  # Outfits grid, detail view, 2D interactive canvas
│   │   │   └── reference-data/           # Domain management page (CRUD on catalogs)
│   │   ├── layout/                       # AppShellComponent (header, counters, sync badge)
│   │   └── shared/                       # Buttons, dropdowns, modals, utilities
│   ├── public/
│   │   ├── manifest.webmanifest          # PWA metadata
│   │   └── sw.js                         # Custom Service Worker (precache, network-first, skipWaiting)
│   └── package.json                      # Angular 22, Angular CDK 22, Vitest 4
├── deploy/
│   ├── nginx.unified.conf                # Unified container Nginx proxy & caching headers
│   └── supervisord.conf                  # Supervisor configuration managing Node + Nginx
├── docs/                                 # Technical documentation suite
├── AGENTS.md                             # AI agent instructions and mandatory invariants
├── Dockerfile                            # Multi-stage production container build
├── docker-compose.yml                    # Local/production container orchestration
└── .github/workflows/
    ├── docker-multiarch.yml              # Multi-arch (amd64 / arm64) GHCR build pipeline
    └── release.yml                       # Semantic versioning & develop-to-main merge workflow
```

---

## 3. Standard Verification & Test Commands

When implementing changes, verify the workspace using these commands:

| Action | Working Directory | Command |
| :--- | :--- | :--- |
| **Run Frontend Unit Tests** | `frontend/` | `npm run test` (Executes Vitest in non-watch mode) |
| **Run Backend Unit & Sync Tests** | `backend/` | `npm run test` (Executes tests via `tsx`) |
| **Lint Backend** | Root or `backend/` | `npm run lint` or `npm --prefix backend run lint` |
| **Build Frontend** | `frontend/` | `npm run build` |
| **Build Backend** | `backend/` | `npm run build` |
| **Run Seed in Dev** | `backend/` | `npm run seed:run` |

---

## 4. Common Extension Patterns

### Pattern A: Adding a New Field to `Clothes`
1. **Entity**: Modify `backend/src/entities/clothes.entity.ts`. Add `@Column({ type: '...', nullable: true })`.
2. **DTO & Sync**: Update `backend/src/common/sync/sync.types.ts` (`ClothesSyncInput`) and `backend/src/services/sync.service.ts` to include the field in LWW comparisons.
3. **Frontend Models**: Update `frontend/src/app/core/models.ts` (`ClothesItem`).
4. **Editor UI**: Update `frontend/src/app/features/wardrobe/pages/editor/editor.component.ts` (Reactive form and template).
5. **Detail UI**: Update `frontend/src/app/features/wardrobe/pages/detail/detail.component.html`.

### Pattern B: Adding a New Reference Catalog
1. **Entity**: Create new entity in `backend/src/entities/` extending `BaseReference`.
2. **Module**: Register entity in `backend/src/app.module.ts` TypeORM entities array.
3. **Service & Controller**: Add category name to `REFERENCE_KINDS` in `reference-data.service.ts` and controller endpoints in `reference-data.controller.ts`.
4. **Tombstones**: Ensure `remove()` writes to `SyncTombstone`.
5. **Frontend**: Add to `ReferenceKind` union in `frontend/src/app/core/models.ts` and register in `DomainManagementPageComponent`.
