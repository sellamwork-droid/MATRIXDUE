// Mapping from MT5 account name/broker to standardized prop firm name
export const PROP_FIRM_KEYWORDS: Record<string, string> = {
  // FUNDER PRO
  "funder pro": "FUNDER PRO",
  "funderpro": "FUNDER PRO",
  // FUNDING PIPS
  "funding pips": "FUNDING PIPS",
  "fundingpips": "FUNDING PIPS",
  // 5%ERS (includes HS1, HS2, FHS patterns)
  "5%ers": "5%ERS",
  "fivers": "5%ERS",
  "5ers": "5%ERS",
  "fivepercenters": "5%ERS",
  "hs1-": "5%ERS",
  "hs2-": "5%ERS",
  "fhs-": "5%ERS",
  "fhs ": "5%ERS",
  // FUNDED NEXT
  "funded next": "FUNDED NEXT",
  "fundednext": "FUNDED NEXT",
  // ALPHA CAPITAL
  "alpha capital": "ALPHA CAPITAL",
  "alphacapital": "ALPHA CAPITAL",
  // FINTOKEI
  "fintokei": "FINTOKEI",
  "purple trading": "FINTOKEI",
  "purpletrading": "FINTOKEI",
  // ACQUA FUNDED
  "acqua funded": "ACQUA FUNDED",
  "acquafunded": "ACQUA FUNDED",
  "aqua funded": "ACQUA FUNDED",
  "aquafunded": "ACQUA FUNDED",
  "aqua": "ACQUA FUNDED",
  // GOAT FUNDED
  "goat funded": "GOAT FUNDED",
  "goatfunded": "GOAT FUNDED",
  "goat": "GOAT FUNDED",
  // TTP
  "trading pit": "TTP",
  "tradingpit": "TTP",
  "the trading pit": "TTP",
  "ttp": "TTP",
  // FTMO
  "ftmo": "FTMO",
  // Blueberry
  "blueberry": "BLUEBERRY",
};

// Extract standardized prop firm name from full MT5 account name
export function extractPropFirmName(fullName: string): string {
  const lowerName = fullName.toLowerCase();

  for (const [keyword, standardName] of Object.entries(PROP_FIRM_KEYWORDS)) {
    if (lowerName.includes(keyword)) {
      return standardName;
    }
  }

  // If no keyword match, return empty string
  return "";
}

// Normalize prop firm name to standard format for color matching
export function normalizePropFirmName(propFirmName: string): string {
  const extracted = extractPropFirmName(propFirmName);
  return extracted || propFirmName.toUpperCase().trim();
}
