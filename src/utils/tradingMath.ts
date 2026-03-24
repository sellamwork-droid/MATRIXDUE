// ============================================
// TRADING MATH UTILITY — High-Precision Calculations
// ============================================
// Centralized utility for all trading math operations.
// Eliminates floating-point drift using fixed-precision arithmetic.
// Symbol-aware pip value calculation with live rate support.

// ============================================
// PRECISION UTILITIES
// ============================================

/**
 * Round to N decimal places without floating-point drift
 */
export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Round to 2 decimal places (standard for lots/risk)
 */
export function round2(value: number): number {
  return roundTo(value, 2);
}

/**
 * Round to 5 decimal places (for pip values)
 */
export function round5(value: number): number {
  return roundTo(value, 5);
}

/**
 * Round to 1 decimal place (for pips)
 */
export function round1(value: number): number {
  return roundTo(value, 1);
}

// ============================================
// SYMBOL CLASSIFICATION
// ============================================

export type SymbolClass = 'USD_QUOTE' | 'JPY_QUOTE' | 'CROSS' | 'GOLD' | 'UNKNOWN';

/**
 * Classify a forex symbol by its quote currency
 */
export function classifySymbol(symbol: string): SymbolClass {
  if (!symbol || symbol.length < 6) return 'UNKNOWN';

  // Gold/Precious metals
  if (symbol === 'XAUUSD' || symbol === 'XAGUSD') return 'GOLD';

  const quoteCurrency = symbol.slice(-3);

  // Quote = USD → fixed pip value
  if (quoteCurrency === 'USD') return 'USD_QUOTE';

  // Quote = JPY → special pip size (0.01)
  if (quoteCurrency === 'JPY') return 'JPY_QUOTE';

  // Everything else is a cross pair
  return 'CROSS';
}

/**
 * Get the base and quote currencies from a symbol
 */
export function splitSymbol(symbol: string): { base: string; quote: string } {
  return {
    base: symbol.slice(0, 3),
    quote: symbol.slice(-3),
  };
}

// ============================================
// PIP VALUE CALCULATION
// ============================================

/**
 * Default pip values when no live rates available
 * These are reasonable approximations based on typical rates
 * ⚠️ WARNING: These are FALLBACKS only - prefer MT5 broker values or live rates
 */
export const DEFAULT_PIP_VALUES: Record<string, number> = {
  // USD quote pairs = $10 fixed
  'EURUSD': 10.00,
  'GBPUSD': 10.00,
  'AUDUSD': 10.00,
  'NZDUSD': 10.00,
  'XAUUSD': 10.00,
  // JPY quote pairs ≈ $6.50 (depends on USDJPY rate)
  'USDJPY': 6.50,
  'EURJPY': 6.50,
  'GBPJPY': 6.50,
  'AUDJPY': 6.50,
  'NZDJPY': 6.50,
  'CADJPY': 6.50,
  'CHFJPY': 6.50,
  // CHF quote pairs ≈ $11.50 (depends on USDCHF rate)
  'USDCHF': 11.50,
  'AUDCHF': 11.50,
  'CADCHF': 11.50,
  'EURCHF': 11.50,
  'GBPCHF': 11.50,
  'NZDCHF': 11.50,
  // CAD quote pairs ≈ $7.30 (depends on USDCAD rate)
  'USDCAD': 7.30,
  'AUDCAD': 7.30,
  'EURCAD': 7.30,
  'GBPCAD': 7.30,
  'NZDCAD': 7.30,
  // GBP quote pairs ≈ $12.50 (depends on GBPUSD rate)
  'EURGBP': 12.50,
  'AUDGBP': 12.50,
  // AUD quote pairs ≈ $6.50 (depends on AUDUSD rate)
  'EURAUD': 6.50,
  'GBPAUD': 6.50,
  // NZD quote pairs ≈ $6.00 (depends on NZDUSD rate)
  'EURNZD': 6.00,
  'GBPNZD': 6.00,
  'AUDNZD': 6.00,
};

export interface LiveRates {
  JPY?: number;   // USDJPY rate (how many JPY per 1 USD)
  CHF?: number;   // USDCHF rate (how many CHF per 1 USD)
  CAD?: number;   // USDCAD rate (how many CAD per 1 USD)
  GBP?: number;   // GBPUSD rate (how many USD per 1 GBP) - INVERTED
  AUD?: number;   // AUDUSD rate (how many USD per 1 AUD) - INVERTED
  NZD?: number;   // NZDUSD rate (how many USD per 1 NZD) - INVERTED
}

export interface PipValueResult {
  value: number;
  source: 'broker' | 'calculated' | 'default';
  isApproximate: boolean;
  warning?: string;
}

/**
 * Calculate the exact pip value for 1 Standard Lot (100,000 units)
 * for accounts denominated in USD.
 *
 * PRIORITY ORDER:
 * 1. Broker-provided tick/pip value (from MT5 EA) - HIGHEST PRIORITY
 * 2. Calculated from live exchange rates
 * 3. Default fallback values - LOWEST PRIORITY (with warning)
 *
 * FORMULAS:
 * - USD Quote (EURUSD, GBPUSD, XAUUSD): $10.00 fixed
 * - JPY Quote (USDJPY, EURJPY): 1000 / USDJPY rate
 * - Indirect Quote (CHF, CAD): 10 / USD[Quote] rate
 * - Direct Quote (GBP, AUD, NZD): 10 * [Quote]USD rate
 */
export function calculatePipValueWithSource(
  symbol: string,
  liveRates?: LiveRates | Record<string, number>,
  brokerPipValue?: number
): PipValueResult {
  // PRIORITY 1: Broker-provided value (MT5 tick value)
  if (brokerPipValue !== undefined && brokerPipValue > 0) {
    return {
      value: round5(brokerPipValue),
      source: 'broker',
      isApproximate: false,
    };
  }

  const symbolClass = classifySymbol(symbol);
  const { quote } = splitSymbol(symbol);

  // CASE A: USD quote or Gold → fixed $10
  if (symbolClass === 'USD_QUOTE' || symbolClass === 'GOLD') {
    return {
      value: 10.00,
      source: 'calculated',
      isApproximate: false,
    };
  }

  // CASE B: JPY quote → 1000 / USDJPY
  if (symbolClass === 'JPY_QUOTE') {
    const rate = liveRates?.['JPY'] ?? liveRates?.['USDJPY'];
    if (rate && rate > 0) {
      return {
        value: round5(1000 / rate),
        source: 'calculated',
        isApproximate: false,
      };
    }
    return {
      value: DEFAULT_PIP_VALUES[symbol] || 6.50,
      source: 'default',
      isApproximate: true,
      warning: `Missing USDJPY rate for ${symbol} - using approximate value`,
    };
  }

  // CASE C: Cross pairs
  if (symbolClass === 'CROSS') {
    // Direct quote currencies (where [Quote]USD pair exists)
    // Formula: pipValue = 10 * [Quote]USD rate
    const directQuotes = ['GBP', 'AUD', 'NZD'];
    if (directQuotes.includes(quote)) {
      const rate = liveRates?.[quote];
      if (rate && rate > 0) {
        return {
          value: round5(10 * rate),
          source: 'calculated',
          isApproximate: false,
        };
      }
      return {
        value: DEFAULT_PIP_VALUES[symbol] || 10.00,
        source: 'default',
        isApproximate: true,
        warning: `Missing ${quote}USD rate for ${symbol} - using approximate value`,
      };
    }

    // Indirect quote currencies (where USD[Quote] pair exists)
    // Formula: pipValue = 10 / USD[Quote] rate
    const indirectQuotes = ['CHF', 'CAD'];
    if (indirectQuotes.includes(quote)) {
      const rate = liveRates?.[quote];
      if (rate && rate > 0) {
        return {
          value: round5(10 / rate),
          source: 'calculated',
          isApproximate: false,
        };
      }
      return {
        value: DEFAULT_PIP_VALUES[symbol] || 10.00,
        source: 'default',
        isApproximate: true,
        warning: `Missing USD${quote} rate for ${symbol} - using approximate value`,
      };
    }

    // Unknown cross pair quote currency
    return {
      value: DEFAULT_PIP_VALUES[symbol] || 10.00,
      source: 'default',
      isApproximate: true,
      warning: `Unknown quote currency ${quote} in ${symbol} - using fallback`,
    };
  }

  // Fallback for unknown symbols
  return {
    value: DEFAULT_PIP_VALUES[symbol] || 10.00,
    source: 'default',
    isApproximate: true,
    warning: `Unknown symbol ${symbol} - using fallback value`,
  };
}

/**
 * Simple pip value calculation (backwards compatible)
 */
export function calculatePipValue(
  symbol: string,
  liveRates?: LiveRates | Record<string, number>,
  brokerPipValue?: number
): number {
  return calculatePipValueWithSource(symbol, liveRates, brokerPipValue).value;
}

/**
 * Get pip value with strict priority:
 * 1. Broker-provided MT5 tick value
 * 2. Pre-calculated dynamic values from API
 * 3. Calculate from live rates
 * 4. Default fallback values
 */
export function getPipValue(
  symbol: string,
  dynamicPipValues?: Record<string, number>,
  liveRates?: LiveRates,
  brokerPipValue?: number
): number {
  // Priority 1: Broker MT5 tick value (exact from platform)
  if (brokerPipValue !== undefined && brokerPipValue > 0) {
    return round5(brokerPipValue);
  }

  // Priority 2: Pre-calculated dynamic values from API
  if (dynamicPipValues?.[symbol] !== undefined && dynamicPipValues[symbol] > 0) {
    return dynamicPipValues[symbol];
  }

  // Priority 3: Calculate from live rates
  if (liveRates) {
    return calculatePipValue(symbol, liveRates);
  }

  // Priority 4: Default values (with implicit warning)
  return DEFAULT_PIP_VALUES[symbol] || 10.00;
}

/**
 * Get pip value with detailed source info (for UI warnings)
 */
export function getPipValueDetailed(
  symbol: string,
  dynamicPipValues?: Record<string, number>,
  liveRates?: LiveRates,
  brokerPipValue?: number
): PipValueResult {
  // Priority 1: Broker MT5 tick value
  if (brokerPipValue !== undefined && brokerPipValue > 0) {
    return {
      value: round5(brokerPipValue),
      source: 'broker',
      isApproximate: false,
    };
  }

  // Priority 2: Pre-calculated dynamic values from API
  if (dynamicPipValues?.[symbol] !== undefined && dynamicPipValues[symbol] > 0) {
    return {
      value: dynamicPipValues[symbol],
      source: 'calculated',
      isApproximate: false,
    };
  }

  // Priority 3 & 4: Calculate or fallback
  return calculatePipValueWithSource(symbol, liveRates);
}




// ============================================
// TRADE MATH CALCULATIONS
// ============================================

export interface TradeMathInput {
  symbol: string;
  balance: number;
  riskPercent?: number;    // Risk as percentage (e.g., 2.5 for 2.5%)
  riskAmount?: number;     // Risk in dollars
  lots?: number;
  pips?: number;
  pipValue?: number;       // Pre-calculated pip value (optional)
  dynamicPipValues?: Record<string, number>;
}

export interface TradeMathResult {
  lots: number;
  pips: number;
  riskAmount: number;     // Risk in $
  riskPercent: number;    // Risk as %
  pipValue: number;       // $ per pip per lot
  expectedProfit: number; // Expected profit at TP
  expectedLoss: number;   // Expected loss at SL (if pips = SL)
}

/**
 * Calculate trade math with precision.
 *
 * UNIDIRECTIONAL FLOW:
 * - If LOTS provided → calculate RISK from lots
 * - If RISK provided → calculate LOTS from risk
 * - PIPS are never recalculated (user input)
 */
export function calculateTradeMath(input: TradeMathInput): TradeMathResult {
  const {
    symbol,
    balance,
    riskPercent,
    riskAmount,
    lots: inputLots,
    pips = 0,
    pipValue: inputPipValue,
    dynamicPipValues,
  } = input;

  // Get pip value
  const pipValue = inputPipValue ?? getPipValue(symbol, dynamicPipValues);

  let lots: number;
  let risk: number;
  let percent: number;

  // CASE 1: Lots provided → calculate risk
  if (inputLots !== undefined && inputLots > 0) {
    lots = round2(inputLots);
    risk = round2(lots * pipValue * pips);
    percent = balance > 0 ? round2((risk / balance) * 100) : 0;
  }
  // CASE 2: Risk amount provided → calculate lots
  else if (riskAmount !== undefined && riskAmount > 0) {
    risk = round2(riskAmount);
    percent = balance > 0 ? round2((risk / balance) * 100) : 0;
    lots = pips > 0 && pipValue > 0 ? round2(risk / (pipValue * pips)) : 0.01;
    lots = Math.max(0.01, lots);
  }
  // CASE 3: Risk percent provided → calculate lots
  else if (riskPercent !== undefined && riskPercent > 0) {
    percent = round2(riskPercent);
    risk = round2(balance * (percent / 100));
    lots = pips > 0 && pipValue > 0 ? round2(risk / (pipValue * pips)) : 0.01;
    lots = Math.max(0.01, lots);
  }
  // Default case
  else {
    lots = 0.01;
    risk = 0;
    percent = 0;
  }

  return {
    lots,
    pips: round1(pips),
    riskAmount: risk,
    riskPercent: percent,
    pipValue: round5(pipValue),
    expectedProfit: round2(lots * pipValue * pips),
    expectedLoss: round2(lots * pipValue * pips),
  };
}

// ============================================
// SPECIALIZED CALCULATORS
// ============================================

/**
 * Calculate lots from risk and pips (pure formula)
 * lots = riskAmount / (pipValue * pips)
 */
export function calculateLotsFromRisk(
  riskAmount: number,
  pips: number,
  pipValue: number
): number {
  if (pips <= 0 || pipValue <= 0) return 0.01;
  const lots = riskAmount / (pipValue * pips);
  return Math.max(0.01, round2(lots));
}

/**
 * Calculate risk from lots and pips (pure formula)
 * riskAmount = lots * pipValue * pips
 */
export function calculateRiskFromLots(
  lots: number,
  pips: number,
  pipValue: number
): number {
  return round2(lots * pipValue * pips);
}

/**
 * Calculate pips from lots and risk (pure formula)
 * pips = riskAmount / (lots * pipValue)
 */
export function calculatePipsFromRisk(
  riskAmount: number,
  lots: number,
  pipValue: number
): number {
  if (lots <= 0 || pipValue <= 0) return 0;
  return round1(riskAmount / (lots * pipValue));
}

/**
 * Calculate risk percentage from risk amount and balance
 */
export function calculateRiskPercent(riskAmount: number, balance: number): number {
  if (balance <= 0) return 0;
  return round2((riskAmount / balance) * 100);
}

/**
 * Calculate risk amount from percentage and balance
 */
export function calculateRiskAmount(riskPercent: number, balance: number): number {
  return round2(balance * (riskPercent / 100));
}

/**
 * Calculate proportional lots for a second account based on balance ratio
 */
export function calculateProportionalLots(
  lotsA: number,
  balanceA: number,
  balanceB: number
): number {
  if (balanceA <= 0) return lotsA;
  const ratio = balanceB / balanceA;
  return Math.max(0.01, round2(lotsA * ratio));
}

// ============================================
// STOP LOSS / TAKE PROFIT CALCULATORS
// ============================================

/**
 * Calculate Stop Loss pips including spread and entry difference
 * Formula: SL = entryDiff + spread + tpPips
 */
export function calculateStopLossPips(
  entryDiff: number,
  spread: number,
  tpPips: number
): number {
  return round1(entryDiff + spread + tpPips);
}

/**
 * Calculate expected dollar loss/profit from lots, pips, and symbol
 */
export function calculateDollarAmount(
  lots: number,
  pips: number,
  symbol: string,
  dynamicPipValues?: Record<string, number>
): number {
  const pipValue = getPipValue(symbol, dynamicPipValues);
  return round2(lots * pipValue * pips);
}

/**
 * Calculate Take Profit pips to achieve target profit
 * Formula: tpPips = targetProfit / (lots * pipValue)
 */
export function calculateTakeProfitPips(
  targetProfit: number,
  lots: number,
  symbol: string,
  dynamicPipValues?: Record<string, number>
): number {
  const pipValue = getPipValue(symbol, dynamicPipValues);
  if (lots <= 0 || pipValue <= 0) return 0;
  return round1(targetProfit / (lots * pipValue));
}

// ============================================
// VALIDATION UTILITIES
// ============================================

/**
 * Validate lots are within broker limits
 */
export function validateLots(lots: number, minLots = 0.01, maxLots = 999): number {
  return Math.max(minLots, Math.min(maxLots, round2(lots)));
}

/**
 * Check if two numbers are approximately equal (within tolerance)
 */
export function isApproxEqual(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) < tolerance;
}
