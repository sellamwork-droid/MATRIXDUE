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

    const { api_key, account_login, id_identifier, event_type, message, metadata } = await req.json()

    if (!api_key || !event_type) {
      return new Response(JSON.stringify({ error: 'api_key e event_type obbligatori' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Find terminal by api_key via user_ids
    const { data: identity } = await supabase
      .from('user_ids')
      .select('id, structure_id')
      .eq('ea_api_key', api_key)
      .single()

    await supabase.from('rotation_logs').insert({
      structure_id:  identity?.structure_id ?? null,
      id_identifier: id_identifier ?? '',
      account_login: account_login ?? '',
      event_type,
      message:       message ?? '',
      metadata:      metadata ?? {},
    })

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
