import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useStructureId } from './useStructure'
import { PropFirmRiskConfigMap, PropFirmRiskConfigForTrade } from './useCrossTrading'

// ─── RAW DB TYPE ───────────────────────────────────────────────────────────────

interface RawRiskConfig {
  id: string
  prop_firm_name: string
  fase_min_risk: number
  fase_max_risk: number
  live_min_risk: number
  live_max_risk: number
  esplosione_fase_risk: number
  esplosione_live_risk: number
  target_fase_min_risk: number
  target_fase_max_risk: number
}

// ─── HOOK: raw configs array ───────────────────────────────────────────────────

export function usePropFirmRiskConfigs() {
  const structureId = useStructureId()
  const [configs, setConfigs] = useState<RawRiskConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('prop_firm_risk_configs')
        .select('*')
        .eq('structure_id', structureId)
      setConfigs((data as RawRiskConfig[]) || [])
      setIsLoading(false)
    }
    load()
  }, [structureId])

  return { configs, isLoading }
}

// ─── CONVERTER ────────────────────────────────────────────────────────────────

export function configsToMap(configs: RawRiskConfig[]): PropFirmRiskConfigMap {
  const map: PropFirmRiskConfigMap = {}
  for (const c of configs) {
    const key = c.prop_firm_name.toUpperCase()
    const entry: PropFirmRiskConfigForTrade = {
      prop_firm_name:      c.prop_firm_name,
      fase_min_risk:       c.fase_min_risk,
      fase_max_risk:       c.fase_max_risk,
      esplosione_fase_risk: c.esplosione_fase_risk,
      target_fase_min_risk: c.target_fase_min_risk,
      target_fase_max_risk: c.target_fase_max_risk,
      live_min_risk:       c.live_min_risk,
      live_max_risk:       c.live_max_risk,
      esplosione_live_risk: c.esplosione_live_risk,
    }
    map[key] = entry
    map[c.prop_firm_name] = entry // also store original case
  }
  return map
}

// ─── HOOK: simplified risk map (prop_firm → avg risk %) ───────────────────────

export function usePropFirmRiskMap() {
  const { configs, isLoading } = usePropFirmRiskConfigs()
  const riskMap: Record<string, number> = {}
  for (const c of configs) {
    riskMap[c.prop_firm_name.toUpperCase()] = (c.fase_min_risk + c.fase_max_risk) / 2
  }
  return { riskMap, isLoading }
}

// ─── HOOK: target rules from prop_firm_rules ──────────────────────────────────

interface PropFirmRule {
  name: string
  profit_target_fase1: number | null
  profit_target_fase2: number | null
  max_loss_funded: number | null
  rischio_max_operazione: number | null
}

export function usePropFirmTargetRules() {
  const structureId = useStructureId()
  const [targetRulesMap, setTargetRulesMap] = useState<Record<string, PropFirmRule>>({})
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('prop_firm_rules')
        .select('name, profit_target_fase1, profit_target_fase2, max_loss_funded, rischio_max_operazione')
        .eq('structure_id', structureId)
        .eq('is_active', true)
      const map: Record<string, PropFirmRule> = {}
      for (const r of (data as PropFirmRule[] || [])) {
        map[r.name.toUpperCase()] = r
        map[r.name] = r
      }
      setTargetRulesMap(map)
      setIsLoading(false)
    }
    load()
  }, [structureId])

  return { targetRulesMap, isLoading }
}
