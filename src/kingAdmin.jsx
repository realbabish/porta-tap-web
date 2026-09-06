import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Footer from './footer';
import {
  ArrowRight,
  Building2,
  LogOut,
  Plus,
  Crown,
  Radio,
  Layers,
  MapPin,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  Trash2,
  Edit3,
  Calendar
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';

export default function KingAdmin() {
  const [clients, setClients] = useState([]);
  const [stats, setStats] = useState({ totalClients: 0, totalSites: 0, totalUnits: 0, pendingTickets: 0 });
  const [form, setForm] = useState({
    companyName: '',
    contactEmail: '',
    adminName: '',
    adminEmail: '',
    adminPassword: ''
  });
  const [kingForm, setKingForm] = useState({ fullName: '', email: '', password: '' });

  // NEW STATES FOR EDITING
  const [editingClient, setEditingClient] = useState(null);
  const [editName, setEditName] = useState('');

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showKingModal, setShowKingModal] = useState(false);

  const navigate = useNavigate();

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      // 1. Fetch clients with related sites and units
      const { data: clientsData, error: clientError } = await supabase
        .from('clients')
        .select(`
          id,
          company_name,
          contact_email,
          created_at,
          sites (
            id,
            site_name,
            units (
              id
            )
          )
        `)
        .order('created_at', { ascending: false }); // Sort newest first

      if (clientError) throw clientError;

      // 2. Fetch pending ticket count
      const { count: pendingCount, error: ticketError } = await supabase
        .from('service_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (ticketError) console.warn('Ticket count note:', ticketError.message);

      const loadedClients = clientsData ?? [];
      setClients(loadedClients);

      // Compute aggregate stats
      let totalSitesCount = 0;
      let totalUnitsCount = 0;
      loadedClients.forEach((client) => {
        const sites = client.sites || [];
        totalSitesCount += sites.length;
        sites.forEach((site) => {
          totalUnitsCount += (site.units || []).length;
        });
      });

      setStats({
        totalClients: loadedClients.length,
        totalSites: totalSitesCount,
        totalUnits: totalUnitsCount,
        pendingTickets: pendingCount ?? 0,
      });
    } catch (err) {
      console.error('Error loading King Admin data:', err);
      setError(err.message || 'Failed to load system data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // --- NEW FEATURE: DELETE CUSTOMER ---
  const deleteCustomer = async (id, name) => {
    if (!window.confirm(`CRITICAL WARNING:\n\nAre you sure you want to delete ${name}?\n\nThis will permanently destroy their sites, units, and all ticket history. This action cannot be undone.`)) {
      return;
    }

    try {
      setError('');
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
      setSuccessMsg(`Organization "${name}" has been permanently deleted.`);
      loadData();
    } catch (err) {
      console.error('Error deleting customer:', err);
      setError(err.message);
    }
  };

  // --- NEW FEATURE: EDIT CUSTOMER NAME ---
  const updateCustomerName = async (e) => {
    e.preventDefault();
    try {
      setError('');
      const { error } = await supabase.from('clients').update({ company_name: editName }).eq('id', editingClient.id);
      if (error) throw error;
      setSuccessMsg('Client name updated successfully!');
      setEditingClient(null);
      loadData();
    } catch (err) {
      console.error('Error updating customer:', err);
      setError(err.message);
    }
  };

  const createCustomer = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      // 1. Insert company into `clients`
      const { data: clientRecord, error: clientInsertErr } = await supabase
        .from('clients')
        .insert({
          company_name: form.companyName.trim(),
          contact_email: form.contactEmail?.trim() || form.adminEmail.trim(),
        })
        .select('id, company_name')
        .single();

      if (clientInsertErr) throw new Error(`Could not create company: ${clientInsertErr.message}`);

      // 2. Provision admin user via database engine (Zero rate limit)
      const { error: userError } = await supabase.rpc('admin_create_user', {
        p_email: form.adminEmail.trim(),
        p_password: form.adminPassword,
        p_role: 'customer_admin',
        p_full_name: form.adminName?.trim() || '',
        p_client_id: clientRecord.id
      });

      if (userError) throw userError;

      setForm({ companyName: '', contactEmail: '', adminName: '', adminEmail: '', adminPassword: '' });
      setSuccessMsg(`Customer "${clientRecord.company_name}" created successfully!`);
      await loadData();
      navigate(`/king-admin/customers/${clientRecord.id}`);
    } catch (err) {
      console.error('Error creating customer:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const createKingAdmin = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      const { error: userError } = await supabase.rpc('admin_create_user', {
        p_email: kingForm.email.trim(),
        p_password: kingForm.password,
        p_role: 'king_admin',
        p_full_name: kingForm.fullName?.trim() || ''
      });

      if (userError) throw userError;

      setKingForm({ fullName: '', email: '', password: '' });
      setSuccessMsg(`Superadmin ${kingForm.email} created successfully.`);
      setShowKingModal(false);
      await loadData();
    } catch (err) {
      console.error('Error creating King Admin:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-amber-500 selection:text-black">
      {/* Top Banner Navigation Bar */}
      <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Logo size="md" variant="horizontal" />
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-lg shadow-amber-500/10">
              <Crown className="w-3.5 h-3.5" />
              King Admin Superuser
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white transition shadow-sm"
              title="Inspect Live Dispatch View"
            >
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              Dispatch Dashboard
            </button>

            <button
              onClick={() => setShowKingModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-amber-500/10 border border-amber-500/30 hover:border-amber-400 text-amber-300 transition shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              Add King
            </button>

            <button
              onClick={logout}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-900/60 hover:text-rose-300 text-slate-400 transition"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-6 md:p-8 animate-fade-in">
        {/* Flash Messages */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-rose-800/80 bg-rose-950/50 p-4 text-sm text-rose-200 shadow-lg animate-slide-up">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-800/80 bg-emerald-950/50 p-4 text-sm text-emerald-200 shadow-lg animate-slide-up">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Executive Metrics Overview */}
        <section className="mb-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl relative overflow-hidden group hover:border-amber-500/40 hover:-translate-y-1 transition-all duration-300">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-transform duration-500">
              <Building2 className="w-14 h-14 text-amber-400" />
            </div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Customer Companies</p>
            <h3 className="mt-2 text-3xl font-black text-white">{stats.totalClients}</h3>
            <p className="mt-1 text-xs text-amber-400/80">Active organizations</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl relative overflow-hidden group hover:border-blue-500/40 hover:-translate-y-1 transition-all duration-300">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-transform duration-500">
              <MapPin className="w-14 h-14 text-blue-400" />
            </div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Sites</p>
            <h3 className="mt-2 text-3xl font-black text-white">{stats.totalSites}</h3>
            <p className="mt-1 text-xs text-blue-400/80">Deployed work locations</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl relative overflow-hidden group hover:border-cyan-500/40 hover:-translate-y-1 transition-all duration-300">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-transform duration-500">
              <Layers className="w-14 h-14 text-cyan-400" />
            </div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Equipment Units</p>
            <h3 className="mt-2 text-3xl font-black text-white">{stats.totalUnits}</h3>
            <p className="mt-1 text-xs text-cyan-400/80">Restrooms in service</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl relative overflow-hidden group hover:border-rose-500/40 hover:-translate-y-1 transition-all duration-300">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-transform duration-500">
              <Radio className="w-14 h-14 text-rose-400" />
            </div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Alerts</p>
            <h3 className="mt-2 text-3xl font-black text-white">{stats.pendingTickets}</h3>
            <p className="mt-1 text-xs text-rose-400/80">Awaiting technician action</p>
          </div>
        </section>

        {/* Main Work Area: Customers Directory + Quick Provisioning */}
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] items-start">
          {/* Customers Directory */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-amber-400" />
                  Client Organizations
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Manage assigned sites, equipment, cleaners, and history.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-12 text-center text-slate-400">
                <div className="animate-spin w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full mx-auto mb-3"></div>
                Loading organizations...
              </div>
            ) : clients.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
                <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-white">No Customer Organizations Yet</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Use the registration form on the right to provision your first customer organization and admin account.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {clients.map((client) => {
                  const siteList = client.sites || [];
                  const unitCount = siteList.reduce((acc, s) => acc + (s.units?.length || 0), 0);
                  const enrollDate = new Date(client.created_at).toLocaleDateString();

                  return (
                    <div
                      key={client.id}
                      className="group relative rounded-2xl border border-slate-800/90 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-5 text-left transition-all duration-300 hover:border-amber-500/50 hover:shadow-xl hover:shadow-amber-500/5 flex flex-col"
                    >
                      <div className="flex items-start justify-between">
                        <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-amber-400 group-hover:bg-amber-500/10 group-hover:border-amber-500/30 transition">
                          <Building2 className="h-6 w-6" />
                        </div>
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <button
                            onClick={() => { setEditingClient(client); setEditName(client.company_name); }}
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-blue-600/30 transition"
                            title="Edit Client Name"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteCustomer(client.id, client.company_name)}
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-rose-600/30 transition"
                            title="Delete Client"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <h3 className="mt-4 text-lg font-bold text-white group-hover:text-amber-300 transition line-clamp-1">
                        {client.company_name}
                      </h3>

                      <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        Enrolled: {enrollDate}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                        <span className="text-slate-400">
                          Sites: <strong className="text-slate-200">{siteList.length}</strong> |
                          Units: <strong className="text-slate-200 ml-1">{unitCount}</strong>
                        </span>
                      </div>

                      <button
                        onClick={() => navigate(`/king-admin/customers/${client.id}`)}
                        className="mt-4 w-full py-2.5 bg-slate-800/50 hover:bg-amber-500 text-slate-300 hover:text-slate-950 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
                      >
                        Enter Workspace <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Provision New Customer Form */}
          <section className="rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl pointer-events-none"></div>

            <div className="mb-5">
              <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20 mb-2">
                Onboarding
              </span>
              <h2 className="text-xl font-bold text-white">Create Customer</h2>
              <p className="text-xs text-slate-400 mt-1">
                Creates the company profile and provisions their initial Customer Admin credentials.
              </p>
            </div>

            {/* autoComplete="off" prevents browser autofill popup */}
            <form onSubmit={createCustomer} className="space-y-3.5" autoComplete="off">

              {/* THE FIX: Fake inputs to trap the browser's aggressive autofill injection */}
              <input type="text" style={{ display: 'none' }} />
              <input type="password" style={{ display: 'none' }} />

              <Field
                label="Company Name"
                placeholder="e.g. Acme Construction LLC"
                value={form.companyName}
                set={(v) => setForm({ ...form, companyName: v })}
                autoComplete="off"
              />

              <Field
                label="Company Contact Email"
                type="email"
                placeholder="ops@acmeconstruction.com"
                value={form.contactEmail}
                set={(v) => setForm({ ...form, contactEmail: v })}
                optional
                autoComplete="off"
              />

              <div className="pt-2 border-t border-slate-800">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Initial Admin Account
                </p>

                <div className="space-y-3">
                  <Field
                    label="Admin Contact Name"
                    placeholder="e.g. Jane Doe"
                    value={form.adminName}
                    set={(v) => setForm({ ...form, adminName: v })}
                    optional
                    autoComplete="off"
                  />

                  <Field
                    label="Admin Login Email"
                    type="email"
                    placeholder="admin@acmeconstruction.com"
                    value={form.adminEmail}
                    set={(v) => setForm({ ...form, adminEmail: v })}
                    autoComplete="new-password"
                  />

                  <Field
                    label="Temporary Password"
                    type="password"
                    placeholder="Minimum 6 characters"
                    value={form.adminPassword}
                    set={(v) => setForm({ ...form, adminPassword: v })}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 transition py-3 text-sm font-bold text-slate-950 disabled:opacity-50 shadow-lg shadow-amber-500/20"
              >
                <Plus className="h-4 w-4 stroke-[2.5]" />
                {saving ? 'Provisioning Customer...' : 'Create Customer & Admin'}
              </button>
            </form>
          </section>
        </div>
        <Footer />
      </main>

      {/* Edit Client Modal */}
      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-3xl border border-blue-500/30 bg-slate-900 p-6 shadow-2xl relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <Edit3 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Edit Configuration</h3>
                <p className="text-xs text-slate-400">Update the organization's details.</p>
              </div>
            </div>

            <form onSubmit={updateCustomerName} className="space-y-4">
              <Field
                label="Company Name"
                value={editName}
                set={(v) => setEditName(v)}
              />
              <div className="mt-5 flex items-center gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingClient(null)}
                  className="flex-1 py-2.5 text-xs font-semibold rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal for adding another King Admin */}
      {showKingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-3xl border border-amber-500/30 bg-slate-900 p-6 shadow-2xl relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Crown className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Add King Admin</h3>
                <p className="text-xs text-slate-400">Grants full superadmin control over all systems.</p>
              </div>
            </div>

            <form onSubmit={createKingAdmin} className="space-y-3.5" autoComplete="off">
              <input type="text" style={{ display: 'none' }} />
              <input type="password" style={{ display: 'none' }} />
              <Field
                label="Full Name"
                placeholder="Superadmin Name"
                value={kingForm.fullName}
                set={(v) => setKingForm({ ...kingForm, fullName: v })}
                optional
                autoComplete="off"
              />
              <Field
                label="Email"
                type="email"
                placeholder="superadmin@shrestha.com"
                value={kingForm.email}
                set={(v) => setKingForm({ ...kingForm, email: v })}
                autoComplete="new-password"
              />
              <Field
                label="Temporary Password"
                type="password"
                placeholder="Secure temporary password"
                value={kingForm.password}
                set={(v) => setKingForm({ ...kingForm, password: v })}
                autoComplete="new-password"
              />

              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowKingModal(false)}
                  className="flex-1 py-2.5 text-xs font-semibold rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 transition disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Grant King Access'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Added the autoComplete prop to your Field component
function Field({ label, value, set, type = 'text', placeholder = '', optional = false, autoComplete = 'off' }) {
  return (
    <label className="block text-xs font-medium text-slate-300">
      <div className="flex items-center justify-between mb-1">
        <span>{label}</span>
        {optional && <span className="text-[10px] text-slate-500 font-normal">Optional</span>}
      </div>
      <input
        required={!optional}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => set(event.target.value)}
        autoComplete={autoComplete}
        className="w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 transition focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
      />
    </label>
  );
}