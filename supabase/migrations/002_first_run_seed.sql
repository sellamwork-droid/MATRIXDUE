-- ============================================================
-- MATRIX PRO HUB v2 — First Run Seed
-- Esegui questo DOPO aver creato il tuo primo utente via
-- Supabase Dashboard → Authentication → Users → Add user
-- Sostituisci YOUR_USER_UUID con il tuo auth.uid()
-- ============================================================

-- 1. Crea la struttura principale
INSERT INTO structures (id, name, slug, description, is_active)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Matrix Pro Hub',
  'matrix-pro-hub',
  'Struttura principale',
  TRUE
) ON CONFLICT (slug) DO NOTHING;

-- 2. Assegna ruolo admin al primo utente
-- ⚠️ Sostituisci YOUR_USER_UUID con il tuo UUID da Authentication → Users
INSERT INTO user_roles (user_id, role)
VALUES ('YOUR_USER_UUID', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

-- 3. Dai accesso alla struttura
INSERT INTO user_structure_access (user_id, structure_id, is_owner)
VALUES ('YOUR_USER_UUID', 'aaaaaaaa-0000-0000-0000-000000000001', TRUE)
ON CONFLICT (user_id, structure_id) DO NOTHING;

-- 4. Aggiorna il profilo con la struttura attiva
UPDATE profiles
SET active_structure_id = 'aaaaaaaa-0000-0000-0000-000000000001'
WHERE id = 'YOUR_USER_UUID';

-- 5. Seed trading_pair_configs per la struttura
INSERT INTO trading_pair_configs (structure_id, symbol, min_pips, max_pips, spread, is_active)
SELECT 'aaaaaaaa-0000-0000-0000-000000000001', symbol,
  CASE symbol
    WHEN 'XAUUSD' THEN 15
    WHEN 'XAGUSD' THEN 10
    ELSE 3
  END,
  CASE symbol
    WHEN 'XAUUSD' THEN 50
    WHEN 'XAGUSD' THEN 30
    ELSE 10
  END,
  CASE symbol
    WHEN 'XAUUSD' THEN 3
    WHEN 'USDJPY' THEN 2
    ELSE 1
  END,
  TRUE
FROM pair_config
ON CONFLICT (structure_id, symbol, config_type) DO NOTHING;
