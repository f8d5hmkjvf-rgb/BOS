-- AI HQ : schéma PostgreSQL (idempotent, appliqué au démarrage du serveur et du worker).

-- ---------------------------------------------------------------- Simulation de vie
CREATE TABLE IF NOT EXISTS sim_saves (
  slot        TEXT PRIMARY KEY,
  seed        INTEGER      NOT NULL,
  tick        BIGINT       NOT NULL,
  sim_day     INTEGER      NOT NULL,
  sim_sec     INTEGER      NOT NULL,
  snapshot    JSONB        NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sim_agent_states (
  slot        TEXT     NOT NULL REFERENCES sim_saves(slot) ON DELETE CASCADE,
  agent_id    TEXT     NOT NULL,
  on_duty     BOOLEAN  NOT NULL,
  tile_x      INTEGER,
  tile_y      INTEGER,
  needs       JSONB    NOT NULL,
  PRIMARY KEY (slot, agent_id)
);

-- ---------------------------------------------------------------- Orchestration
CREATE TABLE IF NOT EXISTS missions (
  id           TEXT PRIMARY KEY,
  goal         TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('planning','running','reviewing','reporting','awaiting_approval','paused','done','failed','cancelled')),
  plan         JSONB,
  result       TEXT,
  error        TEXT,
  budget_usd   NUMERIC(10,4) NOT NULL,
  spent_usd    NUMERIC(12,6) NOT NULL DEFAULT 0,
  review_round INTEGER NOT NULL DEFAULT 0,
  automation_id TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  mission_id   TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('plan','meeting','execute','review','report')),
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  deliverable  TEXT NOT NULL DEFAULT '',
  assignee     TEXT NOT NULL,
  participants TEXT[] NOT NULL DEFAULT '{}',
  depends_on   TEXT[] NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL CHECK (status IN ('blocked','pending','running','awaiting_approval','done','failed','cancelled')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  revision     INTEGER NOT NULL DEFAULT 0,
  feedback     TEXT,
  result       TEXT,
  error        TEXT,
  lease_owner  TEXT,
  lease_until  TIMESTAMPTZ,
  run_after    TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mission_id, key)
);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS complexity TEXT NOT NULL DEFAULT 'standard';
CREATE INDEX IF NOT EXISTS tasks_claim_idx ON tasks (status, run_after);
CREATE INDEX IF NOT EXISTS tasks_mission_idx ON tasks (mission_id);

-- Historique complet des échanges de chaque agent avec l'API (reprise après validation humaine).
CREATE TABLE IF NOT EXISTS agent_messages (
  id          BIGSERIAL PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  mission_id  TEXT NOT NULL,
  agent_id    TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_messages_task_idx ON agent_messages (task_id, id);
CREATE INDEX IF NOT EXISTS agent_messages_agent_idx ON agent_messages (agent_id, id);

-- Conversations entre agents (réunions, consultations) : lignes réellement générées.
CREATE TABLE IF NOT EXISTS conversations (
  id           TEXT PRIMARY KEY,
  mission_id   TEXT,
  task_id      TEXT,
  kind         TEXT NOT NULL CHECK (kind IN ('meeting','consult')),
  title        TEXT NOT NULL,
  participants TEXT[] NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('open','closed','failed')),
  summary      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conversation_lines (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  speaker         TEXT NOT NULL,
  text            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Actions sensibles en attente de validation humaine.
CREATE TABLE IF NOT EXISTS approvals (
  id          TEXT PRIMARY KEY,
  mission_id  TEXT NOT NULL,
  task_id     TEXT NOT NULL,
  agent_id    TEXT NOT NULL,
  tool_use_id TEXT NOT NULL,
  action      TEXT NOT NULL,
  summary     TEXT NOT NULL,
  payload     JSONB NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','executed','failed')),
  result      TEXT,
  decided_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contrôle des coûts : chaque appel API est tracé.
CREATE TABLE IF NOT EXISTS api_usage (
  id              BIGSERIAL PRIMARY KEY,
  mission_id      TEXT,
  task_id         TEXT,
  agent_id        TEXT NOT NULL,
  purpose         TEXT NOT NULL,
  model           TEXT NOT NULL,
  input_tokens    INTEGER NOT NULL,
  output_tokens   INTEGER NOT NULL,
  cache_read      INTEGER NOT NULL DEFAULT 0,
  cache_write     INTEGER NOT NULL DEFAULT 0,
  web_searches    INTEGER NOT NULL DEFAULT 0,
  cost_usd        NUMERIC(12,6) NOT NULL,
  request_id      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_usage_day_idx ON api_usage (created_at);

-- Bus d'événements (serveur ⇄ worker ⇄ interface).
CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Automatisations : missions récurrentes.
CREATE TABLE IF NOT EXISTS automations (
  id               TEXT PRIMARY KEY,
  goal             TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL CHECK (interval_minutes >= 15),
  budget_usd       NUMERIC(10,4) NOT NULL,
  enabled          BOOLEAN NOT NULL DEFAULT true,
  next_run_at      TIMESTAMPTZ NOT NULL,
  last_mission_id  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Battements de cœur des workers (supervision).
CREATE TABLE IF NOT EXISTS workers (
  id          TEXT PRIMARY KEY,
  heartbeat   TIMESTAMPTZ NOT NULL,
  running     INTEGER NOT NULL DEFAULT 0,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ancienne table (v1) conservée pour compatibilité.
CREATE TABLE IF NOT EXISTS authorized_intents (
  id            TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL,
  kind          TEXT NOT NULL,
  summary       TEXT NOT NULL,
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- Connecteurs (v3)
ALTER TABLE missions ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normale';
ALTER TABLE missions ADD COLUMN IF NOT EXISTS budget_warned BOOLEAN NOT NULL DEFAULT false;

-- Configuration des connecteurs : réglages en clair, secrets chiffrés (AES-256-GCM, clé AIHQ_ENCRYPTION_KEY).
CREATE TABLE IF NOT EXISTS connectors (
  kind            TEXT PRIMARY KEY CHECK (kind IN ('n8n','google','slack','sheets')),
  settings        JSONB NOT NULL DEFAULT '{}',
  secret_enc      TEXT,
  -- 'connected' uniquement après un test réel réussi.
  status          TEXT NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured','configured','connected','error')),
  account         TEXT,
  last_tested_at  TIMESTAMPTZ,
  last_error      TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Anti-CSRF du flux OAuth Google (usage unique, 10 minutes).
CREATE TABLE IF NOT EXISTS oauth_states (
  state       TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- File de synchronisation vers Google Sheets : une ligne par mission (dédoublonnage), version croissante.
CREATE TABLE IF NOT EXISTS sync_queue (
  mission_id   TEXT PRIMARY KEY,
  version      INTEGER NOT NULL DEFAULT 1,
  synced_version INTEGER NOT NULL DEFAULT 0,
  attempts     INTEGER NOT NULL DEFAULT 0,
  next_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Historique des exécutions et erreurs des connecteurs (n8n, Sheets, Gmail, Slack).
CREATE TABLE IF NOT EXISTS sync_runs (
  id              BIGSERIAL PRIMARY KEY,
  connector       TEXT NOT NULL,
  action          TEXT NOT NULL,
  target          TEXT,
  status          TEXT NOT NULL CHECK (status IN ('ok','error','demo')),
  http_status     INTEGER,
  error           TEXT,
  duration_ms     INTEGER,
  idempotency_key TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sync_runs_created_idx ON sync_runs (created_at DESC);

-- Tableau de DÉMONSTRATION (quand aucun Google Sheets réel n'est connecté) : même logique d'upsert.
CREATE TABLE IF NOT EXISTS sheet_demo_rows (
  mission_id  TEXT PRIMARY KEY,
  row         JSONB NOT NULL,
  version     INTEGER NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
