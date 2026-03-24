// ============================================
// EXPLOSION ENGINE - Logica Esplosione
// ============================================
// Questo file contiene la logica per la generazione
// di incroci di tipo ESPLOSIONE.
//
// Responsabilità:
// - Detection: identificazione account vicini al limite di drawdown
// - Matching: accoppiamento con filtro balance mandatorio
// - Calcolo lotti SL-driven: saturazione rischio residuo
// - Gestione dei limiti di rischio giornaliero per esplosione
//
// AMBITO: Solo Fase 1 e Fase 2 (Live sarà definito separatamente)

import type { MT5Account } from '../../types/mt5';
import type {
  CrossSuggestion,
  PropFirmRiskMap,
  PropFirmDirectionTracker,
  PipRangeConfig,
  PropFirmRiskConfigMap,
  TradeCross,
  ExplosionSubType,
  AllowedSymbol,
} from '../../hooks/useCrossTrading';
import {
  getStandardBalance,
  getNormalizedBalance,
  PIP_VALUES,
  ensurePropFirmDirectionTrackerInitialized,
  getSessionSymbolLists,
  getRotatedSymbolList,
  type AllowedSymbol as SessionAllowedSymbol,
} from '../../hooks/useCrossTrading';
import { extractPropFirmName } from '../../utils/propFirmUtils';

export interface ExplosionEngineParams {
  accounts: MT5Account[];
  riskMap: PropFirmRiskMap;
  usedAccountIds: Set<string>;
  existingCrosses: TradeCross[];
  propFirmTracker: PropFirmDirectionTracker;
  pipRangeConfigs?: PipRangeConfig[];
  dynamicPipValues?: Record<string, number>;
  riskConfigMap?: PropFirmRiskConfigMap;
}

export interface ExplosionEngineResult {
  suggestions: CrossSuggestion[];
}

// ============================================
// CONSTANTS
// ============================================

/** Coefficiente baseline per 5ERS con balance 60k */
const FIVEERS_60K_COEFFICIENT = 1.2;

/** Commissione broker per lotto scambiato ($) */
const BROKER_COMMISSION_PER_LOT = 5;

/** Buffer di sicurezza finale ($) per garantire che il saldo rimanga sopra il drawdown limit */
const EXPLOSION_SAFETY_BUFFER = 5;

// ============================================
// DETECTION: Identificazione Account Esplosione
// ============================================

/**
 * Determina se un account è candidato ESPLOSIONE.
 *
 * Regola Standard (tutte le prop firm tranne Fintokei):
 *   (Balance_Attuale × 0.96) <= (Baseline × 0.90)
 *   → Se perdendo il 4% del balance attuale si raggiunge il -10% dalla baseline.
 *
 * Eccezione Fintokei (soglia più stretta):
 *   (Balance_Attuale × 0.97) <= (Baseline × 0.90)
 *   → Se perdendo il 3% del balance attuale si raggiunge il -10% dalla baseline.
 *
 * AMBITO: Solo Fase 1 e Fase 2.
 */
export function isExplosionCandidate(account: MT5Account): boolean {
  if (account.phase !== 'fase1' && account.phase !== 'fase2') return false;
  if (account.account_status !== 'active') return false;

  const currentBalance = account.current_balance ?? account.initial_balance;
  const baseline = getStandardBalance(account);
  const drawdownLimit = baseline * 0.90;

  const firmName = extractPropFirmName(account.prop_firm_name || '');
  const isFintokei = firmName === 'FINTOKEI';
  const lossMultiplier = isFintokei ? 0.97 : 0.96;
  const balanceAfterLoss = currentBalance * lossMultiplier;
  const isExplosion = balanceAfterLoss <= drawdownLimit;

  if (isExplosion) {
    console.log(
      `[EXPLOSION DETECTION] ✓ ${account.account_name} (${firmName}) ` +
      `Balance: $${currentBalance} | Baseline: $${baseline} | ` +
      `After ${isFintokei ? '3' : '4'}% loss: $${balanceAfterLoss.toFixed(0)} <= Limit: $${drawdownLimit} → ESPLOSIONE`
    );
  }

  return isExplosion;
}

/**
 * Filtra tutti gli account candidati ESPLOSIONE da una lista.
 */
export function detectExplosionCandidates(accounts: MT5Account[]): MT5Account[] {
  return accounts.filter(isExplosionCandidate);
}

// ============================================
// MATCHING: Accoppiamento Account Esplosione
// ============================================

function calcNormalizedBalanceDiff(a: MT5Account, b: MT5Account): number {
  return Math.abs(getNormalizedBalance(a) - getNormalizedBalance(b));
}

function calcStageDiff(a: MT5Account, b: MT5Account): number {
  return Math.abs((a.stage || 0) - (b.stage || 0));
}

function getExplosionMaxBalanceDiff(riskA: number, riskB: number): number {
  if (riskA <= 2 && riskB <= 2) return 500;
  return 700;
}

function getAccountRisk(account: MT5Account, riskMap: PropFirmRiskMap): number {
  const firm = extractPropFirmName(account.prop_firm_name || '');
  if (!firm) return 4;
  return riskMap[firm] ?? 4;
}

export interface ExplosionMatch {
  accountA: MT5Account;
  accountB: MT5Account;
  subType: ExplosionSubType;
  explosionAccountId: string;
  balanceDiff: number;
  stageDiff: number;
}

function findExplosionMatches(
  candidates: MT5Account[],
  allAvailable: MT5Account[],
  riskMap: PropFirmRiskMap,
): ExplosionMatch[] {
  const candidateIds = new Set(candidates.map(c => c.id));
  const matches: ExplosionMatch[] = [];
  const usedIds = new Set<string>();

  const sortedCandidates = [...candidates].sort((a, b) => {
    const baseA = getStandardBalance(a);
    const baseB = getStandardBalance(b);
    const distA = (a.current_balance ?? a.initial_balance) - baseA * 0.90;
    const distB = (b.current_balance ?? b.initial_balance) - baseB * 0.90;
    return distA - distB;
  });

  for (const candidate of sortedCandidates) {
    if (usedIds.has(candidate.id)) continue;

    const firmCandidate = extractPropFirmName(candidate.prop_firm_name || '');
    const riskCandidate = getAccountRisk(candidate, riskMap);

    let bestPartner: MT5Account | null = null;
    let bestDiff = Infinity;
    let bestIsAlsoCandidate = false;

    for (const partner of allAvailable) {
      if (partner.id === candidate.id) continue;
      if (usedIds.has(partner.id)) continue;

      const firmPartner = extractPropFirmName(partner.prop_firm_name || '');
      if (firmCandidate === firmPartner) continue;
      if (candidate.phase !== partner.phase) continue;
      if (partner.account_status !== 'active') continue;

      const riskPartner = getAccountRisk(partner, riskMap);
      const maxBalDiff = getExplosionMaxBalanceDiff(riskCandidate, riskPartner);
      const balDiff = calcNormalizedBalanceDiff(candidate, partner);

      if (balDiff > maxBalDiff) continue;

      const maxStageDiff = Math.min(riskCandidate, riskPartner) <= 2 ? 1 : 2;
      const stageDiff = calcStageDiff(candidate, partner);
      if (stageDiff > maxStageDiff) continue;

      const isAlsoCandidate = candidateIds.has(partner.id);
      if (isAlsoCandidate && !bestIsAlsoCandidate) {
        bestPartner = partner;
        bestDiff = balDiff;
        bestIsAlsoCandidate = true;
      } else if (isAlsoCandidate === bestIsAlsoCandidate && balDiff < bestDiff) {
        bestPartner = partner;
        bestDiff = balDiff;
        bestIsAlsoCandidate = isAlsoCandidate;
      }
    }

    if (bestPartner) {
      const subType: ExplosionSubType = bestIsAlsoCandidate ? 'ESPLOSIONE DOPPIA' : 'ESPLOSIONE SINGOLA';
      const stageDiff = calcStageDiff(candidate, bestPartner);

      matches.push({
        accountA: candidate,
        accountB: bestPartner,
        subType,
        explosionAccountId: candidate.id,
        balanceDiff: bestDiff,
        stageDiff,
      });

      usedIds.add(candidate.id);
      usedIds.add(bestPartner.id);

      console.log(
        `  [EXPLOSION MATCH] ✓ ${subType}: ${candidate.id_identifier} + ${bestPartner.id_identifier} | ` +
        `Balance diff: $${bestDiff.toFixed(0)} | Stage diff: ${stageDiff}`
      );
    }
  }

  return matches;
}

// ============================================
// LOT CALCULATION HELPERS
// ============================================

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
 * Seleziona un simbolo attivo dalla Tabella Operatività,
 * usando la logica 70/30 session-based con rotazione.
 * Diversifica rispetto ai simboli già usati nella sessione.
 */
function selectSymbolForExplosion(
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

  // Get session-rotated symbol list (70/30 rule)
  const rotatedSymbols = getRotatedSymbolList(sessionSymbols, otherSymbols, rotationIndex);

  // Try symbols in session-priority order, preferring unused ones first
  for (const sym of rotatedSymbols) {
    if (!activeSymbolSet.has(sym)) continue;
    if (usedSymbols.has(sym)) continue;
    const config = activeConfigs.find(c => c.symbol === sym);
    if (config) {
      console.log(`[EXPLOSION SYMBOL] Selected ${sym} (session-rotated, rotation=${rotationIndex})`);
      return { symbol: sym as AllowedSymbol, config };
    }
  }

  // Fallback: try used symbols in session order
  for (const sym of rotatedSymbols) {
    if (!activeSymbolSet.has(sym)) continue;
    const config = activeConfigs.find(c => c.symbol === sym);
    if (config) {
      console.log(`[EXPLOSION SYMBOL] Fallback ${sym} (all used, session-rotated)`);
      return { symbol: sym as AllowedSymbol, config };
    }
  }

  return null;
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

  const existingDirA = propFirmTracker[firmA].symbolDirection.get(symbol);
  const existingDirB = propFirmTracker[firmB].symbolDirection.get(symbol);

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

  propFirmTracker[firmA].symbolDirection.set(symbol, directionA);
  propFirmTracker[firmB].symbolDirection.set(symbol, directionB);

  return { directionA, directionB };
}

// ============================================
// EXPLOSION LOT CALCULATION (SL-DRIVEN)
// ============================================

/**
 * Calcola il Rischio Disponibile per un account esplosione.
 * Rischio_Disponibile ($) = Current_Balance - (Baseline * 0.90)
 */
function calculateAvailableRisk(account: MT5Account): number {
  const currentBalance = account.current_balance ?? account.initial_balance;
  const baseline = getStandardBalance(account);
  const drawdownLimit = baseline * 0.90;
  return Math.max(0, currentBalance - drawdownLimit);
}

export interface ExplosionLotResult {
  baseLots: number;
  lotsA: number;
  lotsB: number;
  /** SL pips per Account A */
  slPipsA: number;
  /** SL pips per Account B */
  slPipsB: number;
  /** TP pips per Account A (mirrored da SL di B) */
  tpPipsA: number;
  /** TP pips per Account B (mirrored da SL di A) */
  tpPipsB: number;
  /** SL Lordo A in $ (gap - commissioni - buffer) */
  riskAmountA: number;
  /** SL Lordo B in $ */
  riskAmountB: number;
  /** Gap di Rischio grezzo A in $ (current_balance - drawdown_limit) — ANCORA FISSA per refresh */
  gapRiskA: number;
  /** Gap di Rischio grezzo B in $ */
  gapRiskB: number;
  /** Risk % per A (su baseline) */
  riskPercentA: number;
  /** Risk % per B (su baseline) */
  riskPercentB: number;
  /** Win amount A in $ */
  winAmountA: number;
  /** Win amount B in $ */
  winAmountB: number;
}

/**
 * Calcolo lotti ESPLOSIONE — SL-Driven, Asimmetrico.
 *
 * ESPLOSIONE DOPPIA (Saturazione Totale):
 *   Entrambi gli account saturano il rischio verso il -10%.
 *   SL_A e SL_B sono diversi perché i saldi sono diversi.
 *   baseLots = min(riskA, riskB) / (randomPips * pipValue)
 *   slPipsA = riskA / (lotsA * pipValue)
 *   slPipsB = riskB / (lotsB * pipValue)
 *
 * ESPLOSIONE SINGOLA (Saturazione + Standard):
 *   Account esplosione: SL satura il rischio disponibile.
 *   Account spalla: SL pips scelti casualmente dal range Tabella Operatività.
 *   baseLots = riskExplosion / (randomPips * pipValue)
 *   slPipsExplosion = riskExplosion / (lots * pipValue)
 *   slPipsSpalla = random pips from Tabella Operatività
 *   riskSpalla ($) = lots * pipValue * slPipsSpalla
 *
 * Mirroring:
 *   TP_A = SL_B - spread
 *   TP_B = SL_A - spread
 */
export function calculateExplosionLots(
  match: ExplosionMatch,
  config: PipRangeConfig,
  symbol: string,
  dynamicPipValues?: Record<string, number>,
  riskConfigMap?: PropFirmRiskConfigMap
): ExplosionLotResult {
  const { accountA, accountB, subType, explosionAccountId } = match;
  const pipValue = dynamicPipValues?.[symbol] || PIP_VALUES[symbol] || 10;
  const spread = config.spread ?? 0.3;

  const baselineA = getStandardBalance(accountA);
  const baselineB = getStandardBalance(accountB);

  // Coefficienti 5ERS
  const coeffA = apply5ersCoefficient(1, accountA, baselineA);
  const coeffB = apply5ersCoefficient(1, accountB, baselineB);

  // Rischio disponibile per ciascun account (saturazione drawdown)
  const riskA_drawdown = calculateAvailableRisk(accountA);
  const riskB_drawdown = calculateAvailableRisk(accountB);

  // Determine the driving risk for lot sizing
  let drivingRisk: number;
  let drivingCoeff: number;

  if (subType === 'ESPLOSIONE DOPPIA') {
    // DOPPIA: usa il rischio minore per garantire entrambi nel range
    const effectiveRiskA = riskA_drawdown / coeffA;
    const effectiveRiskB = riskB_drawdown / coeffB;
    if (effectiveRiskA <= effectiveRiskB) {
      drivingRisk = riskA_drawdown;
      drivingCoeff = coeffA;
    } else {
      drivingRisk = riskB_drawdown;
      drivingCoeff = coeffB;
    }
  } else {
    // SINGOLA: il candidato esplosione guida i lotti
    if (explosionAccountId === accountA.id) {
      drivingRisk = riskA_drawdown;
      drivingCoeff = coeffA;
    } else {
      drivingRisk = riskB_drawdown;
      drivingCoeff = coeffB;
    }
  }

  // Seleziona pips random dal range della Tabella Operatività
  const randomPips = config.min_pips + Math.random() * (config.max_pips - config.min_pips);
  const referencePips = Math.round(randomPips * 10) / 10;

  // baseLots = Rischio / (pips * pipValue * coefficient)
  let baseLots = drivingRisk / (referencePips * pipValue * drivingCoeff);
  baseLots = Math.round(baseLots * 100) / 100;
  baseLots = Math.max(0.01, baseLots);

  // Lotti effettivi con coefficiente 5ERS
  const lotsA = Math.max(0.01, apply5ersCoefficient(baseLots, accountA, baselineA));
  const lotsB = Math.max(0.01, apply5ersCoefficient(baseLots, accountB, baselineB));

  // ===== CALCOLO SL ASIMMETRICO =====
  let slPipsA: number;
  let slPipsB: number;
  let riskAmountA: number;
  let riskAmountB: number;

  // ===== CALCOLO SL PROTETTO =====
  // Formula: SL_Lordo ($) = Gap_Rischio - Commissioni - Buffer
  // Vincolo: (SL_pips * lots * pipValue) + (lots * $5) + $5 <= Gap_Rischio

  if (subType === 'ESPLOSIONE DOPPIA') {
    // DOPPIA: entrambi saturano il rischio disponibile (protetto)
    const commissionsA = lotsA * BROKER_COMMISSION_PER_LOT;
    const commissionsB = lotsB * BROKER_COMMISSION_PER_LOT;
    const slLordoA = Math.max(0, riskA_drawdown - commissionsA - EXPLOSION_SAFETY_BUFFER);
    const slLordoB = Math.max(0, riskB_drawdown - commissionsB - EXPLOSION_SAFETY_BUFFER);
    slPipsA = Math.round((slLordoA / (lotsA * pipValue)) * 10) / 10;
    slPipsB = Math.round((slLordoB / (lotsB * pipValue)) * 10) / 10;
    riskAmountA = Math.round(slLordoA * 100) / 100;
    riskAmountB = Math.round(slLordoB * 100) / 100;

    console.log(
      `  [EXPLOSION SL PROTETTO DOPPIA] A: gap=$${riskA_drawdown.toFixed(0)} - comm=$${commissionsA.toFixed(0)} - buf=$${EXPLOSION_SAFETY_BUFFER} = SL_lordo=$${slLordoA.toFixed(0)}\n` +
      `  [EXPLOSION SL PROTETTO DOPPIA] B: gap=$${riskB_drawdown.toFixed(0)} - comm=$${commissionsB.toFixed(0)} - buf=$${EXPLOSION_SAFETY_BUFFER} = SL_lordo=$${slLordoB.toFixed(0)}`
    );
  } else {
    // SINGOLA: esplosione satura (protetto), spalla usa pips random dal range
    const spallaRandomPips = config.min_pips + Math.random() * (config.max_pips - config.min_pips);
    const spallaSlPips = Math.round(spallaRandomPips * 10) / 10;

    if (explosionAccountId === accountA.id) {
      // A è esplosione, B è spalla
      const commissionsA = lotsA * BROKER_COMMISSION_PER_LOT;
      const slLordoA = Math.max(0, riskA_drawdown - commissionsA - EXPLOSION_SAFETY_BUFFER);
      slPipsA = Math.round((slLordoA / (lotsA * pipValue)) * 10) / 10;
      slPipsB = spallaSlPips;
      riskAmountA = Math.round(slLordoA * 100) / 100;
      riskAmountB = Math.round(lotsB * pipValue * slPipsB * 100) / 100;

      console.log(
        `  [EXPLOSION SL PROTETTO SINGOLA] A (esplosione): gap=$${riskA_drawdown.toFixed(0)} - comm=$${commissionsA.toFixed(0)} - buf=$${EXPLOSION_SAFETY_BUFFER} = SL_lordo=$${slLordoA.toFixed(0)}`
      );
    } else {
      // B è esplosione, A è spalla
      const commissionsB = lotsB * BROKER_COMMISSION_PER_LOT;
      const slLordoB = Math.max(0, riskB_drawdown - commissionsB - EXPLOSION_SAFETY_BUFFER);
      slPipsB = Math.round((slLordoB / (lotsB * pipValue)) * 10) / 10;
      slPipsA = spallaSlPips;
      riskAmountB = Math.round(slLordoB * 100) / 100;
      riskAmountA = Math.round(lotsA * pipValue * slPipsA * 100) / 100;

      console.log(
        `  [EXPLOSION SL PROTETTO SINGOLA] B (esplosione): gap=$${riskB_drawdown.toFixed(0)} - comm=$${commissionsB.toFixed(0)} - buf=$${EXPLOSION_SAFETY_BUFFER} = SL_lordo=$${slLordoB.toFixed(0)}`
      );
    }
  }

  // ===== MAX RISK VALIDATION (SINGOLA: spalla must not exceed its max risk) =====
  if (subType === 'ESPLOSIONE SINGOLA' && riskConfigMap) {
    const spallaAccountId = explosionAccountId === accountA.id ? accountB.id : accountA.id;
    const spallaAccount = spallaAccountId === accountA.id ? accountA : accountB;
    const spallaBaseline = spallaAccountId === accountA.id ? baselineA : baselineB;
    const spallaRisk = spallaAccountId === accountA.id ? riskAmountA : riskAmountB;

    const spallaFirmName = extractPropFirmName(spallaAccount.prop_firm_name || '').toUpperCase();
    const spallaPhase = (spallaAccount.phase || 'fase1').toLowerCase();
    const spallaRiskConfig = riskConfigMap[spallaFirmName];

    let maxRiskPercent: number;
    // PRIORITY: Check RISK_OVERRIDE via structured fields
    if (spallaAccount.is_risk_override_active && spallaAccount.risk_override_value != null && spallaAccount.risk_override_value > 0) {
      maxRiskPercent = spallaAccount.risk_override_value;
      console.log(`[EXPLOSION] RISK_OVERRIDE active for spalla ${spallaAccount.id_identifier}: ${maxRiskPercent}%`);
    } else if (spallaRiskConfig) {
      maxRiskPercent = spallaPhase === 'live' ? spallaRiskConfig.live_max_risk : spallaRiskConfig.fase_max_risk;
    } else {
      maxRiskPercent = spallaPhase === 'live' ? 2.2 : 3.5; // fallback
    }

    const maxRiskDollars = (maxRiskPercent / 100) * spallaBaseline;
    const spallaRiskPercent = (spallaRisk / spallaBaseline) * 100;

    if (spallaRisk > maxRiskDollars) {
      const scaleFactor = maxRiskDollars / spallaRisk;
      console.log(
        `[EXPLOSION LOTS] ⚠️ SINGOLA Max Risk Violation: ${spallaAccount.id_identifier} (${spallaFirmName}) ` +
        `risk=$${spallaRisk.toFixed(0)} (${spallaRiskPercent.toFixed(2)}%) > max=$${maxRiskDollars.toFixed(0)} (${maxRiskPercent}%) ` +
        `→ scaling lots by ${(scaleFactor * 100).toFixed(1)}%`
      );

      baseLots = Math.round(baseLots * scaleFactor * 100) / 100;
      baseLots = Math.max(0.01, baseLots);
      const newLotsA = Math.max(0.01, apply5ersCoefficient(baseLots, accountA, baselineA));
      const newLotsB = Math.max(0.01, apply5ersCoefficient(baseLots, accountB, baselineB));

      // Recalculate SL with new lots
      if (explosionAccountId === accountA.id) {
        const commissionsA = newLotsA * BROKER_COMMISSION_PER_LOT;
        const slLordoA = Math.max(0, riskA_drawdown - commissionsA - EXPLOSION_SAFETY_BUFFER);
        slPipsA = Math.round((slLordoA / (newLotsA * pipValue)) * 10) / 10;
        riskAmountA = Math.round(slLordoA * 100) / 100;
        riskAmountB = Math.round(newLotsB * pipValue * slPipsB * 100) / 100;
      } else {
        const commissionsB = newLotsB * BROKER_COMMISSION_PER_LOT;
        const slLordoB = Math.max(0, riskB_drawdown - commissionsB - EXPLOSION_SAFETY_BUFFER);
        slPipsB = Math.round((slLordoB / (newLotsB * pipValue)) * 10) / 10;
        riskAmountB = Math.round(slLordoB * 100) / 100;
        riskAmountA = Math.round(newLotsA * pipValue * slPipsA * 100) / 100;
      }

      // Update lots references used below
      // (need to use let for lotsA/lotsB - handled via reassignment in the outer scope)
      console.log(
        `[EXPLOSION LOTS] ✓ After scaling: baseLots=${baseLots} | ` +
        `A=${newLotsA} lots ($${riskAmountA.toFixed(0)}) | B=${newLotsB} lots ($${riskAmountB.toFixed(0)})`
      );

      // Reassign lots for mirroring below
      Object.assign(match, { _scaledLotsA: newLotsA, _scaledLotsB: newLotsB });
    }
  }

  // Use potentially scaled lots
  const finalLotsA = (match as any)._scaledLotsA ?? lotsA;
  const finalLotsB = (match as any)._scaledLotsB ?? lotsB;

  // ===== MIRRORING ASIMMETRICO =====
  // TP_A = SL_B - spread (A vince quando B perde)
  // TP_B = SL_A - spread (B vince quando A perde)
  const tpPipsA = Math.round((slPipsB - spread) * 10) / 10;
  const tpPipsB = Math.round((slPipsA - spread) * 10) / 10;

  // Win amounts (quanto vince ciascun account quando il partner perde)
  const winAmountA = Math.round(finalLotsA * pipValue * Math.max(0.1, tpPipsA) * 100) / 100;
  const winAmountB = Math.round(finalLotsB * pipValue * Math.max(0.1, tpPipsB) * 100) / 100;

  // Risk % calcolato su baseline
  const riskPercentA = (riskAmountA / baselineA) * 100;
  const riskPercentB = (riskAmountB / baselineB) * 100;

  console.log(
    `[EXPLOSION LOTS] ${symbol} ${subType} | spread=${spread} baseLots=${baseLots} referencePips=${referencePips}\n` +
    `  A (${accountA.id_identifier}): ${finalLotsA} lots, SL=${slPipsA} pips ($${riskAmountA.toFixed(0)}), TP=${Math.max(0.1, tpPipsA)} pips (wins $${winAmountA.toFixed(0)}), risk=${riskPercentA.toFixed(2)}%\n` +
    `  B (${accountB.id_identifier}): ${finalLotsB} lots, SL=${slPipsB} pips ($${riskAmountB.toFixed(0)}), TP=${Math.max(0.1, tpPipsB)} pips (wins $${winAmountB.toFixed(0)}), risk=${riskPercentB.toFixed(2)}%`
  );

  return {
    baseLots,
    lotsA: finalLotsA,
    lotsB: finalLotsB,
    slPipsA,
    slPipsB,
    tpPipsA: Math.max(0.1, tpPipsA),
    tpPipsB: Math.max(0.1, tpPipsB),
    riskAmountA,
    riskAmountB,
    gapRiskA: riskA_drawdown,
    gapRiskB: riskB_drawdown,
    riskPercentA: Math.round(riskPercentA * 100) / 100,
    riskPercentB: Math.round(riskPercentB * 100) / 100,
    winAmountA,
    winAmountB,
  };
}

// ============================================
// REFRESH EXPLOSION LOTS
// ============================================

export interface RefreshExplosionParams {
  /** Gap di Rischio grezzo A ($) — ancora fissa: current_balance - drawdown_limit */
  gapRiskA: number;
  /** Gap di Rischio grezzo B ($) */
  gapRiskB: number;
  symbol: string;
  accountA: MT5Account;
  accountB: MT5Account;
  pipRangeConfigs: PipRangeConfig[];
  dynamicPipValues?: Record<string, number>;
  /** Which account is the explosion candidate (for SINGOLA only) */
  explosionAccountId?: string;
  /** Sottotipo esplosione — DOPPIA = entrambi saturano, SINGOLA = solo uno */
  explosionSubType?: ExplosionSubType;
  /** Prop firm risk configs for max risk validation (SINGOLA spalla) */
  riskConfigs?: Array<{
    prop_firm_name: string;
    fase_min_risk: number;
    fase_max_risk: number;
    live_min_risk: number;
    live_max_risk: number;
  }>;
}

export interface RefreshExplosionResult {
  baseLots: number;
  lotsA: number;
  lotsB: number;
  slPipsA: number;
  slPipsB: number;
  tpPipsA: number;
  tpPipsB: number;
  riskAmountA: number;
  riskAmountB: number;
  gapRiskA: number;
  gapRiskB: number;
  riskPercentA: number;
  riskPercentB: number;
  winAmountA: number;
  winAmountB: number;
}

/**
 * Rigenera lotti per un trade ESPLOSIONE — Refresh Infinito.
 *
 * ANCORA FISSA: gapRiskA/B (gap grezzo in $) NON cambia mai.
 * Ad ogni refresh:
 *   1. Nuove pips random dal range Tabella Operatività
 *   2. Nuovi lotti = gapRisk / (pips * pipValue * coeff)
 *   3. Commissioni e buffer calcolati sui nuovi lotti
 *   4. SL_Lordo = gapRisk - commissioni - buffer
 *   5. SL_pips = SL_Lordo / (lots * pipValue)
 *   6. TP mirroring: TP_A = SL_B - spread
 *   7. Range compliance: se SL o TP fuori range, scala lotti
 */
export function refreshExplosionLots(params: RefreshExplosionParams): RefreshExplosionResult {
  const { gapRiskA, gapRiskB, symbol, accountA, accountB, pipRangeConfigs, dynamicPipValues, explosionAccountId, explosionSubType, riskConfigs } = params;
  const pipValue = dynamicPipValues?.[symbol] || PIP_VALUES[symbol] || 10;
  const config = pipRangeConfigs.find(c => c.symbol === symbol && c.is_active);
  const spread = config?.spread ?? 0.3;
  const minPips = config?.min_pips ?? 15;
  const maxPips = config?.max_pips ?? 40;

  const baselineA = getStandardBalance(accountA);
  const baselineB = getStandardBalance(accountB);
  const coeffA = apply5ersCoefficient(1, accountA, baselineA);
  const coeffB = apply5ersCoefficient(1, accountB, baselineB);

  // Use subType from metadata to determine DOPPIA vs SINGOLA
  const isDoppia = explosionSubType === 'ESPLOSIONE DOPPIA';

  // Determine driving gap for initial lot sizing
  let drivingGap: number;
  let drivingCoeff: number;
  if (isDoppia) {
    const effectiveGapA = gapRiskA / coeffA;
    const effectiveGapB = gapRiskB / coeffB;
    if (effectiveGapA <= effectiveGapB) {
      drivingGap = gapRiskA;
      drivingCoeff = coeffA;
    } else {
      drivingGap = gapRiskB;
      drivingCoeff = coeffB;
    }
  } else {
    if (explosionAccountId === accountA.id) {
      drivingGap = gapRiskA;
      drivingCoeff = coeffA;
    } else {
      drivingGap = gapRiskB;
      drivingCoeff = coeffB;
    }
  }

  // Nuove pips random
  const randomPips = minPips + Math.random() * (maxPips - minPips);
  const referencePips = Math.round(randomPips * 10) / 10;

  let baseLots = drivingGap / (referencePips * pipValue * drivingCoeff);
  baseLots = Math.round(baseLots * 100) / 100;
  baseLots = Math.max(0.01, baseLots);

  let lotsA = Math.max(0.01, apply5ersCoefficient(baseLots, accountA, baselineA));
  let lotsB = Math.max(0.01, apply5ersCoefficient(baseLots, accountB, baselineB));

  // ===== CALCOLO SL PROTETTO (commissioni + buffer) =====
  let slPipsA: number;
  let slPipsB: number;
  let finalRiskA: number;
  let finalRiskB: number;

  const computeProtectedSl = (gap: number, lots: number): { slPips: number; slLordo: number } => {
    const commissions = lots * BROKER_COMMISSION_PER_LOT;
    const slLordo = Math.max(0, gap - commissions - EXPLOSION_SAFETY_BUFFER);
    const slPips = Math.round((slLordo / (lots * pipValue)) * 10) / 10;
    return { slPips, slLordo };
  };

  if (isDoppia) {
    const resA = computeProtectedSl(gapRiskA, lotsA);
    const resB = computeProtectedSl(gapRiskB, lotsB);
    slPipsA = resA.slPips;
    slPipsB = resB.slPips;
    finalRiskA = Math.round(resA.slLordo * 100) / 100;
    finalRiskB = Math.round(resB.slLordo * 100) / 100;
  } else {
    const spallaRandomPips = minPips + Math.random() * (maxPips - minPips);
    const spallaSlPips = Math.round(spallaRandomPips * 10) / 10;

    if (explosionAccountId === accountA.id) {
      const resA = computeProtectedSl(gapRiskA, lotsA);
      slPipsA = resA.slPips;
      slPipsB = spallaSlPips;
      finalRiskA = Math.round(resA.slLordo * 100) / 100;
      finalRiskB = Math.round(lotsB * pipValue * slPipsB * 100) / 100;
    } else {
      const resB = computeProtectedSl(gapRiskB, lotsB);
      slPipsB = resB.slPips;
      slPipsA = spallaSlPips;
      finalRiskB = Math.round(resB.slLordo * 100) / 100;
      finalRiskA = Math.round(lotsA * pipValue * slPipsA * 100) / 100;
    }
  }

  // ===== RANGE COMPLIANCE =====
  // Se SL pips dell'account esplosione supera max_pips, scala i lotti verso l'alto
  const enforceMaxPips = (gap: number, currentLots: number, currentSlPips: number, coeff: number): { lots: number; slPips: number; slLordo: number } => {
    if (currentSlPips <= maxPips) return { lots: currentLots, slPips: currentSlPips, slLordo: Math.max(0, gap - currentLots * BROKER_COMMISSION_PER_LOT - EXPLOSION_SAFETY_BUFFER) };
    let newBaseLots = (gap - EXPLOSION_SAFETY_BUFFER) / (maxPips * pipValue * coeff + BROKER_COMMISSION_PER_LOT * coeff);
    newBaseLots = Math.round(newBaseLots * 100) / 100;
    newBaseLots = Math.max(0.01, newBaseLots);
    const newLots = Math.max(0.01, Math.round(newBaseLots * coeff * 100) / 100);
    const newCommissions = newLots * BROKER_COMMISSION_PER_LOT;
    const newSlLordo = Math.max(0, gap - newCommissions - EXPLOSION_SAFETY_BUFFER);
    const newSlPips = Math.round((newSlLordo / (newLots * pipValue)) * 10) / 10;
    return { lots: newLots, slPips: newSlPips, slLordo: newSlLordo };
  };

  if (isDoppia) {
    const slExceedsA = slPipsA > maxPips;
    const slExceedsB = slPipsB > maxPips;

    if (slExceedsA || slExceedsB) {
      const requiredBaseLotsA = slExceedsA
        ? (gapRiskA - EXPLOSION_SAFETY_BUFFER) / (maxPips * pipValue * coeffA + BROKER_COMMISSION_PER_LOT * coeffA)
        : baseLots;
      const requiredBaseLotsB = slExceedsB
        ? (gapRiskB - EXPLOSION_SAFETY_BUFFER) / (maxPips * pipValue * coeffB + BROKER_COMMISSION_PER_LOT * coeffB)
        : baseLots;

      baseLots = Math.max(requiredBaseLotsA, requiredBaseLotsB);
      baseLots = Math.round(baseLots * 100) / 100;
      baseLots = Math.max(0.01, baseLots);

      lotsA = Math.max(0.01, apply5ersCoefficient(baseLots, accountA, baselineA));
      lotsB = Math.max(0.01, apply5ersCoefficient(baseLots, accountB, baselineB));

      const resA2 = computeProtectedSl(gapRiskA, lotsA);
      const resB2 = computeProtectedSl(gapRiskB, lotsB);
      slPipsA = resA2.slPips;
      slPipsB = resB2.slPips;
      finalRiskA = Math.round(resA2.slLordo * 100) / 100;
      finalRiskB = Math.round(resB2.slLordo * 100) / 100;

      console.log(`[EXPLOSION REFRESH] Range compliance DOPPIA: baseLots scaled to ${baseLots} → A=${lotsA} lots (SL=${slPipsA} pips) B=${lotsB} lots (SL=${slPipsB} pips)`);
    }
  } else {
    if (explosionAccountId === accountA.id) {
      const adjA = enforceMaxPips(gapRiskA, lotsA, slPipsA, coeffA);
      if (adjA.lots !== lotsA) { lotsA = adjA.lots; lotsB = Math.max(0.01, apply5ersCoefficient(lotsA / coeffA, accountB, baselineB)); slPipsA = adjA.slPips; finalRiskA = Math.round(adjA.slLordo * 100) / 100; finalRiskB = Math.round(lotsB * pipValue * slPipsB * 100) / 100; baseLots = lotsA / coeffA; }
    } else {
      const adjB = enforceMaxPips(gapRiskB, lotsB, slPipsB, coeffB);
      if (adjB.lots !== lotsB) { lotsB = adjB.lots; lotsA = Math.max(0.01, apply5ersCoefficient(lotsB / coeffB, accountA, baselineA)); slPipsB = adjB.slPips; finalRiskB = Math.round(adjB.slLordo * 100) / 100; finalRiskA = Math.round(lotsA * pipValue * slPipsA * 100) / 100; baseLots = lotsB / coeffB; }
    }
  }

  // ===== MAX RISK VALIDATION (SINGOLA: spalla account must not exceed its max risk) =====
  if (!isDoppia && riskConfigs && riskConfigs.length > 0) {
    const spallaAccountId = explosionAccountId === accountA.id ? accountB.id : accountA.id;
    const spallaAccount = spallaAccountId === accountA.id ? accountA : accountB;
    const spallaBaseline = spallaAccountId === accountA.id ? baselineA : baselineB;
    const spallaRisk = spallaAccountId === accountA.id ? finalRiskA : finalRiskB;

    // Find max risk for the spalla's prop firm
    const spallaFirmName = extractPropFirmName(spallaAccount.prop_firm_name || '').toUpperCase();
    const spallaPhase = (spallaAccount.phase || 'fase1').toLowerCase();
    const spallaRiskConfig = riskConfigs.find(c => c.prop_firm_name.toUpperCase() === spallaFirmName);

    let maxRiskPercent: number;
    // PRIORITY: Check RISK_OVERRIDE via structured fields
    if (spallaAccount.is_risk_override_active && spallaAccount.risk_override_value != null && spallaAccount.risk_override_value > 0) {
      maxRiskPercent = spallaAccount.risk_override_value;
      console.log(`[EXPLOSION REFRESH] RISK_OVERRIDE active for spalla ${spallaAccount.id_identifier}: ${maxRiskPercent}%`);
    } else if (spallaRiskConfig) {
      maxRiskPercent = spallaPhase === 'live' ? spallaRiskConfig.live_max_risk : spallaRiskConfig.fase_max_risk;
    } else {
      maxRiskPercent = spallaPhase === 'live' ? 2.2 : 3.5; // fallback
    }

    const maxRiskDollars = (maxRiskPercent / 100) * spallaBaseline;
    const spallaRiskPercent = (spallaRisk / spallaBaseline) * 100;

    if (spallaRisk > maxRiskDollars) {
      // Scale lots DOWN proportionally to bring spalla within max risk
      const scaleFactor = maxRiskDollars / spallaRisk;
      console.log(
        `[EXPLOSION REFRESH] ⚠️ SINGOLA Max Risk Violation: ${spallaAccount.id_identifier} (${spallaFirmName}) ` +
        `risk=$${spallaRisk.toFixed(0)} (${spallaRiskPercent.toFixed(2)}%) > max=$${maxRiskDollars.toFixed(0)} (${maxRiskPercent}%) ` +
        `→ scaling lots by ${(scaleFactor * 100).toFixed(1)}%`
      );

      // Scale baseLots and recalculate everything
      baseLots = Math.round(baseLots * scaleFactor * 100) / 100;
      baseLots = Math.max(0.01, baseLots);
      lotsA = Math.max(0.01, apply5ersCoefficient(baseLots, accountA, baselineA));
      lotsB = Math.max(0.01, apply5ersCoefficient(baseLots, accountB, baselineB));

      // Recalculate SL for both accounts with new lots
      if (explosionAccountId === accountA.id) {
        // A = explosion, B = spalla
        const resA = computeProtectedSl(gapRiskA, lotsA);
        slPipsA = resA.slPips;
        finalRiskA = Math.round(resA.slLordo * 100) / 100;
        // Spalla B keeps same SL pips, but risk $ changes due to lower lots
        finalRiskB = Math.round(lotsB * pipValue * slPipsB * 100) / 100;
      } else {
        // B = explosion, A = spalla
        const resB = computeProtectedSl(gapRiskB, lotsB);
        slPipsB = resB.slPips;
        finalRiskB = Math.round(resB.slLordo * 100) / 100;
        finalRiskA = Math.round(lotsA * pipValue * slPipsA * 100) / 100;
      }

      console.log(
        `[EXPLOSION REFRESH] ✓ After scaling: baseLots=${baseLots} | ` +
        `A=${lotsA} lots ($${finalRiskA.toFixed(0)}) | B=${lotsB} lots ($${finalRiskB.toFixed(0)})`
      );
    }
  }

  // ===== MIRRORING =====
  const tpPipsA = Math.round((slPipsB - spread) * 10) / 10;
  const tpPipsB = Math.round((slPipsA - spread) * 10) / 10;

  const winAmountA = Math.round(lotsA * pipValue * Math.max(0.1, tpPipsA) * 100) / 100;
  const winAmountB = Math.round(lotsB * pipValue * Math.max(0.1, tpPipsB) * 100) / 100;

  const riskPercentA = (finalRiskA / baselineA) * 100;
  const riskPercentB = (finalRiskB / baselineB) * 100;

  console.log(
    `[EXPLOSION REFRESH] ${symbol} ${isDoppia ? 'DOPPIA' : 'SINGOLA'} baseLots=${baseLots} refPips=${referencePips}\n` +
    `  A: ${lotsA} lots, SL=${slPipsA} pips ($${finalRiskA.toFixed(0)}), TP=${Math.max(0.1, tpPipsA)} pips (wins $${winAmountA.toFixed(0)}) | gap=$${gapRiskA.toFixed(0)}\n` +
    `  B: ${lotsB} lots, SL=${slPipsB} pips ($${finalRiskB.toFixed(0)}), TP=${Math.max(0.1, tpPipsB)} pips (wins $${winAmountB.toFixed(0)}) | gap=$${gapRiskB.toFixed(0)}`
  );

  return {
    baseLots,
    lotsA,
    lotsB,
    slPipsA,
    slPipsB,
    tpPipsA: Math.max(0.1, tpPipsA),
    tpPipsB: Math.max(0.1, tpPipsB),
    riskAmountA: finalRiskA,
    riskAmountB: finalRiskB,
    gapRiskA,
    gapRiskB,
    riskPercentA: Math.round(riskPercentA * 100) / 100,
    riskPercentB: Math.round(riskPercentB * 100) / 100,
    winAmountA,
    winAmountB,
  };
}

// ============================================
// GENERAZIONE INCROCI ESPLOSIONE
// ============================================

/**
 * Genera incroci di tipo ESPLOSIONE con calcolo lotti SL-driven.
 *
 * Flow:
 * 1. Detection: identifica candidati esplosione
 * 2. Matching: accoppia con filtro balance mandatorio
 * 3. Classificazione: DOPPIA o SINGOLA
 * 4. Symbol selection dalla Tabella Operatività
 * 5. Lot calculation SL-driven con mirroring
 */
export function generateExplosionCrosses(params: ExplosionEngineParams): ExplosionEngineResult {
  const { accounts, riskMap, usedAccountIds, propFirmTracker, pipRangeConfigs, dynamicPipValues } = params;

  const availableAccounts = accounts.filter(a => !usedAccountIds.has(a.id));
  const candidates = detectExplosionCandidates(availableAccounts);

  console.log(`[EXPLOSION ENGINE] Detection completata: ${candidates.length} candidati su ${availableAccounts.length} account disponibili`);

  if (candidates.length === 0) {
    return { suggestions: [] };
  }

  for (const c of candidates) {
    const baseline = getStandardBalance(c);
    const balance = c.current_balance ?? c.initial_balance;
    const riskAvail = calculateAvailableRisk(c);
    console.log(
      `  → ${c.account_name} | ${extractPropFirmName(c.prop_firm_name || '')} | Fase: ${c.phase} | ` +
      `Balance: $${balance} | Baseline: $${baseline} | ` +
      `Rischio disponibile: $${riskAvail.toFixed(0)}`
    );
  }

  const matches = findExplosionMatches(candidates, availableAccounts, riskMap);
  console.log(`[EXPLOSION ENGINE] Matching completato: ${matches.length} accoppiamenti validi`);

  if (!pipRangeConfigs || pipRangeConfigs.length === 0) {
    console.warn('[EXPLOSION ENGINE] Nessuna config Tabella Operatività disponibile, lotti non calcolabili');
    return { suggestions: [] };
  }

  const usedSymbols = new Set<string>();
  const suggestions: CrossSuggestion[] = [];

  // Pre-shuffle session symbol pools ONCE for this batch
  const { sessionSymbols: batchSessionSymbols, otherSymbols: batchOtherSymbols } = getSessionSymbolLists();
  let globalExplosionCounter = 0;

  for (const match of matches) {
    // Symbol selection with session-based 70/30 rotation
    const symbolResult = selectSymbolForExplosion(pipRangeConfigs, usedSymbols, globalExplosionCounter, batchSessionSymbols, batchOtherSymbols);
    globalExplosionCounter++;
    if (!symbolResult) {
      console.warn(`[EXPLOSION ENGINE] Nessun simbolo disponibile per match ${match.accountA.id_identifier}+${match.accountB.id_identifier}`);
      continue;
    }
    const { symbol, config } = symbolResult;
    usedSymbols.add(symbol);

    // Lot calculation
    const lotResult = calculateExplosionLots(match, config, symbol, dynamicPipValues, params.riskConfigMap);

    // Direction assignment
    const { directionA, directionB } = assignDirections(
      match.accountA, match.accountB, propFirmTracker, symbol
    );

    const metaNotes = JSON.stringify({
      engineType: 'explosion',
      explosionSubType: match.subType,
      explosionAccountId: match.explosionAccountId,
      riskAmountA: lotResult.riskAmountA,
      riskAmountB: lotResult.riskAmountB,
      gapRiskA: lotResult.gapRiskA,
      gapRiskB: lotResult.gapRiskB,
      slPipsA: lotResult.slPipsA,
      slPipsB: lotResult.slPipsB,
      tpPipsA: lotResult.tpPipsA,
      tpPipsB: lotResult.tpPipsB,
      winAmountA: lotResult.winAmountA,
      winAmountB: lotResult.winAmountB,
      riskPercentA: lotResult.riskPercentA,
      riskPercentB: lotResult.riskPercentB,
      baseLots: lotResult.baseLots,
    });

    suggestions.push({
      accountA: match.accountA,
      accountB: match.accountB,
      symbol: symbol as any,
      directionA,
      directionB,
      lotsA: lotResult.lotsA,
      lotsB: lotResult.lotsB,
      phase: match.accountA.phase as any,
      stageDifference: match.stageDiff,
      balanceDifference: match.balanceDiff,
      riskReward: '1:1',
      riskPercent: Math.max(lotResult.riskPercentA, lotResult.riskPercentB),
      riskPercentA: lotResult.riskPercentA,
      riskPercentB: lotResult.riskPercentB,
      score: match.balanceDiff,
      engineType: 'explosion' as const,
      explosionSubType: match.subType,
      explosionAccountId: match.explosionAccountId,
      targetMetaNotes: metaNotes,
    });
  }

  console.log(`[EXPLOSION ENGINE] Generati ${suggestions.length} incroci con lotti calcolati`);
  return { suggestions };
}
