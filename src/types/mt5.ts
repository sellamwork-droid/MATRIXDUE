// ============================================
// MT5 ACCOUNT TYPES
// ============================================
// Extracted from useMT5Accounts.ts in the original project.
// This file is the single source of truth for MT5Account and related types.

export type AccountStatus = 'active' | 'breached' | 'passed' | 'burned' | 'manual_review';

export interface MT5Account {
  id: string;
  user_id: string;
  id_identifier: string;
  account_login: string;
  account_name: string;
  prop_firm_name: string;
  broker_server: string | null;
  account_size: number;
  initial_balance: number;
  current_balance: number | null;
  current_equity: number | null;
  profit_loss: number | null;
  profit_percentage: number | null;
  phase: 'fase1' | 'fase2' | 'live';
  stage: number;
  account_status: AccountStatus;
  connection_status: 'connected' | 'idle' | 'warning' | 'critical' | 'removed' | 'disconnected';
  api_key: string;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
  has_open_trades: boolean;
  open_positions_count: number;
  mt5_password?: string;
  terminal_id?: string | null;
  awaiting_promotion?: boolean;
  phase_needs_review?: boolean;
  purchase_proposal?: string | null;
  is_mobile?: boolean;
  operational_notes?: string | null;
  is_risk_override_active?: boolean;
  risk_override_value?: number | null;
  visible_on_board?: boolean;
  is_deleted?: boolean;
  is_excluded_from_trades?: boolean;
  is_in_payout?: boolean;
  is_in_interview?: boolean;
  custom_target_percentage?: number | null;
  payout_gross_amount?: number | null;
  payout_net_amount?: number | null;
  payout_requested_at?: string | null;
}

export interface NewMT5Account {
  id_identifier: string;
  account_login: string;
  account_name: string;
  prop_firm_name: string;
  account_size: number;
  initial_balance: number;
  phase: 'fase1' | 'fase2' | 'live';
  mt5_password?: string;
  is_mobile?: boolean;
}

export interface UseMT5AccountsOptions {
  idIdentifier?: string;
  filterConnected?: boolean;
  accountStatus?: AccountStatus;
  excludeStatus?: AccountStatus[];
  visibleOnBoard?: boolean;
}
