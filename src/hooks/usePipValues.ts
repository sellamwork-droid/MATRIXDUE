import { useState, useCallback } from 'react';

// ============================================
// DYNAMIC PIP VALUE CALCULATION
// ============================================
// Calcola il Pip Value per 1 Lotto Standard (100.000 unità)
// per account denominati in USD, usando tassi di cambio live.
//
// CASO A — Quote USD (EURUSD, GBPUSD, AUDUSD, NZDUSD, XAUUSD): $10.00 (fisso)
// CASO B — Quote JPY (USDJPY, EURJPY, GBPJPY): 1000 / Tasso_USDJPY
// CASO C — Altre Quote (USDCAD, USDCHF, EURGBP, etc.): 10 / Tasso_USD[QuoteCurrency]

/**
 * Calcola il Pip Value dinamico per un singolo pair.
 * @param pair - Es. 'EURUSD', 'USDJPY', 'EURGBP'
 * @param liveRates - Mappa di valute con tasso rispetto a USD (es. { JPY: 150.5, CAD: 1.37 })
 * @returns Pip value in USD per 1 lotto standard
 */
export function calculateDynamicPipValue(
  pair: string,
  liveRates: Record<string, number>
): number {
  const quoteCurrency = pair.slice(-3);

  // CASO A: Quote = USD → pip value fisso $10
  if (quoteCurrency === 'USD') return 10.00;

  // CASO B: Quote = JPY → pip a 0.01 → 1000 / USDJPY
  if (quoteCurrency === 'JPY') {
    const rate = liveRates['JPY'];
    if (!rate || rate <= 0) return 6.50; // fallback sicuro
    return Math.round((1000 / rate) * 100000) / 100000;
  }

  // CASO D: Quote = GBP, AUD, NZD → 10 * [Quote]USD (tasso diretto)
  const directQuotes: Record<string, string> = { GBP: 'GBP', AUD: 'AUD', NZD: 'NZD' };
  if (directQuotes[quoteCurrency]) {
    const rate = liveRates[quoteCurrency];
    if (!rate || rate <= 0) return 10.00;
    return Math.round((10 * rate) * 100000) / 100000;
  }

  // CASO C: Quote = CAD, CHF, etc. → 10 / USD[Quote]
  const rate = liveRates[quoteCurrency];
  if (!rate || rate <= 0) return 10.00; // fallback sicuro
  return Math.round((10 / rate) * 100000) / 100000;
}

// Default pip values - used as fallback when API is unavailable
// These are approximate and will be overridden by dynamic values
const DEFAULT_PIP_VALUES: Record<string, number> = {
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

export interface PipValuesState {
  values: Record<string, number>;
  lastUpdated: string | null;
  isLoading: boolean;
  source: 'yahoo-finance' | 'default' | 'cached';
}

// Cache pip values in memory to avoid repeated API calls
let cachedPipValues: Record<string, number> | null = null;
let cacheTimestamp: number | null = null;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes cache

export function usePipValues() {
  const [state, setState] = useState<PipValuesState>({
    values: cachedPipValues || DEFAULT_PIP_VALUES,
    lastUpdated: cacheTimestamp ? new Date(cacheTimestamp).toISOString() : null,
    isLoading: false,
    source: cachedPipValues ? 'cached' : 'default',
  });

  const fetchPipValues = useCallback(async (_showToast = true): Promise<Record<string, number>> => {
    // Check cache first
    if (cachedPipValues && cacheTimestamp && (Date.now() - cacheTimestamp) < CACHE_DURATION_MS) {
      console.log('[PipValues] Using cached values');
      return cachedPipValues;
    }

    // Frontend-only mode: return static default values (no Supabase edge function)
    console.log('[PipValues] Frontend-only mode: using static default pip values');
    setState({
      values: DEFAULT_PIP_VALUES,
      lastUpdated: new Date().toISOString(),
      isLoading: false,
      source: 'default',
    });

    return DEFAULT_PIP_VALUES;
  }, []);

  const getPipValue = useCallback((symbol: string): number => {
    const values = cachedPipValues || state.values;
    return values[symbol] || DEFAULT_PIP_VALUES[symbol] || 10.00;
  }, [state.values]);

  return {
    ...state,
    fetchPipValues,
    getPipValue,
    defaultValues: DEFAULT_PIP_VALUES,
  };
}

// Export for direct use in generation functions
export async function fetchLatestPipValues(): Promise<Record<string, number>> {
  // Check cache first
  if (cachedPipValues && cacheTimestamp && (Date.now() - cacheTimestamp) < CACHE_DURATION_MS) {
    console.log('[PipValues] Using cached values');
    return cachedPipValues;
  }

  // Frontend-only mode: return static default values
  console.log('[PipValues] Frontend-only mode: returning static default pip values');
  return DEFAULT_PIP_VALUES;
}

export { DEFAULT_PIP_VALUES };
