# REST API Specification

This document provides a complete specification for all REST API endpoints exposed by the **Dressly** backend (`NestJS 12`).

---

## 1. Global Conventions

- **Base URL Prefix**: All protected and domain endpoints are prefixed with `/api`.
- **System Endpoints**: `/health`, `/oidc/config`, and `/oidc/metadata` are exempt from the `/api` prefix.
- **Content Type**: `application/json` for standard requests and responses; `multipart/form-data` for file uploads.
- **Authentication**: All endpoints marked with 🔒 require valid session cookies (`dressly_at`) or an `Authorization: Bearer <token>` header. Unauthenticated requests receive `401 Unauthorized`.
- **User Scoping**: All queries and mutations are automatically scoped to the authenticated user's `userId`.

---

## 2. System & Health Endpoints

### `GET /health`
Container and application health check endpoint.
- **Auth**: None
- **Response `200 OK`**:
  ```json
  {
    "status": "ok",
    "service": "dressly"
  }
  ```

### `GET /oidc/config`
Supplies OIDC public connection parameters to the frontend client.
- **Auth**: None
- **Response `200 OK`**:
  ```json
  {
    "issuerUrl": "https://auth.example.com/realms/dressly",
    "clientId": "dressly",
    "redirectUri": "http://localhost:3000/api/auth/callback"
  }
  ```

### `GET /oidc/metadata`
Proxies OpenID Connect discovery metadata from the upstream IdP.
- **Auth**: None
- **Response `200 OK`**: Upstream OIDC discovery JSON (`authorization_endpoint`, `token_endpoint`, `jwks_uri`, etc.).

---

## 3. Authentication Endpoints

### `GET /api/auth/login`
Initiates the confidential OIDC authorization code flow with PKCE.
- **Auth**: None
- **Response `302 Found`**: Redirects to the upstream IdP `authorization_endpoint`. Sets temporary PKCE verification cookies (`dressly_oidc_state`, `dressly_oidc_verifier`, `dressly_oidc_nonce`).

### `GET /api/auth/callback`
Receives code and state redirects from the Identity Provider.
- **Auth**: None (Validates state and PKCE cookies)
- **Query Parameters**:
  - `code` (string, required): Authorization code
  - `state` (string, required): Anti-CSRF state token
- **Response `302 Found`**: Redirects to frontend `/auth/callback?status=ok`. Sets session cookies (`dressly_at`, `dressly_it`, `dressly_rt`).

### `POST /api/auth/refresh`
Refreshes the current session using the `dressly_rt` refresh cookie.
- **Auth**: Valid `dressly_rt` cookie
- **Response `200 OK`**:
  ```json
  {
    "refreshed": true,
    "expiresIn": 3600
  }
  ```

### `POST /api/auth/logout`
Terminates the local user session.
- **Auth**: None
- **Response `200 OK`**: Clears all session and PKCE cookies.
  ```json
  {
    "loggedOut": true
  }
  ```

---

## 4. Current User Profile 🔒

### `GET /api/me`
Retrieves or auto-provisions the authenticated user's profile and guarantees reference catalog seeding.
- **Response `200 OK`**:
  ```json
  {
    "id": "c56a4180-65aa-42ec-a945-5fd21dec0538",
    "subject": "f581c8b3-3a52-4e94-81e0-c3d395ec1d28",
    "email": "user@example.com",
    "displayName": "Jane Doe",
    "pictureUrl": "https://avatar.example.com/photo.jpg"
  }
  ```

---

## 5. Reference Catalogs & Domain Management 🔒

Supported categories: `colors`, `brands`, `seasons`, `temperatures`, `use-cases`, `fits`, `materials`, `types`, `tags`, `rooms`, `locations`.

For `locations`, payloads include `roomId` linking the container or position to an existing user room.

### `GET /api/reference-data` or `GET /api/domains`
Returns all reference data categories grouped in a single payload.
- **Response `200 OK`**:
  ```json
  {
    "colors": [{ "id": "...", "name": "Navy Blue", "hexCode": "#000080", "sortOrder": 1 }],
    "brands": [{ "id": "...", "name": "Patagonia", "logoUrl": null, "sortOrder": 1 }],
    "seasons": [{ "id": "...", "name": "Winter", "icon": "snow", "sortOrder": 1 }],
    "temperatures": [{ "id": "...", "name": "Cold", "icon": "thermometer-low", "sortOrder": 1 }],
    "useCases": [{ "id": "...", "name": "Casual", "icon": "coffee", "sortOrder": 1 }],
    "fits": [{ "id": "...", "name": "Regular", "sortOrder": 1 }],
    "materials": [{ "id": "...", "name": "Wool", "sortOrder": 1 }],
    "types": [{ "id": "...", "name": "Sweater", "sortOrder": 1 }],
    "tags": [{ "id": "...", "name": "Favorite", "sortOrder": 1 }]
  }
  ```

### `GET /api/:category`
Lists items for a specific catalog category.
- **Response `200 OK`**: Array of catalog items.

### `POST /api/:category`
Creates a new catalog item.
- **Request Body**:
  ```json
  {
    "name": "Cashmere",
    "sortOrder": 10
  }
  ```
- **Response `201 Created`**: The newly created entity.

### `PUT /api/:category/:id`
Updates an existing catalog item.
- **Response `200 OK`**: Updated entity.

### `DELETE /api/:category/:id`
Deletes a catalog item and records a tombstone in `sync_tombstones`.
- **Response `200 OK`**: `{ "success": true }`.

---

## 6. Clothes Inventory 🔒

### `GET /api/clothes`
Lists all wardrobe items with support for rich filtering, pagination, and multi-criteria sorting.
- **Query Parameters**:
  - `search` (string): Text filter matching item name, brand name, notes, or 3-char tag code.
  - `brand_id` / `brand` (string / CSV): Filter by Brand ID(s).
  - `type_ids` / `type` (string / CSV): Filter by Clothing Type ID(s).
  - `color_ids` / `color` (string / CSV): Filter by Color ID(s).
  - `material_ids` / `material` (string / CSV): Filter by Material ID(s).
  - `season_ids` / `season` (string / CSV): Filter by Season ID(s).
  - `temperature_ids` / `temperature` (string / CSV): Filter by Temperature ID(s).
  - `use_case_ids` / `useCase` (string / CSV): Filter by Use Case ID(s).
  - `fit_ids` / `fit` (string / CSV): Filter by Fit ID(s).
  - `tag_ids` / `tag` (string / CSV): Filter by Tag ID(s).
  - `room_ids` / `room` (string / CSV): Filter by Storage Room ID(s).
  - `location_ids` / `location` (string / CSV): Filter by Storage Location ID(s).
  - `status` (string, optional): Filter by operational garment status: `in_wardrobe`, `in_storage`, `dismissed`, or `all`.
  - `size` (string): Filter by garment size.
  - `sort` (string, optional): Sort criteria. Supported values:
    - `created_desc` *(default)*: Most recently created first.
    - `created_asc`: Oldest created first.
    - `name_asc`: Alphabetical A-Z (item name or computed title).
    - `name_desc`: Alphabetical Z-A (item name or computed title).
    - `type_order`: Wardrobe sequence hierarchy (Tops -> Knitwear -> Outerwear -> Bottoms -> Full-body -> Underwear -> Footwear).
    - `type_asc`: Clothing type name A-Z.
    - `season_current`: Smart season relevance (current astronomical season and all-season garments first).
    - `season_cycle`: Annual seasonal progression (Autumn -> Winter -> Spring -> Summer).
    - `code_asc`: Alphanumeric 3-character tag code (items without codes placed at end).
    - `availability`: Clean and available garments first, followed by ironing and washing queues.
  - `page` (number, default: 1): Page number.
  - `per_page` (number, default: 50, max: 100): Items per page.
- **Response `200 OK`**: Object `{ items: Clothes[], total: number, page: number, perPage: number }`.

### `POST /api/clothes`
Creates a new clothing item, automatically generating care instruction relations and a unique tag code if not supplied.
- **Request Body Example**:
  ```json
  {
    "name": "Merino Wool Turtleneck",
    "code": "K7P",
    "size": "L",
    "notes": "Hand wash only",
    "isCumulative": false,
    "quantity": 1,
    "brandId": "uuid-brand",
    "typeId": "uuid-type",
    "fitId": "uuid-fit",
    "colorIds": ["uuid-color-1"],
    "materialIds": ["uuid-material-1"],
    "seasonIds": ["uuid-season-1"],
    "temperatureIds": ["uuid-temp-1"],
    "useCaseIds": ["uuid-usecase-1"],
    "tagIds": ["uuid-tag-1"],
    "washingInstruction": {
      "temperature": "cold",
      "washType": "hand_wash_only",
      "bleachType": "no_bleach",
      "stretch": true
    },
    "dryingInstruction": {
      "tumbleDry": false,
      "naturalDrying": "flat"
    },
    "ironingInstruction": {
      "temperature": "low",
      "steaming": false
    },
    "buyDetail": {
      "price": 120.00,
      "currency": "EUR",
      "buyDate": "2026-01-15",
      "store": "Boutique"
    }
  }
  ```
- **Response `201 Created`**: Created item with relations.

### `GET /api/clothes/:id`
Retrieves a single clothing piece with full relations.
- **Response `200 OK`**: `Clothes` entity.

### `PATCH /api/clothes/:id`
Updates clothing attributes, relations, or nested instructions.
- **Response `200 OK`**: Updated entity.

### `PATCH /api/clothes/bulk-status`
Batch updates the operational status and storage location for multiple garments atomically.
- **Request Body**:
  ```json
  {
    "clothes_ids": ["uuid-1", "uuid-2"],
    "status": "in_storage",
    "location_id": "uuid-location"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "updated": 2
  }
  ```

### `DELETE /api/clothes/:id`
Removes the clothing item, deleting associated physical photos, cascaded records, and writing a `SyncTombstone`.
- **Response `200 OK`**: `{ "success": true }`.

---

## 7. Media & Attachments 🔒

### `POST /api/clothes/:id/attachments`
Uploads a photo for a clothing item (Max size: 10MB).
- **Content-Type**: `multipart/form-data`
- **Form Fields**: `file` (Binary image file)
- **Response `201 Created`**: Attachment metadata with generated preview path.

### `DELETE /api/clothes/:clothesId/attachments/:attachmentId`
Deletes the photo from disk and database.
- **Response `200 OK`**: `{ "success": true }`.

### `PATCH /api/clothes/:clothesId/attachments/order`
Reorders the photo gallery for the clothing item.
- **Request Body**: `{ "attachment_ids": ["uuid-1", "uuid-2", "uuid-3"] }`
- **Response `200 OK`**: `{ "success": true }`.

### `GET /api/clothes/:clothesId/attachments/:attachmentId/file`
Streams the image file to the client.
- **Query Parameters**:
  - `variant` (optional): Set to `preview` to stream the Sharp-optimized WebP thumbnail; omit to stream the original image.
- **Response `200 OK`**: Image stream with inline `Content-Disposition`.

---

## 8. Laundry State Management 🔒

### `GET /api/clothes/laundry-counts`
Returns current counts of clothes in washing and ironing queues.
- **Response `200 OK`**:
  ```json
  {
    "washing": 3,
    "ironing": 2
  }
  ```

### `GET /api/clothes/washing`
Lists all items currently in the washing queue.
- **Response `200 OK`**: Array of items with quantity and clothing details.

### `POST /api/clothes/washing`
Adds one or more clothes to the washing queue.
- **Request Body**: `{ "clothesIds": ["uuid-1", "uuid-2"] }`
- **Response `201 Created`**: Updated queue list.

### `DELETE /api/clothes/washing/:clothesId`
Removes an item from washing. Decrements quantity for cumulative items, or deletes if quantity reaches zero.
- **Query Parameters**: `all=true` (removes all units at once).
- **Response `200 OK`**: Success acknowledgment.

### `POST /api/clothes/washing/:clothesId/move-to-ironing`
Atomically removes item from the washing bucket and adds it to the ironing bucket.
- **Query Parameters**: `all=true`
- **Response `200 OK`**: Success acknowledgment.

### `GET /api/clothes/ironing`
Lists all items currently in the ironing queue.
- **Response `200 OK`**: Array of items.

### `POST /api/clothes/ironing`
Adds clothes to the ironing queue.
- **Request Body**: `{ "clothesIds": ["uuid-1"] }`
- **Response `201 Created`**: Updated queue list.

### `DELETE /api/clothes/ironing/:clothesId`
Removes an item from ironing (marking it clean and ironed).
- **Query Parameters**: `all=true`
- **Response `200 OK`**: Success acknowledgment.

---

## 9. Outfits & 2D Canvas 🔒

### `GET /api/outfits`
Lists all outfits configured by the user.
- **Response `200 OK`**: Array of `Outfit` entities with member clothes and photo previews.

### `POST /api/outfits`
Creates a new outfit.
- **Request Body**:
  ```json
  {
    "name": "Smart Casual Friday",
    "description": "Navy blazer with beige chinos",
    "clothesIds": ["uuid-blazer", "uuid-chinos"],
    "season_ids": ["uuid-season"],
    "canvasLayout": {
      "uuid-blazer": { "x": 120, "y": 80, "scale": 1.0, "rotation": 0, "zIndex": 2 },
      "uuid-chinos": { "x": 140, "y": 260, "scale": 0.95, "rotation": 2, "zIndex": 1 }
    }
  }
  ```
- **Response `201 Created`**: The newly created outfit.

### `PATCH /api/outfits/:id`
Updates outfit metadata or saves updated 2D canvas coordinates.
- **Response `200 OK`**: Updated outfit.

### `DELETE /api/outfits/:id`
Deletes an outfit and creates a `SyncTombstone`.
- **Response `200 OK`**: `{ "success": true }`.

---

## 10. Offline Synchronization 🔒

### `POST /api/sync`
Bi-directional offline sync endpoint processing client-side mutations and returning server-side changes since `lastSyncAt`.
- **Request Body**:
  ```json
  {
    "lastSyncAt": "2026-11-08T08:00:00.000Z",
    "changes": {
      "referenceData": [...],
      "clothes": [...],
      "laundry": {
        "washing": { "added": ["uuid-1"], "removed": [] },
        "ironing": { "added": [], "removed": [] }
      },
      "outfits": [...]
    }
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "serverTime": "2026-11-08T08:30:00.000Z",
    "status": "ok",
    "conflicts": [],
    "applied": {
      "clothes": ["uuid-1"],
      "referenceData": [],
      "laundry": true,
      "outfits": []
    },
    "serverChanges": {
      "clothes": { "upserted": [...], "deleted": ["uuid-deleted"] },
      "referenceData": { "upserted": [...], "deleted": [] },
      "laundry": { "washing": [...], "ironing": [...] },
      "outfits": { "upserted": [...], "deleted": [] }
    }
  }
  ```

### `GET /api/sync`
Polls server changes since a specific timestamp without transmitting client mutations.
- **Query Parameters**: `since` (ISO 8601 string, optional).
- **Response `200 OK`**: Same response structure as `POST /api/sync`.
