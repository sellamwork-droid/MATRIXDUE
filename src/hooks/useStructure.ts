import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

const STRUCTURE_ID = 'aaaaaaaa-0000-0000-0000-000000000001'

export function useStructureId(): string {
  return STRUCTURE_ID
}

export function useUserRole() {
  const { user } = useAuth()
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    if (!user) { setRole(null); return }
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()
      .then(({ data }: any) => setRole(data?.role ?? null))
  }, [user?.id])

  return role
}
