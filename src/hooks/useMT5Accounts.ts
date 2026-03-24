import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useStructureId } from './useStructure'
import { MT5Account } from '../types/mt5'

export interface UseMT5AccountsOptions {
  activeOnly?: boolean
  visibleOnBoard?: boolean
}

export function useMT5Accounts(options?: UseMT5AccountsOptions) {
  const structureId = useStructureId()
  const [accounts, setAccounts] = useState<MT5Account[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    let query = supabase
      .from('mt5_accounts')
      .select('*')
      .eq('structure_id', structureId)
      .eq('is_deleted', false)
      .order('account_login')

    if (options?.activeOnly) query = query.eq('account_status', 'active')
    if (options?.visibleOnBoard !== undefined) {
      query = query.eq('visible_on_board', options.visibleOnBoard)
    }

    const { data } = await query
    setAccounts((data as MT5Account[]) || [])
    setIsLoading(false)
  }, [structureId, options?.activeOnly, options?.visibleOnBoard])

  useEffect(() => { load() }, [load])

  return { accounts, isLoading, reload: load }
}
