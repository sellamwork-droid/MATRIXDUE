-- ============================================================
-- MATRIX PRO HUB v2 — Initial Schema
-- ============================================================
-- Order: base → structures-dependent → mt5_terminals-dependent → mt5_accounts-dependent

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS (safe re-run)
-- ============================================================
DO $$ BEGIN CREATE TYPE app_role AS ENUM ('admin', 'full', 'trader', 'analyst', 'viewer', 'viewerdash', 'client'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE account_status AS ENUM ('active', 'disabled', 'passed', 'blown'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE phase_type AS ENUM ('fase1', 'fase2', 'live'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE connection_status AS ENUM ('connected', 'disconnected', 'warning'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cross_status AS ENUM ('pending', 'active', 'closed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- BASE TABLES
-- ============================================================

-- 1. structures
CREATE TABLE IF NOT EXISTS structures (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  settings    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. profiles (linked to auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  full_name           TEXT,
  active_structure_id UUID REFERENCES structures(id),
  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. user_roles
CREATE TABLE IF NOT EXISTS user_roles (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       app_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 4. user_structure_access
CREATE TABLE IF NOT EXISTS user_structure_access (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  structure_id UUID NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  is_owner     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, structure_id)
);

-- 5. user_section_permissions (colonne esplicite, non JSON libero)
CREATE TABLE IF NOT EXISTS user_section_permissions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  can_dashboard         BOOLEAN NOT NULL DEFAULT TRUE,
  can_board             BOOLEAN NOT NULL DEFAULT TRUE,
  can_accounts          BOOLEAN NOT NULL DEFAULT TRUE,
  can_operations        BOOLEAN NOT NULL DEFAULT TRUE,
  can_trades            BOOLEAN NOT NULL DEFAULT TRUE,
  can_bilancio          BOOLEAN NOT NULL DEFAULT FALSE,
  can_calendario_payout BOOLEAN NOT NULL DEFAULT TRUE,
  can_propfirm          BOOLEAN NOT NULL DEFAULT FALSE,
  can_prop_counter      BOOLEAN NOT NULL DEFAULT TRUE,
  can_id                BOOLEAN NOT NULL DEFAULT FALSE,
  can_tabella           BOOLEAN NOT NULL DEFAULT FALSE,
  can_outlook           BOOLEAN NOT NULL DEFAULT FALSE,
  can_users             BOOLEAN NOT NULL DEFAULT FALSE,
  can_settings          BOOLEAN NOT NULL DEFAULT FALSE,
  can_install           BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLES DEPENDENT ON structures
-- ============================================================

-- 6. user_ids (operatori — passwords cifrate con pgcrypto)
CREATE TABLE IF NOT EXISTS user_ids (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  structure_id        UUID NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  identifier          TEXT NOT NULL,
  color               TEXT NOT NULL DEFAULT '#3b82f6',
  ea_api_key          TEXT,
  vps_ip              TEXT,
  vps_username        TEXT,
  vps_password_enc    TEXT,             -- cifrata con pgp_sym_encrypt
  outlook_email       TEXT,
  outlook_password_enc TEXT,            -- cifrata
  trust_wallets       JSONB NOT NULL DEFAULT '[]',
  prop_firms          JSONB NOT NULL DEFAULT '[]',
  rise_password_enc   TEXT,             -- cifrata
  rise_frase_segreta  TEXT,
  cellulare           TEXT,
  data_nascita        DATE,
  indirizzo           TEXT,
  sync_wait_min_minutes INT NOT NULL DEFAULT 5,
  sync_wait_max_minutes INT NOT NULL DEFAULT 15,
  is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(structure_id, identifier)
);

-- 7. prop_firm_rules
CREATE TABLE IF NOT EXISTS prop_firm_rules (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  structure_id           UUID REFERENCES structures(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  color                  TEXT NOT NULL DEFAULT '#3b82f6',
  profit_target_fase1    NUMERIC(5,2),
  profit_target_fase2    NUMERIC(5,2),
  max_loss_funded        NUMERIC(5,2),
  daily_loss_limit       NUMERIC(5,2),           -- MODIFICA: aggiunto
  overall_max_drawdown   NUMERIC(5,2),           -- MODIFICA: aggiunto
  rischio_max_operazione NUMERIC(5,2),
  giorni_minimi          INT,
  periodo_inattivita     INT,
  news_policy_challenge  TEXT,
  news_policy_funded     TEXT,
  profit_max_fase1       NUMERIC(5,2),           -- fix: era string
  profit_max_fase2       NUMERIC(5,2),           -- fix: era string
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. prop_firm_risk_configs
CREATE TABLE IF NOT EXISTS prop_firm_risk_configs (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  structure_id             UUID REFERENCES structures(id) ON DELETE CASCADE,
  prop_firm_name           TEXT NOT NULL,
  fase_min_risk            NUMERIC(5,2) NOT NULL DEFAULT 0.5,
  fase_max_risk            NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  live_min_risk            NUMERIC(5,2) NOT NULL DEFAULT 0.3,
  live_max_risk            NUMERIC(5,2) NOT NULL DEFAULT 0.8,
  esplosione_fase_risk     NUMERIC(5,2) NOT NULL DEFAULT 4.0,
  esplosione_live_risk     NUMERIC(5,2) NOT NULL DEFAULT 3.0,
  target_fase_min_risk     NUMERIC(5,2) NOT NULL DEFAULT 0.5,
  target_fase_max_risk     NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(structure_id, prop_firm_name)
);

-- 9. pair_config (metadati tecnici coppie)
CREATE TABLE IF NOT EXISTS pair_config (
  symbol          TEXT PRIMARY KEY,
  pip_size        NUMERIC(10,6) NOT NULL DEFAULT 0.0001,
  quote_currency  TEXT NOT NULL DEFAULT 'USD',
  contract_size   INT NOT NULL DEFAULT 100000
);

-- 10. mt5_server_mappings
CREATE TABLE IF NOT EXISTS mt5_server_mappings (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  structure_id   UUID REFERENCES structures(id) ON DELETE CASCADE,
  server_pattern TEXT NOT NULL,
  prop_firm_name TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. trading_pair_configs (Tabella Operatività)
CREATE TABLE IF NOT EXISTS trading_pair_configs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  structure_id UUID NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id),
  symbol       TEXT NOT NULL,
  min_pips     NUMERIC(8,2) NOT NULL DEFAULT 3,
  max_pips     NUMERIC(8,2) NOT NULL DEFAULT 10,
  spread       NUMERIC(8,2) NOT NULL DEFAULT 1,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  config_type  TEXT NOT NULL DEFAULT 'standard',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(structure_id, symbol, config_type)
);

-- 12. payout_events (MODIFICA: usa id_identifier anziché nome/cognome separati)
CREATE TABLE IF NOT EXISTS payout_events (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  structure_id   UUID NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES auth.users(id),
  id_identifier  TEXT NOT NULL,          -- riferimento a user_ids.identifier
  date           DATE NOT NULL,
  prop_firm      TEXT NOT NULL,
  account_login  TEXT,
  amount         NUMERIC(12,2),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. bilancio_entries (MODIFICA: + currency)
CREATE TABLE IF NOT EXISTS bilancio_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  structure_id    UUID NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id),
  entry_type      TEXT NOT NULL CHECK (entry_type IN ('entrata','uscita')),
  label           TEXT NOT NULL,
  secondary_label TEXT,
  amount          NUMERIC(12,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',   -- MODIFICA: aggiunto
  category        TEXT NOT NULL DEFAULT 'altro',
  month           INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year            INT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. rotation_logs
CREATE TABLE IF NOT EXISTS rotation_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  structure_id  UUID REFERENCES structures(id) ON DELETE CASCADE,
  terminal_id   UUID,
  id_identifier TEXT,
  account_login TEXT,
  event_type    TEXT NOT NULL,
  message       TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. microsoft_oauth_tokens (MODIFICA: tokens cifrati)
CREATE TABLE IF NOT EXISTS microsoft_oauth_tokens (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  structure_id      UUID REFERENCES structures(id) ON DELETE CASCADE,
  id_identifier     TEXT NOT NULL,
  access_token_enc  TEXT,         -- cifrato
  refresh_token_enc TEXT,         -- cifrato
  expires_at        TIMESTAMPTZ,
  email             TEXT,
  needs_reconnect   BOOLEAN NOT NULL DEFAULT FALSE,
  last_error        TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(structure_id, id_identifier)
);

-- ============================================================
-- TABLES DEPENDENT ON mt5_terminals
-- ============================================================

-- 16. mt5_terminals
CREATE TABLE IF NOT EXISTS mt5_terminals (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  structure_id             UUID NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  user_id                  UUID REFERENCES auth.users(id),
  id_identifier            TEXT NOT NULL,
  terminal_name            TEXT NOT NULL,
  broker_server            TEXT[] NOT NULL DEFAULT '{}',
  mt5_path                 TEXT,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  last_activity_at         TIMESTAMPTZ,
  connection_warning_level INT NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLES DEPENDENT ON mt5_accounts
-- ============================================================

-- 17. mt5_accounts
CREATE TABLE IF NOT EXISTS mt5_accounts (
  id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  structure_id               UUID NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  terminal_id                UUID REFERENCES mt5_terminals(id),

  -- Identità
  account_login              TEXT NOT NULL,
  account_name               TEXT,
  prop_firm_name             TEXT,
  id_identifier              TEXT,
  broker_server              TEXT,
  mt5_group                  TEXT,

  -- Stato
  account_status             account_status NOT NULL DEFAULT 'active',
  phase                      phase_type NOT NULL DEFAULT 'fase1',
  connection_status          connection_status NOT NULL DEFAULT 'disconnected',
  is_deleted                 BOOLEAN NOT NULL DEFAULT FALSE,

  -- Finanziari
  current_balance            NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_equity             NUMERIC(12,2) NOT NULL DEFAULT 0,
  initial_balance            NUMERIC(12,2) NOT NULL DEFAULT 0,
  account_size               NUMERIC(12,2) NOT NULL DEFAULT 0,
  profit_loss                NUMERIC(12,2) NOT NULL DEFAULT 0,
  profit_percentage          NUMERIC(8,4) NOT NULL DEFAULT 0,
  stage                      INT NOT NULL DEFAULT 0,

  -- Sync EA
  last_sync_at               TIMESTAMPTZ,
  api_key                    TEXT UNIQUE,
  mt5_password_enc           TEXT,      -- cifrata

  -- Config
  enabled_for_rotation       BOOLEAN NOT NULL DEFAULT TRUE,
  is_mobile                  BOOLEAN NOT NULL DEFAULT FALSE,
  visible_on_board           BOOLEAN NOT NULL DEFAULT TRUE,
  custom_target_percentage   NUMERIC(5,2),

  -- Risk override
  is_risk_override_active    BOOLEAN NOT NULL DEFAULT FALSE,
  risk_override_value        NUMERIC(5,2),

  -- Flags operativi
  is_in_payout               BOOLEAN NOT NULL DEFAULT FALSE,
  is_in_interview            BOOLEAN NOT NULL DEFAULT FALSE,
  is_excluded_from_trades    BOOLEAN NOT NULL DEFAULT FALSE,
  has_open_trades            BOOLEAN NOT NULL DEFAULT FALSE,
  open_positions_count       INT NOT NULL DEFAULT 0,
  connection_warning_level   INT NOT NULL DEFAULT 0,

  -- Promozione
  awaiting_promotion         BOOLEAN NOT NULL DEFAULT FALSE,
  phase_manually_set         BOOLEAN NOT NULL DEFAULT FALSE,
  phase_needs_review         BOOLEAN NOT NULL DEFAULT FALSE,

  -- Payout
  payout_gross_amount        NUMERIC(12,2),
  payout_net_amount          NUMERIC(12,2),
  payout_requested_at        TIMESTAMPTZ,

  -- Note
  operational_notes          TEXT,

  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(structure_id, account_login)
);

-- 18. mt5_trades
CREATE TABLE IF NOT EXISTS mt5_trades (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mt5_account_id   UUID NOT NULL REFERENCES mt5_accounts(id) ON DELETE CASCADE,
  structure_id     UUID NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  position_id      TEXT NOT NULL,
  symbol           TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('BUY','SELL')),
  volume           NUMERIC(10,4) NOT NULL,
  entry_price      NUMERIC(12,5),
  exit_price       NUMERIC(12,5),
  entry_time       TIMESTAMPTZ,
  exit_time        TIMESTAMPTZ,
  stop_loss        NUMERIC(12,5),
  take_profit      NUMERIC(12,5),
  profit           NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_closed        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(mt5_account_id, position_id)
);

-- 19. trade_crosses
CREATE TABLE IF NOT EXISTS trade_crosses (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  structure_id        UUID NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  account_a_id        UUID NOT NULL REFERENCES mt5_accounts(id),
  account_b_id        UUID REFERENCES mt5_accounts(id),     -- NULL se SINGOLO
  account_a_direction TEXT NOT NULL CHECK (account_a_direction IN ('BUY','SELL')),
  account_b_direction TEXT CHECK (account_b_direction IN ('BUY','SELL')),
  account_a_lots      NUMERIC(10,4) NOT NULL,
  account_b_lots      NUMERIC(10,4),
  symbol              TEXT NOT NULL,
  risk_percentage     NUMERIC(8,4),
  risk_percentage_a   NUMERIC(8,4),
  risk_percentage_b   NUMERIC(8,4),
  status              cross_status NOT NULL DEFAULT 'pending',
  is_active           BOOLEAN NOT NULL DEFAULT FALSE,
  notes               JSONB NOT NULL DEFAULT '{}',
  loser_account_id    UUID REFERENCES mt5_accounts(id),
  is_weighted         BOOLEAN NOT NULL DEFAULT FALSE,
  weighted_lots_a     NUMERIC(10,4),
  weighted_lots_b     NUMERIC(10,4),
  stage_difference    NUMERIC(6,2),
  balance_difference  NUMERIC(12,2),
  risk_reward         NUMERIC(8,4),
  engine_type         TEXT,              -- 'target_doppio' | 'target_singolo' | 'esplosione' | 'normal'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 20. trade_crosses_archive (NEW — storico trade chiusi, non si cancella)
CREATE TABLE IF NOT EXISTS trade_crosses_archive (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_id         UUID NOT NULL,   -- id originale da trade_crosses
  structure_id        UUID NOT NULL REFERENCES structures(id),
  account_a_id        UUID,
  account_b_id        UUID,
  account_a_direction TEXT,
  account_b_direction TEXT,
  account_a_lots      NUMERIC(10,4),
  account_b_lots      NUMERIC(10,4),
  symbol              TEXT NOT NULL,
  risk_percentage_a   NUMERIC(8,4),
  risk_percentage_b   NUMERIC(8,4),
  notes               JSONB NOT NULL DEFAULT '{}',
  engine_type         TEXT,
  closed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 21. account_audit_log
CREATE TABLE IF NOT EXISTS account_audit_log (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  structure_id   UUID NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  account_id     UUID REFERENCES mt5_accounts(id),
  user_id        UUID REFERENCES auth.users(id),
  account_login  TEXT,
  id_identifier  TEXT,
  prop_firm_name TEXT,
  action         TEXT NOT NULL,
  details        JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 22. account_daily_snapshots
CREATE TABLE IF NOT EXISTS account_daily_snapshots (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  structure_id      UUID NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  account_id        UUID REFERENCES mt5_accounts(id) ON DELETE CASCADE,
  account_login     TEXT,
  current_balance   NUMERIC(12,2),
  current_equity    NUMERIC(12,2),
  profit_percentage NUMERIC(8,4),
  snapshot_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, snapshot_date)
);

-- 23. integrity_alerts
CREATE TABLE IF NOT EXISTS integrity_alerts (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  structure_id       UUID NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  account_id         UUID REFERENCES mt5_accounts(id),
  account_login      TEXT,
  id_identifier      TEXT,
  prop_firm_name     TEXT,
  alert_type         TEXT NOT NULL,
  alert_message      TEXT,
  alert_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  is_dismissed       BOOLEAN NOT NULL DEFAULT FALSE,
  dismissed_by       UUID REFERENCES auth.users(id),
  dismissed_at       TIMESTAMPTZ,
  last_known_balance NUMERIC(12,2),
  last_known_status  TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES (performance)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_mt5_accounts_structure    ON mt5_accounts(structure_id);
CREATE INDEX IF NOT EXISTS idx_mt5_accounts_status       ON mt5_accounts(account_status);
CREATE INDEX IF NOT EXISTS idx_mt5_accounts_phase        ON mt5_accounts(phase);
CREATE INDEX IF NOT EXISTS idx_mt5_accounts_identifier   ON mt5_accounts(id_identifier);
CREATE INDEX IF NOT EXISTS idx_mt5_accounts_visible      ON mt5_accounts(visible_on_board) WHERE visible_on_board = TRUE;
CREATE INDEX IF NOT EXISTS idx_mt5_trades_account        ON mt5_trades(mt5_account_id);
CREATE INDEX IF NOT EXISTS idx_mt5_trades_closed         ON mt5_trades(is_closed);
CREATE INDEX IF NOT EXISTS idx_trade_crosses_structure   ON trade_crosses(structure_id);
CREATE INDEX IF NOT EXISTS idx_trade_crosses_status      ON trade_crosses(status);
CREATE INDEX IF NOT EXISTS idx_trade_crosses_active      ON trade_crosses(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_rotation_logs_structure   ON rotation_logs(structure_id);
CREATE INDEX IF NOT EXISTS idx_integrity_alerts_struct   ON integrity_alerts(structure_id, is_dismissed);
CREATE INDEX IF NOT EXISTS idx_audit_log_account        ON account_audit_log(account_id);
CREATE INDEX IF NOT EXISTS idx_bilancio_period          ON bilancio_entries(structure_id, year, month);
CREATE INDEX IF NOT EXISTS idx_payout_events_date       ON payout_events(structure_id, date);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mt5_accounts_updated_at ON mt5_accounts;
CREATE TRIGGER trg_mt5_accounts_updated_at
  BEFORE UPDATE ON mt5_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_trade_crosses_updated_at ON trade_crosses;
CREATE TRIGGER trg_trade_crosses_updated_at
  BEFORE UPDATE ON trade_crosses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- NEW USER TRIGGER (auto-creates profile)
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
ALTER TABLE structures              ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_structure_access   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_section_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ids                ENABLE ROW LEVEL SECURITY;
ALTER TABLE prop_firm_rules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE prop_firm_risk_configs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pair_config             ENABLE ROW LEVEL SECURITY;
ALTER TABLE mt5_server_mappings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mt5_terminals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE mt5_accounts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE mt5_trades              ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_crosses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_crosses_archive   ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_audit_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrity_alerts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rotation_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_pair_configs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bilancio_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE microsoft_oauth_tokens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_daily_snapshots ENABLE ROW LEVEL SECURITY;

-- Helper function: current user's role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS app_role AS $$
  SELECT role FROM user_roles WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: structures accessible to current user
CREATE OR REPLACE FUNCTION get_my_structure_ids()
RETURNS UUID[] AS $$
  SELECT ARRAY(SELECT structure_id FROM user_structure_access WHERE user_id = auth.uid());
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---- profiles ----
DROP POLICY IF EXISTS "Users see own profile" ON profiles;
CREATE POLICY "Users see own profile" ON profiles FOR SELECT USING (id = auth.uid());
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (id = auth.uid());

-- ---- user_roles ----
DROP POLICY IF EXISTS "Users see own role" ON user_roles;
CREATE POLICY "Users see own role" ON user_roles FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins manage roles" ON user_roles;
CREATE POLICY "Admins manage roles" ON user_roles FOR ALL USING (get_my_role() = 'admin');

-- ---- structures ----
DROP POLICY IF EXISTS "Users see their structures" ON structures;
CREATE POLICY "Users see their structures" ON structures FOR SELECT USING (id = ANY(get_my_structure_ids()));
DROP POLICY IF EXISTS "Admins manage structures" ON structures;
CREATE POLICY "Admins manage structures" ON structures FOR ALL USING (get_my_role() = 'admin');

-- ---- user_structure_access ----
DROP POLICY IF EXISTS "Users see own access" ON user_structure_access;
CREATE POLICY "Users see own access" ON user_structure_access FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins manage access" ON user_structure_access;
CREATE POLICY "Admins manage access" ON user_structure_access FOR ALL USING (get_my_role() = 'admin');

-- ---- user_section_permissions ----
DROP POLICY IF EXISTS "Users see own permissions" ON user_section_permissions;
CREATE POLICY "Users see own permissions" ON user_section_permissions FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins manage permissions" ON user_section_permissions;
CREATE POLICY "Admins manage permissions" ON user_section_permissions FOR ALL USING (get_my_role() = 'admin');

-- ---- mt5_accounts ----
DROP POLICY IF EXISTS "Structure members see mt5_accounts" ON mt5_accounts;
CREATE POLICY "Structure members see mt5_accounts" ON mt5_accounts FOR SELECT USING (structure_id = ANY(get_my_structure_ids()));
DROP POLICY IF EXISTS "Full+ can modify mt5_accounts" ON mt5_accounts;
CREATE POLICY "Full+ can modify mt5_accounts" ON mt5_accounts FOR ALL USING (structure_id = ANY(get_my_structure_ids()) AND get_my_role() IN ('admin','full','trader'));

-- ---- mt5_terminals ----
DROP POLICY IF EXISTS "Structure members see mt5_terminals" ON mt5_terminals;
CREATE POLICY "Structure members see mt5_terminals" ON mt5_terminals FOR SELECT USING (structure_id = ANY(get_my_structure_ids()));
DROP POLICY IF EXISTS "Admin/full manage terminals" ON mt5_terminals;
CREATE POLICY "Admin/full manage terminals" ON mt5_terminals FOR ALL USING (structure_id = ANY(get_my_structure_ids()) AND get_my_role() IN ('admin','full'));

-- ---- mt5_trades ----
DROP POLICY IF EXISTS "Structure members see mt5_trades" ON mt5_trades;
CREATE POLICY "Structure members see mt5_trades" ON mt5_trades FOR SELECT USING (structure_id = ANY(get_my_structure_ids()));
DROP POLICY IF EXISTS "Traders insert/update trades" ON mt5_trades;
CREATE POLICY "Traders insert/update trades" ON mt5_trades FOR ALL USING (structure_id = ANY(get_my_structure_ids()) AND get_my_role() IN ('admin','full','trader'));

-- ---- trade_crosses ----
DROP POLICY IF EXISTS "Structure members see trade_crosses" ON trade_crosses;
CREATE POLICY "Structure members see trade_crosses" ON trade_crosses FOR SELECT USING (structure_id = ANY(get_my_structure_ids()));
DROP POLICY IF EXISTS "Traders manage trade_crosses" ON trade_crosses;
CREATE POLICY "Traders manage trade_crosses" ON trade_crosses FOR ALL USING (structure_id = ANY(get_my_structure_ids()) AND get_my_role() IN ('admin','full','trader'));

-- ---- trade_crosses_archive ----
DROP POLICY IF EXISTS "Structure members see archive" ON trade_crosses_archive;
CREATE POLICY "Structure members see archive" ON trade_crosses_archive FOR SELECT USING (structure_id = ANY(get_my_structure_ids()));

-- ---- account_audit_log ----
DROP POLICY IF EXISTS "Structure members see audit_log" ON account_audit_log;
CREATE POLICY "Structure members see audit_log" ON account_audit_log FOR SELECT USING (structure_id = ANY(get_my_structure_ids()));
DROP POLICY IF EXISTS "System inserts audit_log" ON account_audit_log;
CREATE POLICY "System inserts audit_log" ON account_audit_log FOR INSERT WITH CHECK (structure_id = ANY(get_my_structure_ids()));

-- ---- integrity_alerts ----
DROP POLICY IF EXISTS "Structure members see integrity_alerts" ON integrity_alerts;
CREATE POLICY "Structure members see integrity_alerts" ON integrity_alerts FOR SELECT USING (structure_id = ANY(get_my_structure_ids()));
DROP POLICY IF EXISTS "Full+ dismiss alerts" ON integrity_alerts;
CREATE POLICY "Full+ dismiss alerts" ON integrity_alerts FOR UPDATE USING (structure_id = ANY(get_my_structure_ids()) AND get_my_role() IN ('admin','full'));

-- ---- rotation_logs ----
DROP POLICY IF EXISTS "Structure members see rotation_logs" ON rotation_logs;
CREATE POLICY "Structure members see rotation_logs" ON rotation_logs FOR SELECT USING (structure_id = ANY(get_my_structure_ids()));

-- ---- user_ids ----
DROP POLICY IF EXISTS "Structure members see user_ids" ON user_ids;
CREATE POLICY "Structure members see user_ids" ON user_ids FOR SELECT USING (structure_id = ANY(get_my_structure_ids()));
DROP POLICY IF EXISTS "Admin/full manage user_ids" ON user_ids;
CREATE POLICY "Admin/full manage user_ids" ON user_ids FOR ALL USING (structure_id = ANY(get_my_structure_ids()) AND get_my_role() IN ('admin','full'));

-- ---- prop_firm_rules ----
DROP POLICY IF EXISTS "Structure members see prop_firm_rules" ON prop_firm_rules;
CREATE POLICY "Structure members see prop_firm_rules" ON prop_firm_rules FOR SELECT USING (structure_id = ANY(get_my_structure_ids()) OR structure_id IS NULL);
DROP POLICY IF EXISTS "Admin/full manage prop_firm_rules" ON prop_firm_rules;
CREATE POLICY "Admin/full manage prop_firm_rules" ON prop_firm_rules FOR ALL USING (get_my_role() IN ('admin','full'));

-- ---- prop_firm_risk_configs ----
DROP POLICY IF EXISTS "Structure members see risk_configs" ON prop_firm_risk_configs;
CREATE POLICY "Structure members see risk_configs" ON prop_firm_risk_configs FOR SELECT USING (structure_id = ANY(get_my_structure_ids()) OR structure_id IS NULL);
DROP POLICY IF EXISTS "Admin/full manage risk_configs" ON prop_firm_risk_configs;
CREATE POLICY "Admin/full manage risk_configs" ON prop_firm_risk_configs FOR ALL USING (get_my_role() IN ('admin','full'));

-- ---- pair_config ----
DROP POLICY IF EXISTS "All authenticated see pair_config" ON pair_config;
CREATE POLICY "All authenticated see pair_config" ON pair_config FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Admins manage pair_config" ON pair_config;
CREATE POLICY "Admins manage pair_config" ON pair_config FOR ALL USING (get_my_role() = 'admin');

-- ---- mt5_server_mappings ----
DROP POLICY IF EXISTS "All authenticated see server_mappings" ON mt5_server_mappings;
CREATE POLICY "All authenticated see server_mappings" ON mt5_server_mappings FOR SELECT USING (auth.uid() IS NOT NULL);

-- ---- trading_pair_configs ----
DROP POLICY IF EXISTS "Structure members see trading_pair_configs" ON trading_pair_configs;
CREATE POLICY "Structure members see trading_pair_configs" ON trading_pair_configs FOR SELECT USING (structure_id = ANY(get_my_structure_ids()));
DROP POLICY IF EXISTS "Admin/full/trader manage pair_configs" ON trading_pair_configs;
CREATE POLICY "Admin/full/trader manage pair_configs" ON trading_pair_configs FOR ALL USING (structure_id = ANY(get_my_structure_ids()) AND get_my_role() IN ('admin','full','trader'));

-- ---- bilancio_entries ----
DROP POLICY IF EXISTS "Structure members see bilancio" ON bilancio_entries;
CREATE POLICY "Structure members see bilancio" ON bilancio_entries FOR SELECT USING (structure_id = ANY(get_my_structure_ids()));
DROP POLICY IF EXISTS "Admin/full manage bilancio" ON bilancio_entries;
CREATE POLICY "Admin/full manage bilancio" ON bilancio_entries FOR ALL USING (structure_id = ANY(get_my_structure_ids()) AND get_my_role() IN ('admin','full'));

-- ---- payout_events ----
DROP POLICY IF EXISTS "Structure members see payout_events" ON payout_events;
CREATE POLICY "Structure members see payout_events" ON payout_events FOR SELECT USING (structure_id = ANY(get_my_structure_ids()));
DROP POLICY IF EXISTS "Admin/full manage payout_events" ON payout_events;
CREATE POLICY "Admin/full manage payout_events" ON payout_events FOR ALL USING (structure_id = ANY(get_my_structure_ids()) AND get_my_role() IN ('admin','full'));

-- ---- microsoft_oauth_tokens ----
DROP POLICY IF EXISTS "Admin/full see oauth_tokens" ON microsoft_oauth_tokens;
CREATE POLICY "Admin/full see oauth_tokens"
  ON microsoft_oauth_tokens FOR ALL
  USING (structure_id = ANY(get_my_structure_ids())
    AND get_my_role() IN ('admin','full'));

-- ---- account_daily_snapshots ----
DROP POLICY IF EXISTS "Structure members see daily_snapshots" ON account_daily_snapshots;
CREATE POLICY "Structure members see daily_snapshots" ON account_daily_snapshots FOR SELECT USING (structure_id = ANY(get_my_structure_ids()));
DROP POLICY IF EXISTS "Service inserts daily_snapshots" ON account_daily_snapshots;
CREATE POLICY "Service inserts daily_snapshots" ON account_daily_snapshots FOR INSERT WITH CHECK (structure_id = ANY(get_my_structure_ids()));

-- ============================================================
-- SEED: pair_config (16 simboli principali)
-- ============================================================
INSERT INTO pair_config (symbol, pip_size, quote_currency, contract_size) VALUES
  ('EURUSD', 0.0001, 'USD', 100000),
  ('GBPUSD', 0.0001, 'USD', 100000),
  ('USDJPY', 0.01,   'JPY', 100000),
  ('USDCHF', 0.0001, 'CHF', 100000),
  ('AUDUSD', 0.0001, 'USD', 100000),
  ('NZDUSD', 0.0001, 'USD', 100000),
  ('USDCAD', 0.0001, 'CAD', 100000),
  ('EURGBP', 0.0001, 'GBP', 100000),
  ('EURJPY', 0.01,   'JPY', 100000),
  ('GBPJPY', 0.01,   'JPY', 100000),
  ('EURCHF', 0.0001, 'CHF', 100000),
  ('AUDJPY', 0.01,   'JPY', 100000),
  ('EURAUD', 0.0001, 'AUD', 100000),
  ('GBPAUD', 0.0001, 'AUD', 100000),
  ('XAUUSD', 0.01,   'USD',    100),
  ('XAGUSD', 0.001,  'USD',   5000)
ON CONFLICT (symbol) DO NOTHING;
