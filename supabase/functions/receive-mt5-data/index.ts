import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MT5Payload {
  api_key: string
  account_login: string
  account_name?: string
  balance: number
  equity: number
  profit_loss?: number
  open_positions_count?: number
  has_open_trades?: boolean
  broker_server?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const payload: MT5Payload = await req.json()
    const { api_key, account_login, balance, equity, profit_loss, open_positions_count, has_open_trades, broker_server } = payload

    if (!api_key || !account_login) {
      return new Response(JSON.stringify({ error: 'api_key e account_login obbligatori' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Find account by api_key
    const { data: account, error: fetchErr } = await supabase
      .from('mt5_accounts')
      .select('id, structure_id, initial_balance, account_size, phase')
      .eq('api_key', api_key)
      .eq('account_login', account_login)
      .eq('is_deleted', false)
      .single()

    if (fetchErr || !account) {
      return new Response(JSON.stringify({ error: 'Account non trovato o api_key non valida' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const initialBalance = account.initial_balance || account.account_size || 10000
    const profitPct = initialBalance > 0 ? ((balance - initialBalance) / initialBalance) * 100 : 0

    // Update account
    const { error: updateErr } = await supabase
      .from('mt5_accounts')
      .update({
        current_balance:       balance,
        current_equity:        equity,
        profit_loss:           profit_loss ?? (balance - initialBalance),
        profit_percentage:     Math.round(profitPct * 100) / 100,
        open_positions_count:  open_positions_count ?? 0,
        has_open_trades:       has_open_trades ?? false,
        connection_status:     'connected',
        last_sync_at:          new Date().toISOString(),
        broker_server:         broker_server ?? null,
      })
      .eq('id', account.id)

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Daily snapshot — upsert so only one per account per day
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('account_daily_snapshots').upsert({
      account_id:        account.id,
      account_login:     account_login,
      structure_id:      account.structure_id,
      current_balance:   balance,
      current_equity:    equity,
      profit_percentage: Math.round(profitPct * 100) / 100,
      snapshot_date:     today,
    }, { onConflict: 'account_id,snapshot_date' })

    return new Response(JSON.stringify({ success: true, account_id: account.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
