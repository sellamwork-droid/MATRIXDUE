-- ============================================================
-- CLEANUP — esegui PRIMA di 001_initial_schema.sql
-- Cancella tutto per ripartire da zero (sicuro su DB vuoto)
-- ============================================================

-- Triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS trg_mt5_accounts_updated_at ON mt5_accounts;
DROP TRIGGER IF EXISTS trg_trade_crosses_updated_at ON trade_crosses;

-- Functions
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;
DROP FUNCTION IF EXISTS get_my_role() CASCADE;
DROP FUNCTION IF EXISTS get_my_structure_ids() CASCADE;

-- Tables (ordine inverso dipendenze)
DROP TABLE IF EXISTS integrity_alerts CASCADE;
DROP TABLE IF EXISTS account_audit_log CASCADE;
DROP TABLE IF EXISTS account_daily_snapshots CASCADE;
DROP TABLE IF EXISTS trade_crosses_archive CASCADE;
DROP TABLE IF EXISTS trade_crosses CASCADE;
DROP TABLE IF EXISTS mt5_trades CASCADE;
DROP TABLE IF EXISTS mt5_accounts CASCADE;
DROP TABLE IF EXISTS mt5_terminals CASCADE;
DROP TABLE IF EXISTS microsoft_oauth_tokens CASCADE;
DROP TABLE IF EXISTS rotation_logs CASCADE;
DROP TABLE IF EXISTS bilancio_entries CASCADE;
DROP TABLE IF EXISTS payout_events CASCADE;
DROP TABLE IF EXISTS trading_pair_configs CASCADE;
DROP TABLE IF EXISTS mt5_server_mappings CASCADE;
DROP TABLE IF EXISTS pair_config CASCADE;
DROP TABLE IF EXISTS prop_firm_risk_configs CASCADE;
DROP TABLE IF EXISTS prop_firm_rules CASCADE;
DROP TABLE IF EXISTS user_ids CASCADE;
DROP TABLE IF EXISTS user_section_permissions CASCADE;
DROP TABLE IF EXISTS user_structure_access CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS structures CASCADE;

-- Types
DROP TYPE IF EXISTS cross_status CASCADE;
DROP TYPE IF EXISTS connection_status CASCADE;
DROP TYPE IF EXISTS phase_type CASCADE;
DROP TYPE IF EXISTS account_status CASCADE;
DROP TYPE IF EXISTS app_role CASCADE;
