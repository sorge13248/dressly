# Dressly

Dressly è una web app per gestire il proprio guardaroba. Permette di catalogare capi, allegare foto, organizzare dati di riferimento personalizzati per utente e accedere tramite autenticazione OIDC con sessione gestita dal backend.

Il progetto è organizzato come monorepo npm con frontend Angular e backend NestJS. Il backend espone le API sotto `/api`, usa SQLite tramite TypeORM e salva i token OIDC in cookie `HttpOnly`.

## Perché esiste

Dressly nasce come reimplementazione moderna di un'app guardaroba con questi obiettivi:

- esperienza utente semplice ma curata;
- dati sempre separati per utente;
- gestione completa di capi, attributi, cura, acquisto e allegati;
- stack leggero, facile da avviare anche in locale o via Docker.

## Funzionalità principali

- login tramite provider OIDC;
- lista guardaroba con ricerca e filtri;
- creazione, modifica, dettaglio ed eliminazione capi;
- upload, preview, rimozione e riordino allegati immagini;
- gestione dati di riferimento per utente: colori, brand, stagioni, temperature, occasioni d'uso, vestibilità, materiali, tipi e tag;
- supporto a istruzioni di lavaggio, asciugatura e stiratura;
- supporto a dettagli di acquisto opzionali;
- seed iniziale dei principali reference data per il singolo utente.

## Stack tecnologico

- frontend: Angular 22, SCSS, Angular CDK, RxJS;
- backend: NestJS 11, TypeORM, `better-sqlite3`;
- database: SQLite;
- autenticazione: OIDC confidential flow con PKCE e cookie `HttpOnly`;
- containerizzazione: Docker multi-stage + Docker Compose;
- processo runtime container: Nginx + backend Node orchestrati da Supervisor.

## Architettura

### Frontend

- applicazione Angular servita in sviluppo su `http://localhost:4200`;
- usa proxy verso `http://localhost:3000` per tutte le chiamate a `/api`;
- rotte principali:
	- `/login`
	- `/auth/callback`
	- `/wardrobe`
	- `/wardrobe/new`
	- `/wardrobe/:id`
	- `/wardrobe/:id/edit`
	- `/categories`

### Backend

- API NestJS in sviluppo su `http://localhost:3000`;
- prefisso globale `/api`;
- endpoint salute fuori prefisso: `/health`;
- autenticazione centralizzata in backend:
	- `GET /api/auth/login`
	- `GET /api/auth/callback`
	- `POST /api/auth/logout`
- endpoint pubblici di supporto OIDC:
	- `GET /oidc/config`
	- `GET /oidc/metadata`
- endpoint autenticati principali:
	- `GET /api/me`
	- CRUD reference data (`/api/colors`, `/api/brands`, `/api/seasons`, `/api/temperatures`, `/api/use-cases`, `/api/fits`, `/api/materials`, `/api/types`, `/api/tags`)
	- CRUD capi e allegati sotto `/api/clothes`

### Persistenza

- database SQLite locale configurabile via `DB_PATH`;
- allegati salvati su filesystem sotto `backend/uploads/clothes/...` in sviluppo;
- reference data scoped per utente;
- seed iniziale applicato al solo utente indicato dalle variabili `SEED_USER_*`.

## Struttura repository

```text
.
├── backend/     # API NestJS, TypeORM, seed, storage allegati
├── frontend/    # SPA Angular
├── deploy/      # configurazioni Nginx per runtime container
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Prerequisiti

- Node.js 22+ consigliato;
- npm 11+;
- un provider OIDC raggiungibile per il login;
- Docker e Docker Compose opzionali, se vuoi eseguire tutto in container.

## Avvio rapido in locale

### 1. Installa le dipendenze

Dalla root del progetto:

```bash
npm install
```

### 2. Crea il file `.env` nella root

Il backend legge prima `../.env` rispetto alla cartella `backend`, quindi il file va creato nella root del monorepo.

Esempio minimo:

```env
PORT=3000
CORS_ALLOWED_ORIGINS=http://localhost:4200

DB_PATH=../dressly.sqlite
DB_SYNCHRONIZE=true
DB_LOGGING=false

OIDC_ISSUER_URL=https://your-issuer.example/realms/your-realm
OIDC_CLIENT_ID=dressly
OIDC_CLIENT_SECRET=replace-me
OIDC_REDIRECT_URI=http://localhost:3000/api/auth/callback
OIDC_FRONTEND_REDIRECT_BASE_URL=http://localhost:4200

SEED_USER_SUBJECT=local-dev-user
SEED_USER_EMAIL=dev@example.com
SEED_USER_DISPLAY_NAME=Local Dev User
```

Note importanti:

- `DB_PATH=../dressly.sqlite` è il valore consigliato in locale con gli script workspace attuali;
- `OIDC_CLIENT_SECRET` è obbligatorio per il flow configurato nel backend;
- `OIDC_REDIRECT_URI` deve puntare al callback backend, non al frontend;
- `CORS_ALLOWED_ORIGINS` deve includere l'origine del frontend Angular.

### 3. Esegui il seed iniziale

```bash
npm run seed:run --workspace backend
```

Il seed richiede almeno `SEED_USER_SUBJECT`. Se l'utente non esiste ancora, viene creato e popolato con i reference data di default.

### 4. Avvia backend e frontend

In due terminali separati dalla root del progetto:

```bash
npm run start:backend
```

```bash
npm run start:frontend
```

Poi apri:

- frontend: `http://localhost:4200`
- backend health check: `http://localhost:3000/health`

## Script disponibili

### Root

- `npm run start:frontend` avvia Angular in sviluppo;
- `npm run start:backend` avvia NestJS in watch mode;
- `npm run build` esegue build di frontend e backend;
- `npm run test` esegue i test disponibili nei workspace;
- `npm run lint` esegue il lint del backend.

### Backend

- `npm run build --workspace backend`
- `npm run start:dev --workspace backend`
- `npm run start --workspace backend`
- `npm run seed:run --workspace backend`
- `npm run lint --workspace backend`

### Frontend

- `npm run start --workspace frontend`
- `npm run build --workspace frontend`
- `npm run test --workspace frontend`

## Esecuzione con Docker

Il repository include un `Dockerfile` multi-stage e un `docker-compose.yml` che pubblicano l'app unificata sulla porta `8080`.

### Avvio

```bash
docker compose up --build
```

### Cosa succede nel container

- il frontend viene compilato e servito da Nginx;
- il backend NestJS viene compilato ed eseguito in produzione;
- SQLite viene salvato nel volume `dressly-backend-data`;
- `config.json` viene montato come file statico del frontend;
- l'health check risponde su `http://localhost:8080/health`.

## Autenticazione OIDC

Dressly usa un approccio BFF-style:

- il frontend non salva bearer token in `localStorage`;
- il login parte da `/api/auth/login`;
- il callback OIDC viene gestito dal backend;
- access token, id token e refresh token sono salvati in cookie `HttpOnly`;
- le API protette leggono il token dai cookie e verificano firma e claim via JWKS del provider.

Per questo motivo, un setup locale senza provider OIDC configurato non consente il normale accesso all'applicazione autenticata.

## Seed e dati di riferimento

Il seed iniziale prepara i cataloghi base per il singolo utente indicato nelle variabili ambiente:

- colori;
- brand;
- stagioni;
- temperature;
- occasioni d'uso;
- vestibilità;
- materiali;
- tipi.

I tag invece sono completamente custom e non vengono pre-popolati dal seed di default.

## Stato del progetto

Attualmente il repository contiene:

- frontend Angular 22 con shell applicativa, login, callback OIDC, guardaroba, dettaglio, editor e pagina categorie;
- backend NestJS con CRUD capi, reference data utente e gestione allegati;
- database SQLite con sincronizzazione schema guidata da env;
- configurazione container pronta per deploy unificato.

## Troubleshooting rapido

### Il frontend parte ma non effettua login

Controlla queste variabili:

- `OIDC_ISSUER_URL`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `OIDC_REDIRECT_URI`
- `CORS_ALLOWED_ORIGINS`

### Il seed fallisce

Verifica che siano presenti almeno:

- `SEED_USER_SUBJECT`
- `DB_PATH`

### Le API non rispondono dal frontend

In sviluppo il frontend usa proxy verso `http://localhost:3000`. Verifica che il backend sia attivo e che la porta configurata in `PORT` coincida.

## Note per sviluppo

- il backend carica il file `.env` dalla root del monorepo e poi applica eventuali override locali;
- `DB_SYNCHRONIZE=true` è comodo in locale, ma in ambienti stabili va usato con criterio;
- i test backend non sono ancora implementati in modo sostanziale;
- il lint root attualmente copre il backend.

## Licenza

Questo progetto è distribuito con licenza GNU Affero General Public License v3.0 o successiva (AGPL-3.0-or-later).

Il testo completo è disponibile nel file `LICENSE` alla root del repository.
