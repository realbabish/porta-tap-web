import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import {
  Wrench, Camera, ShieldCheck, Image as ImageIcon, LogOut,
  AlertTriangle, Droplets, Sparkles, ShieldAlert, CheckCircle2,
  RefreshCw, X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import Footer from './footer';

const TYPE_META = {
  cleaning: { label: 'Needs Cleaning', icon: Droplets, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  supplies: { label: 'Out of Supplies', icon: Sparkles, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  repair: { label: 'Needs Repair', icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  out_of_order: { label: 'Out of Order', icon: ShieldAlert, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
};

export default function Cleaner() {
  const [unitId, setUnitId] = useState('');
  const [tickets, setTickets] = useState([]);    // ALL pending tickets for this unit
  const [cleanerName, setCleanerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false); // confirmation modal
  const [mounted, setMounted] = useState(false);

  const navigate = useNavigate();

  // ─── Auth + fetch ─────────────────────────────────────────────────────────
  const fetchTickets = useCallback(async (id) => {
    if (!id) return;
    const { data } = await supabase
      .from('service_requests')
      .select('*')
      .eq('unit_id', id)
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: true });
    setTickets(data ?? []);
  }, []);

  useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('unit_id');
      setUnitId(id || '');

      // Auth check
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/login'); return; }

      const { data: profile, error: profileErr } = await supabase
        .from('cleaner_users')
        .select('cleaner_name')
        .eq('user_id', user.id)
        .single();

      if (profileErr || !profile) {
        alert('Your account does not have technician privileges.');
        navigate('/login');
        return;
      }

      setCleanerName(profile.cleaner_name);

      if (id) await fetchTickets(id);
      setLoading(false);
      setTimeout(() => setMounted(true), 50);
    };

    init();
  }, [navigate, fetchTickets]);

  // ─── Real-time subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!unitId) return;

    const channel = supabase
      .channel(`unit-tickets-${unitId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_requests',
          filter: `unit_id=eq.${unitId}`,
        },
        () => fetchTickets(unitId)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [unitId, fetchTickets]);

  // ─── Resolve ALL tickets for this unit ────────────────────────────────────
  const handleResolveAll = async (file) => {
    setResolving(true);
    try {
      let proofUrl = null;

      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `proof/proof_${unitId}_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('service-photos')
          .upload(fileName, file);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('service-photos')
          .getPublicUrl(fileName);
        proofUrl = publicUrl;
      }

      // Resolve ALL pending/in_progress tickets for this unit in one shot
      const ticketIds = tickets.map(t => t.id);
      const { error: updateError } = await supabase
        .from('service_requests')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          ...(proofUrl ? { proof_photo_url: proofUrl } : {}),
        })
        .in('id', ticketIds);

      if (updateError) throw updateError;

      setTickets([]);
      setShowConfirm(false);

      confetti({ particleCount: 120, spread: 80, origin: { y: 0.55 }, colors: ['#34d399', '#6ee7b7', '#a7f3d0'] });
    } catch (err) {
      console.error('Error resolving:', err);
      alert('Failed to resolve tickets. Please try again.');
    } finally {
      setResolving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  // ─── Ticket count + unique reasons ────────────────────────────────────────
  const ticketCount = tickets.length;
  const reasons = [...new Set(tickets.map(t => t.request_type))]; // unique types
  const hasPhoto = tickets.some(t => t.user_photo_url);
  const photoUrl = tickets.find(t => t.user_photo_url)?.user_photo_url;

  // ─── UI ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col max-w-md mx-auto p-5 selection:bg-blue-500 selection:text-white">

      {/* Fixed background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-blue-600/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-emerald-500/5 rounded-full blur-3xl" />
      </div>

      {/* Top Bar */}
      <div className="relative z-10 flex items-center justify-between mb-5 pt-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-500/20 border border-blue-500/30 rounded-xl flex items-center justify-center">
            <Wrench className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 leading-none">Technician</p>
            <p className="text-sm font-bold text-white leading-tight">{cleanerName || '—'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchTickets(unitId)}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 transition"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 hover:text-rose-400 hover:border-rose-900/60 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">Checking dispatch system...</p>
          </div>

        ) : !unitId ? (
          /* No unit scanned */
          <div
            className="flex-1 flex flex-col items-center justify-center text-center transition-all duration-700"
            style={{ opacity: mounted ? 1 : 0 }}
          >
            <div className="w-24 h-24 bg-slate-900 border border-slate-800 rounded-3xl flex items-center justify-center mb-5 shadow-xl">
              <ShieldCheck className="w-12 h-12 text-slate-700" />
            </div>
            <h2 className="text-xl font-bold text-slate-200">Ready for Work</h2>
            <p className="text-sm text-slate-500 mt-2 max-w-[240px]">
              Scan or tap an NFC tag on a unit to load its service requests.
            </p>
          </div>

        ) : ticketCount > 0 ? (
          /* Active tickets card */
          <div
            className="transition-all duration-700"
            style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(12px)' }}
          >
            {/* Unit Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold">Unit</p>
                <p className="text-2xl font-black text-white font-mono">{unitId}</p>
              </div>
              <div className="text-right">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/15 border border-rose-500/30 rounded-full">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                  </span>
                  <span className="text-xs font-bold text-rose-300">
                    {ticketCount} Open {ticketCount === 1 ? 'Request' : 'Requests'}
                  </span>
                </div>
              </div>
            </div>

            {/* Issues breakdown */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-4 shadow-xl">
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold mb-3">
                Reported Issues
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {reasons.map(type => {
                  const meta = TYPE_META[type] || TYPE_META.repair;
                  const Icon = meta.icon;
                  const count = tickets.filter(t => t.request_type === type).length;
                  return (
                    <div
                      key={type}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${meta.bg} text-sm`}
                    >
                      <Icon className={`w-4 h-4 ${meta.color}`} />
                      <span className="font-semibold text-white">{meta.label}</span>
                      {count > 1 && (
                        <span className={`text-xs font-bold ${meta.color} bg-black/20 px-1.5 py-0.5 rounded-full`}>
                          ×{count}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Timeline of individual taps */}
              <div className="border-t border-slate-800/80 pt-3">
                <p className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold mb-2">Tap Log</p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {tickets.map((t, i) => {
                    const meta = TYPE_META[t.request_type] || TYPE_META.repair;
                    const Icon = meta.icon;
                    return (
                      <div key={t.id} className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="text-slate-700 w-4 text-right shrink-0">#{i + 1}</span>
                        <Icon className={`w-3.5 h-3.5 ${meta.color} shrink-0`} />
                        <span className="capitalize">{t.request_type.replace(/_/g, ' ')}</span>
                        <span className="ml-auto text-slate-600 font-mono text-[10px]">
                          {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Reporter photo if any */}
            {hasPhoto && (
              <a
                href={photoUrl}
                target="_blank"
                rel="noreferrer"
                className="group block overflow-hidden rounded-2xl border border-slate-700 mb-4 hover:border-blue-500/70 transition"
              >
                <img
                  src={photoUrl}
                  alt="Reporter photo"
                  className="h-44 w-full object-cover group-hover:scale-105 transition duration-300"
                />
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/80 text-sm text-blue-300">
                  <ImageIcon className="w-4 h-4" />
                  View reporter photo full size
                </div>
              </a>
            )}

            {/* CTA Buttons */}
            <div className="space-y-3">
              {/* Snap photo to resolve */}
              <label className={`flex items-center justify-center gap-3 w-full py-4 px-5 rounded-2xl font-bold text-base cursor-pointer transition-all shadow-lg shadow-blue-600/20 active:scale-[0.97] ${resolving ? 'bg-blue-800 opacity-70 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500'}`}>
                {resolving ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Resolving All...
                  </>
                ) : (
                  <>
                    <Camera className="w-5 h-5" />
                    Snap Photo & Mark Unit Clean
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleResolveAll(file);
                  }}
                  disabled={resolving}
                />
              </label>

              {/* Resolve without photo */}
              <button
                onClick={() => setShowConfirm(true)}
                disabled={resolving}
                className="w-full py-3 px-5 rounded-2xl border border-slate-700 hover:border-emerald-700/60 bg-slate-900 hover:bg-emerald-950/30 text-slate-300 hover:text-emerald-300 text-sm font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                Mark Unit Clean (No Photo)
              </button>
            </div>
          </div>

        ) : (
          /* All clear */
          <div
            className="flex-1 flex flex-col items-center justify-center text-center transition-all duration-700"
            style={{ opacity: mounted ? 1 : 0 }}
          >
            <div className="w-24 h-24 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mb-5 shadow-[0_0_40px_rgba(16,185,129,0.1)]">
              <ShieldCheck className="w-12 h-12 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-100">Unit is Clear</h2>
            {unitId && (
              <p className="text-sm text-slate-500 mt-1.5 font-mono">{unitId}</p>
            )}
            <p className="text-sm text-slate-500 mt-2 max-w-[220px]">
              No pending service requests. Great work!
            </p>
          </div>
        )}
      </main>
      <Footer />

      {/* Confirm Modal (resolve without photo) */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">Mark Unit Clean?</h3>
                <p className="text-xs text-slate-400 mt-1">
                  This will resolve all <strong className="text-white">{ticketCount}</strong> open {ticketCount === 1 ? 'request' : 'requests'} for unit <strong className="font-mono text-blue-400">{unitId}</strong>.
                </p>
              </div>
              <button onClick={() => setShowConfirm(false)} className="p-1.5 text-slate-500 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-sm hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleResolveAll(null)}
                disabled={resolving}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {resolving ? (
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Confirm — All Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
