import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Accounts not synced for more than this many hours are flagged
const SYNC_THRESHOLD_HOURS = 6

serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const thresholdDate = new Date(Date.now() - SYNC_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString()
    const today = new Date().toISOString().split('T')[0]

    // Find active accounts that haven't synced recently
    const { data: staleAccounts } = await supabase
      .from('mt5_accounts')
      .select('id, account_login, prop_firm_name, id_identifier, structure_id, current_balance, account_status, last_sync_at')
      .eq('is_deleted', false)
      .eq('account_status', 'active')
      .or(`last_sync_at.is.null,last_sync_at.lt.${thresholdDate}`)

    let alertsCreated = 0

    for (const acc of (staleAccounts || [])) {
      // Check if alert already exists for today
      const { data: existing } = await supabase
        .from('integrity_alerts')
        .select('id')
        .eq('account_id', acc.id)
        .eq('alert_date', today)
        .eq('is_dismissed', false)
        .single()

      if (existing) continue

      await supabase.from('integrity_alerts').insert({
        account_id:         acc.id,
        account_login:      acc.account_login,
        prop_firm_name:     acc.prop_firm_name,
        id_identifier:      acc.id_identifier,
        structure_id:       acc.structure_id,
        alert_type:         'missing',
        alert_message:      acc.last_sync_at
          ? `Nessun sync da ${new Date(acc.last_sync_at).toLocaleString('it-IT')} — verifica EA`
          : 'Account mai sincronizzato — verifica connessione EA',
        alert_date:         today,
        last_known_balance: acc.current_balance,
        last_known_status:  acc.account_status,
        is_dismissed:       false,
      })
      alertsCreated++
    }

    return new Response(
      JSON.stringify({ success: true, checked: staleAccounts?.length ?? 0, alertsCreated }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
