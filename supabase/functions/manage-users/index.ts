import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const respond = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return respond({ error: 'Sign in first.' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const adminClient = createClient(url, serviceRoleKey);
  const { data: { user: caller } } = await callerClient.auth.getUser();
  if (!caller) return respond({ error: 'Invalid session.' }, 401);

  const payload = await request.json();
  const { data: kingRole } = await adminClient.from('king_admins').select('user_id').eq('user_id', caller.id).maybeSingle();
  const { data: customerRole } = await adminClient.from('client_users').select('client_id').eq('user_id', caller.id).maybeSingle();
  const isKing = Boolean(kingRole);

  if (payload.action === 'create-king-admin') {
    if (!isKing) return respond({ error: 'Only an existing King Admin can create another King Admin.' }, 403);
    const { email, password, fullName } = payload;
    if (![email, password].every((value) => typeof value === 'string' && value.trim())) {
      return respond({ error: 'Email and temporary password are required.' }, 400);
    }
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName?.trim() || '', role: 'king_admin' },
    });
    if (authError) return respond({ error: authError.message }, 400);
    const { error: roleError } = await adminClient.from('king_admins').insert({ user_id: authData.user.id });
    if (roleError) return respond({ error: roleError.message }, 400);
    return respond({ kingAdmin: { userId: authData.user.id, email: email.trim() } });
  }

  if (payload.action === 'create-customer') {
    if (!isKing) return respond({ error: 'Only King Admins can create customers.' }, 403);

    const { companyName, contactEmail, adminName, adminEmail, adminPassword } = payload;
    if (![companyName, adminEmail, adminPassword].every((value) => typeof value === 'string' && value.trim())) {
      return respond({ error: 'Company name, admin email, and temporary password are required.' }, 400);
    }

    const { data: client, error: clientError } = await adminClient
      .from('clients')
      .insert({ company_name: companyName.trim(), contact_email: contactEmail?.trim() || adminEmail.trim() })
      .select('id, company_name')
      .single();
    if (clientError) return respond({ error: clientError.message }, 400);

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: adminEmail.trim(),
      password: adminPassword,
      email_confirm: true,
      user_metadata: { full_name: adminName?.trim() || '', role: 'customer_admin' },
    });
    if (authError) return respond({ error: authError.message }, 400);

    const { error: roleError } = await adminClient.from('client_users').insert({ user_id: authData.user.id, client_id: client.id });
    if (roleError) return respond({ error: roleError.message }, 400);
    return respond({ client });
  }

  if (payload.action === 'create-cleaner') {
    if (!isKing && !customerRole?.client_id) return respond({ error: 'Only Customer Admins can create cleaners.' }, 403);

    const clientId = isKing ? payload.clientId : customerRole!.client_id;
    const { cleanerName, email, password, siteIds } = payload;
    if (![cleanerName, email, password].every((value) => typeof value === 'string' && value.trim()) || !Array.isArray(siteIds) || !siteIds.length) {
      return respond({ error: 'Cleaner name, email, password, and at least one site are required.' }, 400);
    }

    const { data: authorizedSites, error: sitesError } = await adminClient
      .from('sites')
      .select('id')
      .eq('client_id', clientId)
      .in('id', siteIds);
    if (sitesError || authorizedSites?.length !== siteIds.length) return respond({ error: 'One or more selected sites are invalid.' }, 400);

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { full_name: cleanerName.trim(), role: 'cleaner' },
    });
    if (authError) return respond({ error: authError.message }, 400);

    const { error: cleanerError } = await adminClient.from('cleaner_users').insert({
      user_id: authData.user.id,
      cleaner_name: cleanerName.trim(),
      client_id: clientId,
    });
    if (cleanerError) return respond({ error: cleanerError.message }, 400);

    const { error: assignmentError } = await adminClient.from('cleaner_site_assignments').insert(
      siteIds.map((siteId: string) => ({ user_id: authData.user.id, site_id: siteId })),
    );
    if (assignmentError) return respond({ error: assignmentError.message }, 400);
    return respond({ cleaner: { userId: authData.user.id, cleanerName: cleanerName.trim() } });
  }

  return respond({ error: 'Unknown action.' }, 400);
});
