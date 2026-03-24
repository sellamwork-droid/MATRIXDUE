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
    // Admin client — uses service role key (set in Supabase dashboard secrets)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Caller client — verify the calling user is admin
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

    // Verify caller is admin
    const { data: roleRow } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .single()

    if (!roleRow || roleRow.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Accesso negato — solo admin' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { email, password, fullName, role, structureId } = await req.json()

    if (!email || !password || !structureId) {
      return new Response(JSON.stringify({ error: 'Parametri mancanti: email, password, structureId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create auth user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || '' },
    })

    if (createError || !newUser.user) {
      return new Response(JSON.stringify({ error: createError?.message || 'Errore creazione utente' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const userId = newUser.user.id

    // Upsert profile (trigger may have already created it)
    await supabaseAdmin.from('profiles').upsert({
      id: userId,
      email,
      full_name: fullName || '',
      active_structure_id: structureId,
    })

    // Assign role
    await supabaseAdmin.from('user_roles').upsert({ user_id: userId, role: role || 'trader' })

    // Grant structure access
    await supabaseAdmin.from('user_structure_access').upsert({
      user_id: userId,
      structure_id: structureId,
      is_owner: false,
    })

    return new Response(JSON.stringify({ success: true, userId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
