import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useStructureId } from './useStructure'
import { PipRangeConfig } from './useCrossTrading'

export function useTradingPairConfigs() {
  const structureId = useStructureId()
  const [challengeConfigs, setChallengeConfigs] = useState<PipRangeConfig[]>([])
  const [liveConfigs, setLiveConfigs] = useState<PipRangeConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('trading_pair_configs')
        .select('*')
        .eq('structure_id', structureId)
        .eq('is_active', true)

      const challenge: PipRangeConfig[] = []
      const live: PipRangeConfig[] = []

      for (const row of (data || [])) {
        const cfg: PipRangeConfig = {
          symbol:   row.symbol,
          min_pips: row.min_pips,
          max_pips: row.max_pips,
          spread:   row.spread || 0,
          is_active: true,
        }
        if (row.config_type === 'live') live.push(cfg)
        else challenge.push(cfg)
      }

      setChallengeConfigs(challenge)
      setLiveConfigs(live)
      setIsLoading(false)
    }
    load()
  }, [structureId])

  return { challengeConfigs, liveConfigs, isLoading }
}
