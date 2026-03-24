import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
// Toast stub — replace with real notification library when wired up
const toast = {
  success: (msg: string, _opts?: unknown) => console.log('[✓]', msg),
  error: (msg: string, _opts?: unknown) => console.error('[✗]', msg),
  info: (msg: string, _opts?: unknown) => console.info('[i]', msg),
};
import { MT5Account } from '../types/mt5';
import { extractPropFirmName } from '../utils/propFirmUtils';
import { findOptimalMatching, MatchCandidate } from '../utils/maximumMatching';
// Target & Explosion detection + lot calculation (used for unified scoring in autoGenerateCrosses)
import { computeTargetCandidate, calculateDoppioLots, calculateSingoloLots, type TargetCandidate, type DetectedTargetPair, type TargetLotResult } from '../logic/engines/targetEngine';
import { isExplosionCandidate, calculateExplosionLots, type ExplosionMatch, type ExplosionLotResult } from '../logic/engines/explosionEngine';

// Allowed symbols for crossing - system will diversify across these
export const ALLOWED_SYMBOLS = [
  'EURUSD',
  'GBPUSD', 
  'USDJPY',
  'EURJPY',
  'GBPJPY',
  'XAUUSD',
  // NEW PAIRS
  'AUDUSD',
  'NZDUSD',
  'USDCHF',
  'USDCAD',
  'EURGBP',
  'AUDCAD',
  'AUDCHF',
  'CADCHF',
  'EURAUD',
  'EURCHF'
] as const;

// ============================================
// TIME-BASED SESSION SYSTEM (Italian Time CET/CEST)
// ============================================
// Sessions defined using Europe/Rome timezone (auto CET/CEST)
// Each session has priority symbols (70% selection probability)
// Outside session windows, all 16 symbols are equally available

export type SessionName = 'ASIA' | 'EUROPA' | 'PRE-USA' | 'FUORI SESSIONE';

export interface SessionConfig {
  name: SessionName;
  startHour: number;   // 0-23
  startMinute: number; // 0-59
  endHour: number;     // 0-23
  endMinute: number;   // 0-59
  symbols: AllowedSymbol[];
}

export const SESSION_CONFIGS: SessionConfig[] = [
  {
    name: 'ASIA',
    startHour: 0, startMinute: 0,
    endHour: 3, endMinute: 30,
    symbols: ['USDJPY', 'EURJPY', 'GBPJPY', 'AUDUSD', 'NZDUSD', 'XAUUSD'],
  },
  {
    name: 'EUROPA',
    startHour: 7, startMinute: 0,
    endHour: 11, endMinute: 0,
    symbols: ['EURUSD', 'GBPUSD', 'EURGBP', 'USDCHF', 'EURCHF', 'XAUUSD'],
  },
  {
    name: 'PRE-USA',
    startHour: 11, startMinute: 1,
    endHour: 18, endMinute: 30,
    symbols: ['USDCAD', 'EURUSD', 'GBPUSD', 'AUDCAD', 'AUDCHF', 'XAUUSD'],
  },
];

// Get current Italian time (Europe/Rome) — always CET/CEST regardless of browser locale
export function getItalianTime(): { hours: number; minutes: number; formatted: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hours = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minutes = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return { hours, minutes, formatted };
}

// Get the currently active session based on Italian time
export function getActiveSession(): { session: SessionConfig | null; name: SessionName } {
  const { hours, minutes } = getItalianTime();
  const timeInMinutes = hours * 60 + minutes;

  for (const session of SESSION_CONFIGS) {
    const start = session.startHour * 60 + session.startMinute;
    const end = session.endHour * 60 + session.endMinute;
    if (timeInMinutes >= start && timeInMinutes < end) {
      return { session, name: session.name };
    }
  }
  return { session: null, name: 'FUORI SESSIONE' };
}

// DEPRECATED — kept for backward compatibility but unused
export type OperatorName = null;

// STATIC FALLBACK pip values — used ONLY when dynamic pip values are unavailable.
// The primary source is the edge function `fetch-pip-values` which calculates
// pip values dynamically from live exchange rates using the 3 mathematical rules:
//   CASO A (Quote USD): $10.00 fisso
//   CASO B (Quote JPY): 1000 / USDJPY
//   CASO C (Altre Quote): 10 / USD[QuoteCurrency]
// See: src/hooks/usePipValues.ts → calculateDynamicPipValue()
export const PIP_VALUES: Record<string, number> = {
  'EURUSD': 10.00,
  'GBPUSD': 10.00,
  'AUDUSD': 10.00,
  'NZDUSD': 10.00,
  'USDJPY': 6.50,
  'EURJPY': 6.50,
  'GBPJPY': 6.50,
  'USDCHF': 11.50,
  'AUDCHF': 11.50,
  'CADCHF': 11.50,
  'EURCHF': 11.50,
  'USDCAD': 7.30,
  'AUDCAD': 7.30,
  'EURGBP': 13.00,
  'EURAUD': 6.50,
  'XAUUSD': 10.00,
};

// LEGACY FALLBACK ONLY — These values are used ONLY if Tabella Operatività has no config for a symbol.
// The single source of truth is the trading_pair_configs table (Tabella Operatività).
// All engines MUST pass pipRangeConfigs and read spread from there.
export const SYMBOL_SPREAD: Record<string, number> = {
  'EURUSD': 0.3,
  'GBPUSD': 0.5,
  'USDJPY': 0.7,
  'EURJPY': 1,
  'GBPJPY': 2,
  'XAUUSD': 6,
  'AUDUSD': 0.6,
  'NZDUSD': 1,
  'USDCHF': 1.2,
  'USDCAD': 1,
  'EURGBP': 1.2,
  'AUDCAD': 2,
  'AUDCHF': 2,
  'CADCHF': 2,
  'EURAUD': 2,
  'EURCHF': 1.2,
};

// Trading ranges by phase and risk
export interface TradingRange {
  minLots: number;
  maxLots: number;
  minPips: number;
  maxPips: number;
}

// TRADING_RANGES: minLots/maxLots are broker-minimum only (0.01/999).
// Lots are calculated purely from formula: lots = risk$ / (pips × pipValue).
// Pip ranges here are FALLBACK only — Tabella Operatività configs take priority.
export const TRADING_RANGES: Record<string, Record<string, TradingRange>> = {
  'challenge_3%': {
    'GBPUSD': { minLots: 0.01, maxLots: 999, minPips: 25, maxPips: 40 },
    'EURUSD': { minLots: 0.01, maxLots: 999, minPips: 25, maxPips: 40 },
    'EURJPY': { minLots: 0.01, maxLots: 999, minPips: 40, maxPips: 60 },
    'USDJPY': { minLots: 0.01, maxLots: 999, minPips: 40, maxPips: 60 },
    'XAUUSD': { minLots: 0.01, maxLots: 999, minPips: 1000, maxPips: 2500 },
    'GBPJPY': { minLots: 0.01, maxLots: 999, minPips: 55, maxPips: 75 },
    'AUDUSD': { minLots: 0.01, maxLots: 999, minPips: 20, maxPips: 35 },
    'NZDUSD': { minLots: 0.01, maxLots: 999, minPips: 20, maxPips: 35 },
    'USDCHF': { minLots: 0.01, maxLots: 999, minPips: 27, maxPips: 45 },
    'USDCAD': { minLots: 0.01, maxLots: 999, minPips: 27, maxPips: 45 },
    'EURGBP': { minLots: 0.01, maxLots: 999, minPips: 15, maxPips: 25 },
    'AUDCAD': { minLots: 0.01, maxLots: 999, minPips: 22, maxPips: 37 },
    'AUDCHF': { minLots: 0.01, maxLots: 999, minPips: 17, maxPips: 27 },
    'CADCHF': { minLots: 0.01, maxLots: 999, minPips: 15, maxPips: 25 },
    'EURAUD': { minLots: 0.01, maxLots: 999, minPips: 60, maxPips: 80 },
    'EURCHF': { minLots: 0.01, maxLots: 999, minPips: 20, maxPips: 35 },
  },
  'challenge_3%_asymmetric': {
    'GBPUSD': { minLots: 0.01, maxLots: 999, minPips: 25, maxPips: 40 },
    'EURUSD': { minLots: 0.01, maxLots: 999, minPips: 25, maxPips: 40 },
    'EURJPY': { minLots: 0.01, maxLots: 999, minPips: 40, maxPips: 60 },
    'USDJPY': { minLots: 0.01, maxLots: 999, minPips: 40, maxPips: 60 },
    'XAUUSD': { minLots: 0.01, maxLots: 999, minPips: 1000, maxPips: 2500 },
    'GBPJPY': { minLots: 0.01, maxLots: 999, minPips: 55, maxPips: 75 },
    'AUDUSD': { minLots: 0.01, maxLots: 999, minPips: 20, maxPips: 35 },
    'NZDUSD': { minLots: 0.01, maxLots: 999, minPips: 20, maxPips: 35 },
    'USDCHF': { minLots: 0.01, maxLots: 999, minPips: 27, maxPips: 45 },
    'USDCAD': { minLots: 0.01, maxLots: 999, minPips: 27, maxPips: 45 },
    'EURGBP': { minLots: 0.01, maxLots: 999, minPips: 15, maxPips: 25 },
    'AUDCAD': { minLots: 0.01, maxLots: 999, minPips: 22, maxPips: 37 },
    'AUDCHF': { minLots: 0.01, maxLots: 999, minPips: 17, maxPips: 27 },
    'CADCHF': { minLots: 0.01, maxLots: 999, minPips: 15, maxPips: 25 },
    'EURAUD': { minLots: 0.01, maxLots: 999, minPips: 60, maxPips: 80 },
    'EURCHF': { minLots: 0.01, maxLots: 999, minPips: 20, maxPips: 35 },
  },
  'challenge_2%': {
    'GBPUSD': { minLots: 0.01, maxLots: 999, minPips: 15, maxPips: 25 },
    'EURUSD': { minLots: 0.01, maxLots: 999, minPips: 15, maxPips: 25 },
    'EURJPY': { minLots: 0.01, maxLots: 999, minPips: 25, maxPips: 40 },
    'USDJPY': { minLots: 0.01, maxLots: 999, minPips: 25, maxPips: 40 },
    'XAUUSD': { minLots: 0.01, maxLots: 999, minPips: 800, maxPips: 1700 },
    'GBPJPY': { minLots: 0.01, maxLots: 999, minPips: 45, maxPips: 55 },
    'AUDUSD': { minLots: 0.01, maxLots: 999, minPips: 20, maxPips: 35 },
    'NZDUSD': { minLots: 0.01, maxLots: 999, minPips: 20, maxPips: 35 },
    'USDCHF': { minLots: 0.01, maxLots: 999, minPips: 27, maxPips: 45 },
    'USDCAD': { minLots: 0.01, maxLots: 999, minPips: 27, maxPips: 45 },
    'EURGBP': { minLots: 0.01, maxLots: 999, minPips: 15, maxPips: 25 },
    'AUDCAD': { minLots: 0.01, maxLots: 999, minPips: 22, maxPips: 37 },
    'AUDCHF': { minLots: 0.01, maxLots: 999, minPips: 17, maxPips: 27 },
    'CADCHF': { minLots: 0.01, maxLots: 999, minPips: 15, maxPips: 25 },
    'EURAUD': { minLots: 0.01, maxLots: 999, minPips: 60, maxPips: 80 },
    'EURCHF': { minLots: 0.01, maxLots: 999, minPips: 20, maxPips: 35 },
  },
  'live': {
    'GBPUSD': { minLots: 0.01, maxLots: 999, minPips: 20, maxPips: 25 },
    'EURUSD': { minLots: 0.01, maxLots: 999, minPips: 20, maxPips: 25 },
    'EURJPY': { minLots: 0.01, maxLots: 999, minPips: 35, maxPips: 42 },
    'USDJPY': { minLots: 0.01, maxLots: 999, minPips: 33, maxPips: 40 },
    'XAUUSD': { minLots: 0.01, maxLots: 999, minPips: 1700, maxPips: 2500 },
    'GBPJPY': { minLots: 0.01, maxLots: 999, minPips: 45, maxPips: 55 },
    'AUDUSD': { minLots: 0.01, maxLots: 999, minPips: 20, maxPips: 35 },
    'NZDUSD': { minLots: 0.01, maxLots: 999, minPips: 20, maxPips: 35 },
    'USDCHF': { minLots: 0.01, maxLots: 999, minPips: 27, maxPips: 45 },
    'USDCAD': { minLots: 0.01, maxLots: 999, minPips: 27, maxPips: 45 },
    'EURGBP': { minLots: 0.01, maxLots: 999, minPips: 15, maxPips: 25 },
    'AUDCAD': { minLots: 0.01, maxLots: 999, minPips: 22, maxPips: 37 },
    'AUDCHF': { minLots: 0.01, maxLots: 999, minPips: 17, maxPips: 27 },
    'CADCHF': { minLots: 0.01, maxLots: 999, minPips: 15, maxPips: 25 },
    'EURAUD': { minLots: 0.01, maxLots: 999, minPips: 60, maxPips: 80 },
    'EURCHF': { minLots: 0.01, maxLots: 999, minPips: 20, maxPips: 35 },
  },
};

// Calculate SL based on entry difference + spread from Tabella Operatività (SINGLE SOURCE OF TRUTH)
export function calculateStopLossPips(
  entryDifference: number,
  symbol: string,
  pipRangeConfigs?: PipRangeConfig[]
): number {
  const spread = getSpreadForSymbol(symbol, pipRangeConfigs);
  return Math.round((entryDifference + spread) * 10) / 10;
}

// Get spread for a symbol — reads from Tabella Operatività (SINGLE SOURCE OF TRUTH)
// Falls back to SYMBOL_SPREAD hardcoded ONLY if no config exists (should not happen in production)
export function getSpreadForSymbol(symbol: string, pipRangeConfigs?: PipRangeConfig[]): number {
  const configSpread = pipRangeConfigs?.find(c => c.symbol === symbol && c.is_active)?.spread;
  if (configSpread != null) return configSpread;
  // FALLBACK — log warning so we know the table is missing this pair
  console.warn(`[SPREAD] ⚠️ No Tabella Operatività config for ${symbol}, using hardcoded fallback`);
  return SYMBOL_SPREAD[symbol] ?? 0.3;
}

// Get range key based on phase and risk
export function getRangeKey(phase: string, riskPercent: number): string {
  if (phase === 'live') return 'live';
  if (riskPercent >= 3) return 'challenge_3%';
  return 'challenge_2%';
}

// Generate lots within the correct range for phase/risk/symbol
// Now accepts optional usedLots array to avoid duplicates
export function generateLotsForRange(
  phase: string, 
  riskPercent: number, 
  symbol: string,
  usedLots: number[] = [],
  maxAttempts: number = 25
): number {
  const rangeKey = getRangeKey(phase, riskPercent);
  const range = TRADING_RANGES[rangeKey]?.[symbol];
  
  if (!range) {
    // Fallback to standard range
    return 5 + Math.random() * 3;
  }
  
  // Convert usedLots to a Set for O(1) lookup
  const usedSet = new Set(usedLots.map(l => l.toFixed(2)));
  
  // Try to generate unique lots
  let attempts = 0;
  let lots: number;
  
  do {
    lots = range.minLots + Math.random() * (range.maxLots - range.minLots);
    lots = Math.round(lots * 100) / 100;
    attempts++;
  } while (usedSet.has(lots.toFixed(2)) && attempts < maxAttempts);
  
  // If we exhausted attempts, add micro-adjustments for uniqueness
  if (usedSet.has(lots.toFixed(2))) {
    for (let offset = 0.01; offset <= 0.15; offset += 0.01) {
      const adjustedUp = Math.round((lots + offset) * 100) / 100;
      const adjustedDown = Math.round((lots - offset) * 100) / 100;
      
      if (!usedSet.has(adjustedUp.toFixed(2)) && adjustedUp <= range.maxLots) {
        return adjustedUp;
      }
      if (!usedSet.has(adjustedDown.toFixed(2)) && adjustedDown >= range.minLots) {
        return adjustedDown;
      }
    }
  }
  
  return lots;
}

// Calculate Take Profit in pips needed to reach target profit
// Now accepts optional dynamic pip values from MyFXBook
export function calculateTakeProfitPips(
  balance: number,
  riskPercent: number,
  lots: number,
  symbol: string,
  dynamicPipValues?: Record<string, number>
): number {
  // Target profit in USD
  const targetProfit = balance * (riskPercent / 100);
  
  // Get pip value for symbol - prefer dynamic values, fallback to static
  const pipValuePerLot = (dynamicPipValues?.[symbol]) || PIP_VALUES[symbol] || 10;
  
  // Total pip value for the position
  const totalPipValue = lots * pipValuePerLot;
  
  // Calculate pips needed
  if (totalPipValue === 0) return 0;
  const pipsNeeded = targetProfit / totalPipValue;
  
  return Math.round(pipsNeeded * 10) / 10; // Round to 1 decimal
}

// ============================================
// NEW: CALCULATE LOTS FROM PIP RANGE (Tabella Operatività)
// ============================================
// Formula: lots = targetProfit / (pips × pipValuePerLot)
// This reverses the calculation - instead of calculating pips from lots,
// we calculate lots from a pip range configured in the Tabella Operatività
export interface PipRangeConfig {
  symbol: string;
  min_pips: number;
  max_pips: number;
  spread: number;
  is_active: boolean;
}

// Calculate lots given a pip value and target profit
// SOURCE: https://www.myfxbook.com/forex-calculators/position-size
// IMPORTANT: Always uses pips directly from Tabella Operatività - no conversions
// NO HARDCODED LOT LIMITS: pips are the primary constraint, lots are derived
export function calculateLotsFromPips(
  balance: number,
  riskPercent: number,
  pips: number,
  symbol: string,
  dynamicPipValues?: Record<string, number>
): number {
  // Target profit in USD
  const targetProfit = balance * (riskPercent / 100);
  
  // Get pip value for symbol - prefer dynamic values, fallback to static
  const pipValuePerLot = (dynamicPipValues?.[symbol]) || PIP_VALUES[symbol] || 10;
  
  // Calculate lots needed to reach target profit at given pips
  // Formula: lots = targetProfit / (pips × pipValuePerLot)
  if (pips === 0 || pipValuePerLot === 0) return 1; // Fallback
  
  const lotsNeeded = targetProfit / (pips * pipValuePerLot);
  
  // Round to 2 decimals, ensure minimum 0.01
  return Math.max(0.01, Math.round(lotsNeeded * 100) / 100);
}

// Generate random pips within the configured range
export function generateRandomPipsFromRange(minPips: number, maxPips: number): number {
  const pips = minPips + Math.random() * (maxPips - minPips);
  return Math.round(pips * 10) / 10; // Round to 1 decimal
}

// Generate lots using pip range from Tabella Operatività
// PIPS-FIRST: pips are always the primary constraint (never exceed max_pips)
// Lots are derived from the formula: lots = risk$ / (pips × pipValue)
// 
// FOR NORMAL TRADES ONLY: lots are clamped to TRADING_RANGES min/max,
// with pip adjustment to keep both pips and lots within valid ranges.
// TARGET and EXPLOSION engines have their own logic and must NOT call this.
export function generateLotsFromPipRange(
  account: MT5Account,
  riskPercent: number,
  symbol: string,
  pipRangeConfigs: PipRangeConfig[],
  usedLots: number[] = [],
  dynamicPipValues?: Record<string, number>,
  maxAttempts: number = 25
): { lots: number; pips: number } {
  // Find config for this symbol
  const config = pipRangeConfigs.find(c => c.symbol === symbol && c.is_active);
  
  if (!config) {
    // Fallback to old method if no config found
    console.log(`[LOTS] No pip range config for ${symbol}, using fallback`);
    const fallbackRange = TRADING_RANGES['challenge_2%']?.[symbol];
    if (fallbackRange) {
      const pips = generateRandomPipsFromRange(fallbackRange.minPips, fallbackRange.maxPips);
      const lots = calculateLotsFromPips(
        getStandardBalance(account),
        riskPercent,
        pips,
        symbol,
        dynamicPipValues
      );
      return { lots, pips };
    }
    return { lots: 5, pips: 30 };
  }
  
  // Get balance for calculation (use standard/baseline balance)
  const balance = getStandardBalance(account);
  
  // Get pip value for symbol
  const pipValuePerLot = (dynamicPipValues?.[symbol]) || PIP_VALUES[symbol] || 10;
  const targetProfit = balance * (riskPercent / 100);
  
  // Get lot range from TRADING_RANGES for NORMAL trade clamping
  const phase = account.phase || 'fase1';
  const rangeKey = getRangeKey(phase, riskPercent);
  const lotRange = TRADING_RANGES[rangeKey]?.[symbol];
  const minLots = lotRange?.minLots ?? 0.01;
  const maxLots = lotRange?.maxLots ?? 999;
  
  // Convert usedLots to a Set for O(1) lookup
  const usedSet = new Set(usedLots.map(l => l.toFixed(2)));
  
  let attempts = 0;
  let lots: number;
  let pips: number;
  
  do {
    // Step 1: Generate random pips strictly within configured range
    pips = generateRandomPipsFromRange(config.min_pips, config.max_pips);
    
    // Step 2: Calculate lots from pips
    lots = calculateLotsFromPips(balance, riskPercent, pips, symbol, dynamicPipValues);
    
    // Step 3: lots too LOW → reduce pips to raise lots (never below min_pips)
    if (lots < minLots && targetProfit > 0 && pipValuePerLot > 0) {
      const pipsForMinLots = targetProfit / (minLots * pipValuePerLot);
      const adjustedPips = Math.round(Math.max(config.min_pips, Math.min(pipsForMinLots, config.max_pips)) * 10) / 10;
      const adjustedLots = calculateLotsFromPips(balance, riskPercent, adjustedPips, symbol, dynamicPipValues);
      
      if (adjustedLots >= minLots) {
        pips = adjustedPips;
        lots = adjustedLots;
      } else {
        lots = minLots;
        pips = adjustedPips;
      }
    }
    
    // Step 4: lots too HIGH → increase pips to lower lots (never above max_pips)
    if (lots > maxLots && targetProfit > 0 && pipValuePerLot > 0) {
      const pipsForMaxLots = targetProfit / (maxLots * pipValuePerLot);
      const adjustedPips = Math.round(Math.min(config.max_pips, Math.max(pipsForMaxLots, config.min_pips)) * 10) / 10;
      const adjustedLots = calculateLotsFromPips(balance, riskPercent, adjustedPips, symbol, dynamicPipValues);
      
      if (adjustedLots <= maxLots) {
        pips = adjustedPips;
        lots = adjustedLots;
      } else {
        lots = maxLots;
        pips = adjustedPips;
      }
    }
    
    // Ensure minimum viable lot
    if (lots < 0.01) {
      lots = 0.01;
    }
    
    attempts++;
  } while (usedSet.has(lots.toFixed(2)) && attempts < maxAttempts);
  
  // If we exhausted attempts, apply micro-adjustments for uniqueness
  if (usedSet.has(lots.toFixed(2))) {
    for (let offset = 0.01; offset <= 0.15; offset += 0.01) {
      const adjustedUp = Math.round((lots + offset) * 100) / 100;
      const adjustedDown = Math.round((lots - offset) * 100) / 100;
      
      if (!usedSet.has(adjustedUp.toFixed(2)) && adjustedUp <= maxLots) {
        return { lots: adjustedUp, pips };
      }
      if (!usedSet.has(adjustedDown.toFixed(2)) && adjustedDown >= minLots) {
        return { lots: adjustedDown, pips };
      }
    }
  }
  
  console.log(`[LOTS-NORMAL] ${symbol}: pips=${pips} [${config.min_pips}-${config.max_pips}], lots=${lots} [${minLots}-${maxLots}] (balance=$${balance}, risk=${riskPercent}%)`);
  
  return { lots, pips };
}

// ============================================
// 70/30 RR MIX FOR NORMAL TRADES
// ============================================
// 70% → 1:1 Symmetric: TP pips = SL pips, push lots toward max risk
// 30% → Asymmetric: TP and SL pips differ (e.g. 1:1.5 or 1:2), still within pip ranges
// Both respect min/max pips from Tabella Operatività and lot ranges from TRADING_RANGES
// ONLY for NORMAL trades — TARGET and EXPLOSION engines are NOT affected

export type NormalTradeRRType = 'symmetric_1:1' | 'asymmetric';

export interface NormalTradeParams {
  lotsA: number;
  lotsB: number;
  pipsA: number;  // SL pips for account A
  pipsB: number;  // SL pips for account B
  rrType: NormalTradeRRType;
  riskReward: string;
  actualRiskA: number;  // ACTUAL risk % after hard cap enforcement
  actualRiskB: number;  // ACTUAL risk % after hard cap enforcement
}

export function generateNormalTradeWithRRMix(
  accountA: MT5Account,
  accountB: MT5Account,
  variableRiskA: number,
  variableRiskB: number,
  symbol: string,
  pipRangeConfigs: PipRangeConfig[],
  usedLots: number[],
  dynamicPipValues?: Record<string, number>,
  phase?: CrossablePhase,
  riskConfigMap?: PropFirmRiskConfigMap
): NormalTradeParams & { isLimitedAsym?: boolean; limitedAccountId?: string; bufferedRisk?: number; standardRisk?: number } {
  const config = pipRangeConfigs.find(c => c.symbol === symbol && c.is_active);
  const minPips = config?.min_pips ?? 20;
  const maxPips = config?.max_pips ?? 40;
  const spread = getSpreadForSymbol(symbol, pipRangeConfigs);

  const balanceA = getStandardBalance(accountA);
  const balanceB = getStandardBalance(accountB);
  const pipValuePerLot = (dynamicPipValues?.[symbol]) || PIP_VALUES[symbol] || 10;

  const phaseA = accountA.phase || 'fase1';
  const rangeKeyA = getRangeKey(phaseA, variableRiskA);
  const lotRangeA = TRADING_RANGES[rangeKeyA]?.[symbol];
  const minLotsA = lotRangeA?.minLots ?? 0.01;
  const maxLotsA = lotRangeA?.maxLots ?? 999;

  // GUARD: This function is ONLY for NORMAL trades.
  // TARGET and EXPLOSION engines have their own asymmetric logic and must NEVER call this.
  
  // ======= LIMITED ASYM CHECK =======
  // If either account has is_risk_override_active, force asymmetric trade with buffered risk
  const overrideA = parseRiskOverride(accountA);
  const overrideB = parseRiskOverride(accountB);
  const hasOverride = !!(overrideA || overrideB);
  
  if (hasOverride) {
    // Determine which account is limited and which is "sano" (healthy)
    const limitedIsA = !!overrideA;
    const limitedAccount = limitedIsA ? accountA : accountB;
    const healthyAccount = limitedIsA ? accountB : accountA;
    const limitedOverride = limitedIsA ? overrideA! : overrideB!;
    const healthyRisk = limitedIsA ? variableRiskB : variableRiskA;
    
    // Apply 15% buffer protection (risk * 0.85)
    const bufferedRisk = getBufferedOverrideRisk(limitedOverride.value);
    const limitedBalance = getStandardBalance(limitedAccount);
    const healthyBalance = getStandardBalance(healthyAccount);
    
    console.log(`[LIMITED ASYM] Account ${limitedAccount.account_login} LIMITED: ${limitedOverride.value}% → buffered ${bufferedRisk}% | Partner: ${healthyAccount.account_login} standard ${healthyRisk}%`);
    
    // Calculate SL$ for each
    const limitedSL_dollars = limitedBalance * (bufferedRisk / 100);
    const healthySL_dollars = healthyBalance * (healthyRisk / 100);
    
    // Pick random pips within range for the healthy account (driver)
    const randomPips = generateRandomPipsFromRange(minPips, maxPips);
    
    // CROSS RULE: Both accounts enter the SAME instrument, so LOTS MUST BE EQUAL
    // (or proportional for 5ERS). Calculate lots from healthy account as base.
    let baseLots = healthySL_dollars / (randomPips * pipValuePerLot);
    baseLots = Math.max(0.01, Math.round(baseLots * 100) / 100);
    
    // Clamp lots
    if (baseLots < minLotsA) baseLots = minLotsA;
    if (baseLots > maxLotsA) baseLots = maxLotsA;
    baseLots = Math.round(baseLots * 100) / 100;
    
    // Apply 5ERS proportional correction
    const baseStandardHealthy = getStandardBalance(healthyAccount);
    const baseStandardLimited = getStandardBalance(limitedAccount);
    const isSameBase = baseStandardHealthy === baseStandardLimited;
    
    let lotsHealthy = baseLots;
    let lotsLimited = isSameBase ? baseLots : calculateProportionalLots(healthyAccount, limitedAccount, baseLots);
    
    // Derive pips from $risk for each: pips = risk$ / (lots * pipValue)
    // These pips represent SL distances — different because risks are different
    const pipsLimited = Math.round((limitedSL_dollars / (lotsLimited * pipValuePerLot)) * 10) / 10;
    const pipsHealthy = Math.round((healthySL_dollars / (lotsHealthy * pipValuePerLot)) * 10) / 10;
    
    let finalLotsA = limitedIsA ? lotsLimited : lotsHealthy;
    let finalLotsB = limitedIsA ? lotsHealthy : lotsLimited;
    const pipsA = limitedIsA ? pipsLimited : pipsHealthy;
    const pipsB = limitedIsA ? pipsHealthy : pipsLimited;
    
    // === HARD CAP ENFORCEMENT ===
    const hardCapA = getHardCapMaxRisk(accountA, 'normal', riskConfigMap);
    const hardCapB = getHardCapMaxRisk(accountB, 'normal', riskConfigMap);
    if (hardCapA && pipsA > 0) {
      finalLotsA = enforceHardCapRisk(finalLotsA, pipsA, pipValuePerLot, balanceA, hardCapA, `A:${accountA.account_login}`);
    }
    if (hardCapB && pipsB > 0) {
      finalLotsB = enforceHardCapRisk(finalLotsB, pipsB, pipValuePerLot, balanceB, hardCapB, `B:${accountB.account_login}`);
    }
    
    // CROSS SYNCHRONIZATION: After hard cap, sync lots to the more restrictive
    const baseA = getStandardBalance(accountA);
    const baseB = getStandardBalance(accountB);
    if (isSameBase) {
      const minLots = Math.min(finalLotsA, finalLotsB);
      finalLotsA = minLots;
      finalLotsB = minLots;
    } else {
      const normalizedA = finalLotsA / baseA;
      const normalizedB = finalLotsB / baseB;
      if (normalizedA < normalizedB) {
        finalLotsB = Math.round(finalLotsA * (baseB / baseA) * 100) / 100;
      } else if (normalizedB < normalizedA) {
        finalLotsA = Math.round(finalLotsB * (baseA / baseB) * 100) / 100;
      }
    }
    
    // === RECALCULATE ACTUAL RISK after sync ===
    const actualRiskA = calculateActualRiskPercent(finalLotsA, pipsA, pipValuePerLot, balanceA);
    const actualRiskB = calculateActualRiskPercent(finalLotsB, pipsB, pipValuePerLot, balanceB);
    
    const ratio = Math.max(pipsLimited, pipsHealthy) / Math.min(pipsLimited, pipsHealthy);
    const riskReward = `1:${ratio.toFixed(1)}`;
    
    console.log(`[LIMITED ASYM] ${symbol}: SYNCED lots=${finalLotsA} | Limited pips=${pipsLimited} ($${limitedSL_dollars.toFixed(0)}) | Healthy pips=${pipsHealthy} ($${healthySL_dollars.toFixed(0)}) | RR=${riskReward} | ActualRisk A=${actualRiskA.toFixed(2)}% B=${actualRiskB.toFixed(2)}%`);
    
    return {
      lotsA: finalLotsA,
      lotsB: finalLotsB,
      pipsA,
      pipsB,
      rrType: 'asymmetric',
      riskReward,
      actualRiskA,
      actualRiskB,
      isLimitedAsym: true,
      limitedAccountId: limitedAccount.id,
      bufferedRisk,
      standardRisk: healthyRisk,
    };
  }
  
  // LIVE phase: force ALL trades to symmetric 1:1 (no asymmetric allowed)
  const isLivePhase = phase === 'live';
  const roll = Math.random();
  const isSymmetric = isLivePhase ? true : roll < 0.70;
  console.log(`[RR-MIX] Roll=${roll.toFixed(3)} → ${isLivePhase ? 'LIVE FORCED 1:1' : (isSymmetric ? 'SYMMETRIC 1:1 (70%)' : 'ASYMMETRIC (30%)')} | ${symbol}`);

  if (isSymmetric) {
    // ======= 70% → SYMMETRIC 1:1 (Lot Range Intersection) =======
    // STEP 1: Get min/max risk from DB config for each account
    const firmA_sym = extractPropFirmName(accountA.prop_firm_name || '');
    const firmB_sym = extractPropFirmName(accountB.prop_firm_name || '');
    const phaseKey_sym = (accountA.phase || 'fase1') as 'fase1' | 'fase2' | 'live';
    
    const rangeA_sym = riskConfigMap ? getRiskRangeFromConfig(firmA_sym, phaseKey_sym, 'normal', riskConfigMap) : null;
    const rangeB_sym = riskConfigMap ? getRiskRangeFromConfig(firmB_sym, phaseKey_sym, 'normal', riskConfigMap) : null;
    
    const symMinRiskA = rangeA_sym?.minRisk ?? variableRiskA;
    const symMaxRiskA = rangeA_sym?.maxRisk ?? variableRiskA;
    const symMinRiskB = rangeB_sym?.minRisk ?? variableRiskB;
    const symMaxRiskB = rangeB_sym?.maxRisk ?? variableRiskB;
    
    // STEP 2: Pick random pips
    const randomFactor = 0.9 + Math.random() * 0.2;
    let pips = Math.round(Math.max(minPips, Math.min((minPips + (maxPips - minPips) * Math.random()) * randomFactor, maxPips)) * 10) / 10;
    pips = Math.max(minPips, Math.min(pips, maxPips));
    
    // STEP 3: Calculate admissible lot ranges for each account (symmetric: same pips)
    const symBaseA = getStandardBalance(accountA);
    const symBaseB = getStandardBalance(accountB);
    const isSameBase_sym = symBaseA === symBaseB;
    
    const symLotsAMin = (balanceA * (symMinRiskA / 100)) / (pips * pipValuePerLot);
    const symLotsAMax = (balanceA * (symMaxRiskA / 100)) / (pips * pipValuePerLot);
    
    const symLotsBMin_raw = (balanceB * (symMinRiskB / 100)) / (pips * pipValuePerLot);
    const symLotsBMax_raw = (balanceB * (symMaxRiskB / 100)) / (pips * pipValuePerLot);
    
    // Normalize B to A's base for intersection
    const symLotsBMin = isSameBase_sym ? symLotsBMin_raw : symLotsBMin_raw * (symBaseA / symBaseB);
    const symLotsBMax = isSameBase_sym ? symLotsBMax_raw : symLotsBMax_raw * (symBaseA / symBaseB);
    
    // STEP 4: Intersect ranges
    const symGlobalMin = Math.max(symLotsAMin, symLotsBMin);
    const symGlobalMax = Math.min(symLotsAMax, symLotsBMax);
    
    let symFinalLots: number;
    let symIntersectionValid = true;
    if (symGlobalMin <= symGlobalMax) {
      symFinalLots = symGlobalMin + Math.random() * (symGlobalMax - symGlobalMin);
    } else {
      symIntersectionValid = false;
      symFinalLots = Math.min(symLotsAMax, symLotsBMax);
      console.log(`[SYM INTERSECTION] No overlap! A=[${symLotsAMin.toFixed(3)}-${symLotsAMax.toFixed(3)}] B=[${symLotsBMin.toFixed(3)}-${symLotsBMax.toFixed(3)}] → ${symFinalLots.toFixed(3)}`);
    }
    
    symFinalLots = Math.max(0.01, Math.round(symFinalLots * 100) / 100);
    
    let lotsA = symFinalLots;
    let lotsB = isSameBase_sym ? symFinalLots : calculateProportionalLots(accountA, accountB, symFinalLots);
    
    // POST-ROUNDING VALIDATION: nudge lots to stay within [min, max] for both
    for (let attempt = 0; attempt < 10; attempt++) {
      const rA = calculateActualRiskPercent(lotsA, pips, pipValuePerLot, balanceA);
      const rB = calculateActualRiskPercent(lotsB, pips, pipValuePerLot, balanceB);
      const aOver = rA > symMaxRiskA + 0.01;
      const bOver = rB > symMaxRiskB + 0.01;
      const aUnder = rA < symMinRiskA - 0.01;
      const bUnder = rB < symMinRiskB - 0.01;
      
      if (!aOver && !bOver && !aUnder && !bUnder) break;
      
      if (aOver || bOver) {
        lotsA = Math.max(0.01, Math.round((lotsA - 0.01) * 100) / 100);
        lotsB = isSameBase_sym ? lotsA : calculateProportionalLots(accountA, accountB, lotsA);
      } else if (aUnder || bUnder) {
        const candA = Math.round((lotsA + 0.01) * 100) / 100;
        const candB = isSameBase_sym ? candA : calculateProportionalLots(accountA, accountB, candA);
        const candRA = calculateActualRiskPercent(candA, pips, pipValuePerLot, balanceA);
        const candRB = calculateActualRiskPercent(candB, pips, pipValuePerLot, balanceB);
        if (candRA <= symMaxRiskA + 0.01 && candRB <= symMaxRiskB + 0.01) {
          lotsA = candA;
          lotsB = candB;
        } else {
          break; // Accept below-min rather than exceed max
        }
      }
    }
    
    const actualRiskA_sym = calculateActualRiskPercent(lotsA, pips, pipValuePerLot, balanceA);
    const actualRiskB_sym = calculateActualRiskPercent(lotsB, pips, pipValuePerLot, balanceB);
    
    const aStatus = actualRiskA_sym > symMaxRiskA + 0.01 ? '⚠️MAX' : actualRiskA_sym < symMinRiskA - 0.01 ? '⚠️MIN' : '✅';
    const bStatus = actualRiskB_sym > symMaxRiskB + 0.01 ? '⚠️MAX' : actualRiskB_sym < symMinRiskB - 0.01 ? '⚠️MIN' : '✅';
    
    console.log(`[RR-MIX] SYMMETRIC 1:1 | ${symbol}: pips=${pips} [${minPips}-${maxPips}], lotsA=${lotsA}, lotsB=${lotsB} | RiskA: [${symMinRiskA}-${symMaxRiskA}%] → ${actualRiskA_sym.toFixed(2)}% ${aStatus} | RiskB: [${symMinRiskB}-${symMaxRiskB}%] → ${actualRiskB_sym.toFixed(2)}% ${bStatus} | intersection=${symIntersectionValid}`);
    
    return {
      lotsA,
      lotsB,
      pipsA: pips,
      pipsB: pips,
      rrType: 'symmetric_1:1',
      riskReward: '1:1',
      actualRiskA: actualRiskA_sym,
      actualRiskB: actualRiskB_sym,
    };
  } else {
    // ======= 30% → ASYMMETRIC — CHALLENGE ONLY =======
    // DIVERGENT TARGETS: pipsA and pipsB MUST differ by at least 2 pips
    // WITH STRICT RISK RANGE ENFORCEMENT: pip divergence is reduced until both
    // accounts fit within their [min_risk, max_risk] ranges.
    
    // --- STEP 0: Get min/max risk from DB config for each account ---
    const firmA = extractPropFirmName(accountA.prop_firm_name || '');
    const firmB = extractPropFirmName(accountB.prop_firm_name || '');
    const phaseKey = (accountA.phase || 'fase1') as 'fase1' | 'fase2' | 'live';
    
    const rangeA = riskConfigMap ? getRiskRangeFromConfig(firmA, phaseKey, 'normal', riskConfigMap) : null;
    const rangeB = riskConfigMap ? getRiskRangeFromConfig(firmB, phaseKey, 'normal', riskConfigMap) : null;
    
    const minRiskA = rangeA?.minRisk ?? variableRiskA;
    const maxRiskA = rangeA?.maxRisk ?? variableRiskA;
    const minRiskB = rangeB?.minRisk ?? variableRiskB;
    const maxRiskB = rangeB?.maxRisk ?? variableRiskB;
    
    // Override check
    const overrideCheckA = parseRiskOverride(accountA);
    const overrideCheckB = parseRiskOverride(accountB);
    const effectiveMinRiskA = overrideCheckA ? getBufferedOverrideRisk(overrideCheckA.value) : minRiskA;
    const effectiveMaxRiskA = overrideCheckA ? overrideCheckA.value : maxRiskA;
    const effectiveMinRiskB = overrideCheckB ? getBufferedOverrideRisk(overrideCheckB.value) : minRiskB;
    const effectiveMaxRiskB = overrideCheckB ? overrideCheckB.value : maxRiskB;
    
    // --- STEP 1: Generate divergent pips with CONVERGENCE LOOP ---
    // Start with maximum divergence, reduce if risk ranges are violated
    const pipRange = maxPips - minPips;
    let pipsA: number;
    let pipsB: number;
    let convergenceAttempt = 0;
    const MAX_CONVERGENCE_ATTEMPTS = 15;
    // Scale factor: 1.0 = full divergence, decreasing toward 0 = near-symmetric
    let divergenceScale = 1.0;
    
    let finalLotsResult: { lotsA: number; lotsB: number; intersectionValid: boolean } = { lotsA: 0.01, lotsB: 0.01, intersectionValid: false };
    let bestActualRiskA = 0;
    let bestActualRiskB = 0;
    let foundValid = false;
    
    while (convergenceAttempt < MAX_CONVERGENCE_ATTEMPTS && !foundValid) {
      // Generate pips with current divergence scale
      if (pipRange < 2 || divergenceScale < 0.1) {
        // Collapse to near-symmetric: use midpoint with tiny spread
        const mid = (minPips + maxPips) / 2;
        pipsA = Math.round((mid - 0.5) * 10) / 10;
        pipsB = Math.round((mid + 0.5) * 10) / 10;
      } else {
        const midPoint = (minPips + maxPips) / 2;
        const scaledHalf = (pipRange / 2) * divergenceScale;
        const halfGap = 1 * divergenceScale;
        const zoneAMax = midPoint - halfGap;
        const zoneBMin = midPoint + halfGap;
        
        if (zoneAMax >= minPips && zoneBMin <= maxPips) {
          // Scale the zones: as divergenceScale shrinks, zones narrow toward midpoint
          const zoneAMin = Math.max(minPips, midPoint - scaledHalf);
          const scaledZoneAMax = Math.min(zoneAMax, midPoint - halfGap);
          const scaledZoneBMin = Math.max(zoneBMin, midPoint + halfGap);
          const zoneBMax = Math.min(maxPips, midPoint + scaledHalf);
          
          pipsA = generateRandomPipsFromRange(zoneAMin, scaledZoneAMax);
          pipsB = generateRandomPipsFromRange(scaledZoneBMin, zoneBMax);
          if (Math.random() < 0.5) {
            const temp = pipsA;
            pipsA = pipsB;
            pipsB = temp;
          }
        } else {
          pipsA = generateRandomPipsFromRange(minPips, maxPips);
          pipsB = generateRandomPipsFromRange(minPips, maxPips);
          let attempts = 0;
          while (Math.abs(pipsA - pipsB) < 2 * divergenceScale && attempts < 50) {
            pipsB = generateRandomPipsFromRange(minPips, maxPips);
            attempts++;
          }
        }
      }
      
      if (Math.abs(pipsA - pipsB) < 1) {
        if (pipsA + 2 <= maxPips) {
          pipsB = Math.round((pipsA + 2 * divergenceScale) * 10) / 10;
        } else if (pipsA - 2 >= minPips) {
          pipsB = Math.round((pipsA - 2 * divergenceScale) * 10) / 10;
        }
      }
      
      // Clamp pips to [minPips, maxPips]
      pipsA = Math.max(minPips, Math.min(maxPips, pipsA));
      pipsB = Math.max(minPips, Math.min(maxPips, pipsB));
      
      // --- STEP 2: Calculate admissible lot ranges for each account ---
      const lotsAMin = (balanceA * (effectiveMinRiskA / 100)) / (pipsA * pipValuePerLot);
      const lotsAMax = (balanceA * (effectiveMaxRiskA / 100)) / (pipsA * pipValuePerLot);
      
      const baseStandardA = getStandardBalance(accountA);
      const baseStandardB = getStandardBalance(accountB);
      const isSameBase = baseStandardA === baseStandardB;
      
      const lotsBMin_raw = (balanceB * (effectiveMinRiskB / 100)) / (pipsB * pipValuePerLot);
      const lotsBMax_raw = (balanceB * (effectiveMaxRiskB / 100)) / (pipsB * pipValuePerLot);
      
      const lotsBMin_normalized = isSameBase ? lotsBMin_raw : lotsBMin_raw * (baseStandardA / baseStandardB);
      const lotsBMax_normalized = isSameBase ? lotsBMax_raw : lotsBMax_raw * (baseStandardA / baseStandardB);
      
      // --- STEP 3: Intersect the ranges ---
      const globalMinLots = Math.max(lotsAMin, lotsBMin_normalized);
      const globalMaxLots = Math.min(lotsAMax, lotsBMax_normalized);
      
      let finalLots: number;
      let intersectionValid = true;
      if (globalMinLots <= globalMaxLots) {
        finalLots = globalMinLots + Math.random() * (globalMaxLots - globalMinLots);
      } else {
        intersectionValid = false;
        finalLots = Math.min(lotsAMax, lotsBMax_normalized);
      }
      
      finalLots = Math.max(0.01, Math.round(finalLots * 100) / 100);
      
      // POST-ROUNDING VALIDATION (verifyAndClamp)
      for (let attempt = 0; attempt < 10; attempt++) {
        const curLotsB = isSameBase ? finalLots : calculateProportionalLots(accountA, accountB, finalLots);
        const rA = calculateActualRiskPercent(finalLots, pipsA, pipValuePerLot, balanceA);
        const rB = calculateActualRiskPercent(curLotsB, pipsB, pipValuePerLot, balanceB);
        const aOver = rA > effectiveMaxRiskA + 0.01;
        const bOver = rB > effectiveMaxRiskB + 0.01;
        const aUnder = rA < effectiveMinRiskA - 0.01;
        const bUnder = rB < effectiveMinRiskB - 0.01;
        
        if (!aOver && !bOver && !aUnder && !bUnder) break;
        
        if (aOver || bOver) {
          finalLots = Math.max(0.01, Math.round((finalLots - 0.01) * 100) / 100);
        } else if (aUnder || bUnder) {
          const cand = Math.round((finalLots + 0.01) * 100) / 100;
          const candB = isSameBase ? cand : calculateProportionalLots(accountA, accountB, cand);
          const cRA = calculateActualRiskPercent(cand, pipsA, pipValuePerLot, balanceA);
          const cRB = calculateActualRiskPercent(candB, pipsB, pipValuePerLot, balanceB);
          if (cRA <= effectiveMaxRiskA + 0.01 && cRB <= effectiveMaxRiskB + 0.01) {
            finalLots = cand;
          } else {
            break;
          }
        }
      }
      
      const lotsA_candidate = finalLots;
      const lotsB_candidate = isSameBase ? finalLots : calculateProportionalLots(accountA, accountB, finalLots);
      
      bestActualRiskA = calculateActualRiskPercent(lotsA_candidate, pipsA, pipValuePerLot, balanceA);
      bestActualRiskB = calculateActualRiskPercent(lotsB_candidate, pipsB, pipValuePerLot, balanceB);
      
      const aOK = bestActualRiskA >= effectiveMinRiskA - 0.01 && bestActualRiskA <= effectiveMaxRiskA + 0.01;
      const bOK = bestActualRiskB >= effectiveMinRiskB - 0.01 && bestActualRiskB <= effectiveMaxRiskB + 0.01;
      
      if (aOK && bOK) {
        foundValid = true;
        finalLotsResult = { lotsA: lotsA_candidate, lotsB: lotsB_candidate, intersectionValid };
        console.log(`[ASYM CONVERGENCE] ✅ Valid at attempt ${convergenceAttempt + 1} (scale=${divergenceScale.toFixed(2)}) pipsA=${pipsA} pipsB=${pipsB} RiskA=${bestActualRiskA.toFixed(2)}% RiskB=${bestActualRiskB.toFixed(2)}%`);
      } else {
        console.log(`[ASYM CONVERGENCE] ❌ Attempt ${convergenceAttempt + 1} (scale=${divergenceScale.toFixed(2)}) pipsA=${pipsA} pipsB=${pipsB} RiskA=${bestActualRiskA.toFixed(2)}% [${effectiveMinRiskA}-${effectiveMaxRiskA}] RiskB=${bestActualRiskB.toFixed(2)}% [${effectiveMinRiskB}-${effectiveMaxRiskB}]`);
        // Reduce divergence for next attempt
        divergenceScale *= 0.65;
        convergenceAttempt++;
      }
    }
    
    // If we exhausted attempts, use last result with hard clamping as fallback
    if (!foundValid) {
      console.log(`[ASYM CONVERGENCE] ⚠️ Exhausted ${MAX_CONVERGENCE_ATTEMPTS} attempts, using last pips with hard clamp`);
      // Force near-symmetric as ultimate fallback
      const mid = (minPips + maxPips) / 2;
      pipsA = Math.round((mid - 0.5) * 10) / 10;
      pipsB = Math.round((mid + 0.5) * 10) / 10;
      
      const lotsMax_a = (balanceA * (effectiveMaxRiskA / 100)) / (pipsA * pipValuePerLot);
      const lotsMax_b = (balanceB * (effectiveMaxRiskB / 100)) / (pipsB * pipValuePerLot);
      const baseStdA = getStandardBalance(accountA);
      const baseStdB = getStandardBalance(accountB);
      const sameBase = baseStdA === baseStdB;
      const lotsMax_b_norm = sameBase ? lotsMax_b : lotsMax_b * (baseStdA / baseStdB);
      
      let safeLots = Math.min(lotsMax_a, lotsMax_b_norm);
      safeLots = Math.max(0.01, Math.round(safeLots * 100) / 100);
      
      const safeLotsB = sameBase ? safeLots : calculateProportionalLots(accountA, accountB, safeLots);
      bestActualRiskA = calculateActualRiskPercent(safeLots, pipsA, pipValuePerLot, balanceA);
      bestActualRiskB = calculateActualRiskPercent(safeLotsB, pipsB, pipValuePerLot, balanceB);
      finalLotsResult = { lotsA: safeLots, lotsB: safeLotsB, intersectionValid: false };
    }
    
    const { lotsA, lotsB } = finalLotsResult;
    
    const ratio = Math.max(pipsA, pipsB) / Math.min(pipsA, pipsB);
    const riskReward = `1:${ratio.toFixed(1)}`;
    
    const actualRiskA_asym = bestActualRiskA;
    const actualRiskB_asym = bestActualRiskB;
    
    const aViolation = actualRiskA_asym > effectiveMaxRiskA + 0.01 ? '⚠️MAX' : actualRiskA_asym < effectiveMinRiskA - 0.01 ? '⚠️MIN' : '✅';
    const bViolation = actualRiskB_asym > effectiveMaxRiskB + 0.01 ? '⚠️MAX' : actualRiskB_asym < effectiveMinRiskB - 0.01 ? '⚠️MIN' : '✅';
    
    console.log(`[ASYM INTERSECTION] ${symbol}: lotsA=${lotsA} lotsB=${lotsB} | pipsA=${pipsA} pipsB=${pipsB} | RiskA: [${effectiveMinRiskA}-${effectiveMaxRiskA}%] → ${actualRiskA_asym.toFixed(2)}% ${aViolation} | RiskB: [${effectiveMinRiskB}-${effectiveMaxRiskB}%] → ${actualRiskB_asym.toFixed(2)}% ${bViolation} | RR=${riskReward} | convergence=${convergenceAttempt}`);
    return { lotsA, lotsB, pipsA, pipsB, rrType: 'asymmetric', riskReward, actualRiskA: actualRiskA_asym, actualRiskB: actualRiskB_asym };
  }
}

export type AllowedSymbol = typeof ALLOWED_SYMBOLS[number];

// Phases that can be crossed (only same phase allowed)
export type CrossablePhase = 'fase1' | 'fase2' | 'live';

export interface LotRange {
  min: number;
  max: number;
}

// Target sub-types assigned during detection phase
export type TargetSubType = 'TRADE TARGET DOPPIO' | 'TRADE TARGET SINGOLO';
export type ExplosionSubType = 'ESPLOSIONE DOPPIA' | 'ESPLOSIONE SINGOLA';

export interface CrossSuggestion {
  accountA: MT5Account;
  accountB: MT5Account;
  symbol: AllowedSymbol;
  directionA: 'BUY' | 'SELL';
  directionB: 'BUY' | 'SELL';
  lotsA: number;
  lotsB: number;
  phase: CrossablePhase;
  stageDifference: number;
  balanceDifference: number;
  riskReward: string;
  riskPercent: number;
  riskPercentA: number;
  riskPercentB: number;
  score: number; // Lower is better
  // Engine detection fields (populated by targetEngine / explosionEngine)
  engineType?: 'target' | 'explosion';
  targetSubType?: TargetSubType;
  explosionSubType?: ExplosionSubType;
  // For TARGET SINGOLO: which account is the target account (the one going to target)
  targetAccountId?: string;
  // For ESPLOSIONE SINGOLA: which account is the explosion candidate
  explosionAccountId?: string;
  // Asymmetric pips data (TARGET engine: lotti uguali, pips diverse)
  pipsA?: number;
  pipsB?: number;
  winAmountA?: number;
  winAmountB?: number;
  loseAmountA?: number;
  loseAmountB?: number;
  // JSON metadata for DB notes field
  targetMetaNotes?: string;
  // Internal marker for VIP manual pairing
  isManualSuggested?: boolean;
}

// Pre-calculated candidate for optimal matching algorithm
// Used in autoGenerateCrosses to find the BEST combination of crosses
// NOW includes unified scoring: TARGET/EXPLOSION detection is done DURING candidate building
interface CrossCandidate {
  accountA: MT5Account;
  accountB: MT5Account;
  phase: CrossablePhase;
  balanceDiff: number;
  stageDiff: number;
  riskA: number;
  riskB: number;
  maxStageDiff: number;
  maxBalanceDiff: number;
  // === UNIFIED SCORING SYSTEM ===
  // Detected engine type for this specific pair (null = normal trade)
  detectedEngineType?: 'target' | 'explosion' | null;
  // TARGET detection data (if applicable)
  targetPairData?: import('../logic/engines/targetEngine').DetectedTargetPair;
  // EXPLOSION detection data (if applicable)
  explosionMatchData?: import('../logic/engines/explosionEngine').ExplosionMatch;
  // Matching weight: lower = better. Incorporates scoring bonuses.
  // Normal: 1_000_000 + balanceDiff
  // Explosion: 950_000 + balanceDiff
  // Target Singolo: 900_000 + balanceDiff
  // Target Doppio: 800_000 + balanceDiff
  matchingWeight: number;
}

// Map of prop firm normalized names to their max risk percentages
export type PropFirmRiskMap = Record<string, number>;

export interface TradeCross {
  id: string;
  user_id: string;
  structure_id: string | null;
  symbol: string;
  risk_reward: string;
  risk_percentage: number;
  risk_percentage_a: number;  // Risk % for account A
  risk_percentage_b: number;  // Risk % for account B
  account_a_id: string;
  account_a_direction: string;
  account_a_lots: number;
  account_b_id: string;
  account_b_direction: string;
  account_b_lots: number;
  stage_difference: number;
  balance_difference: number;
  status: 'suggested' | 'approved' | 'executed' | 'closed' | 'cancelled';
  notes: string | null;
  created_at: string;
  updated_at: string;
  executed_at: string | null;
  closed_at?: string | null;  // When EA detected both trades closed
  is_active: boolean;  // Safety freeze: false = frozen (needs manual activation)
  weighted_type?: string | null;  // 'target' | 'explosion' | null
  weighted_account_id?: string | null;  // Account ID for weighted trades
  is_weighted?: boolean | null;
}

// Check if account is 5%ERS 
// Recognizes all naming patterns: 5%ERS, 5ERS, HS1- (Phase 1), HS2- (Phase 2), FHS- (Funded/Live)
function is5ERS(account: MT5Account): boolean {
  const name = account.prop_firm_name?.toUpperCase() || '';
  return (
    name.includes('5%ERS') || 
    name.includes('5ERS') || 
    name.includes('5 ERS') ||
    name.includes('HS1-') ||   // Pattern Fase 1
    name.includes('HS2-') ||   // Pattern Fase 2
    name.includes('FHS-') ||   // Pattern Funded/Live
    name.includes('FHS ')      // Variante con spazio
  );
}

// Get the standard balance for an account based on prop firm
// FIXED: Uses actual initial_balance to properly handle FHS-70K ($70k), FHS-60K ($60k), etc.
// Standard prop firms: $50,000
// 5%ERS accounts: Use actual initial_balance (60k or 70k depending on account)
export function getStandardBalance(account: MT5Account): number {
  // For 5%ERS accounts, use the actual initial_balance (supports 60k AND 70k accounts)
  if (is5ERS(account)) {
    return account.initial_balance || 60000;
  }
  // All other prop firms use $50,000 standard
  return 50000;
}

// ============================================
// PROPORTIONAL BALANCE NORMALIZATION
// ============================================
// Normalizes balance to a common $50,000 scale for matching
// This allows 5%ERS accounts ($60k or $70k) to match with standard accounts ($50k)
// when they have the same PROFIT PERCENTAGE (stage)
//
// Example:
// - FHS-70K: $69,902 (-0.14% of $70k) → normalized = $49,930 (-0.14% of $50k)
// - Standard: $49,930 (-0.14% of $50k) → normalized = $49,930
// - Difference: $0 (perfect match!)
export function getNormalizedBalance(account: MT5Account): number {
  const standardBase = 50000;
  const accountBase = getStandardBalance(account);
  const currentBalance = account.current_balance || account.initial_balance;
  
  // If account is already on $50k base, return actual balance
  if (accountBase === standardBase) {
    return currentBalance;
  }
  
  // Calculate profit/loss percentage based on account's ACTUAL baseline
  const profitPercent = (currentBalance - accountBase) / accountBase;
  
  // Apply the same percentage to the standard $50k scale
  return standardBase * (1 + profitPercent);
}

// Calculate proportional lots based on account balances
export function calculateProportionalLots(
  baseAccount: MT5Account,
  targetAccount: MT5Account,
  baseLots: number
): number {
  const baseStandard = getStandardBalance(baseAccount);
  const targetStandard = getStandardBalance(targetAccount);
  
  if (baseStandard === targetStandard) {
    return baseLots;
  }
  
  // If base is 50k and target is 60k, multiply by 1.2
  // If base is 60k and target is 50k, multiply by 0.833
  const ratio = targetStandard / baseStandard;
  return Math.round(baseLots * ratio * 100) / 100;
}

// Calculate stage difference between two accounts
function calculateStageDifference(accountA: MT5Account, accountB: MT5Account): number {
  const stageA = accountA.stage || 0;
  const stageB = accountB.stage || 0;
  return Math.abs(stageA - stageB);
}

// Calculate balance difference using NORMALIZED balances
// This allows 5%ERS accounts to match with standard accounts proportionally
// e.g.: 5%ERS at $60k and Standard at $50k both show $0 difference if at same stage
function calculateBalanceDifference(accountA: MT5Account, accountB: MT5Account): number {
  const normalizedA = getNormalizedBalance(accountA);
  const normalizedB = getNormalizedBalance(accountB);
  return Math.abs(normalizedA - normalizedB);
}

// Get risk percentage for an account based on prop firm rules
function getPropFirmRisk(account: MT5Account, riskMap: PropFirmRiskMap): number {
  const normalizedFirm = extractPropFirmName(account.prop_firm_name || '');
  if (!normalizedFirm) return 4; // Default to 4% if unknown
  return riskMap[normalizedFirm] ?? 4; // Default to 4% if not in map
}

// Calculate RR based on risk percentages of both accounts and phase
function calculateRiskRewardForPhase(
  riskA: number, 
  riskB: number,
  phase: CrossablePhase
): { rr: '1:1' | '1:2'; riskPercent: number; riskPercentA: number; riskPercentB: number } {
  // REGOLA LIVE: Sempre RR 1:1 con range 1.5% - 2.2%
  // Il rischio effettivo viene calcolato tramite generateVariableRisk con phase='live'
  if (phase === 'live') {
    // Base risk per LIVE è 2%, ma verrà variato tra 1.5% e 2.2% dalla generateVariableRisk
    return { 
      rr: '1:1', 
      riskPercent: 2, // Base value, will be varied by generateVariableRisk
      riskPercentA: 2, 
      riskPercentB: 2 
    };
  }
  
  // Challenge phases (fase1, fase2): logica normale
  if (riskA === riskB) {
    // Same risk max -> 1:1 at max allowed
    return { rr: '1:1', riskPercent: riskA, riskPercentA: riskA, riskPercentB: riskB };
  }
  // Different risks -> 1:2
  // The lower risk prop has potential advantage
  const minRisk = Math.min(riskA, riskB);
  return { rr: '1:2', riskPercent: minRisk, riskPercentA: riskA, riskPercentB: riskB };
}

// Get max stage difference based on risk (use the lower risk for the pair)
function getMaxStageDiff(riskA: number, riskB: number, phase: CrossablePhase): number {
  // In LIVE, tutti usano 2% quindi max 1 stage diff
  if (phase === 'live') {
    return 1;
  }
  
  const minRisk = Math.min(riskA, riskB);
  // 2% risk = max 1 stage diff, 3% risk = max 2 stage diff
  return minRisk <= 2 ? 1 : 2;
}

// Get max balance difference allowed based on risk combination and phase
// LIVE phase: $300 max (stricter for funded trading)
// Challenge phases: 
//   - $500 for both at 2% risk (symmetric 1:1)
//   - $700 for asymmetric 1:2 (mixed 2%+3%) OR for 3% risk tier at 1:1
//   - $1000 for both at 3% (max flexibility)
function getMaxBalanceDiff(riskA: number, riskB: number, phase?: string): number {
  // LIVE: max $300 (stricter limit for funded accounts)
  if (phase === 'live') {
    return 300;
  }
  
  // Both at 2% max risk: standard $500 limit (symmetric 1:1)
  if (riskA <= 2 && riskB <= 2) {
    return 500;
  }
  
  // ASYMMETRIC 1:2 (one at 2%, one at 3%): INCREASED to $700
  // This allows more matching opportunities when risk profiles differ
  if ((riskA <= 2 && riskB >= 3) || (riskA >= 3 && riskB <= 2)) {
    return 700;
  }
  
  // Both at 3% (5%ERS, FUNDING PIPS, FUNDED NEXT, FUNDER PRO): $700 for 1:1
  // This maximizes trades for high-risk tier prop firms
  if (riskA >= 3 && riskB >= 3) {
    return 700;
  }
  
  // Fallback
  return 700;
}

// Check if two accounts can be crossed (STRICT RULES)
// NOW: OR logic — passes if EITHER classic balance/stage rules OR target-distance equivalence
function canCross(
  accountA: MT5Account,
  accountB: MT5Account,
  maxStageDiff: number,
  maxBalanceDiff: number,
  targetRulesMap?: Record<string, { fase1: number; fase2: number }>,
  options?: { bypassDistanceRules?: boolean }
): { valid: boolean; reason?: string } {
  // Rule 1: MUST be same phase
  if (accountA.phase !== accountB.phase) {
    return { valid: false, reason: 'Fasi diverse' };
  }
  
  // Rule 2: MUST be different prop firms (NORMALIZED)
  const firmA = extractPropFirmName(accountA.prop_firm_name || '');
  const firmB = extractPropFirmName(accountB.prop_firm_name || '');
  
  if (!firmA || !firmB) {
    return { valid: false, reason: 'Prop firm non riconosciuta' };
  }
  
  if (firmA === firmB) {
    return { valid: false, reason: 'Stessa prop firm' };
  }
  
  // Rule 3: Both must be active
  if (accountA.account_status !== 'active' || accountB.account_status !== 'active') {
    return { valid: false, reason: 'Account non attivo' };
  }

  // ===== HARD LIMIT: ALPHA CAPITAL $1000 ABSOLUTE CAP =====
  // Uses NORMALIZED balances (not raw) to handle different baselines correctly.
  // e.g. 5%ERS $60k at Stage +1 ($60,589) normalizes to ~$50,491 on $50k scale,
  // so it can match Alpha Capital at $50,605 (diff ~$114, within $1000).
  const ALPHA_CAPITAL_HARD_LIMIT = 1000;
  const isAlphaA = firmA === 'ALPHA CAPITAL';
  const isAlphaB = firmB === 'ALPHA CAPITAL';

  if (isAlphaA || isAlphaB) {
    const normBalA = getNormalizedBalance(accountA);
    const normBalB = getNormalizedBalance(accountB);
    const normBalanceDiff = Math.abs(normBalA - normBalB);

    if (normBalanceDiff > ALPHA_CAPITAL_HARD_LIMIT) {
      console.log(`  🛑 ALPHA CAPITAL HARD LIMIT: ${firmA}(${accountA.id_identifier}) norm $${normBalA.toFixed(0)} vs ${firmB}(${accountB.id_identifier}) norm $${normBalB.toFixed(0)} → diff $${normBalanceDiff.toFixed(0)} > $${ALPHA_CAPITAL_HARD_LIMIT} → BLOCKED`);
      return { valid: false, reason: `Alpha Capital hard limit: norm diff $${normBalanceDiff.toFixed(0)} > $${ALPHA_CAPITAL_HARD_LIMIT}` };
    }
  }
  
  const stageDiff = calculateStageDifference(accountA, accountB);
  const balanceDiff = calculateBalanceDifference(accountA, accountB);

  if (options?.bypassDistanceRules) {
    return { valid: true };
  }
  
  // ===== CONDITION A (Classic): balance + stage within absolute limits =====
  const classicValid = stageDiff <= maxStageDiff && balanceDiff <= maxBalanceDiff;
  
  // ===== CONDITION B (Target Distance Equivalence): =====
  // Two accounts are compatible if the $ remaining to their respective targets
  // is within the same threshold, regardless of absolute balance/stage.
  // e.g. Alpha at +6% (target 10%, missing $2000) ≈ Goat at +3% (target 8%, missing $2500) → diff $500
  let targetDistanceValid = false;
  
  if (!classicValid && targetRulesMap && accountA.phase !== 'live') {
    // GUARD: Both accounts MUST be in profit for Condition B to activate
    const currentBalA = accountA.current_balance ?? accountA.initial_balance;
    const currentBalB = accountB.current_balance ?? accountB.initial_balance;
    const inProfitA = currentBalA > accountA.initial_balance;
    const inProfitB = currentBalB > accountB.initial_balance;
    
    if (inProfitA && inProfitB) {
      const rulesA = targetRulesMap[firmA];
      const rulesB = targetRulesMap[firmB];
      
      if (rulesA && rulesB) {
        const phase = accountA.phase as 'fase1' | 'fase2';
        const defaultTargetA = phase === 'fase1' ? rulesA.fase1 : rulesA.fase2;
        const defaultTargetB = phase === 'fase1' ? rulesB.fase1 : rulesB.fase2;
        const targetPercentA = (accountA as any).custom_target_percentage ?? defaultTargetA;
        const targetPercentB = (accountB as any).custom_target_percentage ?? defaultTargetB;
        
        if (targetPercentA > 0 && targetPercentB > 0) {
          const targetBalA = accountA.initial_balance * (1 + targetPercentA / 100);
          const targetBalB = accountB.initial_balance * (1 + targetPercentB / 100);
          const targetMancA = Math.max(0, targetBalA - currentBalA);
          const targetMancB = Math.max(0, targetBalB - currentBalB);
          const targetDistDiff = Math.abs(targetMancA - targetMancB);
          
          if (targetDistDiff <= maxBalanceDiff && stageDiff <= maxStageDiff + 2) {
            targetDistanceValid = true;
            console.log(`  → TARGET-EQUIV: ${firmA}(${accountA.id_identifier}) manca $${targetMancA.toFixed(0)} vs ${firmB}(${accountB.id_identifier}) manca $${targetMancB.toFixed(0)} → diff $${targetDistDiff.toFixed(0)} ≤ $${maxBalanceDiff} ✅`);
          }
        }
      }
    } else {
      console.log(`  → TARGET-EQUIV SKIP: ${!inProfitA ? firmA + '(' + accountA.id_identifier + ') in drawdown' : ''}${(!inProfitA && !inProfitB) ? ' + ' : ''}${!inProfitB ? firmB + '(' + accountB.id_identifier + ') in drawdown' : ''} → Condition B disabled`);
    }
  }
  
  if (!classicValid && !targetDistanceValid) {
    // Report the most useful rejection reason
    if (stageDiff > maxStageDiff && balanceDiff > maxBalanceDiff) {
      return { valid: false, reason: `Stage diff ${stageDiff} > ${maxStageDiff} AND Balance diff $${balanceDiff.toFixed(0)} > $${maxBalanceDiff}` };
    }
    if (stageDiff > maxStageDiff) {
      return { valid: false, reason: `Stage diff ${stageDiff} > max ${maxStageDiff}` };
    }
    return { valid: false, reason: `Balance diff $${balanceDiff.toFixed(0)} > max $${maxBalanceDiff}` };
  }
  
  return { valid: true };
}

// Group accounts by phase
function groupAccountsByPhase(accounts: MT5Account[]): Record<CrossablePhase, MT5Account[]> {
  const groups: Record<CrossablePhase, MT5Account[]> = {
    fase1: [],
    fase2: [],
    live: []
  };
  
  for (const account of accounts) {
    const phase = account.phase as CrossablePhase;
    if (phase && groups[phase]) {
      groups[phase].push(account);
    }
  }
  
  return groups;
}

// Helper function to extract USED ACCOUNT IDs from ACTIVE crosses
// Solo account con status 'closed' sono liberi per nuovi incroci
// 'approved' = pianificato ma non ancora eseguito → BLOCCATO
// 'executed' = trade aperto su MT5 (rilevato da EA) → BLOCCATO
// 'closed' = trade chiuso su MT5 (rilevato da EA) → LIBERO
export function getUsedAccountIds(crosses: TradeCross[]): Set<string> {
  const usedIds = new Set<string>();
  // Blocca account con status 'approved' O 'executed'
  // Solo 'closed' e 'cancelled' liberano l'account per nuovi match
  for (const cross of crosses.filter(c => c.status === 'approved' || c.status === 'executed')) {
    usedIds.add(cross.account_a_id);
    usedIds.add(cross.account_b_id);
  }
  return usedIds;
}

// Calculate daily risk already used for each account (THEORETICAL fallback)
// Used only in synchronous contexts (useMemo). For regeneration, use calculateDailyRiskUsedWithHistory.
export function calculateDailyRiskUsed(
  crosses: TradeCross[], 
  accounts: MT5Account[]
): Map<string, number> {
  const dailyRisk = new Map<string, number>();
  // "New day" starts at 23:00 (broker rollover)
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 0, 0, 0);
  if (now < today) today.setDate(today.getDate() - 1);
  
  const accountsMap = new Map(accounts.map(a => [a.id, a]));
  
  for (const cross of crosses) {
    const crossDate = new Date(cross.created_at);
    if (crossDate.getTime() < today.getTime()) continue;
    if (cross.status === 'cancelled') continue;
    
    const accountA = accountsMap.get(cross.account_a_id);
    const accountB = accountsMap.get(cross.account_b_id);
    
    if (accountA) {
      const balanceA = accountA.initial_balance || 50000;
      const riskA = balanceA * (cross.risk_percentage_a / 100);
      dailyRisk.set(cross.account_a_id, (dailyRisk.get(cross.account_a_id) || 0) + riskA);
    }
    
    if (accountB) {
      const balanceB = accountB.initial_balance || 50000;
      const riskB = balanceB * (cross.risk_percentage_b / 100);
      dailyRisk.set(cross.account_b_id, (dailyRisk.get(cross.account_b_id) || 0) + riskB);
    }
  }
  
  return dailyRisk;
}

// ============================================
// NEW: Calculate daily risk using REAL P&L from mt5_trades history
// ============================================
// Formula: Rischio_Totale = abs(Realized_Loss_Today) - Realized_Profit_Today + Latent_Risk_Open_Crosses
// If account is in profit today, the profit INCREASES the available margin (compound).
// This is used for regeneration filtering (Reload / Doppi Incroci).
export async function calculateDailyRiskUsedWithHistory(
  crosses: TradeCross[], 
  accounts: MT5Account[]
): Promise<Map<string, number>> {
  const dailyRisk = new Map<string, number>();
  // "New day" starts at 23:00 (broker rollover)
  const now2 = new Date();
  const today = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate(), 23, 0, 0, 0);
  if (now2 < today) today.setDate(today.getDate() - 1);
  
  const accountIds = accounts.map(a => a.id);
  if (accountIds.length === 0) return dailyRisk;
  
  // STEP 1: Fetch real P&L from mt5_trades for today's closed trades
  const { supabase } = await import('../lib/supabaseClient');
  const { data: todayTrades, error } = await supabase
    .from('mt5_trades')
    .select('mt5_account_id, profit')
    .eq('is_closed', true)
    .gte('exit_time', today.toISOString())
    .in('mt5_account_id', accountIds);
  
  if (error) {
    console.error('[RISK] Failed to fetch mt5_trades history, falling back to theoretical:', error);
    return calculateDailyRiskUsed(crosses, accounts);
  }
  
  // Sum realized P&L per account (profit is negative for losses, positive for wins)
  const realizedPnL = new Map<string, number>();
  for (const trade of (todayTrades || [])) {
    const pnl = trade.profit || 0;
    realizedPnL.set(trade.mt5_account_id, (realizedPnL.get(trade.mt5_account_id) || 0) + pnl);
  }
  
  console.log('[RISK] Realized P&L today:', Object.fromEntries(realizedPnL));
  
  // STEP 2: Calculate latent (theoretical) risk from open crosses (approved/executed only)
  const accountsMap = new Map(accounts.map(a => [a.id, a]));
  const latentRisk = new Map<string, number>();
  
  for (const cross of crosses) {
    const crossDate = new Date(cross.created_at);
    if (crossDate.getTime() < today.getTime()) continue;
    
    // Only approved/executed = still open, contributing latent risk
    if (cross.status !== 'approved' && cross.status !== 'executed') continue;
    
    const accountA = accountsMap.get(cross.account_a_id);
    const accountB = accountsMap.get(cross.account_b_id);
    
    if (accountA) {
      const balanceA = accountA.initial_balance || 50000;
      const riskA = balanceA * (cross.risk_percentage_a / 100);
      latentRisk.set(cross.account_a_id, (latentRisk.get(cross.account_a_id) || 0) + riskA);
    }
    
    if (accountB) {
      const balanceB = accountB.initial_balance || 50000;
      const riskB = balanceB * (cross.risk_percentage_b / 100);
      latentRisk.set(cross.account_b_id, (latentRisk.get(cross.account_b_id) || 0) + riskB);
    }
  }
  
  // STEP 3: Combine: Total Risk = -realizedPnL (loss=positive risk, profit=negative risk) + latentRisk
  // If account made $500 profit today → realizedPnL = +500 → risk contribution = -500 (frees margin)
  // If account lost $1000 today → realizedPnL = -1000 → risk contribution = +1000 (consumes margin)
  const allAccountIds = new Set([...realizedPnL.keys(), ...latentRisk.keys()]);
  
  for (const accountId of allAccountIds) {
    const pnl = realizedPnL.get(accountId) || 0;
    const latent = latentRisk.get(accountId) || 0;
    // Negative P&L (loss) increases risk used; Positive P&L (profit) decreases risk used
    const totalRisk = Math.max(0, -pnl + latent);
    dailyRisk.set(accountId, totalRisk);
  }
  
  console.log('[RISK] Total daily risk (real+latent):', Object.fromEntries(dailyRisk));
  
  return dailyRisk;
}

// Variable risk ranges for maximum diversification
// DEPRECATED: Now using prop_firm_risk_configs table
// Kept as FALLBACK only when no config is found
export const RISK_RANGES = {
  '2%': { min: 1.9, max: 2.4 },  // Per prop firm al 2% (Alpha, Fintokei, FTMO, Acqua, Goat, TTP)
  '3%': { min: 2.5, max: 3.1 }   // Per prop firm al 3% (5%ERS, Funded Next, Funder Pro, Funding Pips)
} as const;

// Get max daily risk allowed for an account for REGENERATION filtering
// GOAT FUNDED: 4% max daily drawdown
// All other firms: 5% max daily drawdown
export function getMaxDailyRisk(account: MT5Account): number {
  const initialBalance = account.initial_balance || (is5ERS(account) ? 60000 : 50000);
  const isGoat = (account.prop_firm_name || '').toUpperCase().includes('GOAT');
  const riskPercent = isGoat ? 0.04 : 0.05;
  return initialBalance * riskPercent;
}

// Check if an account has remaining risk budget for the day
export function hasRemainingDailyRisk(
  accountId: string,
  dailyRiskUsed: Map<string, number>,
  maxRisk: number,
  minRequired: number = 500
): boolean {
  const usedRisk = dailyRiskUsed.get(accountId) || 0;
  const remainingRisk = maxRisk - usedRisk;
  return remainingRisk >= minRequired;
}

// DEPRECATED: Now using prop_firm_risk_configs table  
export const LIVE_RISK_RANGE = { min: 1.5, max: 2.2 };

// ============================================
// NEW: RISK CONFIG FROM TABELLA OPERATIVITÀ
// ============================================
// Type for prop firm risk configuration from database
export interface PropFirmRiskConfigForTrade {
  prop_firm_name: string;
  fase_min_risk: number;
  fase_max_risk: number;
  esplosione_fase_risk: number;
  target_fase_min_risk: number;
  target_fase_max_risk: number;
  live_min_risk: number;
  live_max_risk: number;
  esplosione_live_risk: number;
}

export type PropFirmRiskConfigMap = Record<string, PropFirmRiskConfigForTrade>;

// Get risk range from config map for a prop firm based on phase and trade type
export function getRiskRangeFromConfig(
  propFirmName: string,
  phase: 'fase1' | 'fase2' | 'live',
  tradeType: 'normal' | 'target' | 'esplosione',
  riskConfigMap: PropFirmRiskConfigMap
): { minRisk: number; maxRisk: number } | null {
  const normalizedName = extractPropFirmName(propFirmName);
  const config = riskConfigMap[normalizedName] || riskConfigMap[propFirmName.toUpperCase()];
  
  if (!config) return null;
  
  if (phase === 'live') {
    if (tradeType === 'esplosione') {
      return { minRisk: config.esplosione_live_risk, maxRisk: config.esplosione_live_risk };
    }
    return { minRisk: config.live_min_risk, maxRisk: config.live_max_risk };
  } else {
    // Fase 1/2
    if (tradeType === 'esplosione') {
      return { minRisk: config.esplosione_fase_risk, maxRisk: config.esplosione_fase_risk };
    }
    if (tradeType === 'target') {
      return { minRisk: config.target_fase_min_risk, maxRisk: config.target_fase_max_risk };
    }
    return { minRisk: config.fase_min_risk, maxRisk: config.fase_max_risk };
  }
}

// Parse RISK_OVERRIDE from account fields (boolean flag + numeric value)
// Falls back to legacy text parsing for backward compatibility
export function parseRiskOverride(account: MT5Account): { type: 'percentage'; value: number } | null {
  // NEW: Use structured boolean flag + numeric value
  if (account.is_risk_override_active && account.risk_override_value != null && account.risk_override_value > 0) {
    return { type: 'percentage', value: account.risk_override_value };
  }
  return null;
}

// Apply 15% safety buffer to override risk value
// E.g. 1% → 0.85%, 0.5% → 0.425%
export const OVERRIDE_SAFETY_BUFFER = 0.15;

export function getBufferedOverrideRisk(overrideValue: number): number {
  return Math.round((overrideValue * (1 - OVERRIDE_SAFETY_BUFFER)) * 100) / 100;
}

// Check if either account in a pair has an active risk override
export function hasLimitedAccount(accountA: MT5Account, accountB: MT5Account): boolean {
  return !!(accountA.is_risk_override_active || accountB.is_risk_override_active);
}

// Generate variable risk from config (NEW: uses prop_firm_risk_configs table)
// NOW: checks for RISK_OVERRIDE via account's is_risk_override_active flag
export function generateVariableRiskFromConfig(
  propFirmName: string,
  phase: 'fase1' | 'fase2' | 'live',
  tradeType: 'normal' | 'target' | 'esplosione',
  riskConfigMap?: PropFirmRiskConfigMap,
  account?: MT5Account | null
): number {
  // PRIORITY 1: Check for RISK_OVERRIDE via structured fields
  if (account) {
    const override = parseRiskOverride(account);
    if (override) {
      const buffered = getBufferedOverrideRisk(override.value);
      console.log(`[RISK] RISK_OVERRIDE active for ${propFirmName}: ${override.value}% → buffered ${buffered}%`);
      return buffered;
    }
  }

  // PRIORITY 2: If config map is provided, use it
  if (riskConfigMap) {
    const range = getRiskRangeFromConfig(propFirmName, phase, tradeType, riskConfigMap);
    if (range) {
      const variable = range.minRisk + Math.random() * (range.maxRisk - range.minRisk);
      return Math.round(variable * 100) / 100;
    }
  }
  
  // Fallback to old logic if no config found
  if (phase === 'live') {
    const variable = LIVE_RISK_RANGE.min + Math.random() * (LIVE_RISK_RANGE.max - LIVE_RISK_RANGE.min);
    return Math.round(variable * 100) / 100;
  }
  
  // Default to 2% range if unknown
  const range = RISK_RANGES['2%'];
  const variable = range.min + Math.random() * (range.max - range.min);
  return Math.round(variable * 100) / 100;
}

// Generate variable risk within range for diversification (LEGACY - kept for backward compat)
// LIVE phase uses specific 1.5% - 2.2% range
export function generateVariableRisk(baseRisk: number, phase?: string): number {
  // LIVE ha range specifico 1.5% - 2.2%
  if (phase === 'live') {
    const variable = LIVE_RISK_RANGE.min + Math.random() * (LIVE_RISK_RANGE.max - LIVE_RISK_RANGE.min);
    return Math.round(variable * 100) / 100;
  }
  
  // Challenge phases (fase1, fase2): use standard ranges
  // Prop firm al 3% max -> range 2.5% - 3.1%
  // Prop firm al 2% max -> range 1.9% - 2.4%
  const range = baseRisk <= 2 ? RISK_RANGES['2%'] : RISK_RANGES['3%'];
  const variable = range.min + Math.random() * (range.max - range.min);
  return Math.round(variable * 100) / 100;
}

// ============================================
// HARD CAP RISK ENFORCEMENT
// ============================================
// After lot calculation and rounding, the actual risk % may exceed the configured max.
// This function reduces lots until actual risk is within the hard ceiling.

/**
 * Enforces that the actual risk % (calculated from lots, pips, pipValue, balance)
 * does not exceed the configured maximum risk for the prop firm.
 * Returns clamped lots if needed.
 */
export function enforceHardCapRisk(
  lots: number,
  slPips: number,
  pipValuePerLot: number,
  balance: number,
  maxRiskPercent: number,
  label?: string
): number {
  if (balance <= 0 || slPips <= 0 || maxRiskPercent <= 0) return lots;
  
  const actualRiskDollars = lots * pipValuePerLot * slPips;
  const actualRiskPercent = (actualRiskDollars / balance) * 100;
  
  if (actualRiskPercent <= maxRiskPercent) return lots;
  
  // Reduce lots to bring risk exactly to max
  const maxRiskDollars = balance * (maxRiskPercent / 100);
  let clampedLots = maxRiskDollars / (pipValuePerLot * slPips);
  clampedLots = Math.floor(clampedLots * 100) / 100; // Floor to ensure we stay UNDER
  clampedLots = Math.max(0.01, clampedLots);
  
  console.log(
    `[HARD CAP] ${label || ''} Risk ${actualRiskPercent.toFixed(2)}% > max ${maxRiskPercent}% → lots ${lots} → ${clampedLots}`
  );
  
  return clampedLots;
}

/**
 * Calculates the ACTUAL risk % from final lots, pips, pipValue, and balance.
 * Use this AFTER enforceHardCapRisk to get the true risk stored in the DB.
 */
export function calculateActualRiskPercent(
  lots: number,
  slPips: number,
  pipValuePerLot: number,
  balance: number
): number {
  if (balance <= 0 || slPips <= 0 || lots <= 0) return 0;
  const riskDollars = lots * pipValuePerLot * slPips;
  return (riskDollars / balance) * 100;
}

/**
 * Gets the hard cap max risk % for an account based on phase and trade type.
 * Returns null if no config is found.
 */
export function getHardCapMaxRisk(
  account: MT5Account,
  tradeType: 'normal' | 'target' | 'esplosione',
  riskConfigMap?: PropFirmRiskConfigMap
): number | null {
  if (!riskConfigMap) return null;
  
  // If account has risk override, the hard cap is the override value itself (not buffered)
  if (account.is_risk_override_active && account.risk_override_value != null && account.risk_override_value > 0) {
    return account.risk_override_value;
  }
  
  const firmName = extractPropFirmName(account.prop_firm_name || '');
  const phase = (account.phase || 'fase1') as 'fase1' | 'fase2' | 'live';
  const range = getRiskRangeFromConfig(firmName, phase, tradeType, riskConfigMap);
  return range ? range.maxRisk : null;
}

// Calculate expected profit in dollars
export function calculateExpectedProfit(balance: number, riskPercent: number): number {
  return balance * (riskPercent / 100);
}

// Calculate expected loss in dollars based on lots, SL pips, and symbol
export function calculateExpectedLoss(lots: number, slPips: number, symbol: string): number {
  const pipValue = PIP_VALUES[symbol] || 10;
  return lots * pipValue * slPips;
}

// ============================================
// CURRENCY PAIR CORRELATION MAP (Anti-Hedging)
// ============================================
// DIRECT correlations: same direction (BUY EUR/USD → BUY GBP/USD)
// INVERSE correlations: opposite direction (BUY EUR/USD → SELL USD/CHF)

type CorrelationType = 'direct' | 'inverse';

interface CorrelationEntry {
  symbol: AllowedSymbol;
  type: CorrelationType;
}

// Build correlation map: for each symbol, list all correlated symbols
const CORRELATION_PAIRS: { symbols: AllowedSymbol[]; type: CorrelationType }[] = [
  // DIRECT correlations (move together)
  { symbols: ['EURUSD', 'GBPUSD'], type: 'direct' },
  { symbols: ['AUDUSD', 'NZDUSD'], type: 'direct' },
  { symbols: ['EURJPY', 'GBPJPY'], type: 'direct' },
  { symbols: ['EURJPY', 'USDJPY'], type: 'direct' },
  { symbols: ['GBPJPY', 'USDJPY'], type: 'direct' },
  // INVERSE correlations (move opposite)
  { symbols: ['EURUSD', 'USDCHF'], type: 'inverse' },
  { symbols: ['GBPUSD', 'USDCHF'], type: 'inverse' },
];

// Pre-computed lookup: symbol → list of correlated symbols with type
const CORRELATION_MAP: Record<string, CorrelationEntry[]> = {};

for (const pair of CORRELATION_PAIRS) {
  const [a, b] = pair.symbols;
  if (!CORRELATION_MAP[a]) CORRELATION_MAP[a] = [];
  if (!CORRELATION_MAP[b]) CORRELATION_MAP[b] = [];
  CORRELATION_MAP[a].push({ symbol: b, type: pair.type });
  CORRELATION_MAP[b].push({ symbol: a, type: pair.type });
}

/**
 * Given a prop firm's existing direction on a correlated symbol,
 * determine what direction is REQUIRED for a new symbol.
 * Returns the required direction, or null if no constraint.
 */
function getCorrelationRequiredDirection(
  newSymbol: AllowedSymbol,
  propFirmDirections: Map<AllowedSymbol, 'BUY' | 'SELL'>
): 'BUY' | 'SELL' | null {
  const correlations = CORRELATION_MAP[newSymbol];
  if (!correlations) return null;
  
  for (const corr of correlations) {
    const existingDir = propFirmDirections.get(corr.symbol);
    if (!existingDir) continue;
    
    if (corr.type === 'direct') {
      // Direct correlation: SAME direction required
      return existingDir;
    } else {
      // Inverse correlation: OPPOSITE direction required
      return existingDir === 'BUY' ? 'SELL' : 'BUY';
    }
  }
  return null;
}

/**
 * Check if a symbol has ANY correlation conflict with existing directions of a prop firm.
 * Returns true if the symbol is safe (no conflict or can be resolved).
 */
function hasCorrelationConflict(
  symbol: AllowedSymbol,
  propFirmDirections: Map<AllowedSymbol, 'BUY' | 'SELL'>
): boolean {
  const correlations = CORRELATION_MAP[symbol];
  if (!correlations) return false;
  
  // Collect all required directions from correlations
  let requiredDirection: 'BUY' | 'SELL' | null = null;
  
  for (const corr of correlations) {
    const existingDir = propFirmDirections.get(corr.symbol);
    if (!existingDir) continue;
    
    const needed = corr.type === 'direct' ? existingDir : (existingDir === 'BUY' ? 'SELL' : 'BUY');
    
    if (requiredDirection === null) {
      requiredDirection = needed;
    } else if (requiredDirection !== needed) {
      // Contradictory constraints from multiple correlations — conflict!
      return true;
    }
  }
  return false;
}

// ============================================
// ID + PROP FIRM SYMBOL & DIRECTION TRACKER
// ============================================
// Tracks symbol usage and fixed directions per ID + Prop Firm combination
// Key format: "id_identifier::NORMALIZED_PROP_FIRM"
// This ensures that the same ID with multiple accounts of the same prop firm
// will have CONSISTENT directions for the same symbol
export type IdPropFirmSymbolTracker = Record<string, {
  usedSymbols: Set<AllowedSymbol>;
  symbolDirection: Map<AllowedSymbol, 'BUY' | 'SELL'>;
  symbolUsageCount: Map<AllowedSymbol, number>;
  lotsUsed: Set<string>; // Track used lot values for diversification
}>;

// ============================================
// GLOBAL PROP FIRM DIRECTION TRACKER
// ============================================
// Global direction tracker per PROP FIRM (not per ID+PropFirm)
// Key is ONLY the normalized prop firm name
// This ensures ALL accounts of the SAME PROP FIRM (regardless of ID) have the 
// SAME direction for the same symbol
// e.g.: FINTOKEI + EURUSD = SELL for ALL FINTOKEI accounts (gianni, mattia, etc.)
// NOW ALSO ENFORCES: correlation-based direction constraints (anti-hedging)
export type PropFirmDirectionTracker = Record<string, {
  symbolDirection: Map<AllowedSymbol, 'BUY' | 'SELL'>;
}>;

// Initialize global prop firm direction tracker
export function ensurePropFirmDirectionTrackerInitialized(
  tracker: PropFirmDirectionTracker, 
  propFirm: string
): void {
  if (!tracker[propFirm]) {
    tracker[propFirm] = {
      symbolDirection: new Map()
    };
  }
}

// Generate tracker key from account (id_identifier::normalized_prop_firm)
export function getTrackerKey(account: MT5Account): string {
  const normalizedFirm = extractPropFirmName(account.prop_firm_name || '');
  return `${account.id_identifier}::${normalizedFirm}`;
}

// Initialize tracker for an ID+PropFirm combination if not exists
export function ensureTrackerInitialized(tracker: IdPropFirmSymbolTracker, key: string): void {
  if (!tracker[key]) {
    tracker[key] = {
      usedSymbols: new Set(),
      symbolDirection: new Map(),
      symbolUsageCount: new Map(),
      lotsUsed: new Set()
    };
  }
}

// Generate diversified lots to avoid duplicates within same ID+PropFirm
// Also accepts optional globalUsedLots array to avoid duplicates across ALL crosses in session
function generateDiversifiedLots(
  account: MT5Account,
  phase: string,
  riskPercent: number,
  symbol: string,
  tracker: IdPropFirmSymbolTracker,
  globalUsedLots: number[] = []
): number {
  const rangeKey = getRangeKey(phase, riskPercent);
  const range = TRADING_RANGES[rangeKey]?.[symbol];
  
  if (!range) {
    return 5 + Math.random() * 3;
  }
  
  const key = getTrackerKey(account);
  ensureTrackerInitialized(tracker, key);
  
  // Combine local tracker and global used lots
  const allUsedLots = new Set<string>();
  for (const lot of tracker[key].lotsUsed) {
    allUsedLots.add(lot);
  }
  for (const lot of globalUsedLots) {
    allUsedLots.add(lot.toFixed(2));
  }
  
  // Try to generate unique lots (up to 25 attempts)
  let attempts = 0;
  let lots: number;
  
  do {
    lots = range.minLots + Math.random() * (range.maxLots - range.minLots);
    lots = Math.round(lots * 100) / 100;
    attempts++;
  } while (
    allUsedLots.has(lots.toFixed(2)) && 
    attempts < 25
  );
  
  // If still duplicate, apply micro-adjustments
  if (allUsedLots.has(lots.toFixed(2))) {
    for (let offset = 0.01; offset <= 0.15; offset += 0.01) {
      const adjustedUp = Math.round((lots + offset) * 100) / 100;
      const adjustedDown = Math.round((lots - offset) * 100) / 100;
      
      if (!allUsedLots.has(adjustedUp.toFixed(2)) && adjustedUp <= range.maxLots) {
        lots = adjustedUp;
        break;
      }
      if (!allUsedLots.has(adjustedDown.toFixed(2)) && adjustedDown >= range.minLots) {
        lots = adjustedDown;
        break;
      }
    }
  }
  
  tracker[key].lotsUsed.add(lots.toFixed(2));
  
  return lots;
}

// Shuffle an array in place (Fisher-Yates)
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Get session symbols and non-session symbols as two separate shuffled lists.
// Called ONCE per generation batch so the shuffle is stable within a batch,
// but the rotation index offsets into them differently per trade.
export function getSessionSymbolLists(): { sessionSymbols: AllowedSymbol[]; otherSymbols: AllowedSymbol[] } {
  const { session } = getActiveSession();
  
  if (!session) {
    // FUORI SESSIONE: all symbols go into "session" bucket (treated equally)
    return {
      sessionSymbols: shuffleArray([...ALLOWED_SYMBOLS] as AllowedSymbol[]),
      otherSymbols: []
    };
  }
  
  const sessionSyms = shuffleArray([...session.symbols] as AllowedSymbol[]);
  const otherSyms = shuffleArray(
    (ALLOWED_SYMBOLS.filter(s => !session.symbols.includes(s)) as AllowedSymbol[])
  );
  
  return { sessionSymbols: sessionSyms, otherSymbols: otherSyms };
}

// ============================================
// WEIGHTED SYMBOL SELECTION
// ============================================
// XAUUSD gets weight=3 (3x more likely), all others weight=1.
// The weighted random pick runs BEFORE rotation/session logic,
// so the bias applies uniformly across all engines.

const SYMBOL_WEIGHTS: Partial<Record<AllowedSymbol, number>> = {
  'XAUUSD': 3,
};

function getSymbolWeight(sym: AllowedSymbol): number {
  return SYMBOL_WEIGHTS[sym] ?? 1;
}

/**
 * Weighted shuffle: reorders an array so that higher-weight symbols
 * appear earlier, using a random draw proportional to their weight.
 * This preserves variance (no symbol is guaranteed first) while
 * statistically favouring heavier symbols.
 */
function weightedShuffle(symbols: AllowedSymbol[]): AllowedSymbol[] {
  const items = symbols.map(s => ({ symbol: s, sort: Math.random() ** (1 / getSymbolWeight(s)) }));
  items.sort((a, b) => b.sort - a.sort);
  return items.map(i => i.symbol);
}

// Build a rotated symbol list for a specific trade using:
//   1) 50/50 probability roll (session vs non-session symbols)
//   2) Weighted shuffle within each pool (XAUUSD bias x3)
//   3) Rotation index to offset starting position
// Returns ALL symbols ordered by priority for this specific trade.
export function getRotatedSymbolList(
  sessionSymbols: AllowedSymbol[],
  otherSymbols: AllowedSymbol[],
  rotationIndex: number
): AllowedSymbol[] {
  // If FUORI SESSIONE (otherSymbols empty), weighted-shuffle the full list
  if (otherSymbols.length === 0) {
    return weightedShuffle([...sessionSymbols]);
  }
  
  // 50/50 ROLL: decide which pool to try FIRST
  const roll = Math.random();
  const useSessionFirst = roll <= 0.50;
  
  // Weighted shuffle within each pool
  const shuffledSession = weightedShuffle([...sessionSymbols]);
  const shuffledOther = weightedShuffle([...otherSymbols]);
  
  if (useSessionFirst) {
    console.log(`[SYMBOL-50/50] Roll=${roll.toFixed(3)} → SESSION FIRST (50%) [XAUUSD bias x3]`);
    return [...shuffledSession, ...shuffledOther];
  } else {
    console.log(`[SYMBOL-50/50] Roll=${roll.toFixed(3)} → OTHER FIRST (50%) [XAUUSD bias x3]`);
    return [...shuffledOther, ...shuffledSession];
  }
}

// LEGACY: Get UNIQUE symbols ordered by session preference (kept for backward compat)
export function getSessionOrderedUniqueSymbols(): AllowedSymbol[] {
  const { sessionSymbols, otherSymbols } = getSessionSymbolLists();
  return [...sessionSymbols, ...otherSymbols];
}

// Get weighted symbols based on Italian time session (50/50 rule)
// During active sessions: 50% probability for session symbols, 50% for others
// Outside sessions: all 16 symbols equally available
export function getSessionWeightedSymbols(operatorName?: OperatorName): AllowedSymbol[] {
  const { session } = getActiveSession();
  
  if (!session) {
    // FUORI SESSIONE: all symbols equally available
    return [...ALLOWED_SYMBOLS];
  }
  
  // Build 50/50 weighted array
  const sessionSyms = session.symbols.filter(s => ALLOWED_SYMBOLS.includes(s)) as AllowedSymbol[];
  const otherSyms = (ALLOWED_SYMBOLS as readonly string[]).filter(
    s => !sessionSyms.includes(s as AllowedSymbol)
  ) as AllowedSymbol[];
  
  const weighted: AllowedSymbol[] = [];
  
  // 50% session, 50% others
  for (let i = 0; i < 5; i++) {
    weighted.push(...sessionSyms);
  }
  for (let i = 0; i < 5; i++) {
    weighted.push(...otherSyms);
  }
  
  // Shuffle to avoid predictable patterns
  for (let i = weighted.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [weighted[i], weighted[j]] = [weighted[j], weighted[i]];
  }
  
  return weighted;
}

// SESSION-AWARE SYMBOL SELECTION with CORRELATION AWARENESS
// Uses Italian time-based 50/50 rule for symbol weighting
// NOW: Prioritizes symbols NOT correlated with already-used symbols for same ID+PropFirm
export function selectBestSymbol(
  accountA: MT5Account,
  accountB: MT5Account,
  tracker: IdPropFirmSymbolTracker,
  globalCrossIndex: number,
  operatorName?: OperatorName  // DEPRECATED — kept for signature compat, ignored
): AllowedSymbol {
  const keyA = getTrackerKey(accountA);
  const keyB = getTrackerKey(accountB);
  
  ensureTrackerInitialized(tracker, keyA);
  ensureTrackerInitialized(tracker, keyB);
  
  // Get time-based weighted symbol array (70/30 rule)
  const symbolArray = getSessionWeightedSymbols();
  
  // Collect symbols already used by BOTH accounts' ID+PropFirm trackers
  const usedSymbolsA = tracker[keyA].usedSymbols;
  const usedSymbolsB = tracker[keyB].usedSymbols;
  
  // Build set of correlated symbols to deprioritize
  const correlatedSymbols = new Set<AllowedSymbol>();
  for (const usedSym of [...usedSymbolsA, ...usedSymbolsB]) {
    const correlations = CORRELATION_MAP[usedSym];
    if (correlations) {
      for (const corr of correlations) {
        correlatedSymbols.add(corr.symbol);
      }
    }
    correlatedSymbols.add(usedSym); // also deprioritize the exact same symbol
  }
  
  // Try to find a non-correlated symbol first (starting from globalCrossIndex for rotation)
  let selectedSymbol: AllowedSymbol | null = null;
  
  // Pass 1: prefer non-correlated, non-used symbols
  for (let offset = 0; offset < symbolArray.length; offset++) {
    const idx = (globalCrossIndex + offset) % symbolArray.length;
    const candidate = symbolArray[idx];
    if (!correlatedSymbols.has(candidate)) {
      selectedSymbol = candidate;
      break;
    }
  }
  
  // Pass 2: fallback — accept correlated but prefer least-used
  if (!selectedSymbol) {
    const idx = globalCrossIndex % symbolArray.length;
    selectedSymbol = symbolArray[idx];
  }
  
  // Register in tracker
  tracker[keyA].usedSymbols.add(selectedSymbol);
  const countA = tracker[keyA].symbolUsageCount.get(selectedSymbol) || 0;
  tracker[keyA].symbolUsageCount.set(selectedSymbol, countA + 1);
  
  tracker[keyB].usedSymbols.add(selectedSymbol);
  const countB = tracker[keyB].symbolUsageCount.get(selectedSymbol) || 0;
  tracker[keyB].symbolUsageCount.set(selectedSymbol, countB + 1);
  
  return selectedSymbol;
}

// Get or assign a consistent direction for an ID+PropFirm on a specific symbol
// CRITICAL: Same ID + Same PropFirm + Same Symbol = SAME DIRECTION
export function getDirectionForIdPropFirm(
  account: MT5Account,
  symbol: AllowedSymbol,
  tracker: IdPropFirmSymbolTracker
): 'BUY' | 'SELL' {
  const key = getTrackerKey(account);
  ensureTrackerInitialized(tracker, key);
  
  // If this ID+PropFirm already has a direction for this symbol, use it
  // This ensures all accounts of the same ID+PropFirm have the same direction for the same symbol
  const existingDirection = tracker[key].symbolDirection.get(symbol);
  if (existingDirection) {
    return existingDirection;
  }
  
  // First time using this symbol for this ID+PropFirm - assign random direction
  const direction: 'BUY' | 'SELL' = Math.random() > 0.5 ? 'BUY' : 'SELL';
  tracker[key].symbolDirection.set(symbol, direction);
  
  return direction;
}

// ============================================
// CONSISTENT DIRECTIONS FOR CROSS TRADES
// ============================================
// Get directions for BOTH accounts ensuring directional consistency at PROP FIRM LEVEL
// CRITICAL: Same PROP FIRM (regardless of ID) + Same Symbol = SAME DIRECTION
// CRITICAL: Also enforces CORRELATION-BASED ANTI-HEDGING constraints:
//   - Direct correlation (EURUSD↔GBPUSD): same direction required
//   - Inverse correlation (EURUSD↔USDCHF): opposite direction required
// Returns null if the cross is impossible
export function getConsistentDirections(
  accountA: MT5Account,
  accountB: MT5Account,
  symbol: AllowedSymbol,
  propFirmTracker: PropFirmDirectionTracker
): { directionA: 'BUY' | 'SELL'; directionB: 'BUY' | 'SELL' } | null {
  const propFirmA = extractPropFirmName(accountA.prop_firm_name || '');
  const propFirmB = extractPropFirmName(accountB.prop_firm_name || '');
  
  if (!propFirmA || !propFirmB) return null;
  
  ensurePropFirmDirectionTrackerInitialized(propFirmTracker, propFirmA);
  ensurePropFirmDirectionTrackerInitialized(propFirmTracker, propFirmB);
  
  // STEP 1: Check direct symbol registration
  const existingA = propFirmTracker[propFirmA].symbolDirection.get(symbol);
  const existingB = propFirmTracker[propFirmB].symbolDirection.get(symbol);
  
  // STEP 2: Check CORRELATION constraints for each prop firm
  const correlReqA = getCorrelationRequiredDirection(symbol, propFirmTracker[propFirmA].symbolDirection);
  const correlReqB = getCorrelationRequiredDirection(symbol, propFirmTracker[propFirmB].symbolDirection);
  
  // Determine effective direction for A (direct registration takes priority, then correlation)
  const effectiveA = existingA ?? correlReqA;
  // Determine effective direction for B
  const effectiveB = existingB ?? correlReqB;
  
  // Case 1: Both have effective directions
  if (effectiveA && effectiveB) {
    if (effectiveA === effectiveB) {
      // Same direction — impossible to cross
      console.log(`[DIRECTION] ❌ ${propFirmA}+${propFirmB} on ${symbol}: both ${effectiveA} (correl conflict)`);
      return null;
    }
    // Opposite — perfect
    propFirmTracker[propFirmA].symbolDirection.set(symbol, effectiveA);
    propFirmTracker[propFirmB].symbolDirection.set(symbol, effectiveB);
    return { directionA: effectiveA, directionB: effectiveB };
  }
  
  // Case 2: Only A has effective direction — B takes opposite
  if (effectiveA) {
    const directionB: 'BUY' | 'SELL' = effectiveA === 'BUY' ? 'SELL' : 'BUY';
    // Check B's correlation doesn't conflict with the assigned direction
    if (correlReqB && correlReqB !== directionB) {
      console.log(`[DIRECTION] ❌ ${propFirmB} correl conflict on ${symbol}: needs ${correlReqB} but cross requires ${directionB}`);
      return null;
    }
    propFirmTracker[propFirmA].symbolDirection.set(symbol, effectiveA);
    propFirmTracker[propFirmB].symbolDirection.set(symbol, directionB);
    return { directionA: effectiveA, directionB };
  }
  
  // Case 3: Only B has effective direction — A takes opposite
  if (effectiveB) {
    const directionA: 'BUY' | 'SELL' = effectiveB === 'BUY' ? 'SELL' : 'BUY';
    if (correlReqA && correlReqA !== directionA) {
      console.log(`[DIRECTION] ❌ ${propFirmA} correl conflict on ${symbol}: needs ${correlReqA} but cross requires ${directionA}`);
      return null;
    }
    propFirmTracker[propFirmA].symbolDirection.set(symbol, directionA);
    propFirmTracker[propFirmB].symbolDirection.set(symbol, effectiveB);
    return { directionA, directionB: effectiveB };
  }
  
  // Case 4: Neither has direction — assign randomly
  const directionA: 'BUY' | 'SELL' = Math.random() > 0.5 ? 'BUY' : 'SELL';
  const directionB: 'BUY' | 'SELL' = directionA === 'BUY' ? 'SELL' : 'BUY';
  
  propFirmTracker[propFirmA].symbolDirection.set(symbol, directionA);
  propFirmTracker[propFirmB].symbolDirection.set(symbol, directionB);
  
  return { directionA, directionB };
}

// Register symbol usage for an ID+PropFirm combination
export function registerSymbolUsage(
  account: MT5Account,
  symbol: AllowedSymbol,
  tracker: IdPropFirmSymbolTracker
): void {
  const key = getTrackerKey(account);
  ensureTrackerInitialized(tracker, key);
  
  tracker[key].usedSymbols.add(symbol);
  const currentCount = tracker[key].symbolUsageCount.get(symbol) || 0;
  tracker[key].symbolUsageCount.set(symbol, currentCount + 1);
}

// Pre-load directions from existing crosses in database at PROP FIRM level
// This ensures directional consistency: ALL accounts of the same prop firm
// have the same direction for the same symbol
// NOW ALSO: Propagates correlation-based directions so correlated pairs are consistent
export function preloadDirectionsFromCrosses(
  existingCrosses: TradeCross[],
  accounts: MT5Account[]
): PropFirmDirectionTracker {
  const propFirmTracker: PropFirmDirectionTracker = {};
  const accountsMap = new Map(accounts.map(a => [a.id, a]));
  
  for (const cross of existingCrosses) {
    if (cross.status !== 'approved' && cross.status !== 'executed') continue;
    
    const accountA = accountsMap.get(cross.account_a_id);
    const accountB = accountsMap.get(cross.account_b_id);
    if (!accountA || !accountB) continue;
    
    const symbol = cross.symbol as AllowedSymbol;
    if (!ALLOWED_SYMBOLS.includes(symbol)) continue;
    
    const propFirmA = extractPropFirmName(accountA.prop_firm_name || '');
    const propFirmB = extractPropFirmName(accountB.prop_firm_name || '');
    
    if (propFirmA) {
      ensurePropFirmDirectionTrackerInitialized(propFirmTracker, propFirmA);
      propFirmTracker[propFirmA].symbolDirection.set(symbol, cross.account_a_direction as 'BUY' | 'SELL');
    }
    
    if (propFirmB) {
      ensurePropFirmDirectionTrackerInitialized(propFirmTracker, propFirmB);
      propFirmTracker[propFirmB].symbolDirection.set(symbol, cross.account_b_direction as 'BUY' | 'SELL');
    }
  }
  
  // PROPAGATE correlation-based directions
  // For each prop firm, if it has a direction on symbol X, propagate to correlated symbols
  for (const propFirm of Object.keys(propFirmTracker)) {
    const directions = propFirmTracker[propFirm].symbolDirection;
    const toPropagate: [AllowedSymbol, 'BUY' | 'SELL'][] = [];
    
    for (const [sym, dir] of directions.entries()) {
      const correlations = CORRELATION_MAP[sym];
      if (!correlations) continue;
      
      for (const corr of correlations) {
        // Only propagate if the correlated symbol doesn't already have a direction
        if (directions.has(corr.symbol)) continue;
        
        const impliedDir: 'BUY' | 'SELL' = corr.type === 'direct' 
          ? dir 
          : (dir === 'BUY' ? 'SELL' : 'BUY');
        
        toPropagate.push([corr.symbol, impliedDir]);
      }
    }
    
    for (const [sym, dir] of toPropagate) {
      directions.set(sym, dir);
      console.log(`[PRELOAD-CORREL] ${propFirm}: ${sym} → ${dir} (propagated from correlation)`);
    }
  }
  
  return propFirmTracker;
}

// Return type for autoGenerateCrosses - includes suggestions AND updated usedAccountIds
export interface AutoGenerateCrossesResult {
  suggestions: CrossSuggestion[];
  usedAccountIdsAfter: Set<string>;  // Account IDs used after generation (for chaining with weighted)
}

export interface AutoGenerateCrossesOptions {
  bypassDistanceRules?: boolean;
  manualSuggested?: boolean;
}

// AUTO-GENERATE all possible crosses for all phases
// UNIFIED ENGINE: Integrates TARGET, EXPLOSION and NORMAL detection into a single scoring system.
// For each valid pair, the engine detects if it qualifies as TARGET DOPPIO/SINGOLO or EXPLOSION,
// assigns a weighted score, and uses Maximum Matching to find the combination that:
//   1. Maximizes total number of trades (absolute priority)
//   2. Prefers TARGET/EXPLOSION pairs as tie-breakers (scoring bonus)
//
// SCORING SYSTEM (lower weight = preferred by matching):
//   Normal:           1,000,000 + balanceDiff
//   Explosion:          950,000 + balanceDiff  (+50 bonus)
//   Target Singolo:     900,000 + balanceDiff  (+100 bonus)
//   Target Doppio:      800,000 + balanceDiff  (+200 bonus)
export function autoGenerateCrosses(
  accounts: MT5Account[],
  riskMap: PropFirmRiskMap = {},
  usedAccountIds: Set<string> = new Set(),
  existingCrosses: TradeCross[] = [],
  sharedPropFirmTracker?: PropFirmDirectionTracker,
  operatorName?: OperatorName,
  pipRangeConfigs?: PipRangeConfig[],
  dynamicPipValues?: Record<string, number>,
  riskConfigMap?: PropFirmRiskConfigMap,
  externalUsedPairs?: Set<string>,
  // NEW: Target rules for unified scoring (pass from generateCrossesForPhase)
  targetRulesMap?: Record<string, { fase1: number; fase2: number }>,
  options?: AutoGenerateCrossesOptions
): AutoGenerateCrossesResult {
  const suggestions: CrossSuggestion[] = [];
  const activeAccounts = accounts.filter(a => a.account_status === 'active');
  const phaseGroups = groupAccountsByPhase(activeAccounts);
  
  // Track used accounts to avoid duplicates - UN ACCOUNT = UN SOLO INCROCIO
  const usedAccounts = new Set<string>(usedAccountIds);
  
  // DEBUG: Log accounts already excluded from normal trade generation
  console.log(`[AUTO-GENERATE] Starting with ${usedAccountIds.size} pre-excluded accounts:`);
  for (const excludedId of usedAccountIds) {
    const account = accounts.find(a => a.id === excludedId);
    if (account) {
      console.log(`  → EXCLUDED: ${account.prop_firm_name} (${account.id_identifier}) - Balance: $${(account.current_balance || account.initial_balance).toFixed(0)}`);
    }
  }
  
  // USE SHARED TRACKER if provided, otherwise create new one from existing crosses
  // This is the KEY FIX: when called from Trades.tsx with a shared tracker,
  // normal crosses and weighted crosses will share the same direction state
  const propFirmDirectionTracker: PropFirmDirectionTracker = sharedPropFirmTracker ?? preloadDirectionsFromCrosses(existingCrosses, accounts);
  
  // Symbol tracker for lots diversification (still uses ID+PropFirm)
  const symbolTracker: IdPropFirmSymbolTracker = {};
  
  // Collect lots already used in existing crosses (per symbol) to avoid duplicates
  const existingLotsPerSymbol = new Map<string, number[]>();
  for (const cross of existingCrosses) {
    if (cross.status === 'cancelled' || cross.status === 'closed') continue;
    const current = existingLotsPerSymbol.get(cross.symbol) || [];
    current.push(cross.account_a_lots, cross.account_b_lots);
    existingLotsPerSymbol.set(cross.symbol, current);
  }
  
  // GLOBAL CROSS COUNTER for symbol rotation — each trade offsets into the symbol list
  let globalCrossCounter = 0;
  
  // Pre-shuffle session/other symbol pools ONCE per generation batch
  const { sessionSymbols: batchSessionSymbols, otherSymbols: batchOtherSymbols } = getSessionSymbolLists();
  
  // BATCH-LEVEL PAIR DIVERSIFICATION: Track symbols used in this generation batch
  // Includes symbols from weighted engines (TARGET/EXPLOSION) if provided
  const batchUsedPairs = new Set<string>(externalUsedPairs || []);
  
  // Process each phase separately
  for (const phase of ['fase1', 'fase2', 'live'] as CrossablePhase[]) {
    const phaseAccounts = phaseGroups[phase];
    if (phaseAccounts.length < 2) continue;
    
    // Group by NORMALIZED prop firm within this phase
    const propFirmGroups: Record<string, MT5Account[]> = {};
    for (const account of phaseAccounts) {
      const normalizedFirm = extractPropFirmName(account.prop_firm_name || '');
      if (!normalizedFirm) continue;
      if (!propFirmGroups[normalizedFirm]) propFirmGroups[normalizedFirm] = [];
      propFirmGroups[normalizedFirm].push(account);
    }
    
    const propFirms = Object.keys(propFirmGroups);
    if (propFirms.length < 2) continue;
    
    // ======= MAJORITY FIRM DETECTION =======
    // Identify the prop firm with most FREE accounts in this phase.
    // Pairs containing a majority-firm account get a large weight REDUCTION
    // (lower weight = higher priority in minimum-weight matching),
    // forcing the algorithm to prioritize clearing the bottleneck.
    const firmFreeCounts: Record<string, number> = {};
    for (const firm of propFirms) {
      firmFreeCounts[firm] = propFirmGroups[firm].filter(a => !usedAccounts.has(a.id)).length;
    }
    const sortedFirms = Object.entries(firmFreeCounts).sort((a, b) => b[1] - a[1]);
    const majorityFirm = sortedFirms.length > 0 && sortedFirms[0][1] >= 3 ? sortedFirms[0][0] : null;
    const MAJORITY_BONUS = 5_000_000; // Large negative bonus (subtracted from weight)
    
    if (majorityFirm) {
      console.log(`[MAJORITY] Phase ${phase}: "${majorityFirm}" is majority with ${sortedFirms[0][1]} free accounts → applying -${MAJORITY_BONUS} weight bonus`);
    }
    
    // ======= STEP 1: PRE-CALCOLARE TUTTE LE COMBINAZIONI VALIDE =======
    // Instead of immediately creating crosses, we first collect ALL valid candidates
    // This allows us to optimize for MAXIMUM crosses with BEST balance matching
    const allCandidates: CrossCandidate[] = [];
    
    // DEBUG: Log available accounts per phase
    console.log(`[AUTO-GENERATE] Phase ${phase}: ${phaseAccounts.length} accounts, ${propFirms.length} prop firms`);
    for (const account of phaseAccounts) {
      const isUsed = usedAccounts.has(account.id);
      console.log(`  → ${account.prop_firm_name} (${account.id_identifier}) - $${(account.current_balance || account.initial_balance).toFixed(0)} - ${isUsed ? 'USED' : 'FREE'}`);
    }
    
    for (let i = 0; i < propFirms.length; i++) {
      for (let j = i + 1; j < propFirms.length; j++) {
        const firmA = propFirms[i];
        const firmB = propFirms[j];
        
        // Get risk percentages - IN LIVE È SEMPRE 2%
        const riskA = phase === 'live' ? 2 : getPropFirmRisk({ prop_firm_name: firmA } as MT5Account, riskMap);
        const riskB = phase === 'live' ? 2 : getPropFirmRisk({ prop_firm_name: firmB } as MT5Account, riskMap);
        const maxStageDiff = getMaxStageDiff(riskA, riskB, phase);
        const maxBalanceDiff = getMaxBalanceDiff(riskA, riskB, phase);
        
        // Generate ALL valid pairs between these two firms
        for (const accountA of propFirmGroups[firmA]) {
          for (const accountB of propFirmGroups[firmB]) {
            // Skip if EITHER account is already used (from previous cycles or other phases)
            if (usedAccounts.has(accountA.id) || usedAccounts.has(accountB.id)) {
              console.log(`  → SKIP ${firmA}+${firmB}: one or both already used (${accountA.id_identifier} used=${usedAccounts.has(accountA.id)}, ${accountB.id_identifier} used=${usedAccounts.has(accountB.id)})`);
              continue;
            }
            
            const checkResult = canCross(accountA, accountB, maxStageDiff, maxBalanceDiff, targetRulesMap, {
              bypassDistanceRules: options?.bypassDistanceRules
            });
            if (!checkResult.valid) {
              console.log(`  → REJECT ${firmA}(${accountA.id_identifier})+${firmB}(${accountB.id_identifier}): ${checkResult.reason}`);
              continue;
            }
            
            const balanceDiff = calculateBalanceDifference(accountA, accountB);
            const stageDiff = calculateStageDifference(accountA, accountB);
            
            // === UNIFIED SCORING: Detect TARGET / EXPLOSION for this pair ===
            let detectedEngineType: CrossCandidate['detectedEngineType'] = null;
            let targetPairData: CrossCandidate['targetPairData'] = undefined;
            let explosionMatchData: CrossCandidate['explosionMatchData'] = undefined;
            let matchingWeight = 1_000_000 + balanceDiff; // Normal: base score
            
            // TARGET detection (only for fase1/fase2, not live)
            if (phase !== 'live' && targetRulesMap && Object.keys(targetRulesMap).length > 0) {
              const candA = computeTargetCandidate(accountA, targetRulesMap, riskConfigMap);
              const candB = computeTargetCandidate(accountB, targetRulesMap, riskConfigMap);
              
              if (candA && candB) {
                const bCanCoverA = candB.maxRisk >= candA.targetMancante;
                const aCanCoverB = candA.maxRisk >= candB.targetMancante;
                
                if (bCanCoverA && aCanCoverB) {
                  // TRADE TARGET DOPPIO (+200 bonus)
                  detectedEngineType = 'target';
                  targetPairData = {
                    candidateA: candA,
                    candidateB: candB,
                    subType: 'TRADE TARGET DOPPIO',
                    targetAccountId: candA.account.id,
                  };
                  matchingWeight = 800_000 + balanceDiff;
                  console.log(`  → TARGET DOPPIO: ${firmA}(${accountA.id_identifier}) + ${firmB}(${accountB.id_identifier})`);
                } else if (bCanCoverA) {
                  // SINGOLO: A va a target — check 70% rule
                  const balA = accountA.current_balance ?? accountA.initial_balance;
                  const balB = accountB.current_balance ?? accountB.initial_balance;
                  const bd = Math.abs(balA - balB);
                  const maxAllowed = candB.maxRisk * 0.70;
                  if (bd <= maxAllowed) {
                    detectedEngineType = 'target';
                    targetPairData = {
                      candidateA: candA,
                      candidateB: candB,
                      subType: 'TRADE TARGET SINGOLO',
                      targetAccountId: candA.account.id,
                    };
                    matchingWeight = 900_000 + balanceDiff;
                    console.log(`  → TARGET SINGOLO (A target): ${firmA}(${accountA.id_identifier}) + ${firmB}(${accountB.id_identifier})`);
                  }
                } else if (aCanCoverB) {
                  // SINGOLO: B va a target — check 70% rule
                  const balA2 = accountA.current_balance ?? accountA.initial_balance;
                  const balB2 = accountB.current_balance ?? accountB.initial_balance;
                  const bd2 = Math.abs(balA2 - balB2);
                  const maxAllowed2 = candA.maxRisk * 0.70;
                  if (bd2 <= maxAllowed2) {
                    detectedEngineType = 'target';
                    targetPairData = {
                      candidateA: candB, // B goes to target, swap A/B
                      candidateB: candA,
                      subType: 'TRADE TARGET SINGOLO',
                      targetAccountId: candB.account.id,
                    };
                    matchingWeight = 900_000 + balanceDiff;
                    console.log(`  → TARGET SINGOLO (B target): ${firmA}(${accountA.id_identifier}) + ${firmB}(${accountB.id_identifier})`);
                  }
                }
              }
            }
            
            // EXPLOSION detection (only for fase1/fase2, not live, and only if not already TARGET)
            if (!detectedEngineType && phase !== 'live') {
              const isExplA = isExplosionCandidate(accountA);
              const isExplB = isExplosionCandidate(accountB);
              
              if (isExplA || isExplB) {
                const subType: ExplosionSubType = (isExplA && isExplB) ? 'ESPLOSIONE DOPPIA' : 'ESPLOSIONE SINGOLA';
                const explosionAccountId = isExplA ? accountA.id : accountB.id;
                
                // Additional explosion matching rules (balance/stage filters)
                const riskCandidate = getPropFirmRisk(isExplA ? accountA : accountB, riskMap);
                const riskPartner = getPropFirmRisk(isExplA ? accountB : accountA, riskMap);
                const maxExpBalDiff = (riskCandidate <= 2 && riskPartner <= 2) ? 500 : 700;
                const maxExpStageDiff = Math.min(riskCandidate, riskPartner) <= 2 ? 1 : 2;
                
                if (balanceDiff <= maxExpBalDiff && stageDiff <= maxExpStageDiff) {
                  detectedEngineType = 'explosion';
                  explosionMatchData = {
                    accountA,
                    accountB,
                    subType,
                    explosionAccountId,
                    balanceDiff,
                    stageDiff,
                  };
                  matchingWeight = 950_000 + balanceDiff;
                  console.log(`  → EXPLOSION ${subType}: ${firmA}(${accountA.id_identifier}) + ${firmB}(${accountB.id_identifier})`);
                }
              }
            }
            
            // ===== MAJORITY FIRM BONUS =====
            // If either account belongs to the majority firm, subtract a large bonus
            // to force the matching algorithm to prioritize pairs that clear the bottleneck
            if (majorityFirm && (firmA === majorityFirm || firmB === majorityFirm)) {
              matchingWeight -= MAJORITY_BONUS;
              console.log(`  → MAJORITY BONUS: ${firmA === majorityFirm ? firmA : firmB} is majority → weight ${matchingWeight + MAJORITY_BONUS} → ${matchingWeight}`);
            }
            
            // ===== LIMITED PROP FIRM PENALTY =====
            // De-prioritize pairs involving accounts with risk override (e.g. max 1% SL)
            // These are used as "last resort" — only matched when no unrestricted pairs remain
            const LIMITED_PENALTY = 100_000;
            const isLimitedA = !!accountA.is_risk_override_active;
            const isLimitedB = !!accountB.is_risk_override_active;
            if (isLimitedA || isLimitedB) {
              const penalty = (isLimitedA ? LIMITED_PENALTY : 0) + (isLimitedB ? LIMITED_PENALTY : 0);
              matchingWeight += penalty;
              console.log(`  → LIMITED PENALTY: ${isLimitedA ? firmA + '(' + accountA.id_identifier + ')' : ''}${isLimitedA && isLimitedB ? ' + ' : ''}${isLimitedB ? firmB + '(' + accountB.id_identifier + ')' : ''} → +${penalty} (weight now ${matchingWeight})`);
            }
            
            console.log(`  → VALID CANDIDATE: ${firmA}(${accountA.id_identifier}) + ${firmB}(${accountB.id_identifier}) - balanceDiff: $${balanceDiff.toFixed(0)} - engine: ${detectedEngineType || 'normal'} - weight: ${matchingWeight}`);
            
            // Store ALL valid candidates for later optimization
            allCandidates.push({
              accountA,
              accountB,
              phase,
              balanceDiff,
              stageDiff,
              riskA,
              riskB,
              maxStageDiff,
              maxBalanceDiff,
              detectedEngineType,
              targetPairData,
              explosionMatchData,
              matchingWeight,
            });
          }
        }
      }
    }
    
    console.log(`[AUTO-GENERATE] Phase ${phase}: Found ${allCandidates.length} valid candidates`);
    
    // ======= STEP 2+3: MAXIMUM MATCHING WITH RETRY LOOP =======
    // The matching algorithm finds optimal pairings, but symbol assignment may fail
    // (due to anti-hedging constraints). When a pair fails, we remove that edge
    // and RE-RUN the matching to find alternative pairings for the freed accounts.
    // This guarantees MAXIMUM number of successfully generated trades.
    
    let remainingCandidates = [...allCandidates];
    const failedEdges = new Set<string>(); // Track "accountA.id::accountB.id" edges that failed symbol assignment
    const MAX_RETRY_ROUNDS = 10; // Safety limit to prevent infinite loops
    let retryRound = 0;
    
    while (remainingCandidates.length > 0 && retryRound < MAX_RETRY_ROUNDS) {
      retryRound++;
      
      // Filter out candidates where either account is already used
      const availableCandidates = remainingCandidates.filter(c => 
        !usedAccounts.has(c.accountA.id) && !usedAccounts.has(c.accountB.id)
      );
      
      if (availableCandidates.length === 0) break;
      
      // Convert to MatchCandidate format — USE matchingWeight for unified scoring
      const matchCandidates: MatchCandidate<MT5Account>[] = availableCandidates.map(c => ({
        nodeA: c.accountA,
        nodeB: c.accountB,
        weight: c.matchingWeight // Lower weight = preferred (TARGET DOPPIO < SINGOLO < EXPLOSION < NORMAL)
      }));
      
      const optimalResult = findOptimalMatching(matchCandidates);
      
      console.log(`[AUTO-GENERATE] Phase ${phase} (round ${retryRound}): Optimal matching found ${optimalResult.matches.length} trades from ${availableCandidates.length} candidates`);
      if (optimalResult.unmatched.length > 0) {
        console.log(`[AUTO-GENERATE] Phase ${phase}: Unmatched accounts: ${optimalResult.unmatched.map(a => `${a.prop_firm_name}(${a.id_identifier})`).join(', ')}`);
      }
      
      if (optimalResult.matches.length === 0) break;
      
      let anyFailedThisRound = false;
      
      // ======= STEP 3: CREATE SUGGESTIONS FROM OPTIMAL MATCHES =======
      for (const match of optimalResult.matches) {
        const accountA = match.nodeA;
        const accountB = match.nodeB;
        
        // Skip if already used (by a successful match earlier in this round)
        if (usedAccounts.has(accountA.id) || usedAccounts.has(accountB.id)) continue;
        
        // Look up the original CrossCandidate to get engine detection data
        const originalCandidate = allCandidates.find(c => 
          (c.accountA.id === accountA.id && c.accountB.id === accountB.id) ||
          (c.accountA.id === accountB.id && c.accountB.id === accountA.id)
        );
        
        // Re-fetch candidate data
        const riskA = phase === 'live' ? 2 : getPropFirmRisk(accountA, riskMap);
        const riskB = phase === 'live' ? 2 : getPropFirmRisk(accountB, riskMap);
        const stageDiff = calculateStageDifference(accountA, accountB);
        const balanceDiff = calculateBalanceDifference(accountA, accountB);
        
        const { rr, riskPercentA: baseRiskA, riskPercentB: baseRiskB } = calculateRiskRewardForPhase(riskA, riskB, phase);
        
        // === DIVERSIFICATION: Generate VARIABLE risk percentages ===
        let variableRiskA: number;
        let variableRiskB: number;
        
        const propFirmA = extractPropFirmName(accountA.prop_firm_name || '');
        const propFirmB = extractPropFirmName(accountB.prop_firm_name || '');
        const phaseForRisk = phase as 'fase1' | 'fase2' | 'live';
        
        const hasOverrideA = !!(accountA.is_risk_override_active && accountA.risk_override_value);
        const hasOverrideB = !!(accountB.is_risk_override_active && accountB.risk_override_value);
        const hasAnyOverride = hasOverrideA || hasOverrideB;
        
        if (riskConfigMap && Object.keys(riskConfigMap).length > 0) {
          variableRiskA = generateVariableRiskFromConfig(propFirmA, phaseForRisk, 'normal', riskConfigMap, accountA);
          variableRiskB = generateVariableRiskFromConfig(propFirmB, phaseForRisk, 'normal', riskConfigMap, accountB);
          
          if (rr === '1:1' && !hasAnyOverride) {
            const sharedRisk = Math.min(variableRiskA, variableRiskB);
            variableRiskA = sharedRisk;
            variableRiskB = sharedRisk;
          }
        } else if (rr === '1:1' && !hasAnyOverride) {
          const sharedRisk = generateVariableRisk(baseRiskA, phase);
          variableRiskA = sharedRisk;
          variableRiskB = sharedRisk;
        } else {
          variableRiskA = generateVariableRisk(baseRiskA, phase);
          variableRiskB = generateVariableRisk(baseRiskB, phase);
        }
        
        // === SYMBOL SELECTION: 50/50 ROLL + BATCH DIVERSIFICATION ===
        const rotatedSymbols = getRotatedSymbolList(batchSessionSymbols, batchOtherSymbols, globalCrossCounter);
        let selectedSymbol: AllowedSymbol | null = null;
        let directions: { directionA: 'BUY' | 'SELL'; directionB: 'BUY' | 'SELL' } | null = null;
        
        const rejectedSymbols: string[] = [];
        
        // PASS 1: Only consider symbols NOT in batchUsedPairs (maximum diversification)
        for (const trySymbol of rotatedSymbols) {
          if (batchUsedPairs.has(trySymbol)) continue;
          
          const tryDirections = getConsistentDirections(accountA, accountB, trySymbol, propFirmDirectionTracker);
          if (!tryDirections) {
            rejectedSymbols.push(`${trySymbol}(dir)`);
            continue;
          }
          
          if (pipRangeConfigs && pipRangeConfigs.length > 0) {
            const pipConfig = pipRangeConfigs.find(c => c.symbol === trySymbol && c.is_active);
            if (!pipConfig) {
              rejectedSymbols.push(`${trySymbol}(pip)`);
              continue;
            }
          }
          
          selectedSymbol = trySymbol;
          directions = tryDirections;
          break;
        }
        
        // PASS 2: All virgin pairs exhausted — fallback to already-used symbols
        if (!selectedSymbol) {
          for (const trySymbol of rotatedSymbols) {
            if (!batchUsedPairs.has(trySymbol)) continue;
            
            const tryDirections = getConsistentDirections(accountA, accountB, trySymbol, propFirmDirectionTracker);
            if (!tryDirections) {
              rejectedSymbols.push(`${trySymbol}(reuse-dir)`);
              continue;
            }
            
            if (pipRangeConfigs && pipRangeConfigs.length > 0) {
              const pipConfig = pipRangeConfigs.find(c => c.symbol === trySymbol && c.is_active);
              if (!pipConfig) {
                rejectedSymbols.push(`${trySymbol}(reuse-pip)`);
                continue;
              }
            }
            
            selectedSymbol = trySymbol;
            directions = tryDirections;
            console.log(`[PAIR-DIVERSIFICATION] Reusing pair ${trySymbol} (all virgin pairs exhausted)`);
            break;
          }
        }
        
        globalCrossCounter++;
        
        if (rejectedSymbols.length > 0) {
          console.log(`[SYMBOL-ROTATION] Trade #${globalCrossCounter} ${propFirmA}+${propFirmB}: rejected [${rejectedSymbols.join(', ')}] → ${selectedSymbol || 'NONE'}`);
        } else {
          console.log(`[SYMBOL-ROTATION] Trade #${globalCrossCounter} ${propFirmA}+${propFirmB}: → ${selectedSymbol} (direct hit)`);
        }
        
        // If NO symbol works, mark this edge as FAILED and let retry loop find alternative pairings
        if (!selectedSymbol || !directions) {
          const edgeKey = `${accountA.id}::${accountB.id}`;
          console.log(`[SYMBOL-ROTATION] ❌ SYMBOL FAILED for ${accountA.prop_firm_name}(${accountA.id_identifier}) + ${accountB.prop_firm_name}(${accountB.id_identifier}) — marking edge as failed, will retry with alternative partners`);
          failedEdges.add(edgeKey);
          anyFailedThisRound = true;
          continue; // Don't mark accounts as used — they're free for re-matching
        }
        
        // SUCCESS: Mark accounts as used
        usedAccounts.add(accountA.id);
        usedAccounts.add(accountB.id);
        
        const symbol = selectedSymbol;
        const { directionA, directionB } = directions;
        
        batchUsedPairs.add(symbol);
        
        // === LOT & RR CALCULATION (UNIFIED: branch by detected engine type) ===
        const globalLotsForSymbol = existingLotsPerSymbol.get(symbol) || [];
        const detectedEngine = originalCandidate?.detectedEngineType;
        
        let finalLotsA: number;
        let finalLotsB: number;
        let finalRR: string = rr;
        let finalPipsA: number | undefined;
        let finalPipsB: number | undefined;
        let finalActualRiskA: number = variableRiskA;
        let finalActualRiskB: number = variableRiskB;
        let limitedAsymData: { isLimitedAsym?: boolean; limitedAccountId?: string; bufferedRisk?: number; standardRisk?: number } | null = null;
        let suggestionEngineType: CrossSuggestion['engineType'] = undefined;
        let suggestionTargetSubType: CrossSuggestion['targetSubType'] = undefined;
        let suggestionExplosionSubType: CrossSuggestion['explosionSubType'] = undefined;
        let suggestionTargetAccountId: string | undefined;
        let suggestionExplosionAccountId: string | undefined;
        let suggestionWinAmountA: number | undefined;
        let suggestionWinAmountB: number | undefined;
        let suggestionLoseAmountA: number | undefined;
        let suggestionLoseAmountB: number | undefined;
        let targetMetaNotesStr: string | undefined;
        
        if (detectedEngine === 'target' && originalCandidate?.targetPairData && pipRangeConfigs && pipRangeConfigs.length > 0) {
          // ===== TARGET ENGINE LOT CALCULATION =====
          const tgtPair = originalCandidate.targetPairData;
          const pipConfig = pipRangeConfigs.find(c => c.symbol === symbol && c.is_active);
          
          if (pipConfig) {
            let lotResult: TargetLotResult;
            if (tgtPair.subType === 'TRADE TARGET DOPPIO') {
              lotResult = calculateDoppioLots(tgtPair, pipConfig, symbol, dynamicPipValues);
            } else {
              lotResult = calculateSingoloLots(tgtPair, pipConfig, symbol, riskConfigMap, dynamicPipValues);
            }
            
            finalLotsA = lotResult.lotsA;
            finalLotsB = lotResult.lotsB;
            finalRR = '1:1';
            finalPipsA = lotResult.pipsA;
            finalPipsB = lotResult.pipsB;
            finalActualRiskA = lotResult.riskPercentA;
            finalActualRiskB = lotResult.riskPercentB;
            suggestionEngineType = 'target';
            suggestionTargetSubType = tgtPair.subType;
            suggestionTargetAccountId = tgtPair.targetAccountId;
            suggestionWinAmountA = lotResult.winAmountA;
            suggestionWinAmountB = lotResult.winAmountB;
            suggestionLoseAmountA = lotResult.loseAmountA;
            suggestionLoseAmountB = lotResult.loseAmountB;
            
            targetMetaNotesStr = JSON.stringify({
              engineType: 'target',
              targetSubType: tgtPair.subType,
              targetAccountId: tgtPair.targetAccountId,
              baseLots: lotResult.baseLots,
              pipsA: lotResult.pipsA, pipsB: lotResult.pipsB,
              slPipsA: lotResult.slPipsA, slPipsB: lotResult.slPipsB,
              winAmountA: lotResult.winAmountA, winAmountB: lotResult.winAmountB,
              loseAmountA: lotResult.loseAmountA, loseAmountB: lotResult.loseAmountB,
              riskPercentA: lotResult.riskPercentA, riskPercentB: lotResult.riskPercentB,
              targetLordoA: lotResult.winAmountA, targetLordoB: lotResult.winAmountB,
              baselineA: tgtPair.candidateA.baseline, baselineB: tgtPair.candidateB.baseline,
            });
            
            console.log(`[UNIFIED] ✅ TARGET ${tgtPair.subType} applied: ${accountA.account_login} + ${accountB.account_login} on ${symbol}`);
          } else {
            console.log(`[UNIFIED] ⚠️ TARGET detected but no pip config for ${symbol}, falling back to NORMAL`);
            finalLotsA = 0; finalLotsB = 0;
          }
        }
        
        if (detectedEngine === 'explosion' && originalCandidate?.explosionMatchData && pipRangeConfigs && pipRangeConfigs.length > 0) {
          // ===== EXPLOSION ENGINE LOT CALCULATION =====
          const explMatch = originalCandidate.explosionMatchData;
          const pipConfig = pipRangeConfigs.find(c => c.symbol === symbol && c.is_active);
          
          if (pipConfig) {
            const lotResult = calculateExplosionLots(explMatch, pipConfig, symbol, dynamicPipValues, riskConfigMap);
            
            finalLotsA = lotResult.lotsA;
            finalLotsB = lotResult.lotsB;
            finalRR = '1:1';
            finalPipsA = lotResult.tpPipsA;
            finalPipsB = lotResult.tpPipsB;
            finalActualRiskA = lotResult.riskPercentA;
            finalActualRiskB = lotResult.riskPercentB;
            suggestionEngineType = 'explosion';
            suggestionExplosionSubType = explMatch.subType;
            suggestionExplosionAccountId = explMatch.explosionAccountId;
            suggestionWinAmountA = lotResult.winAmountA;
            suggestionWinAmountB = lotResult.winAmountB;
            
            targetMetaNotesStr = JSON.stringify({
              engineType: 'explosion',
              explosionSubType: explMatch.subType,
              explosionAccountId: explMatch.explosionAccountId,
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
            
            console.log(`[UNIFIED] ✅ EXPLOSION ${explMatch.subType} applied: ${accountA.account_login} + ${accountB.account_login} on ${symbol}`);
          } else {
            console.log(`[UNIFIED] ⚠️ EXPLOSION detected but no pip config for ${symbol}, falling back to NORMAL`);
            finalLotsA = 0; finalLotsB = 0;
          }
        }
        
        // ===== NORMAL LOT CALCULATION (fallback or primary for normal trades) =====
        if (!suggestionEngineType) {
          if (pipRangeConfigs && pipRangeConfigs.length > 0) {
            const tradeParams = generateNormalTradeWithRRMix(
              accountA,
              accountB,
              variableRiskA,
              variableRiskB,
              symbol,
              pipRangeConfigs,
              globalLotsForSymbol,
              dynamicPipValues,
              phase,
              riskConfigMap
            );
            finalLotsA = tradeParams.lotsA;
            finalLotsB = tradeParams.lotsB;
            finalRR = tradeParams.riskReward;
            finalPipsA = tradeParams.pipsA;
            finalPipsB = tradeParams.pipsB;
            finalActualRiskA = tradeParams.actualRiskA;
            finalActualRiskB = tradeParams.actualRiskB;
            if (tradeParams.isLimitedAsym) {
              limitedAsymData = {
                isLimitedAsym: tradeParams.isLimitedAsym,
                limitedAccountId: tradeParams.limitedAccountId,
                bufferedRisk: tradeParams.bufferedRisk,
                standardRisk: tradeParams.standardRisk,
              };
            }
          } else {
            finalLotsA = generateDiversifiedLots(accountA, phase, variableRiskA, symbol, symbolTracker, globalLotsForSymbol);
            finalLotsB = calculateProportionalLots(accountA, accountB, finalLotsA);
          }
          
          // Normal/limited asym notes
          const isNormalAsymmetric = finalRR !== '1:1' && finalPipsA !== undefined && finalPipsB !== undefined && finalPipsA !== finalPipsB;
          const isLimitedAsymTrade = !!limitedAsymData?.isLimitedAsym;
          
          targetMetaNotesStr = isLimitedAsymTrade ? JSON.stringify({
            engineType: 'limited_asym',
            pipsA: finalPipsA,
            pipsB: finalPipsB,
            riskPercentA: finalActualRiskA,
            riskPercentB: finalActualRiskB,
            limitedAccountId: limitedAsymData!.limitedAccountId,
            bufferedRisk: limitedAsymData!.bufferedRisk,
            standardRisk: limitedAsymData!.standardRisk,
          }) : isNormalAsymmetric ? JSON.stringify({
            engineType: 'normal_asym',
            pipsA: finalPipsA,
            pipsB: finalPipsB,
            riskPercentA: finalActualRiskA,
            riskPercentB: finalActualRiskB,
          }) : undefined;
        }
        
        const score = stageDiff * 10000 + balanceDiff;

        suggestions.push({
          accountA,
          accountB,
          symbol,
          directionA,
          directionB,
          lotsA: finalLotsA,
          lotsB: finalLotsB,
          phase,
          stageDifference: stageDiff,
          balanceDifference: balanceDiff,
          riskReward: finalRR,
          riskPercent: finalActualRiskA,
          riskPercentA: finalActualRiskA,
          riskPercentB: finalActualRiskB,
          pipsA: finalPipsA,
          pipsB: finalPipsB,
          score,
          // Engine detection fields
          engineType: suggestionEngineType,
          targetSubType: suggestionTargetSubType,
          explosionSubType: suggestionExplosionSubType,
          targetAccountId: suggestionTargetAccountId,
          explosionAccountId: suggestionExplosionAccountId,
          winAmountA: suggestionWinAmountA,
          winAmountB: suggestionWinAmountB,
          loseAmountA: suggestionLoseAmountA,
          loseAmountB: suggestionLoseAmountB,
          targetMetaNotes: targetMetaNotesStr,
          isManualSuggested: !!options?.manualSuggested,
        });
      }
      
      // If no pairs failed this round, we're done — all matches succeeded
      if (!anyFailedThisRound) break;
      
      // Remove failed edges from candidates and retry matching with freed accounts
      remainingCandidates = remainingCandidates.filter(c => {
        const edgeKey = `${c.accountA.id}::${c.accountB.id}`;
        return !failedEdges.has(edgeKey);
      });
      
      console.log(`[AUTO-GENERATE] Phase ${phase}: Retrying matching (round ${retryRound + 1}) with ${remainingCandidates.length} remaining candidates after ${failedEdges.size} failed edges`);
    }
  }
  
  // Sort by phase priority first, then by score
  const phaseOrder: Record<CrossablePhase, number> = { 'fase1': 0, 'fase2': 1, 'live': 2 };
  const sortedSuggestions = suggestions.sort((a, b) => {
    const phaseDiff = phaseOrder[a.phase] - phaseOrder[b.phase];
    if (phaseDiff !== 0) return phaseDiff;
    return a.score - b.score;
  });
  
  // FIXED: Return BOTH suggestions AND the updated usedAccounts set
  // This allows the caller to pass the updated set to generateWeightedCrossSuggestions
  // ensuring no account is used twice across both generation functions
  return {
    suggestions: sortedSuggestions,
    usedAccountIdsAfter: usedAccounts  // Contains all accounts used in this generation
  };
}

// ============================================
// RESHUFFLE PLANNED CROSSES (RICARICA)
// ============================================
// Takes existing planned crosses and reassigns ONLY the symbol/direction/lots,
// keeping the same account pairings (A↔B). Does NOT create or delete crosses.
// Considers open (executed) trades for anti-hedging and diversification.
// Uses current session timing, dynamic spread from Tabella Operatività, and 50/50 roll.
export interface ReshuffledCross {
  crossId: string;
  symbol: AllowedSymbol;
  directionA: 'BUY' | 'SELL';
  directionB: 'BUY' | 'SELL';
  lotsA: number;
  lotsB: number;
  riskReward: string;
  riskPercentA: number;
  riskPercentB: number;
  notes: string | null;
}

export function reshufflePlannedCrosses(
  plannedCrosses: TradeCross[],
  executedCrosses: TradeCross[],
  accounts: MT5Account[],
  riskMap: PropFirmRiskMap,
  pipRangeConfigsByPhase: Record<string, PipRangeConfig[]>,
  dynamicPipValues?: Record<string, number>,
  riskConfigMap?: PropFirmRiskConfigMap,
  targetRulesMap?: Record<string, { fase1: number; fase2: number }>,
  externalExposure?: { prop_firm_name: string; symbol: string; direction: string }[]
): ReshuffledCross[] {
  if (plannedCrosses.length === 0) return [];

  const accountsMap = new Map(accounts.map(a => [a.id, a]));

  // Build direction tracker from EXECUTED (open) trades only
  const propFirmTracker: PropFirmDirectionTracker = preloadDirectionsFromCrosses(executedCrosses, accounts);
  
  // RADAR ANTI-BAN: Inject cross-structure exposure if available
  if (externalExposure && externalExposure.length > 0) {
    let injected = 0;
    for (const entry of externalExposure) {
      const normalizedFirm = extractPropFirmName(entry.prop_firm_name);
      const sym = entry.symbol as AllowedSymbol;
      if (!normalizedFirm || !ALLOWED_SYMBOLS.includes(sym)) continue;
      ensurePropFirmDirectionTrackerInitialized(propFirmTracker, normalizedFirm);
      if (!propFirmTracker[normalizedFirm].symbolDirection.has(sym)) {
        propFirmTracker[normalizedFirm].symbolDirection.set(sym, entry.direction as 'BUY' | 'SELL');
        injected++;
      }
    }
    if (injected > 0) console.log(`[RADAR-RESHUFFLE] Injected ${injected} external directions`);
  }

  // Track symbols already in use by executed (open) trades
  const openTradeSymbols = new Set<string>();
  for (const c of executedCrosses) {
    if (c.status === 'executed') openTradeSymbols.add(c.symbol);
  }

  // Get session-aware symbol lists (computed ONCE for entire batch)
  const { sessionSymbols: batchSessionSymbols, otherSymbols: batchOtherSymbols } = getSessionSymbolLists();
  let crossCounter = Math.floor(Math.random() * 16); // Random starting offset

  // Track symbols used in this reshuffle batch for diversification
  const batchUsedPairs = new Set<string>(openTradeSymbols);

  const results: ReshuffledCross[] = [];

  for (const cross of plannedCrosses) {
    const accountA = accountsMap.get(cross.account_a_id);
    const accountB = accountsMap.get(cross.account_b_id);
    if (!accountA || !accountB) continue;

    const propFirmA = extractPropFirmName(accountA.prop_firm_name || '');
    const propFirmB = extractPropFirmName(accountB.prop_firm_name || '');
    const phase = (accountA.phase || 'fase1') as CrossablePhase;
    const phaseForRisk = phase as 'fase1' | 'fase2' | 'live';

    // === DETECT ORIGINAL ENGINE TYPE from weighted_type or notes ===
    let originalEngineType: 'target' | 'explosion' | 'normal' = 'normal';
    let targetSubType: TargetSubType | null = null;
    let explosionSubType: ExplosionSubType | null = null;
    let targetAccountId: string | null = cross.weighted_account_id || null;
    let explosionAccountId: string | null = null;

    if (cross.weighted_type === 'target' || cross.weighted_type === 'explosion') {
      originalEngineType = cross.weighted_type;
    }
    // Fallback: parse notes JSON
    if (cross.notes) {
      try {
        const notesParsed = JSON.parse(cross.notes);
        if (notesParsed.engineType === 'target') {
          originalEngineType = 'target';
          targetSubType = notesParsed.targetSubType || null;
          targetAccountId = notesParsed.targetAccountId || targetAccountId;
        } else if (notesParsed.engineType === 'explosion') {
          originalEngineType = 'explosion';
          explosionSubType = notesParsed.explosionSubType || null;
          explosionAccountId = notesParsed.explosionAccountId || null;
        }
      } catch { /* not JSON notes, that's fine */ }
    }

    console.log(`[RESHUFFLE] Cross ${cross.id}: originalEngine=${originalEngineType} phase=${phase}`);

    // === GET PHASE-SPECIFIC PIP CONFIGS ===
    const phaseKey = phase === 'live' ? 'live' : 'challenge';
    const pipRangeConfigs = pipRangeConfigsByPhase[phaseKey] || pipRangeConfigsByPhase['challenge'] || [];

    // === VARIABLE RISK ===
    const hasOverrideA = !!(accountA.is_risk_override_active && accountA.risk_override_value);
    const hasOverrideB = !!(accountB.is_risk_override_active && accountB.risk_override_value);
    const hasAnyOverride = hasOverrideA || hasOverrideB;

    let variableRiskA: number;
    let variableRiskB: number;

    if (riskConfigMap && Object.keys(riskConfigMap).length > 0) {
      variableRiskA = generateVariableRiskFromConfig(propFirmA, phaseForRisk, 'normal', riskConfigMap, accountA);
      variableRiskB = generateVariableRiskFromConfig(propFirmB, phaseForRisk, 'normal', riskConfigMap, accountB);
      if (!hasAnyOverride) {
        const riskA_base = getPropFirmRisk(accountA, riskMap);
        const riskB_base = getPropFirmRisk(accountB, riskMap);
        const { rr } = calculateRiskRewardForPhase(riskA_base, riskB_base, phase);
        if (rr === '1:1') {
          const shared = Math.min(variableRiskA, variableRiskB);
          variableRiskA = shared;
          variableRiskB = shared;
        }
      }
    } else {
      const riskA_base = getPropFirmRisk(accountA, riskMap);
      const riskB_base = getPropFirmRisk(accountB, riskMap);
      const shared = generateVariableRisk(riskA_base, phase);
      variableRiskA = shared;
      variableRiskB = shared;
    }

    // === SYMBOL SELECTION: 50/50 + 2-pass diversification ===
    const rotatedSymbols = getRotatedSymbolList(batchSessionSymbols, batchOtherSymbols, crossCounter);
    let selectedSymbol: AllowedSymbol | null = null;
    let directions: { directionA: 'BUY' | 'SELL'; directionB: 'BUY' | 'SELL' } | null = null;

    // PASS 1: Virgin pairs (not in batchUsedPairs)
    for (const trySymbol of rotatedSymbols) {
      if (batchUsedPairs.has(trySymbol)) continue;
      const tryDir = getConsistentDirections(accountA, accountB, trySymbol, propFirmTracker);
      if (!tryDir) continue;
      if (pipRangeConfigs.length > 0 && !pipRangeConfigs.find(c => c.symbol === trySymbol && c.is_active)) continue;
      selectedSymbol = trySymbol;
      directions = tryDir;
      break;
    }

    // PASS 2: Fallback to already-used symbols (anti-hedging enforced by getConsistentDirections)
    if (!selectedSymbol) {
      for (const trySymbol of rotatedSymbols) {
        if (!batchUsedPairs.has(trySymbol)) continue;
        const tryDir = getConsistentDirections(accountA, accountB, trySymbol, propFirmTracker);
        if (!tryDir) continue;
        if (pipRangeConfigs.length > 0 && !pipRangeConfigs.find(c => c.symbol === trySymbol && c.is_active)) continue;
        selectedSymbol = trySymbol;
        directions = tryDir;
        console.log(`[RESHUFFLE] Reusing pair ${trySymbol} for cross ${cross.id}`);
        break;
      }
    }

    crossCounter++;

    if (!selectedSymbol || !directions) {
      console.warn(`[RESHUFFLE] No compatible symbol found for cross ${cross.id}, keeping original`);
      continue;
    }

    // Track in batch
    batchUsedPairs.add(selectedSymbol);

    // Register directions in tracker for subsequent crosses
    ensurePropFirmDirectionTrackerInitialized(propFirmTracker, propFirmA);
    ensurePropFirmDirectionTrackerInitialized(propFirmTracker, propFirmB);
    propFirmTracker[propFirmA].symbolDirection.set(selectedSymbol, directions.directionA);
    propFirmTracker[propFirmB].symbolDirection.set(selectedSymbol, directions.directionB);

    // === ENGINE-SPECIFIC LOT CALCULATION ===
    let finalLotsA = 0;
    let finalLotsB = 0;
    let finalRR = '1:1';
    let finalRiskA = variableRiskA;
    let finalRiskB = variableRiskB;
    let notes: string | null = null;

    const pipConfig = pipRangeConfigs.find(c => c.symbol === selectedSymbol && c.is_active);

    // ── TARGET ENGINE ──
    if (originalEngineType === 'target' && targetRulesMap && pipConfig && phase !== 'live') {
      const candA = computeTargetCandidate(accountA, targetRulesMap, riskConfigMap);
      const candB = computeTargetCandidate(accountB, targetRulesMap, riskConfigMap);

      if (candA && candB) {
        // Rebuild DetectedTargetPair
        const bCanCoverA = candB.maxRisk >= candA.targetMancante;
        const aCanCoverB = candA.maxRisk >= candB.targetMancante;
        const detectedSubType: TargetSubType = (bCanCoverA && aCanCoverB)
          ? 'TRADE TARGET DOPPIO'
          : 'TRADE TARGET SINGOLO';

        const rebuiltPair: import('../logic/engines/targetEngine').DetectedTargetPair = {
          candidateA: candA,
          candidateB: candB,
          subType: targetSubType || detectedSubType,
          targetAccountId: targetAccountId || candA.account.id,
        };

        let lotResult: import('../logic/engines/targetEngine').TargetLotResult;
        if (rebuiltPair.subType === 'TRADE TARGET DOPPIO') {
          lotResult = calculateDoppioLots(rebuiltPair, pipConfig, selectedSymbol, dynamicPipValues);
        } else {
          lotResult = calculateSingoloLots(rebuiltPair, pipConfig, selectedSymbol, riskConfigMap, dynamicPipValues);
        }

        finalLotsA = lotResult.lotsA;
        finalLotsB = lotResult.lotsB;
        finalRiskA = lotResult.riskPercentA;
        finalRiskB = lotResult.riskPercentB;
        finalRR = '1:1';
        notes = JSON.stringify({
          engineType: 'target',
          targetSubType: rebuiltPair.subType,
          targetAccountId: rebuiltPair.targetAccountId,
          baseLots: lotResult.baseLots,
          pipsA: lotResult.pipsA, pipsB: lotResult.pipsB,
          slPipsA: lotResult.slPipsA, slPipsB: lotResult.slPipsB,
          winAmountA: lotResult.winAmountA, winAmountB: lotResult.winAmountB,
          loseAmountA: lotResult.loseAmountA, loseAmountB: lotResult.loseAmountB,
          riskPercentA: lotResult.riskPercentA, riskPercentB: lotResult.riskPercentB,
        });

        console.log(`[RESHUFFLE] ✅ TARGET ${rebuiltPair.subType}: ${accountA.account_login} + ${accountB.account_login} → ${selectedSymbol}`);
      } else {
        console.log(`[RESHUFFLE] ⚠️ TARGET re-detection failed for cross ${cross.id}, falling back to NORMAL`);
        originalEngineType = 'normal'; // fall through to normal below
      }
    }

    // ── EXPLOSION ENGINE ──
    if (originalEngineType === 'explosion' && pipConfig && phase !== 'live') {
      const isExpA = isExplosionCandidate(accountA);
      const isExpB = isExplosionCandidate(accountB);

      if (isExpA || isExpB) {
        const detectedSubType: ExplosionSubType =
          (isExpA && isExpB) ? 'ESPLOSIONE DOPPIA' : 'ESPLOSIONE SINGOLA';

        const rebuiltMatch: import('../logic/engines/explosionEngine').ExplosionMatch = {
          accountA,
          accountB,
          subType: explosionSubType || detectedSubType,
          explosionAccountId: explosionAccountId || (isExpA ? accountA.id : accountB.id),
          balanceDiff: Math.abs(
            (accountA.current_balance ?? accountA.initial_balance) -
            (accountB.current_balance ?? accountB.initial_balance)
          ),
          stageDiff: Math.abs((accountA.stage || 0) - (accountB.stage || 0)),
        };

        const lotResult = calculateExplosionLots(rebuiltMatch, pipConfig, selectedSymbol, dynamicPipValues, riskConfigMap);

        finalLotsA = lotResult.lotsA;
        finalLotsB = lotResult.lotsB;
        finalRiskA = lotResult.riskPercentA;
        finalRiskB = lotResult.riskPercentB;
        finalRR = '1:1';
        notes = JSON.stringify({
          engineType: 'explosion',
          explosionSubType: rebuiltMatch.subType,
          explosionAccountId: rebuiltMatch.explosionAccountId,
          riskAmountA: lotResult.riskAmountA, riskAmountB: lotResult.riskAmountB,
          gapRiskA: lotResult.gapRiskA, gapRiskB: lotResult.gapRiskB,
          slPipsA: lotResult.slPipsA, slPipsB: lotResult.slPipsB,
          tpPipsA: lotResult.tpPipsA, tpPipsB: lotResult.tpPipsB,
          winAmountA: lotResult.winAmountA, winAmountB: lotResult.winAmountB,
          riskPercentA: lotResult.riskPercentA, riskPercentB: lotResult.riskPercentB,
          baseLots: lotResult.baseLots,
        });

        console.log(`[RESHUFFLE] ✅ EXPLOSION ${rebuiltMatch.subType}: ${accountA.account_login} + ${accountB.account_login} → ${selectedSymbol}`);
      } else {
        console.log(`[RESHUFFLE] ⚠️ EXPLOSION re-detection failed for cross ${cross.id}, falling back to NORMAL`);
        originalEngineType = 'normal';
      }
    }

    // ── NORMAL ENGINE (default or fallback) ──
    if (originalEngineType === 'normal' || (finalLotsA === 0 && finalLotsB === 0)) {
      const tradeParams = generateNormalTradeWithRRMix(
        accountA, accountB,
        variableRiskA, variableRiskB,
        selectedSymbol, pipRangeConfigs, [],
        dynamicPipValues, phase, riskConfigMap
      );

      finalLotsA = tradeParams.lotsA;
      finalLotsB = tradeParams.lotsB;
      finalRR = tradeParams.riskReward;
      finalRiskA = tradeParams.actualRiskA;
      finalRiskB = tradeParams.actualRiskB;

      // Build notes for asymmetric trades
      const isAsym = tradeParams.riskReward !== '1:1' && tradeParams.pipsA !== tradeParams.pipsB;
      const isLimited = tradeParams.isLimitedAsym;
      if (isLimited) {
        notes = JSON.stringify({
          engineType: 'limited_asym', pipsA: tradeParams.pipsA, pipsB: tradeParams.pipsB,
          riskPercentA: tradeParams.actualRiskA, riskPercentB: tradeParams.actualRiskB,
          limitedAccountId: tradeParams.limitedAccountId,
          bufferedRisk: tradeParams.bufferedRisk, standardRisk: tradeParams.standardRisk,
        });
      } else if (isAsym) {
        notes = JSON.stringify({
          engineType: 'normal_asym', pipsA: tradeParams.pipsA, pipsB: tradeParams.pipsB,
          riskPercentA: tradeParams.actualRiskA, riskPercentB: tradeParams.actualRiskB,
        });
      }

      console.log(`[RESHUFFLE] NORMAL: ${accountA.account_login} + ${accountB.account_login} → ${selectedSymbol}`);
    }

    results.push({
      crossId: cross.id,
      symbol: selectedSymbol,
      directionA: directions.directionA,
      directionB: directions.directionB,
      lotsA: finalLotsA,
      lotsB: finalLotsB,
      riskReward: finalRR,
      riskPercentA: finalRiskA,
      riskPercentB: finalRiskB,
      notes,
    });

    console.log(`[RESHUFFLE] Cross ${cross.id}: ${cross.symbol} → ${selectedSymbol} (${directions.directionA}/${directions.directionB}) [engine=${originalEngineType}]`);
  }

  return results;
}


// Hook for managing trade crosses
export function useTradeCrosses() {
  const [crosses, setCrosses] = useState<TradeCross[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [structureId, setStructureId] = useState<string | null>(null);

  // Get user and structure
  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUserId(user?.id || null);
        
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('active_structure_id')
            .eq('id', user.id)
            .single();
          setStructureId(profile?.active_structure_id || null);
        }
      } catch (err) {
        console.error('Error getting user for crosses:', err);
        setIsLoading(false);
      }
    };
    getUser();
  }, []);

  // Fetch crosses
  const fetchCrosses = useCallback(async () => {
    if (!userId) {
      setCrosses([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('trade_crosses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCrosses((data || []) as TradeCross[]);
    } catch (err) {
      console.error('Error fetching crosses:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchCrosses();
  }, [fetchCrosses]);

  // Create a new cross from suggestion (status defaults to approved)
  const createCross = async (
    suggestion: CrossSuggestion,
    initialStatus: TradeCross['status'] = 'approved'
  ): Promise<TradeCross | null> => {
    if (!userId) {
      toast.error('Devi essere autenticato');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('trade_crosses')
        .insert({
          user_id: userId,
          structure_id: structureId,
          symbol: suggestion.symbol,
          risk_reward: suggestion.riskReward,
          risk_percentage: suggestion.riskPercent,
          risk_percentage_a: suggestion.riskPercentA,
          risk_percentage_b: suggestion.riskPercentB,
          account_a_id: suggestion.accountA.id,
          account_a_direction: suggestion.directionA,
          account_a_lots: suggestion.lotsA,
          account_b_id: suggestion.accountB.id,
          account_b_direction: suggestion.directionB,
          account_b_lots: suggestion.lotsB,
          stage_difference: suggestion.stageDifference,
          balance_difference: suggestion.balanceDifference,
          status: initialStatus,
          notes: suggestion.targetMetaNotes || null
        })
        .select()
        .single();

      if (error) throw error;

      const cross = data as TradeCross;
      setCrosses(prev => [cross, ...prev]);
      return cross;
    } catch (err) {
      console.error('Error creating cross:', err);
      toast.error('Errore nella creazione dell\'incrocio');
      return null;
    }
  };

  // Create multiple crosses at once
  // frozenEngineTypes: if set, crosses whose engineType matches will be created with is_active=false
  const createMultipleCrosses = async (
    suggestions: CrossSuggestion[],
    initialStatus: TradeCross['status'] = 'approved',
    frozenEngineTypes?: Set<string>
  ): Promise<TradeCross[]> => {
    if (!userId) {
      toast.error('Devi essere autenticato');
      return [];
    }

    try {
      const inserts = suggestions.map(suggestion => {
        // Determine if this trade should be frozen
        const shouldFreeze = frozenEngineTypes && suggestion.engineType && frozenEngineTypes.has(suggestion.engineType);
        return {
          user_id: userId,
          structure_id: structureId,
          symbol: suggestion.symbol,
          risk_reward: suggestion.riskReward,
          risk_percentage: suggestion.riskPercent,
          risk_percentage_a: suggestion.riskPercentA,
          risk_percentage_b: suggestion.riskPercentB,
          account_a_id: suggestion.accountA.id,
          account_a_direction: suggestion.directionA,
          account_a_lots: suggestion.lotsA,
          account_b_id: suggestion.accountB.id,
          account_b_direction: suggestion.directionB,
          account_b_lots: suggestion.lotsB,
          stage_difference: suggestion.stageDifference,
          balance_difference: suggestion.balanceDifference,
          status: initialStatus,
          notes: (suggestion.targetMetaNotes || null) as string | null,
          is_active: shouldFreeze ? false : true,
        };
      });

      const { data, error } = await supabase
        .from('trade_crosses')
        .insert(inserts)
        .select();

      if (error) throw error;

      const crosses = (data || []) as TradeCross[];
      setCrosses(prev => [...crosses, ...prev]);
      toast.success(`${crosses.length} incroci pianificati`);
      return crosses;
    } catch (err) {
      console.error('Error creating multiple crosses:', err);
      toast.error('Errore nella creazione degli incroci');
      return [];
    }
  };

  // Update cross status
  const updateCrossStatus = async (
    crossId: string,
    status: TradeCross['status'],
    notes?: string
  ): Promise<boolean> => {
    try {
      const nowIso = new Date().toISOString();
      console.log(`[UPDATE_STATUS] crossId=${crossId} newStatus=${status} at=${nowIso}`);

      // Build update payload
      const updates: Partial<TradeCross> & { updated_at: string } = {
        status,
        updated_at: nowIso,
      };

      // Keep timestamps consistent
      if (notes !== undefined) updates.notes = notes;
      if (status === 'executed') {
        updates.executed_at = nowIso;
      }
      if (status === 'closed') {
        updates.closed_at = nowIso;
      }

      const { data, error } = await supabase
        .from('trade_crosses')
        .update(updates)
        .eq('id', crossId)
        .select('*')
        .maybeSingle();

      console.log(`[UPDATE_STATUS] response: error=${error?.message || 'none'} data=${data ? 'OK' : 'NULL'} dataStatus=${data?.status || 'N/A'}`);

      if (error) {
        toast.error(`Errore DB: ${error.message}`, { duration: 8000 });
        throw error;
      }
      if (!data) {
        const msg = 'Aggiornamento rifiutato dal database (0 righe modificate). Verifica permessi/struttura.';
        console.error(`[UPDATE_STATUS] SILENT FAIL: ${msg}`);
        toast.error(msg, { duration: 8000 });
        return false;
      }

      setCrosses(prev => prev.map(c => (c.id === crossId ? (data as TradeCross) : c)));
      toast.success(`Stato aggiornato → ${status === 'executed' ? 'Trade Aperto' : status}`);
      return true;
    } catch (err) {
      console.error('[UPDATE_STATUS] Exception:', err);
      toast.error(err instanceof Error ? err.message : "Errore nell'aggiornamento", { duration: 8000 });
      return false;
    }
  };

  // Delete a cross
  const deleteCross = async (crossId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('trade_crosses')
        .delete()
        .eq('id', crossId);

      if (error) throw error;

      setCrosses(prev => prev.filter(c => c.id !== crossId));
      toast.success('Incrocio eliminato');
      return true;
    } catch (err) {
      console.error('Error deleting cross:', err);
      toast.error('Errore nell\'eliminazione');
      return false;
    }
  };

  // Delete all planned crosses (approved/suggested only, not executed)
  const deleteAllCrosses = async (): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('trade_crosses')
        .delete()
        .in('status', ['approved', 'suggested']);

      if (error) throw error;

      setCrosses(prev => prev.filter(c => c.status === 'executed'));
      toast.success('Tutti gli incroci pianificati eliminati');
      return true;
    } catch (err) {
      console.error('Error deleting all crosses:', err);
      toast.error('Errore nell\'eliminazione');
      return false;
    }
  };

  // Update cross lots (regenerate with new random values)
  // Optionally update notes for weighted trades (recalculated asymmetric data)
  const updateCrossLots = async (
    crossId: string,
    newLotsA: number,
    newLotsB: number,
    newNotes?: string
  ): Promise<boolean> => {
    try {
      const updateData: Record<string, unknown> = {
        account_a_lots: newLotsA,
        account_b_lots: newLotsB,
        updated_at: new Date().toISOString()
      };
      
      // Include notes if provided (for weighted trades with recalculated commissions)
      if (newNotes !== undefined) {
        updateData.notes = newNotes;
      }
      
      const { error } = await supabase
        .from('trade_crosses')
        .update(updateData)
        .eq('id', crossId);

      if (error) throw error;

      setCrosses(prev =>
        prev.map(c => c.id === crossId 
          ? { 
              ...c, 
              account_a_lots: newLotsA, 
              account_b_lots: newLotsB,
              ...(newNotes !== undefined ? { notes: newNotes } : {})
            } 
          : c
        )
      );
      toast.success('Lotti rigenerati');
      return true;
    } catch (err) {
      console.error('Error updating lots:', err);
      toast.error('Errore nell\'aggiornamento dei lotti');
      return false;
    }
  };

  // Update cross risk percentages (regenerate with new random values)
  const updateCrossRisk = async (
    crossId: string,
    newRiskA: number,
    newRiskB: number
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('trade_crosses')
        .update({
          risk_percentage_a: newRiskA,
          risk_percentage_b: newRiskB,
          risk_percentage: newRiskA, // Keep main field synced with A
          updated_at: new Date().toISOString()
        })
        .eq('id', crossId);

      if (error) throw error;

      setCrosses(prev =>
        prev.map(c => c.id === crossId 
          ? { 
              ...c, 
              risk_percentage_a: newRiskA, 
              risk_percentage_b: newRiskB,
              risk_percentage: newRiskA
            } 
          : c
        )
      );
      toast.success('Risk rigenerato');
      return true;
    } catch (err) {
      console.error('Error updating risk:', err);
      toast.error('Errore nell\'aggiornamento del risk');
      return false;
    }
  };

  // Activate a frozen cross (set is_active = true)
  const activateCross = async (crossId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('trade_crosses')
        .update({ is_active: true })
        .eq('id', crossId);

      if (error) throw error;

      setCrosses(prev =>
        prev.map(c => c.id === crossId ? { ...c, is_active: true } : c)
      );
      toast.success('Trade attivato');
      return true;
    } catch (err) {
      console.error('Error activating cross:', err);
      toast.error('Errore nell\'attivazione del trade');
      return false;
    }
  };

  // Re-roll pair: update symbol, directions, lots, risk, notes in one shot
  const rerollCrossPair = async (
    crossId: string,
    newSymbol: string,
    newDirectionA: string,
    newDirectionB: string,
    newLotsA: number,
    newLotsB: number,
    newRiskA: number,
    newRiskB: number,
    newRiskReward: string,
    newNotes?: string
  ): Promise<boolean> => {
    try {
      const updateData: Record<string, unknown> = {
        symbol: newSymbol,
        account_a_direction: newDirectionA,
        account_b_direction: newDirectionB,
        account_a_lots: newLotsA,
        account_b_lots: newLotsB,
        risk_percentage_a: newRiskA,
        risk_percentage_b: newRiskB,
        risk_percentage: newRiskA,
        risk_reward: newRiskReward,
        updated_at: new Date().toISOString(),
      };
      if (newNotes !== undefined) updateData.notes = newNotes;

      const { error } = await supabase
        .from('trade_crosses')
        .update(updateData)
        .eq('id', crossId);

      if (error) throw error;

      setCrosses(prev =>
        prev.map(c => c.id === crossId ? {
          ...c,
          symbol: newSymbol,
          account_a_direction: newDirectionA,
          account_b_direction: newDirectionB,
          account_a_lots: newLotsA,
          account_b_lots: newLotsB,
          risk_percentage_a: newRiskA,
          risk_percentage_b: newRiskB,
          risk_percentage: newRiskA,
          risk_reward: newRiskReward,
          ...(newNotes !== undefined ? { notes: newNotes } : {}),
        } : c)
      );
      toast.success(`Pair cambiato → ${newSymbol}`);
      return true;
    } catch (err) {
      console.error('Error rerolling pair:', err);
      toast.error('Errore nel cambio pair');
      return false;
    }
  };

  return {
    crosses,
    isLoading,
    createCross,
    createMultipleCrosses,
    updateCrossStatus,
    updateCrossLots,
    updateCrossRisk,
    rerollCrossPair,
    activateCross,
    deleteCross,
    deleteAllCrosses,
    refetch: fetchCrosses
  };
}
