import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )

    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Non autorizzato' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { account_id } = await req.json()
    if (!account_id) {
      return new Response(JSON.stringify({ error: 'account_id obbligatorio' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: account, error: fetchErr } = await supabase
      .from('mt5_accounts')
      .select('id, phase, current_balance, account_login, prop_firm_name, id_identifier, structure_id')
      .eq('id', account_id)
      .single()

    if (fetchErr || !account) {
      return new Response(JSON.stringify({ error: 'Account non trovato' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const nextPhase = account.phase === 'fase1' ? 'fase2' : account.phase === 'fase2' ? 'live' : null
    if (!nextPhase) {
      return new Response(JSON.stringify({ error: 'Account già in fase Live — nessuna promozione disponibile' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Promote
    await supabase.from('mt5_accounts').update({
      phase:               nextPhase,
      awaiting_promotion:  false,
      phase_needs_review:  false,
      initial_balance:     account.current_balance,
    }).eq('id', account_id)

    // Audit log
    await supabase.from('account_audit_log').insert({
      account_id:     account_id,
      account_login:  account.account_login,
      prop_firm_name: account.prop_firm_name,
      id_identifier:  account.id_identifier,
      structure_id:   account.structure_id,
      user_id:        caller.id,
      action:         'phase_promotion',
      details: {
        from_phase: account.phase,
        to_phase:   nextPhase,
        balance_at_promotion: account.current_balance,
      },
    })

    return new Response(JSON.stringify({ success: true, new_phase: nextPhase }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
