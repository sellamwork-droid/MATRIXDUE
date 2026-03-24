// ============================================
// TARGET ENGINE - Detection + Lot Calculation
// ============================================
// Responsabilità:
// - Scansione account per identificare candidati TARGET
// - Classificazione: TRADE TARGET DOPPIO / TRADE TARGET SINGOLO
// - Validazione incrociata (Max_Risk vs Target_Mancante)
// - Calcolo lotti con formula Pips-First dalla Tabella Operatività
//
// REGOLA 1 — TRADE TARGET DOPPIO:
//   Max_Risk_B >= Target_Mancante_A  AND  Max_Risk_A >= Target_Mancante_B
//   Entrambi gli account puntano ai rispettivi target.
//
// REGOLA 2 — TRADE TARGET SINGOLO:
//   Max_Risk_B >= Target_Mancante_A  BUT  Max_Risk_A < Target_Mancante_B
//   Solo Account A va a target; Account B massimizza il profitto entro il rischio.

import type { MT5Account } from '../../types/mt5';
import type {
  CrossSuggestion,
  PropFirmRiskMap,
  PropFirmDirectionTracker,
  PipRangeConfig,
  PropFirmRiskConfigMap,
  TradeCross,
  TargetSubType,
  AllowedSymbol,
} from '../../hooks/useCrossTrading';
import {
  getStandardBalance,
  PIP_VALUES,
  ensurePropFirmDirectionTrackerInitialized,
  getSessionSymbolLists,
  getRotatedSymbolList,
  type AllowedSymbol as SessionAllowedSymbol,
} from '../../hooks/useCrossTrading';
import { extractPropFirmName } from '../../utils/propFirmUtils';

// ============================================
// CONSTANTS
// ============================================

/** Coefficiente baseline per 5ERS con balance 60k */
const FIVEERS_60K_COEFFICIENT = 1.2;

/** Commissione broker per lotto round-turn */
const BROKER_COMMISSION_PER_LOT = 5;

/** Buffer di sicurezza in dollari */
const TARGET_SAFETY_BUFFER = 10;

// ============================================
// TYPES
// ============================================

export interface TargetEngineParams {
  accounts: MT5Account[];
  riskMap: PropFirmRiskMap;
  usedAccountIds: Set<string>;
  existingCrosses: TradeCross[];
  propFirmTracker: PropFirmDirectionTracker;
  pipRangeConfigs?: PipRangeConfig[];
  dynamicPipValues?: Record<string, number>;
  riskConfigMap?: PropFirmRiskConfigMap;
  targetRulesMap?: Record<string, { fase1: number; fase2: number }>;
}

export interface TargetEngineResult {
  suggestions: CrossSuggestion[];
}

/** Info calcolata per ogni account candidato TARGET */
export interface TargetCandidate {
  account: MT5Account;
  /** Bilancio obiettivo = initial_balance × (1 + targetPercent/100) */
  targetBalance: number;
  /** Importo mancante al target = targetBalance - currentBalance */
  targetMancante: number;
  /** Rischio massimo in $ = baseline × (target_fase_max_risk / 100) */
  maxRisk: number;
  /** Baseline (standard balance) per calcoli di rischio */
  baseline: number;
  /** Percentuale target di profitto per la fase corrente */
  targetPercent: number;
}

export interface DetectedTargetPair {
  candidateA: TargetCandidate;
  candidateB: TargetCandidate;
  subType: TargetSubType;
  /** Per SINGOLO: l'account che deve andare a target */
  targetAccountId: string;
}

/** Risultato del calcolo lotti + pips asimmetriche */
export interface TargetLotResult {
  /** Lotto base comune (prima del coefficiente 5ERS) */
  baseLots: number;
  /** Lotti effettivi per A (con eventuale coefficiente 5ERS) */
  lotsA: number;
  /** Lotti effettivi per B (con eventuale coefficiente 5ERS) */
  lotsB: number;
  /** Pips TP per Account A */
  pipsA: number;
  /** Pips TP per Account B */
  pipsB: number;
  /** Pips SL per Account A (= pipsB + spread, mirroring speculare) */
  slPipsA: number;
  /** Pips SL per Account B (= pipsA + spread, mirroring speculare) */
  slPipsB: number;
  /** Importo $ vinto da A se il trade va a suo favore */
  winAmountA: number;
  /** Importo $ vinto da B se il trade va a suo favore */
  winAmountB: number;
  /** Importo $ perso da A (calcolato su slPipsA) */
  loseAmountA: number;
  /** Importo $ perso da B (calcolato su slPipsB) */
  loseAmountB: number;
  /** Risk % per A */
  riskPercentA: number;
  /** Risk % per B */
  riskPercentB: number;
}

// ============================================
// DETECTION HELPERS
// ============================================

/**
 * Calcola le informazioni TARGET per un singolo account.
 * Restituisce null se l'account non è idoneo.
 */
export function computeTargetCandidate(
  account: MT5Account,
  targetRulesMap: Record<string, { fase1: number; fase2: number }>,
  riskConfigMap?: PropFirmRiskConfigMap
): TargetCandidate | null {
  if (account.account_status !== 'active') return null;
  if (account.phase === 'live') return null;

  const firmName = extractPropFirmName(account.prop_firm_name || '');
  if (!firmName) return null;

  const rules = targetRulesMap[firmName];
  if (!rules) return null;

  // Custom target override takes priority over default rules
  const defaultTargetPercent = account.phase === 'fase1' ? rules.fase1 : rules.fase2;
  const targetPercent = (account as any).custom_target_percentage ?? defaultTargetPercent;
  if (!targetPercent || targetPercent <= 0) return null;

  const baseline = getStandardBalance(account);
  const currentBalance = account.current_balance ?? account.initial_balance;
  const targetBalance = account.initial_balance * (1 + targetPercent / 100);
  const targetMancante = targetBalance - currentBalance;

  if (targetMancante <= 0) return null;

  let maxRiskPercent = 3.5; // fallback

  // PRIORITY: Check RISK_OVERRIDE via structured fields
  if (account.is_risk_override_active && account.risk_override_value != null && account.risk_override_value > 0) {
    // Apply 15% buffer for protection (risk * 0.85)
    maxRiskPercent = Math.max(0.01, Math.round((account.risk_override_value * 0.85) * 100) / 100);
    console.log(`[TARGET] RISK_OVERRIDE active for ${firmName}: ${account.risk_override_value}% → buffered ${maxRiskPercent}%`);
  } else if (riskConfigMap) {
    const riskConfig = riskConfigMap[firmName];
    if (riskConfig) {
      maxRiskPercent = riskConfig.target_fase_max_risk;
    }
  }
  const maxRisk = baseline * (maxRiskPercent / 100);

  return {
    account,
    targetBalance,
    targetMancante,
    maxRisk,
    baseline,
    targetPercent,
  };
}

/**
 * Scansiona tutte le coppie di candidati TARGET e classifica
 * ogni match come TRADE TARGET DOPPIO o TRADE TARGET SINGOLO.
 */
export function detectTargetPairs(
  candidates: TargetCandidate[],
  allAccounts: MT5Account[],
  usedAccountIds: Set<string>,
  riskConfigMap?: PropFirmRiskConfigMap,
  targetRulesMap?: Record<string, { fase1: number; fase2: number }>
): DetectedTargetPair[] {
  const pairs: DetectedTargetPair[] = [];
  const used = new Set<string>();

  const sorted = [...candidates]
    .filter(c => !usedAccountIds.has(c.account.id))
    .sort((a, b) => a.targetMancante - b.targetMancante);

  // Build a set of candidate IDs for quick lookup
  const candidateIds = new Set(sorted.map(c => c.account.id));

  // Build global partner pool: ALL active accounts in the same phases, excluding used
  const globalPool = allAccounts.filter(a =>
    a.account_status === 'active' &&
    !usedAccountIds.has(a.id) &&
    !a.is_excluded_from_trades &&
    !a.is_in_payout &&
    !a.is_in_interview
  );

  // Diagnostic logging
  for (const c of sorted) {
    const firm = extractPropFirmName(c.account.prop_firm_name || '');
    console.log(
      `[TARGET DETECT] Candidato: ${c.account.account_login} (${firm}) ` +
      `gap=$${c.targetMancante.toFixed(0)} maxRisk=$${c.maxRisk.toFixed(0)} phase=${c.account.phase}`
    );
  }
  console.log(`[TARGET DETECT] Pool globale partner: ${globalPool.length} accounts disponibili`);

  // Helper: compute progress ratio (0→1) toward the profit target for any account
  function getProgressRatio(acct: MT5Account): number {
    const bal = acct.current_balance ?? acct.initial_balance;
    const init = acct.initial_balance;
    const firmName = extractPropFirmName(acct.prop_firm_name || '');
    const rules = firmName ? targetRulesMap[firmName] : null;
    if (!rules) return (bal - init) / (init * 0.08); // fallback 8%
    const pct = acct.phase === 'fase1' ? rules.fase1 : rules.fase2;
    const targetBal = init * (1 + (pct || 8) / 100);
    const totalGap = targetBal - init;
    if (totalGap <= 0) return 1;
    return (bal - init) / totalGap;
  }

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(sorted[i].account.id)) continue;
    const A = sorted[i];
    const balA = A.account.current_balance ?? A.account.initial_balance;
    const firmA = extractPropFirmName(A.account.prop_firm_name || '');
    const progressA = getProgressRatio(A.account);

    // ── Collect valid partners from GLOBAL pool + other TARGET candidates ──
    type PartnerOption = {
      account: MT5Account;
      balanceDelta: number;
      progressDelta: number;
      subType: 'TRADE TARGET DOPPIO' | 'TRADE TARGET SINGOLO';
      targetAccountId: string;
      candidateData: TargetCandidate | null; // null if partner is non-target (pure sacrificial)
    };
    const validPartners: PartnerOption[] = [];

    // --- PASS 1: Check other TARGET candidates for DOPPIO ---
    for (const B of sorted) {
      if (B.account.id === A.account.id) continue;
      if (used.has(B.account.id)) continue;
      if (A.account.phase !== B.account.phase) continue;
      const firmB = extractPropFirmName(B.account.prop_firm_name || '');
      if (firmA === firmB) continue;

      const bCanCoverA = B.maxRisk >= A.targetMancante;
      const aCanCoverB = A.maxRisk >= B.targetMancante;
      const balB = B.account.current_balance ?? B.account.initial_balance;
      const balanceDelta = Math.abs(balA - balB);
      const progressDelta = Math.abs(progressA - getProgressRatio(B.account));

      if (bCanCoverA && aCanCoverB) {
        console.log(`[TARGET DETECT] DOPPIO candidato: ${A.account.account_login} ↔ ${B.account.account_login} Δprog=${(progressDelta * 100).toFixed(1)}% Δbal=$${balanceDelta.toFixed(0)}`);
        validPartners.push({
          account: B.account,
          balanceDelta,
          progressDelta,
          subType: 'TRADE TARGET DOPPIO',
          targetAccountId: A.account.id,
          candidateData: B,
        });
      }
    }

    // --- PASS 2: Search GLOBAL pool for SINGOLO partners (sacrificial) ---
    for (const partnerAcct of globalPool) {
      if (partnerAcct.id === A.account.id) continue;
      if (used.has(partnerAcct.id)) continue;
      if (A.account.phase !== partnerAcct.phase) continue;
      // Skip if already evaluated as DOPPIO candidate above
      if (candidateIds.has(partnerAcct.id)) continue;

      const firmB = extractPropFirmName(partnerAcct.prop_firm_name || '');
      if (firmA === firmB) continue;

      const balB = partnerAcct.current_balance ?? partnerAcct.initial_balance;
      const balanceDelta = Math.abs(balA - balB);
      const progressDelta = Math.abs(progressA - getProgressRatio(partnerAcct));

      // For SINGOLO from global pool: partner's maxRisk must cover A's target
      // Calculate partner's maxRisk using same logic as computeTargetCandidate
      const partnerBaseline = getStandardBalance(partnerAcct);
      let partnerMaxRiskPercent = 3.5;
      if (partnerAcct.is_risk_override_active && partnerAcct.risk_override_value != null && partnerAcct.risk_override_value > 0) {
        partnerMaxRiskPercent = Math.max(0.01, Math.round((partnerAcct.risk_override_value * 0.85) * 100) / 100);
      } else if (riskConfigMap) {
        const riskConfig = riskConfigMap[firmB];
        if (riskConfig) {
          partnerMaxRiskPercent = riskConfig.target_fase_max_risk;
        }
      }
      const partnerMaxRisk = partnerBaseline * (partnerMaxRiskPercent / 100);

      const canCoverA = partnerMaxRisk >= A.targetMancante;
      if (!canCoverA) continue;

      // Regola 70%: balance diff must be within 70% of partner's maxRisk
      const maxAllowed = partnerMaxRisk * 0.70;
      if (balanceDelta > maxAllowed) {
        console.log(`[TARGET SINGOLO GLOBAL] SCARTATO ${partnerAcct.account_login}: Δbal $${balanceDelta.toFixed(0)} > 70% $${maxAllowed.toFixed(0)}`);
        continue;
      }

      console.log(`[TARGET DETECT] SINGOLO global partner: ${partnerAcct.account_login} (${firmB}) Δprog=${(progressDelta * 100).toFixed(1)}% Δbal=$${balanceDelta.toFixed(0)} maxRisk=$${partnerMaxRisk.toFixed(0)}`);

      // Build a synthetic TargetCandidate for the partner (needed by calculateSingoloLots)
      const syntheticCandidate: TargetCandidate = {
        account: partnerAcct,
        targetBalance: 0, // not going to target
        targetMancante: 0,
        maxRisk: partnerMaxRisk,
        baseline: partnerBaseline,
        targetPercent: 0,
      };

      validPartners.push({
        account: partnerAcct,
        balanceDelta,
        progressDelta,
        subType: 'TRADE TARGET SINGOLO',
        targetAccountId: A.account.id,
        candidateData: syntheticCandidate,
      });
    }

    // --- PASS 3: Also check other TARGET candidates as SINGOLO (fallback) ---
    for (const B of sorted) {
      if (B.account.id === A.account.id) continue;
      if (used.has(B.account.id)) continue;
      if (A.account.phase !== B.account.phase) continue;
      const firmB = extractPropFirmName(B.account.prop_firm_name || '');
      if (firmA === firmB) continue;

      const bCanCoverA = B.maxRisk >= A.targetMancante;
      const aCanCoverB = A.maxRisk >= B.targetMancante;
      // Only add as SINGOLO if NOT already added as DOPPIO
      if (bCanCoverA && !aCanCoverB) {
        const balB = B.account.current_balance ?? B.account.initial_balance;
        const balanceDelta = Math.abs(balA - balB);
        const progressDelta = Math.abs(progressA - getProgressRatio(B.account));
        const maxAllowed = B.maxRisk * 0.70;
        if (balanceDelta > maxAllowed) continue;

        validPartners.push({
          account: B.account,
          balanceDelta,
          progressDelta,
          subType: 'TRADE TARGET SINGOLO',
          targetAccountId: A.account.id,
          candidateData: B,
        });
      }
    }

    // ── ANTI-JAM FALLBACK: if no valid partners, pick partner with most drawdown headroom ──
    if (validPartners.length === 0) {
      console.log(`[TARGET ANTI-JAM] No standard partners for ${A.account.account_login} — scanning fallback pool...`);

      type FallbackOption = {
        account: MT5Account;
        drawdownHeadroom: number; // distance from burn threshold ($45k default)
        partnerMaxRisk: number;
        partnerBaseline: number;
      };
      const fallbackCandidates: FallbackOption[] = [];

      for (const partnerAcct of globalPool) {
        if (partnerAcct.id === A.account.id) continue;
        if (used.has(partnerAcct.id)) continue;
        if (A.account.phase !== partnerAcct.phase) continue;
        if (candidateIds.has(partnerAcct.id)) continue; // skip other target candidates

        const firmB = extractPropFirmName(partnerAcct.prop_firm_name || '');
        if (firmA === firmB) continue;

        const partnerBaseline = getStandardBalance(partnerAcct);
        let partnerMaxRiskPercent = 3.5;
        if (partnerAcct.is_risk_override_active && partnerAcct.risk_override_value != null && partnerAcct.risk_override_value > 0) {
          partnerMaxRiskPercent = Math.max(0.01, Math.round((partnerAcct.risk_override_value * 0.85) * 100) / 100);
        } else if (riskConfigMap) {
          const riskConfig = riskConfigMap[firmB];
          if (riskConfig) {
            partnerMaxRiskPercent = riskConfig.target_fase_max_risk;
          }
        }
        const partnerMaxRisk = partnerBaseline * (partnerMaxRiskPercent / 100);

        // Fallback: partner MUST still be able to cover A's target
        if (partnerMaxRisk < A.targetMancante) continue;

        const balB = partnerAcct.current_balance ?? partnerAcct.initial_balance;
        const burnThreshold = partnerBaseline * 0.90; // 10% max drawdown
        const drawdownHeadroom = balB - burnThreshold;

        fallbackCandidates.push({ account: partnerAcct, drawdownHeadroom, partnerMaxRisk, partnerBaseline });
      }

      if (fallbackCandidates.length > 0) {
        // Pick partner with MOST drawdown headroom (safest shield)
        fallbackCandidates.sort((a, b) => b.drawdownHeadroom - a.drawdownHeadroom);
        const fb = fallbackCandidates[0];
        const balB = fb.account.current_balance ?? fb.account.initial_balance;
        const balanceDelta = Math.abs(balA - balB);
        const progressDelta = Math.abs(progressA - getProgressRatio(fb.account));

        console.log(
          `[TARGET ANTI-JAM] ✅ Fallback partner: ${fb.account.account_login} ` +
          `headroom=$${fb.drawdownHeadroom.toFixed(0)} Δbal=$${balanceDelta.toFixed(0)}`
        );

        const syntheticCandidate: TargetCandidate = {
          account: fb.account,
          targetBalance: 0,
          targetMancante: 0,
          maxRisk: fb.partnerMaxRisk,
          baseline: fb.partnerBaseline,
          targetPercent: 0,
        };

        validPartners.push({
          account: fb.account,
          balanceDelta,
          progressDelta,
          subType: 'TRADE TARGET SINGOLO',
          targetAccountId: A.account.id,
          candidateData: syntheticCandidate,
        });
      } else {
        console.warn(`[TARGET ANTI-JAM] ⚠️ No fallback partner available for ${A.account.account_login} — skipping`);
        continue;
      }
    }

    // ── SORT BY: 1) DOPPIO preferred, 2) smallest progress% delta (proportional matching) ──
    validPartners.sort((a, b) => {
      const typePriorityA = a.subType === 'TRADE TARGET DOPPIO' ? 0 : 1;
      const typePriorityB = b.subType === 'TRADE TARGET DOPPIO' ? 0 : 1;
      if (typePriorityA !== typePriorityB) return typePriorityA - typePriorityB;
      return a.progressDelta - b.progressDelta;
    });

    const best = validPartners[0];
    console.log(
      `[TARGET DETECT] ✅ BEST MATCH for ${A.account.account_login}: ${best.account.account_login} ` +
      `(${best.subType}, Δprog=${(best.progressDelta * 100).toFixed(1)}%, Δbal=$${best.balanceDelta.toFixed(0)}) — out of ${validPartners.length} valid partners`
    );

    pairs.push({
      candidateA: A,
      candidateB: best.candidateData!,
      subType: best.subType,
      targetAccountId: best.targetAccountId,
    });
    used.add(A.account.id);
    used.add(best.account.id);
  }

  return pairs;
}

// ============================================
// TARGET LORDO (Gross Target) CALCULATION
// ============================================

/**
 * Calcola il Target Lordo tramite iterazione:
 * Il target lordo include il gap netto + commissioni (lotti * $5) + buffer ($10).
 * Poiché i lotti dipendono dal target e il target dipende dai lotti,
 * si usa un calcolo iterativo convergente (2 passaggi).
 *
 * @param gapNetto - Importo netto mancante al target (targetBalance - currentBalance)
 * @param pips - Pips selezionate per il trade
 * @param pipValue - Valore di 1 pip per lotto standard
 * @param coefficient - Coefficiente 5ERS (1.0 o 1.2)
 * @returns { targetLordo, finalLots } - Target lordo e lotti finali calcolati
 */
function calculateTargetLordo(
  gapNetto: number,
  pips: number,
  pipValue: number,
  coefficient: number
): { targetLordo: number; finalLots: number } {
  // Iteration 1: stima lotti sul gap netto
  let estimatedLots = gapNetto / (pips * pipValue);
  estimatedLots = Math.max(0.01, Math.round(estimatedLots * 100) / 100);
  const effectiveLots1 = estimatedLots * coefficient;

  // Calcola commissioni con i lotti stimati
  const commission1 = effectiveLots1 * BROKER_COMMISSION_PER_LOT;
  let targetLordo = gapNetto + commission1 + TARGET_SAFETY_BUFFER;

  // Iteration 2: ricalcola lotti sul target lordo
  let finalBaseLots = targetLordo / (pips * pipValue);
  finalBaseLots = Math.max(0.01, Math.round(finalBaseLots * 100) / 100);
  const effectiveLots2 = finalBaseLots * coefficient;

  // Ricalcola commissioni finali e target lordo definitivo
  const commission2 = effectiveLots2 * BROKER_COMMISSION_PER_LOT;
  targetLordo = gapNetto + commission2 + TARGET_SAFETY_BUFFER;

  return { targetLordo, finalLots: finalBaseLots };
}

// ============================================
// LOT CALCULATION HELPERS
// ============================================

/**
 * Seleziona un simbolo attivo dalla Tabella Operatività,
 * usando la logica 50/50 session-based con rotazione.
 * Diversifica rispetto ai simboli già usati nella sessione.
 */
function selectSymbolForTarget(
  pipRangeConfigs: PipRangeConfig[],
  usedSymbols: Set<string>,
  rotationIndex: number,
  sessionSymbols: SessionAllowedSymbol[],
  otherSymbols: SessionAllowedSymbol[]
): { symbol: AllowedSymbol; config: PipRangeConfig } | null {
  const activeConfigs = pipRangeConfigs.filter(c => c.is_active);
  if (activeConfigs.length === 0) return null;

  // Build active symbol set for fast lookup
  const activeSymbolSet = new Set(activeConfigs.map(c => c.symbol));

  // Get session-rotated symbol list (50/50 rule)
  const rotatedSymbols = getRotatedSymbolList(sessionSymbols, otherSymbols, rotationIndex);

  // Try symbols in session-priority order, preferring unused ones first
  for (const sym of rotatedSymbols) {
    if (!activeSymbolSet.has(sym)) continue;
    if (usedSymbols.has(sym)) continue;
    const config = activeConfigs.find(c => c.symbol === sym);
    if (config) {
      console.log(`[TARGET SYMBOL] Selected ${sym} (session-rotated, rotation=${rotationIndex})`);
      return { symbol: sym as AllowedSymbol, config };
    }
  }

  // Fallback: try used symbols in session order
  for (const sym of rotatedSymbols) {
    if (!activeSymbolSet.has(sym)) continue;
    const config = activeConfigs.find(c => c.symbol === sym);
    if (config) {
      console.log(`[TARGET SYMBOL] Fallback ${sym} (all used, session-rotated)`);
      return { symbol: sym as AllowedSymbol, config };
    }
  }

  return null;
}

/**
 * Applica il coefficiente 5ERS: x1.2 se prop firm è 5%ERS con baseline 60k.
 */
function apply5ersCoefficient(lots: number, account: MT5Account, baseline: number): number {
  const firmName = extractPropFirmName(account.prop_firm_name || '');
  if (firmName === '5%ERS' && baseline === 60000) {
    return Math.round(lots * FIVEERS_60K_COEFFICIENT * 100) / 100;
  }
  return lots;
}

/**
 * Assegna direzioni consistenti per la coppia, rispettando il tracker globale.
 */
function assignDirections(
  accountA: MT5Account,
  accountB: MT5Account,
  propFirmTracker: PropFirmDirectionTracker,
  symbol: AllowedSymbol
): { directionA: 'BUY' | 'SELL'; directionB: 'BUY' | 'SELL' } {
  const firmA = extractPropFirmName(accountA.prop_firm_name || '');
  const firmB = extractPropFirmName(accountB.prop_firm_name || '');

  ensurePropFirmDirectionTrackerInitialized(propFirmTracker, firmA);
  ensurePropFirmDirectionTrackerInitialized(propFirmTracker, firmB);

  const trackerA = propFirmTracker[firmA];
  const trackerB = propFirmTracker[firmB];

  const existingDirA = trackerA.symbolDirection.get(symbol);
  const existingDirB = trackerB.symbolDirection.get(symbol);

  let directionA: 'BUY' | 'SELL';
  let directionB: 'BUY' | 'SELL';

  if (existingDirA) {
    directionA = existingDirA;
    directionB = existingDirA === 'BUY' ? 'SELL' : 'BUY';
  } else if (existingDirB) {
    directionB = existingDirB;
    directionA = existingDirB === 'BUY' ? 'SELL' : 'BUY';
  } else {
    directionA = Math.random() > 0.5 ? 'BUY' : 'SELL';
    directionB = directionA === 'BUY' ? 'SELL' : 'BUY';
  }

  trackerA.symbolDirection.set(symbol, directionA);
  trackerB.symbolDirection.set(symbol, directionB);

  return { directionA, directionB };
}

// ============================================
// LOT CALCULATION: LOTTI UGUALI + PIPS ASIMMETRICHE
// ============================================

/**
 * TRADE TARGET DOPPIO: Entrambi vanno a target.
 *
 * LOGICA CORRETTA:
 * 1. Prendi il Target_Mancante più alto → determina il lotto base
 * 2. Scegli pips random dalla Tabella Operatività
 * 3. lots_base = Target_Mancante_max / (pips_random * pipValue)
 * 4. Applica coefficiente 5ERS (x1.2 se baseline 60k) a ciascun account
 * 5. Calcola pips asimmetriche:
 *    pipsTP_A = Target_Mancante_A / (lotsA_effettivi * pipValue)
 *    pipsTP_B = Target_Mancante_B / (lotsB_effettivi * pipValue)
 * 6. Se pips risultanti > max_pips, aumenta i lotti base e ricalcola
 *
 * I LOTTI SONO UGUALI (salvo coefficiente 5ERS). LE PIPS SONO DIVERSE.
 */
export function calculateDoppioLots(
  pair: DetectedTargetPair,
  config: PipRangeConfig,
  symbol: string,
  dynamicPipValues?: Record<string, number>
): TargetLotResult {
  const { candidateA, candidateB } = pair;
  const pipValue = dynamicPipValues?.[symbol] || PIP_VALUES[symbol] || 10;
  const spread = config.spread ?? 0.3;

  // Step 1: Scegli pips random dal range della Tabella Operatività
  const randomPips = config.min_pips + Math.random() * (config.max_pips - config.min_pips);
  const referencePips = Math.round(randomPips * 10) / 10;

  // Step 2: Coefficienti 5ERS
  const coeffA = apply5ersCoefficient(1, candidateA.account, candidateA.baseline);
  const coeffB = apply5ersCoefficient(1, candidateB.account, candidateB.baseline);

  // Step 3: Calcola Target Lordo iterativo per entrambi gli account
  // Gap Netto = targetMancante (già calcolato come targetBalance - currentBalance)
  const grossA = calculateTargetLordo(candidateA.targetMancante, referencePips, pipValue, coeffA);
  const grossB = calculateTargetLordo(candidateB.targetMancante, referencePips, pipValue, coeffB);

  const targetLordoA = grossA.targetLordo;
  const targetLordoB = grossB.targetLordo;

  console.log(
    `[TARGET DOPPIO] Target Lordo: A gap=$${candidateA.targetMancante.toFixed(0)} → lordo=$${targetLordoA.toFixed(0)} | ` +
    `B gap=$${candidateB.targetMancante.toFixed(0)} → lordo=$${targetLordoB.toFixed(0)}`
  );

  // Step 4: Lotto base dal Target Lordo più alto
  const maxTarget = Math.max(targetLordoA, targetLordoB);
  let baseLots = maxTarget / (referencePips * pipValue);
  baseLots = Math.round(baseLots * 100) / 100;
  baseLots = Math.max(0.01, baseLots);

  // Step 5: Cap baseLots via maxRisk constraint
  const maxLotsFromRiskA = spread > 0
    ? (candidateA.maxRisk - targetLordoB) / (spread * pipValue * coeffA)
    : Infinity;
  const maxLotsFromRiskB = spread > 0
    ? (candidateB.maxRisk - targetLordoA) / (spread * pipValue * coeffB)
    : Infinity;

  if (maxLotsFromRiskA > 0 && baseLots > maxLotsFromRiskA) {
    baseLots = Math.round(maxLotsFromRiskA * 100) / 100;
  }
  if (maxLotsFromRiskB > 0 && baseLots > maxLotsFromRiskB) {
    baseLots = Math.round(maxLotsFromRiskB * 100) / 100;
  }
  baseLots = Math.max(0.01, baseLots);

  // Step 6: Calculate effective lots and pips (usando Target Lordo)
  let lotsA = apply5ersCoefficient(baseLots, candidateA.account, candidateA.baseline);
  let lotsB = apply5ersCoefficient(baseLots, candidateB.account, candidateB.baseline);

  let pipsA = targetLordoA / (lotsA * pipValue);
  let pipsB = targetLordoB / (lotsB * pipValue);

  // If pips exceed max_pips, increase lots (but re-check risk cap)
  const maxPipsResult = Math.max(pipsA, pipsB);
  if (maxPipsResult > config.max_pips) {
    const scaleFactor = maxPipsResult / config.max_pips;
    baseLots = Math.round(baseLots * scaleFactor * 100) / 100;
    if (maxLotsFromRiskA > 0 && baseLots > maxLotsFromRiskA) baseLots = Math.round(maxLotsFromRiskA * 100) / 100;
    if (maxLotsFromRiskB > 0 && baseLots > maxLotsFromRiskB) baseLots = Math.round(maxLotsFromRiskB * 100) / 100;
    baseLots = Math.max(0.01, baseLots);
  }

  // Ricalcola valori finali (usando Target Lordo per le pips)
  lotsA = apply5ersCoefficient(baseLots, candidateA.account, candidateA.baseline);
  lotsB = apply5ersCoefficient(baseLots, candidateB.account, candidateB.baseline);
  pipsA = Math.round((targetLordoA / (lotsA * pipValue)) * 10) / 10;
  pipsB = Math.round((targetLordoB / (lotsB * pipValue)) * 10) / 10;
  const slPipsA = Math.round((pipsB + spread) * 10) / 10;
  const slPipsB = Math.round((pipsA + spread) * 10) / 10;

  // winAmount = Target Lordo (include gap + commissioni + buffer)
  const winAmountA = Math.round(pipsA * lotsA * pipValue);
  const winAmountB = Math.round(pipsB * lotsB * pipValue);
  const loseAmountA = Math.round(slPipsA * lotsA * pipValue);
  const loseAmountB = Math.round(slPipsB * lotsB * pipValue);

  const riskPercentA = (loseAmountA / candidateA.baseline) * 100;
  const riskPercentB = (loseAmountB / candidateB.baseline) * 100;

  console.log(
    `[TARGET DOPPIO] ${symbol} spread=${spread} baseLots=${baseLots} | ` +
    `A: ${lotsA} lots, TP=${pipsA} pips, SL=${slPipsA} pips → vince $${winAmountA} (lordo), perde $${loseAmountA} (risk ${riskPercentA.toFixed(2)}%) | ` +
    `B: ${lotsB} lots, TP=${pipsB} pips, SL=${slPipsB} pips → vince $${winAmountB} (lordo), perde $${loseAmountB} (risk ${riskPercentB.toFixed(2)}%)`
  );

  return {
    baseLots,
    lotsA: Math.max(0.01, lotsA),
    lotsB: Math.max(0.01, lotsB),
    pipsA,
    pipsB,
    slPipsA,
    slPipsB,
    winAmountA,
    winAmountB,
    loseAmountA,
    loseAmountB,
    riskPercentA: Math.round(riskPercentA * 100) / 100,
    riskPercentB: Math.round(riskPercentB * 100) / 100,
  };
}

/**
 * TRADE TARGET SINGOLO: Solo A va a target, B massimizza il profitto.
 *
 * LOGICA v3 — ALGEBRA INVERSA DETERMINISTICA (zero loop):
 *
 * 1. Calcola i tetti massimi di rischio in $ per A e B.
 * 2. SL_A è blindato: SL_Pips_A = MaxRisk_A / (lotsA * pipValue).
 *    Di conseguenza TP_B = SL_A - spread.
 * 3. TP_A è blindato dal rischio di B: Max_SL_B = MaxRisk_B / (lotsB * pipValue).
 *    Quindi Max_TP_A = Max_SL_B - spread.
 * 4. Se il target richiesto da A supera Max_TP_A → Partial Target.
 *
 * REGOLA INVALICABILE: Nessun account può avere SL > maxRisk.
 */
export function calculateSingoloLots(
  pair: DetectedTargetPair,
  config: PipRangeConfig,
  symbol: string,
  riskConfigMap?: PropFirmRiskConfigMap,
  dynamicPipValues?: Record<string, number>
): TargetLotResult {
  const { candidateA, candidateB } = pair;
  const pipValue = dynamicPipValues?.[symbol] || PIP_VALUES[symbol] || 10;
  const spread = config.spread ?? 0.3;

  // ── TETTI MASSIMI (Cap) ──
  const maxRiskAmountA = candidateA.maxRisk;
  const maxRiskAmountB = candidateB.maxRisk;

  // Per B (spalla): profitto desiderato = suo maxRisk%
  const firmB = extractPropFirmName(candidateB.account.prop_firm_name || '');
  let maxRiskPercentB = 3.5;
  if (candidateB.account.is_risk_override_active && candidateB.account.risk_override_value != null && candidateB.account.risk_override_value > 0) {
    maxRiskPercentB = candidateB.account.risk_override_value;
  } else if (riskConfigMap && firmB) {
    const riskConfig = riskConfigMap[firmB];
    if (riskConfig) {
      maxRiskPercentB = riskConfig.target_fase_max_risk;
    }
  }
  const desiredProfitB = candidateB.baseline * (maxRiskPercentB / 100);

  // ── COEFFICIENTI 5ERS ──
  const coeffA = apply5ersCoefficient(1, candidateA.account, candidateA.baseline);
  const coeffB = apply5ersCoefficient(1, candidateB.account, candidateB.baseline);

  // ── PIPS RANDOM dalla Tabella Operatività ──
  const randomPips = config.min_pips + Math.random() * (config.max_pips - config.min_pips);
  const referencePips = Math.round(randomPips * 10) / 10;

  // ── TARGET LORDO per Account A ──
  const grossA = calculateTargetLordo(candidateA.targetMancante, referencePips, pipValue, coeffA);
  const fullTargetLordoA = grossA.targetLordo;

  // ── LOTTO BASE iniziale dal target di A ──
  let baseLots = fullTargetLordoA / (referencePips * pipValue);
  baseLots = Math.max(0.01, Math.round(baseLots * 100) / 100);

  // ── LOTTI EFFETTIVI ──
  const lotsA = apply5ersCoefficient(baseLots, candidateA.account, candidateA.baseline);
  const lotsB = apply5ersCoefficient(baseLots, candidateB.account, candidateB.baseline);

  // ══════════════════════════════════════════════
  // ALGEBRA INVERSA — NESSUN LOOP
  // ══════════════════════════════════════════════

  // (A) Pips desiderate per il TP di A (target completo)
  const desiredPipsA = fullTargetLordoA / (lotsA * pipValue);

  // (B) Pips desiderate per il TP di B (profitto massimo spalla)
  const desiredPipsB = desiredProfitB / (lotsB * pipValue);

  // ── VINCOLO 1: SL di A non deve superare maxRiskA ──
  // SL_A = pipsB + spread → pipsB_max = (maxRiskA / (lotsA * pipValue)) - spread
  const maxPipsB_fromRiskA = (maxRiskAmountA / (lotsA * pipValue)) - spread;
  const cappedPipsB = Math.max(0.1, Math.min(desiredPipsB, maxPipsB_fromRiskA));

  // ── VINCOLO 2: SL di B non deve superare maxRiskB ──
  // SL_B = pipsA + spread → pipsA_max = (maxRiskB / (lotsB * pipValue)) - spread
  const maxPipsA_fromRiskB = (maxRiskAmountB / (lotsB * pipValue)) - spread;

  // ── PARTIAL TARGET: se pipsA richieste > max consentito, taglia ──
  const cappedPipsA = Math.max(0.1, Math.min(desiredPipsA, maxPipsA_fromRiskB));
  const isPartialTarget = cappedPipsA < desiredPipsA;

  // ── ENFORCE MAX PIPS (mai sopra max_pips della Tabella) ──
  let finalPipsA = Math.min(cappedPipsA, config.max_pips);
  let finalPipsB = Math.min(cappedPipsB, config.max_pips);

  // Arrotondamento
  finalPipsA = Math.round(finalPipsA * 10) / 10;
  finalPipsB = Math.round(finalPipsB * 10) / 10;

  // ── SL SPECULARE ──
  const slPipsA = Math.round((finalPipsB + spread) * 10) / 10;
  const slPipsB = Math.round((finalPipsA + spread) * 10) / 10;

  // ── IMPORTI FINALI ──
  let winAmountA = Math.round(finalPipsA * lotsA * pipValue);
  let winAmountB = Math.round(finalPipsB * lotsB * pipValue);
  let loseAmountA = Math.round(slPipsA * lotsA * pipValue);
  let loseAmountB = Math.round(slPipsB * lotsB * pipValue);

  let riskPercentA = (loseAmountA / candidateA.baseline) * 100;
  let riskPercentB = (loseAmountB / candidateB.baseline) * 100;

  // ══════════════════════════════════════════════
  // POST-CALCULATION HARD CAP — SAFETY NET FINALE
  // ══════════════════════════════════════════════
  // Se dopo l'arrotondamento il rischio sfora comunque, riduci i lotti.
  const maxRiskPctA = (maxRiskAmountA / candidateA.baseline) * 100;
  const maxRiskPctB = (maxRiskAmountB / candidateB.baseline) * 100;

  if (riskPercentA > maxRiskPctA || riskPercentB > maxRiskPctB) {
    console.log(`[TARGET SINGOLO] ⚠️ Post-calc risk overflow detected: A=${riskPercentA.toFixed(2)}% (cap ${maxRiskPctA.toFixed(2)}%), B=${riskPercentB.toFixed(2)}% (cap ${maxRiskPctB.toFixed(2)}%) — clamping lots`);

    // Calculate max lots each account can handle
    const maxLotsFromA = maxRiskAmountA / (slPipsA * pipValue);
    const maxLotsFromB = maxRiskAmountB / (slPipsB * pipValue);

    // Take the minimum to satisfy both constraints
    const safeLots = Math.max(0.01, Math.floor(Math.min(lotsA, lotsB, maxLotsFromA, maxLotsFromB) * 100) / 100);

    // Recalculate with safe lots (preserve 5ERS coefficient ratio)
    const safeLotsA = apply5ersCoefficient(safeLots, candidateA.account, candidateA.baseline);
    const safeLotsB = apply5ersCoefficient(safeLots, candidateB.account, candidateB.baseline);

    // Recalculate pips from fixed targets with new lots
    finalPipsA = Math.round((fullTargetLordoA / (safeLotsA * pipValue)) * 10) / 10;
    finalPipsB = Math.round((desiredProfitB / (safeLotsB * pipValue)) * 10) / 10;

    // Re-apply all caps
    finalPipsA = Math.min(finalPipsA, maxPipsA_fromRiskB, config.max_pips);
    finalPipsB = Math.min(finalPipsB, maxPipsB_fromRiskA, config.max_pips);
    finalPipsA = Math.round(Math.max(0.1, finalPipsA) * 10) / 10;
    finalPipsB = Math.round(Math.max(0.1, finalPipsB) * 10) / 10;

    const safeSlA = Math.round((finalPipsB + spread) * 10) / 10;
    const safeSlB = Math.round((finalPipsA + spread) * 10) / 10;

    winAmountA = Math.round(finalPipsA * safeLotsA * pipValue);
    winAmountB = Math.round(finalPipsB * safeLotsB * pipValue);
    loseAmountA = Math.round(safeSlA * safeLotsA * pipValue);
    loseAmountB = Math.round(safeSlB * safeLotsB * pipValue);
    riskPercentA = (loseAmountA / candidateA.baseline) * 100;
    riskPercentB = (loseAmountB / candidateB.baseline) * 100;

    console.log(`[TARGET SINGOLO] ✅ Clamped: lots ${safeLots} → A risk=${riskPercentA.toFixed(2)}%, B risk=${riskPercentB.toFixed(2)}%`);

    return {
      baseLots: safeLots,
      lotsA: Math.max(0.01, safeLotsA),
      lotsB: Math.max(0.01, safeLotsB),
      pipsA: finalPipsA,
      pipsB: finalPipsB,
      slPipsA: safeSlA,
      slPipsB: safeSlB,
      winAmountA,
      winAmountB,
      loseAmountA,
      loseAmountB,
      riskPercentA: Math.round(riskPercentA * 100) / 100,
      riskPercentB: Math.round(riskPercentB * 100) / 100,
    };
  }

  console.log(
    `[TARGET SINGOLO v3] ${symbol} ${isPartialTarget ? '⚠️ PARTIAL TARGET' : '✅ FULL TARGET'} spread=${spread} baseLots=${baseLots} | ` +
    `A (TARGET): ${lotsA} lots, TP=${finalPipsA} pips ($${winAmountA}), SL=${slPipsA} pips ($${loseAmountA}, risk ${riskPercentA.toFixed(2)}%) [cap=${maxRiskPctA.toFixed(2)}%] | ` +
    `B (SPALLA): ${lotsB} lots, TP=${finalPipsB} pips ($${winAmountB}), SL=${slPipsB} pips ($${loseAmountB}, risk ${riskPercentB.toFixed(2)}%) [cap=${maxRiskPctB.toFixed(2)}%]`
  );

  return {
    baseLots,
    lotsA: Math.max(0.01, lotsA),
    lotsB: Math.max(0.01, lotsB),
    pipsA: finalPipsA,
    pipsB: finalPipsB,
    slPipsA,
    slPipsB,
    winAmountA,
    winAmountB,
    loseAmountA,
    loseAmountB,
    riskPercentA: Math.round(riskPercentA * 100) / 100,
    riskPercentB: Math.round(riskPercentB * 100) / 100,
  };
}

// ============================================
// REFRESH TARGET LOTS
// ============================================

export interface RefreshTargetParams {
  /** Fixed monetary target for Account A (Target Lordo) */
  targetLordoA: number;
  /** Fixed monetary target for Account B (Target Lordo) */
  targetLordoB: number;
  /** Symbol being traded */
  symbol: string;
  /** Account A info */
  accountA: MT5Account;
  /** Account B info */
  accountB: MT5Account;
  /** Pip range configs from Tabella Operatività */
  pipRangeConfigs: PipRangeConfig[];
  /** Dynamic pip values from MyFXBook */
  dynamicPipValues?: Record<string, number>;
  /** Baseline A */
  baselineA: number;
  /** Baseline B */
  baselineB: number;
}

export interface RefreshTargetResult {
  lotsA: number;
  lotsB: number;
  pipsA: number;
  pipsB: number;
  slPipsA: number;
  slPipsB: number;
  winAmountA: number;
  winAmountB: number;
  loseAmountA: number;
  loseAmountB: number;
  riskPercentA: number;
  riskPercentB: number;
  baseLots: number;
}

/**
 * Rigenera lotti per un trade TARGET mantenendo fisso il Target Lordo.
 *
 * Logica:
 * 1. Seleziona nuove pips random dalla Tabella Operatività
 * 2. Calcola nuovi lotti: baseLots = max(targetLordoA, targetLordoB) / (pips * pipValue)
 * 3. REGOLA CRITICA: le pips NON devono MAI superare max_pips, ma POSSONO scendere sotto min_pips
 *    (per accomodare target lordi molto diversi tra A e B)
 * 4. Se le pips del target maggiore superano max_pips, scala i lotti in alto
 * 5. Ricalcola mirroring SL: SL_A = pipsB + spread, SL_B = pipsA + spread
 *
 * DOPPIO e SINGOLO usano la stessa identica logica.
 */
export function refreshTargetLots(params: RefreshTargetParams): RefreshTargetResult {
  const {
    targetLordoA,
    targetLordoB,
    symbol,
    accountA,
    accountB,
    pipRangeConfigs,
    dynamicPipValues,
    baselineA,
    baselineB,
  } = params;

  const pipValue = dynamicPipValues?.[symbol] || PIP_VALUES[symbol] || 10;
  const config = pipRangeConfigs.find(c => c.symbol === symbol && c.is_active);

  if (!config) {
    console.warn(`[REFRESH TARGET] No pip range config for ${symbol}`);
    return {
      lotsA: 0.01, lotsB: 0.01,
      pipsA: 30, pipsB: 30,
      slPipsA: 30.3, slPipsB: 30.3,
      winAmountA: targetLordoA, winAmountB: targetLordoB,
      loseAmountA: 0, loseAmountB: 0,
      riskPercentA: 0, riskPercentB: 0,
      baseLots: 0.01,
    };
  }

  const spread = config.spread ?? 0.3;

  // Coefficienti 5ERS
  const coeffA = apply5ersCoefficient(1, accountA, baselineA);
  const coeffB = apply5ersCoefficient(1, accountB, baselineB);

  // Step 1: Generate new random pips from Tabella Operatività
  let referencePips = config.min_pips + Math.random() * (config.max_pips - config.min_pips);
  referencePips = Math.round(referencePips * 10) / 10;

  // Step 2: Calculate base lots from the HIGHER target lordo
  const maxTarget = Math.max(targetLordoA, targetLordoB);
  let baseLots = maxTarget / (referencePips * pipValue);
  baseLots = Math.round(baseLots * 100) / 100;
  baseLots = Math.max(0.01, baseLots);

  // Step 3: Calculate initial pips for both accounts
  let lotsA = apply5ersCoefficient(baseLots, accountA, baselineA);
  let lotsB = apply5ersCoefficient(baseLots, accountB, baselineB);
  let pipsA = targetLordoA / (lotsA * pipValue);
  let pipsB = targetLordoB / (lotsB * pipValue);

  // Step 4: ENFORCE MAX PIPS ONLY (never exceed max_pips, CAN go below min_pips)
  // This is critical for DOPPIO where targetLordoA and targetLordoB can be very different
  const maxPipsResult = Math.max(pipsA, pipsB);
  if (maxPipsResult > config.max_pips) {
    // Scale UP lots to bring the highest pips down to max_pips
    const scaleFactor = maxPipsResult / config.max_pips;
    baseLots = Math.round(baseLots * scaleFactor * 100) / 100;
    baseLots = Math.max(0.01, baseLots);
  }

  // Final recalculation with adjusted baseLots
  lotsA = apply5ersCoefficient(baseLots, accountA, baselineA);
  lotsB = apply5ersCoefficient(baseLots, accountB, baselineB);
  pipsA = Math.round((targetLordoA / (lotsA * pipValue)) * 10) / 10;
  pipsB = Math.round((targetLordoB / (lotsB * pipValue)) * 10) / 10;

  // Step 5: Mirror SL
  const slPipsA = Math.round((pipsB + spread) * 10) / 10;
  const slPipsB = Math.round((pipsA + spread) * 10) / 10;

  // Calculate win/lose amounts
  const winAmountA = Math.round(pipsA * lotsA * pipValue);
  const winAmountB = Math.round(pipsB * lotsB * pipValue);
  const loseAmountA = Math.round(slPipsA * lotsA * pipValue);
  const loseAmountB = Math.round(slPipsB * lotsB * pipValue);

  const riskPercentA = Math.round((loseAmountA / baselineA) * 10000) / 100;
  const riskPercentB = Math.round((loseAmountB / baselineB) * 10000) / 100;

  console.log(
    `[REFRESH TARGET] ${symbol} refPips=${referencePips} baseLots=${baseLots} | ` +
    `A: ${lotsA} lots, TP=${pipsA} pips, SL=${slPipsA} pips → vince $${winAmountA}, perde $${loseAmountA} (${riskPercentA}%) | ` +
    `B: ${lotsB} lots, TP=${pipsB} pips, SL=${slPipsB} pips → vince $${winAmountB}, perde $${loseAmountB} (${riskPercentB}%)`
  );

  return {
    lotsA: Math.max(0.01, lotsA),
    lotsB: Math.max(0.01, lotsB),
    pipsA,
    pipsB,
    slPipsA,
    slPipsB,
    winAmountA,
    winAmountB,
    loseAmountA,
    loseAmountB,
    riskPercentA,
    riskPercentB,
    baseLots,
  };
}

// ============================================
// MAIN ENTRY POINT
// ============================================

/**
 * Genera incroci di tipo TARGET con calcolo lotti completo.
 *
 * Fase 1 — Detection:
 *   Scansiona gli account, calcola targetMancante e maxRisk,
 *   classifica come DOPPIO o SINGOLO.
 *
 * Fase 2 — Lot Calculation:
 *   Seleziona simbolo dalla Tabella Operatività,
 *   calcola lotti con formula Pips-First,
 *   assegna direzioni consistenti per prop firm.
 */
export function generateTargetCrosses(params: TargetEngineParams): TargetEngineResult {
  const {
    accounts,
    usedAccountIds,
    propFirmTracker,
    pipRangeConfigs,
    dynamicPipValues,
    riskConfigMap,
    targetRulesMap,
  } = params;

  if (!targetRulesMap) {
    console.log('[TARGET ENGINE] targetRulesMap non disponibile, skip');
    return { suggestions: [] };
  }

  // Step 1: Costruisci la lista di candidati TARGET
  const candidates: TargetCandidate[] = [];
  for (const account of accounts) {
    if (usedAccountIds.has(account.id)) continue;
    const candidate = computeTargetCandidate(account, targetRulesMap, riskConfigMap);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  console.log(`[TARGET ENGINE] Candidati trovati: ${candidates.length}`);

  if (candidates.length < 1) {
    return { suggestions: [] };
  }

  // Step 2: Rileva coppie TARGET (DOPPIO / SINGOLO)
  // Pass ALL accounts so partner search is global (not limited to target candidates)
  const detectedPairs = detectTargetPairs(candidates, accounts, usedAccountIds, riskConfigMap, targetRulesMap);

  console.log(`[TARGET ENGINE] Coppie rilevate: ${detectedPairs.length}`);
  for (const pair of detectedPairs) {
    console.log(
      `[TARGET ENGINE]   ${pair.subType}: ` +
      `${pair.candidateA.account.account_name} (mancante: $${pair.candidateA.targetMancante.toFixed(0)}) ↔ ` +
      `${pair.candidateB.account.account_name} (mancante: $${pair.candidateB.targetMancante.toFixed(0)})`
    );
  }

  if (detectedPairs.length === 0) {
    return { suggestions: [] };
  }

  // Step 3: Calcola lotti per ogni coppia
  const suggestions: CrossSuggestion[] = [];
  const usedSymbols = new Set<string>();

  // Pre-shuffle session symbol pools ONCE for this batch
  const { sessionSymbols: batchSessionSymbols, otherSymbols: batchOtherSymbols } = getSessionSymbolLists();
  let globalTargetCounter = 0;

  for (const pair of detectedPairs) {
    // Seleziona simbolo dalla Tabella Operatività con logica 50/50 session
    const symbolResult = selectSymbolForTarget(pipRangeConfigs || [], usedSymbols, globalTargetCounter, batchSessionSymbols, batchOtherSymbols);
    globalTargetCounter++;
    if (!symbolResult) {
      console.log('[TARGET ENGINE] Nessun simbolo attivo disponibile, skip coppia');
      continue;
    }

    const { symbol, config } = symbolResult;
    usedSymbols.add(symbol);

    // Assegna direzioni consistenti
    const { directionA, directionB } = assignDirections(
      pair.candidateA.account,
      pair.candidateB.account,
      propFirmTracker,
      symbol
    );

    // Calcola lotti in base al sub-type
    let lotResult: TargetLotResult;

    if (pair.subType === 'TRADE TARGET DOPPIO') {
      lotResult = calculateDoppioLots(pair, config, symbol, dynamicPipValues);
    } else {
      lotResult = calculateSingoloLots(pair, config, symbol, riskConfigMap, dynamicPipValues);
    }

    const phase = pair.candidateA.account.phase as 'fase1' | 'fase2';

    // Build target metadata JSON for notes field (used by UI)
    const targetMeta = {
      engineType: 'target',
      targetSubType: pair.subType,
      targetAccountId: pair.targetAccountId,
      baseLots: lotResult.baseLots,
      pipsA: lotResult.pipsA,
      pipsB: lotResult.pipsB,
      slPipsA: lotResult.slPipsA,
      slPipsB: lotResult.slPipsB,
      winAmountA: lotResult.winAmountA,
      winAmountB: lotResult.winAmountB,
      loseAmountA: lotResult.loseAmountA,
      loseAmountB: lotResult.loseAmountB,
      riskPercentA: lotResult.riskPercentA,
      riskPercentB: lotResult.riskPercentB,
      // Fixed anchors for lot refresh (Target Lordo = gap + commissioni + buffer)
      targetLordoA: lotResult.winAmountA,
      targetLordoB: lotResult.winAmountB,
      // Account baselines for risk recalculation
      baselineA: pair.candidateA.baseline,
      baselineB: pair.candidateB.baseline,
    };

    suggestions.push({
      accountA: pair.candidateA.account,
      accountB: pair.candidateB.account,
      symbol,
      directionA,
      directionB,
      lotsA: lotResult.lotsA,
      lotsB: lotResult.lotsB,
      phase,
      stageDifference: Math.abs(
        (pair.candidateA.account.stage || 0) - (pair.candidateB.account.stage || 0)
      ),
      balanceDifference: Math.abs(
        (pair.candidateA.account.current_balance || 0) -
        (pair.candidateB.account.current_balance || 0)
      ),
      riskReward: '1:1',
      riskPercent: Math.max(lotResult.riskPercentA, lotResult.riskPercentB),
      riskPercentA: lotResult.riskPercentA,
      riskPercentB: lotResult.riskPercentB,
      score: 0,
      // Engine detection metadata
      engineType: 'target' as const,
      targetSubType: pair.subType,
      targetAccountId: pair.targetAccountId,
      // Asymmetric pips data
      pipsA: lotResult.pipsA,
      pipsB: lotResult.pipsB,
      winAmountA: lotResult.winAmountA,
      winAmountB: lotResult.winAmountB,
      loseAmountA: lotResult.loseAmountA,
      loseAmountB: lotResult.loseAmountB,
      // Store metadata as notes JSON for DB persistence
      targetMetaNotes: JSON.stringify(targetMeta),
    });
  }

  console.log(`[TARGET ENGINE] Suggerimenti finali con lotti: ${suggestions.length}`);
  for (const s of suggestions) {
    console.log(
      `[TARGET ENGINE]   ${s.targetSubType} | ${s.symbol} ${s.directionA}/${s.directionB} | ` +
      `${s.accountA.account_name}: ${s.lotsA} lots (${s.pipsA} pips) | ` +
      `${s.accountB.account_name}: ${s.lotsB} lots (${s.pipsB} pips)`
    );
  }

  return { suggestions };
}
