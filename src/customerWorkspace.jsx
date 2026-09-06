import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';
import {
  ArrowLeft, MapPin, Plus, Users, Wrench, CheckCircle2,
  AlertCircle, Layers, Trash2, Edit3, Clock, Image as ImageIcon,
  Search, Archive, History, X, ChevronDown, BarChart3,
  ShieldAlert, Droplets, Sparkles, AlertTriangle, RefreshCw,
  CheckCircle, Filter
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import Logo from './Logo';

const TYPE_META = {
  cleaning:     { label: 'Cleaning',    icon: Droplets,      color: 'text-blue-400',    pill: 'bg-blue-500/10 border-blue-500/20 text-blue-300' },
  supplies:     { label: 'Supplies',    icon: Sparkles,      color: 'text-emerald-400', pill: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' },
  repair:       { label: 'Repair',      icon: AlertTriangle, color: 'text-amber-400',   pill: 'bg-amber-500/10 border-amber-500/20 text-amber-300' },
  out_of_order: { label: 'Out of Order',icon: ShieldAlert,   color: 'text-rose-400',    pill: 'bg-rose-500/10 border-rose-500/20 text-rose-300' },
};

const STATUS_META = {
  pending:     { label: 'Pending',     style: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  in_progress: { label: 'In Progress', style: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  resolved:    { label: 'Resolved',    style: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
};

export default function CustomerWorkspace({ ownCustomer = false }) {
  const { clientId: routeClientId } = useParams();
  const [clientId, setClientId] = useState(routeClientId ?? '');
  const [client, setClient] = useState(null);
  const [sites, setSites] = useState([]);
  const [units, setUnits] = useState([]);
  const [cleaners, setCleaners] = useState([]);
  const [tickets, setTickets] = useState([]);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Search + filter
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState('active'); // 'active' | 'resolved' | 'all'
  const [unitSearch, setUnitSearch] = useState('');

  // Modals
  const [editingSite, setEditingSite]   = useState(null);
  const [editName, setEditName]         = useState('');
  const [historyUnit, setHistoryUnit]   = useState(null); // unit ID for history modal
  const [historyTickets, setHistoryTickets] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type, id, label, fn }

  // Forms
  const [siteForm, setSiteForm]     = useState({ name: '', address: '' });
  const [unitForm, setUnitForm]     = useState({ id: '', siteId: '' });
  const [cleanerForm, setCleanerForm] = useState({ name: '', username: '', password: '', siteId: '' });

  const navigate = useNavigate();

  // ─── Data load ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setError('');
    let activeClientId = routeClientId;

    if (ownCustomer) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setError('Please sign in.');
      const { data } = await supabase.from('client_users').select('client_id').eq('user_id', user.id).maybeSingle();
      activeClientId = data?.client_id;
    }

    if (!activeClientId) {
      setError('No customer organization is assigned to this account.');
      setLoading(false);
      return;
    }
    setClientId(activeClientId);

    try {
      const [clientResult, sitesResult, cleanersResult] = await Promise.all([
        supabase.from('clients').select('id, company_name, contact_email').eq('id', activeClientId).single(),
        supabase.from('sites').select('id, site_name, address').eq('client_id', activeClientId).order('site_name'),
        supabase.from('cleaner_users').select('user_id, cleaner_name').eq('client_id', activeClientId).order('cleaner_name'),
      ]);

      setClient(clientResult.data);
      const loadedSites = sitesResult.data ?? [];
      setSites(loadedSites);
      setCleaners(cleanersResult.data ?? []);

      const siteIds = loadedSites.map(s => s.id);
      if (siteIds.length > 0) {
        const { data: unitData } = await supabase
          .from('units').select('id, site_id, status').in('site_id', siteIds).order('id');
        setUnits(unitData ?? []);

        const unitIds = (unitData ?? []).map(u => u.id);
        if (unitIds.length > 0) {
          const { data: ticketData } = await supabase
            .from('service_requests').select('*').in('unit_id', unitIds)
            .order('created_at', { ascending: false });
          setTickets(ticketData ?? []);
        } else setTickets([]);
      } else { setUnits([]); setTickets([]); }
    } catch (err) {
      setError('Failed to load workspace data');
    } finally {
      setLoading(false);
    }
  }, [routeClientId, ownCustomer]);

  useEffect(() => { load(); }, [load]);

  // ─── CRUD helpers ──────────────────────────────────────────────────────────
  const save = async (actionFn, successMessage) => {
    setSaving(true); setError(''); setSuccessMsg('');
    try {
      const { error: saveError } = await actionFn();
      if (saveError) throw saveError;
      setSuccessMsg(successMessage);
      await load();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const createSite = (e) => {
    e.preventDefault();
    save(() => supabase.from('sites').insert({ client_id: clientId, site_name: siteForm.name.trim(), address: siteForm.address.trim() }), 'Site added successfully.');
    setSiteForm({ name: '', address: '' });
  };

  const createUnit = (e) => {
    e.preventDefault();
    save(() => supabase.from('units').insert({ id: unitForm.id.trim(), site_id: unitForm.siteId, status: 'active' }), 'Unit registered.');
    setUnitForm({ id: '', siteId: '' });
  };

  const createCleaner = async (e) => {
    e.preventDefault();
    setSaving(true); setError(''); setSuccessMsg('');
    const generatedEmail = `${cleanerForm.username.trim().toLowerCase().replace(/\s+/g, '')}@cleaners.local`;
    try {
      const { error: rpcError } = await supabase.rpc('admin_create_user', {
        p_email: generatedEmail, p_password: cleanerForm.password,
        p_role: 'cleaner', p_full_name: cleanerForm.name.trim(),
        p_client_id: clientId, p_site_id: cleanerForm.siteId || null
      });
      if (rpcError) throw rpcError;
      setSuccessMsg(`Technician authorized! Login username: "${cleanerForm.username}"`);
      setCleanerForm({ name: '', username: '', password: '', siteId: '' });
      await load();
    } catch (err) { setError(err.message || 'Failed to create cleaner.'); }
    finally { setSaving(false); }
  };

  // Delete actions go through confirmation modal
  const confirmDelete = (type, id, label, fn) => setDeleteConfirm({ type, id, label, fn });

  const updateSiteName = (e) => {
    e.preventDefault();
    save(() => supabase.from('sites').update({ site_name: editName }).eq('id', editingSite.id), 'Site updated.');
    setEditingSite(null);
  };

  const updateTicketStatus = (id, currentStatus) => {
    const nextStatus = currentStatus === 'pending' ? 'in_progress' : currentStatus === 'in_progress' ? 'resolved' : 'pending';
    save(() => supabase.from('service_requests').update({ status: nextStatus }).eq('id', id), `Status → ${nextStatus.replace('_', ' ')}`);
  };

  // ─── Unit history modal ────────────────────────────────────────────────────
  const openHistory = async (unitId) => {
    setHistoryUnit(unitId);
    setHistoryLoading(true);
    const { data } = await supabase
      .from('service_requests').select('*').eq('unit_id', unitId)
      .order('created_at', { ascending: false });
    setHistoryTickets(data ?? []);
    setHistoryLoading(false);
  };

  // ─── Filtered tickets ──────────────────────────────────────────────────────
  const filteredTickets = tickets.filter(t => {
    const matchesSearch = !ticketSearch ||
      t.unit_id.toLowerCase().includes(ticketSearch.toLowerCase()) ||
      t.request_type.toLowerCase().includes(ticketSearch.toLowerCase());

    const matchesStatus =
      ticketStatusFilter === 'all' ? true :
      ticketStatusFilter === 'active' ? (t.status === 'pending' || t.status === 'in_progress') :
      t.status === 'resolved';

    return matchesSearch && matchesStatus;
  });

  // Group by unit_id for grouped display
  const groupedTickets = filteredTickets.reduce((acc, t) => {
    if (!acc[t.unit_id]) acc[t.unit_id] = [];
    acc[t.unit_id].push(t);
    return acc;
  }, {});

  const filteredUnits = units.filter(u =>
    !unitSearch || u.id.toLowerCase().includes(unitSearch.toLowerCase())
  );

  // Compute stats
  const pendingCount = tickets.filter(t => t.status === 'pending').length;
  const inProgressCount = tickets.filter(t => t.status === 'in_progress').length;
  const resolvedCount = tickets.filter(t => t.status === 'resolved').length;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 p-5 text-slate-200 md:p-8 font-sans selection:bg-amber-500 selection:text-black">
      <div className="mx-auto max-w-6xl">

        {/* Nav */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-5 mb-8">
          <button onClick={() => navigate(ownCustomer ? '/dashboard' : '/king-admin')}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2 text-xs font-semibold hover:border-slate-600 hover:text-white transition">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center gap-3">
            <button onClick={load} className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 transition" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
            <Logo size="sm" variant="horizontal" />
          </div>
        </div>

        {/* Header */}
        <header className="mb-8">
          <span className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/30">
            {ownCustomer ? 'Customer Admin Workspace' : 'Superadmin Workspace'}
          </span>
          <h1 className="mt-2 text-3xl font-extrabold text-white">{client?.company_name || 'Loading...'}</h1>
        </header>

        {/* Alerts */}
        {error && <div className="mb-6 flex gap-3 rounded-xl border border-rose-800 bg-rose-950/50 p-4 text-sm text-rose-200"><AlertCircle className="w-5 h-5 shrink-0" />{error}</div>}
        {successMsg && <div className="mb-6 flex gap-3 rounded-xl border border-emerald-800 bg-emerald-950/50 p-4 text-sm text-emerald-200"><CheckCircle2 className="w-5 h-5 shrink-0" />{successMsg}</div>}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: 'Pending', count: pendingCount, color: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/5' },
            { label: 'In Progress', count: inProgressCount, color: 'text-blue-400', border: 'border-blue-500/20', bg: 'bg-blue-500/5' },
            { label: 'Resolved', count: resolvedCount, color: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5' },
          ].map(s => (
            <div key={s.label} className={`rounded-2xl border ${s.border} ${s.bg} p-4 text-center`}>
              <p className={`text-2xl font-black ${s.color}`}>{s.count}</p>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Create Panels */}
        <div className="grid gap-5 md:grid-cols-3 mb-8">
          <Panel title="Add Site" icon={MapPin} color="blue">
            <form onSubmit={createSite} className="space-y-3" autoComplete="off">
              <Input label="Site Name" value={siteForm.name} set={(v) => setSiteForm({ ...siteForm, name: v })} />
              <Input label="Address" value={siteForm.address} set={(v) => setSiteForm({ ...siteForm, address: v })} optional />
              <SaveButton saving={saving} label="Create Site" color="blue" />
            </form>
          </Panel>

          <Panel title="Assign Unit" icon={Layers} color="amber">
            <form onSubmit={createUnit} className="space-y-3" autoComplete="off">
              <Input label="Unit ID (e.g. UNIT-101)" value={unitForm.id} set={(v) => setUnitForm({ ...unitForm, id: v })} />
              <SiteSelect label="Deploy to Site" value={unitForm.siteId} set={(v) => setUnitForm({ ...unitForm, siteId: v })} sites={sites} />
              <SaveButton saving={saving} label="Register Unit" color="amber" disabled={sites.length === 0} />
            </form>
          </Panel>

          <Panel title="Add Cleaner" icon={Users} color="emerald">
            <form onSubmit={createCleaner} className="space-y-3" autoComplete="off">
              <input type="text" style={{ display: 'none' }} />
              <input type="password" style={{ display: 'none' }} />
              <Input label="Technician Name" value={cleanerForm.name} set={(v) => setCleanerForm({ ...cleanerForm, name: v })} />
              <Input label="Login Username" placeholder="e.g. john_smith" value={cleanerForm.username} set={(v) => setCleanerForm({ ...cleanerForm, username: v })} />
              <Input label="Password" type="password" value={cleanerForm.password} set={(v) => setCleanerForm({ ...cleanerForm, password: v })} />
              <SiteSelect label="Assigned Site" value={cleanerForm.siteId} set={(v) => setCleanerForm({ ...cleanerForm, siteId: v })} sites={sites} />
              <SaveButton saving={saving} label="Authorize Tech" color="emerald" disabled={sites.length === 0} />
            </form>
          </Panel>
        </div>

        {/* Sites & Units + Cleaners */}
        <section className="grid gap-5 md:grid-cols-2 mb-8">
          {/* Sites & Units */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-white">
                <MapPin className="h-4 w-4 text-blue-400" /> Sites & Units
              </h2>
              <span className="text-[11px] text-slate-500">{sites.length} sites · {units.length} units</span>
            </div>

            {/* Unit search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                placeholder="Search units..."
                value={unitSearch}
                onChange={e => setUnitSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-700/60 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60"
              />
            </div>

            <div className="divide-y divide-slate-800/60 max-h-80 overflow-y-auto pr-1">
              {sites.map(site => {
                const siteUnits = filteredUnits.filter(u => u.site_id === site.id);
                return (
                  <div key={site.id} className="py-3.5 first:pt-0">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-bold text-white text-sm">{site.site_name}</p>
                        {site.address && <p className="text-[11px] text-slate-500">{site.address}</p>}
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => { setEditingSite(site); setEditName(site.site_name); }}
                          className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => confirmDelete('site', site.id, site.site_name, () =>
                          supabase.from('sites').delete().eq('id', site.id)
                        )} className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {siteUnits.map(u => {
                        const unitTickets = tickets.filter(t => t.unit_id === u.id && (t.status === 'pending' || t.status === 'in_progress'));
                        const alertCount = unitTickets.length;
                        return (
                          <div key={u.id} className="group flex items-center gap-1 rounded-lg bg-slate-950 border border-slate-700/80 pl-2 pr-1 py-1 text-[11px] hover:border-slate-600 transition">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${alertCount > 0 ? 'bg-rose-400 animate-pulse' : 'bg-emerald-400'}`} />
                            <span className="font-mono text-slate-300">{u.id}</span>
                            {alertCount > 0 && (
                              <span className="ml-0.5 px-1.5 py-0.5 bg-rose-500/20 text-rose-300 rounded-full text-[10px] font-bold">{alertCount}</span>
                            )}
                            <button
                              onClick={() => openHistory(u.id)}
                              className="ml-1 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-blue-400 transition"
                              title="View history"
                            >
                              <History className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => confirmDelete('unit', u.id, u.id, () =>
                                supabase.from('units').delete().eq('id', u.id)
                              )}
                              className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                      {siteUnits.length === 0 && (
                        <span className="text-[11px] text-slate-600 italic">No units</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cleaners */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
            <h2 className="flex items-center gap-2 text-base font-bold text-white mb-4">
              <Wrench className="h-4 w-4 text-emerald-400" /> Technicians
              <span className="ml-auto text-[11px] text-slate-500 font-normal">{cleaners.length} active</span>
            </h2>
            <div className="divide-y divide-slate-800/60 max-h-80 overflow-y-auto pr-1">
              {cleaners.length === 0 ? (
                <div className="py-8 text-center text-slate-600 text-sm">No technicians assigned yet.</div>
              ) : cleaners.map(cleaner => (
                <div key={cleaner.user_id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-[11px] font-bold text-slate-400">
                      {cleaner.cleaner_name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <p className="font-semibold text-white text-sm">{cleaner.cleaner_name}</p>
                  </div>
                  <button
                    onClick={() => confirmDelete('cleaner', cleaner.user_id, cleaner.cleaner_name, () =>
                      supabase.from('cleaner_users').delete().eq('user_id', cleaner.user_id)
                    )}
                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── TICKET BOARD ── */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
            <div className="flex items-center gap-2 flex-1">
              <Clock className="h-5 w-5 text-amber-400" />
              <h2 className="text-lg font-bold text-white">Service Tickets</h2>
            </div>

            {/* Status filter tabs */}
            <div className="flex gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
              {[
                { value: 'active',   label: 'Active' },
                { value: 'resolved', label: 'Resolved' },
                { value: 'all',      label: 'All' },
              ].map(f => (
                <button
                  key={f.value}
                  onClick={() => setTicketStatusFilter(f.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${ticketStatusFilter === f.value ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                placeholder="Search unit / type..."
                value={ticketSearch}
                onChange={e => setTicketSearch(e.target.value)}
                className="pl-8 pr-8 py-2 bg-slate-950 border border-slate-700/60 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/60 w-48"
              />
              {ticketSearch && (
                <button onClick={() => setTicketSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {Object.keys(groupedTickets).length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-xl">
              {ticketSearch || ticketStatusFilter !== 'active'
                ? 'No tickets match your filter.'
                : 'No active service tickets. All clear!'}
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedTickets).map(([unitId, unitTickets]) => {
                const activeCount = unitTickets.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
                const reasons = [...new Set(unitTickets.map(t => t.request_type))];
                const latestPhoto = unitTickets.find(t => t.user_photo_url)?.user_photo_url;

                return (
                  <div key={unitId} className="bg-slate-950 border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition">
                    {/* Unit Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-base font-black text-amber-400">{unitId}</span>
                        {activeCount > 0 && (
                          <span className="px-2 py-0.5 bg-rose-500/15 border border-rose-500/25 text-rose-300 text-[11px] font-bold rounded-full">
                            {activeCount} open
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => openHistory(unitId)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg border border-transparent hover:border-blue-500/20 transition font-medium"
                      >
                        <History className="w-3.5 h-3.5" /> History
                      </button>
                    </div>

                    {/* Issue type pills */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {reasons.map(type => {
                        const meta = TYPE_META[type] || TYPE_META.repair;
                        const Icon = meta.icon;
                        const cnt = unitTickets.filter(t => t.request_type === type).length;
                        return (
                          <div key={type} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${meta.pill}`}>
                            <Icon className="w-3.5 h-3.5" />
                            {meta.label}
                            {cnt > 1 && <span className="opacity-70">×{cnt}</span>}
                          </div>
                        );
                      })}
                    </div>

                    {/* Photo link if any */}
                    {latestPhoto && (
                      <a href={latestPhoto} target="_blank" rel="noreferrer"
                        className="mb-3 inline-flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 bg-blue-500/10 px-2.5 py-1 rounded-lg transition">
                        <ImageIcon className="w-3.5 h-3.5" /> View attached photo
                      </a>
                    )}

                    {/* Individual ticket rows (collapsed style) */}
                    <div className="space-y-1.5 border-t border-slate-800/60 pt-3">
                      {unitTickets.map(ticket => {
                        const statusMeta = STATUS_META[ticket.status] || STATUS_META.pending;
                        return (
                          <div key={ticket.id} className="flex items-center gap-3 text-xs">
                            <span className="text-slate-600 font-mono text-[10px]">
                              {new Date(ticket.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="capitalize text-slate-400 flex-1">{ticket.request_type.replace(/_/g, ' ')}</span>
                            <button
                              onClick={() => updateTicketStatus(ticket.id, ticket.status)}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition ${statusMeta.style}`}
                            >
                              {statusMeta.label}
                            </button>
                            <button
                              onClick={() => confirmDelete('ticket', ticket.id, `ticket for ${unitId}`, () =>
                                supabase.from('service_requests').delete().eq('id', ticket.id)
                              )}
                              className="p-1 text-slate-600 hover:text-rose-400 rounded transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>

      {/* ── Edit Site Modal ── */}
      {editingSite && (
        <Modal onClose={() => setEditingSite(null)} title="Edit Site Name">
          <form onSubmit={updateSiteName} className="space-y-4">
            <Input label="Site Name" value={editName} set={setEditName} />
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setEditingSite(null)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700 text-sm transition">Cancel</button>
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 text-sm transition">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteConfirm && (
        <Modal onClose={() => setDeleteConfirm(null)} title="Confirm Delete" danger>
          <p className="text-sm text-slate-400 mb-5">
            Are you sure you want to delete <strong className="text-white">"{deleteConfirm.label}"</strong>?
            {deleteConfirm.type === 'site' && <span className="block mt-1 text-rose-400 text-xs">This will also delete all its units and ticket history.</span>}
            This cannot be undone.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700 text-sm transition">Cancel</button>
            <button
              onClick={async () => {
                await save(deleteConfirm.fn, `${deleteConfirm.type} deleted.`);
                setDeleteConfirm(null);
              }}
              className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-500 text-sm transition"
            >
              Delete
            </button>
          </div>
        </Modal>
      )}

      {/* ── Unit History Modal ── */}
      {historyUnit && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold">Maintenance History</p>
                <h3 className="text-lg font-black text-white font-mono">{historyUnit}</h3>
              </div>
              <button onClick={() => setHistoryUnit(null)} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-5">
              {historyLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : historyTickets.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">No ticket history for this unit.</div>
              ) : (
                <div className="space-y-3">
                  {historyTickets.map(t => {
                    const meta = TYPE_META[t.request_type] || TYPE_META.repair;
                    const Icon = meta.icon;
                    const statusMeta = STATUS_META[t.status] || STATUS_META.pending;
                    return (
                      <div key={t.id} className="flex items-center gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${meta.color.replace('text-', 'bg-').replace('400', '500/10')}`}>
                          <Icon className={`w-4 h-4 ${meta.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white capitalize">{t.request_type.replace(/_/g, ' ')}</p>
                          <p className="text-[11px] text-slate-500">{new Date(t.created_at).toLocaleString()}</p>
                          {t.resolved_at && (
                            <p className="text-[11px] text-emerald-500">Resolved: {new Date(t.resolved_at).toLocaleString()}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {t.proof_photo_url && (
                            <a href={t.proof_photo_url} target="_blank" rel="noreferrer"
                              className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg transition">
                              <ImageIcon className="w-4 h-4" />
                            </a>
                          )}
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${statusMeta.style}`}>
                            {statusMeta.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reusable UI Components ─────────────────────────────────────────────────

function Modal({ title, onClose, children, danger = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded-3xl border ${danger ? 'border-rose-800/60' : 'border-slate-700'} bg-slate-900 p-6 shadow-2xl`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, color, children }) {
  const iconColors = { blue: 'text-blue-400', amber: 'text-amber-400', emerald: 'text-emerald-400' };
  return (
    <section className="rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-xl">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
        <Icon className={`h-4 w-4 ${iconColors[color]}`} />{title}
      </h2>
      {children}
    </section>
  );
}

function Input({ label, value, set, type = 'text', placeholder = '', optional = false }) {
  return (
    <label className="block text-xs font-medium text-slate-300">
      <div className="flex items-center justify-between mb-1">
        <span>{label}</span>{optional && <span className="text-[10px] text-slate-500">Optional</span>}
      </div>
      <input required={!optional} type={type} placeholder={placeholder} value={value}
        onChange={(e) => set(e.target.value)} autoComplete="off"
        className="w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-400 focus:outline-none" />
    </label>
  );
}

function SiteSelect({ label, value, set, sites }) {
  return (
    <label className="block text-xs font-medium text-slate-300">
      <span className="block mb-1">{label}</span>
      <select required value={value} onChange={(e) => set(e.target.value)}
        className="w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-400 focus:outline-none">
        <option value="">Select a site</option>
        {sites.map(site => <option key={site.id} value={site.id}>{site.site_name}</option>)}
      </select>
    </label>
  );
}

function SaveButton({ saving, label, color, disabled }) {
  const bgColors = {
    blue: 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20',
    amber: 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20',
    emerald: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
  };
  return (
    <button disabled={saving || disabled}
      className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition shadow-md active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed ${bgColors[color]}`}>
      <Plus className="h-3.5 w-3.5 stroke-[2.5]" /> {saving ? 'Saving…' : label}
    </button>
  );
}