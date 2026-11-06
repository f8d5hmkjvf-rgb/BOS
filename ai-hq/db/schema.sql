-- AI HQ : persistance des états importants de la simulation.
CREATE TABLE IF NOT EXISTS sim_saves (
  slot        TEXT PRIMARY KEY,
  seed        INTEGER      NOT NULL,
  tick        BIGINT       NOT NULL,
  sim_day     INTEGER      NOT NULL,
  sim_sec     INTEGER      NOT NULL,
  snapshot    JSONB        NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Vue dénormalisée par agent (requêtable : positions et besoins).
CREATE TABLE IF NOT EXISTS sim_agent_states (
  slot        TEXT     NOT NULL REFERENCES sim_saves(slot) ON DELETE CASCADE,
  agent_id    TEXT     NOT NULL,
  on_duty     BOOLEAN  NOT NULL,
  tile_x      INTEGER,
  tile_y      INTEGER,
  needs       JSONB    NOT NULL,
  PRIMARY KEY (slot, agent_id)
);

-- Missions IA réelles : source de vérité côté serveur, lue par la simulation.
CREATE TABLE IF NOT EXISTS agent_missions (
  agent_id    TEXT PRIMARY KEY,
  status      TEXT NOT NULL CHECK (status IN ('idle','busy','blocked','awaiting_approval','offline')),
  task_title  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Journal des intentions autorisées par un humain (traçabilité).
CREATE TABLE IF NOT EXISTS authorized_intents (
  id           TEXT PRIMARY KEY,
  agent_id     TEXT NOT NULL,
  kind         TEXT NOT NULL,
  summary      TEXT NOT NULL,
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
