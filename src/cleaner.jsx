import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import {
  Wrench, Camera, ShieldCheck, Image as ImageIcon, LogOut,
  AlertTriangle, Droplets, Sparkles, ShieldAlert, CheckCircle2,
  RefreshCw, X, SmartphoneNfc
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
  const [tickets, setTickets] = useState([]);
  const [cleanerName, setCleanerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [mounted, setMounted] = useState(false);

  const navigate = useNavigate();

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

  useEffect(() => {
    if (!unitId) return;

    const channel = supabase
      .channel(`unit-tickets-${unitId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_requests', filter: `unit_id=eq.${unitId}` },
        () => fetchTickets(unitId)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [unitId, fetchTickets]);

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

  const ticketCount = tickets.length;
  const reasons = [...new Set(tickets.map(t => t.request_type))];
  const hasPhoto = tickets.some(t => t.user_photo_url);
  const photoUrl = tickets.find(t => t.user_photo_url)?.user_photo_url;

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col max-w-md mx-auto p-5 selection:bg-blue-500 selection:text-white">

      <style>
        {`
          @keyframes radar {
            0% { transform: scale(0.5); opacity: 0.8; }
            100% { transform: scale(2.5); opacity: 0; }
          }
          .animate-radar { animation: radar 2s cubic-bezier(0, 0, 0.2, 1) infinite; }
        `}
      </style>

      {/* Fixed background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-blue-600/5 rounded-full blur-3xl transition-all duration-1000" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-emerald-500/5 rounded-full blur-3xl transition-all duration-1000" />
      </div>

      {/* Top Bar */}
      <div className="relative z-10 flex items-center justify-between mb-5 pt-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.15)]">
            <Wrench className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 leading-none uppercase tracking-wider font-semibold">Technician</p>
            <p className="text-sm font-bold text-white leading-tight">{cleanerName || '—'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {unitId && (
            <button
              onClick={() => fetchTickets(unitId)}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 hover:bg-slate-800 transition-all shadow-sm active:scale-95"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-rose-400 hover:border-rose-900/60 hover:bg-rose-950/20 transition-all active:scale-95"
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
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(59,130,246,0.3)]" />
            <p className="text-slate-500 text-sm animate-pulse">Syncing dispatch...</p>
          </div>

        ) : !unitId ? (
          /* No unit scanned - Radar Animation */
          <div
            className="flex-1 flex flex-col items-center justify-center text-center transition-all duration-700"
            style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(10px)' }}
          >
            <div className="relative w-32 h-32 flex items-center justify-center mb-6">
              <div className="absolute inset-0 border-2 border-blue-500/30 rounded-full animate-radar" />
              <div className="absolute inset-2 border-2 border-blue-500/20 rounded-full animate-radar" style={{ animationDelay: '0.5s' }} />
              <div className="relative w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-800 border border-blue-400/50 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(37,99,235,0.4)] z-10">
                <SmartphoneNfc className="w-8 h-8 text-white" />
              </div>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">Awaiting Tag</h2>
            <p className="text-sm text-slate-400 mt-2 max-w-[240px] leading-relaxed">
              Tap your device to an NFC tag to securely load unit assignments.
            </p>
          </div>

        ) : ticketCount > 0 ? (
          /* Active tickets card */
          <div
            className="transition-all duration-700"
            style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(12px)' }}
          >
            {/* Unit Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold mb-0.5">Unit Location</p>
                <p className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 font-mono tracking-tight">{unitId}</p>
              </div>
              <div className="text-right">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-rose-500/10 border border-rose-500/30 rounded-full shadow-[0_0_15px_rgba(244,63,94,0.1)]">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                  </span>
                  <span className="text-xs font-bold text-rose-400 tracking-wide">
                    {ticketCount} {ticketCount === 1 ? 'ISSUE' : 'ISSUES'}
                  </span>
                </div>
              </div>
            </div>

            {/* Issues breakdown */}
            <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-3xl p-6 mb-5 shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />

              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold mb-4">
                Required Actions
              </p>

              <div className="flex flex-col gap-2.5 mb-5 relative z-10">
                {reasons.map((type, index) => {
                  const meta = TYPE_META[type] || TYPE_META.repair;
                  const Icon = meta.icon;
                  const count = tickets.filter(t => t.request_type === type).length;
                  return (
                    <div
                      key={type}
                      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${meta.bg} backdrop-blur-sm transition-all duration-300 hover:scale-[1.02]`}
                      style={{ animation: `slideUp 0.4s ease-out ${index * 0.1}s forwards`, opacity: 0, transform: 'translateY(10px)' }}
                    >
                      <div className="p-2 bg-black/20 rounded-xl">
                        <Icon className={`w-4 h-4 ${meta.color}`} />
                      </div>
                      <span className="font-semibold text-white text-sm">{meta.label}</span>
                      {count > 1 && (
                        <span className={`ml-auto text-xs font-black ${meta.color} bg-black/30 px-2 py-1 rounded-lg border border-white/5`}>
                          ×{count}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Timeline of individual taps */}
              <div className="border-t border-slate-800 pt-4 relative z-10">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-3">Audit Log</p>
                <div className="space-y-2 max-h-36 overflow-y-auto pr-2 custom-scrollbar">
                  {tickets.map((t, i) => {
                    const meta = TYPE_META[t.request_type] || TYPE_META.repair;
                    const Icon = meta.icon;
                    return (
                      <div key={t.id} className="flex items-center gap-3 text-xs text-slate-400 bg-black/20 p-2 rounded-xl border border-white/[0.02]">
                        <span className="text-slate-600 font-mono w-4 text-right shrink-0">#{i + 1}</span>
                        <Icon className={`w-3.5 h-3.5 ${meta.color} shrink-0`} />
                        <span className="capitalize font-medium text-slate-300">{t.request_type.replace(/_/g, ' ')}</span>
                        <span className="ml-auto text-slate-500 font-mono text-[10px] bg-black/40 px-1.5 py-0.5 rounded">
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
                className="group block overflow-hidden rounded-3xl border border-slate-700/80 mb-5 hover:border-blue-500/70 transition-all duration-300 relative shadow-lg"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent z-10 pointer-events-none" />
                <img
                  src={photoUrl}
                  alt="Reporter photo"
                  className="h-48 w-full object-cover group-hover:scale-105 transition duration-700"
                />
                <div className="absolute bottom-0 left-0 w-full flex items-center gap-2 px-5 py-4 z-20">
                  <div className="p-1.5 bg-blue-500/20 backdrop-blur-md rounded-lg border border-blue-400/30">
                    <ImageIcon className="w-4 h-4 text-blue-300" />
                  </div>
                  <span className="text-sm font-semibold text-white text-shadow">View field photo</span>
                </div>
              </a>
            )}

            {/* CTA Buttons */}
            <div className="space-y-3 pb-6">
              <label className={`relative overflow-hidden flex items-center justify-center gap-3 w-full py-4 px-5 rounded-2xl font-bold text-[15px] cursor-pointer transition-all duration-300 active:scale-[0.98] ${resolving ? 'bg-blue-900 border border-blue-700 opacity-80 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_25px_rgba(37,99,235,0.4)]'}`}>
                {resolving ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing Clear...
                  </>
                ) : (
                  <>
                    <div className="absolute inset-0 bg-white/10 opacity-0 hover:opacity-100 transition-opacity" />
                    <Camera className="w-5 h-5 relative z-10" />
                    <span className="relative z-10 tracking-wide">Photo & Resolve All</span>
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

              <button
                onClick={() => setShowConfirm(true)}
                disabled={resolving}
                className="w-full py-3.5 px-5 rounded-2xl border border-slate-700 hover:border-emerald-700/60 bg-slate-900/80 hover:bg-emerald-950/40 text-slate-300 hover:text-emerald-400 text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                Override & Mark Clean
              </button>
            </div>
          </div>

        ) : (
          /* All clear */
          <div
            className="flex-1 flex flex-col items-center justify-center text-center transition-all duration-700"
            style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'scale(1)' : 'scale(0.95)' }}
          >
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-2xl animate-pulse" />
              <div className="relative w-28 h-28 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(16,185,129,0.15)]">
                <ShieldCheck className="w-14 h-14 text-emerald-400" />
              </div>
            </div>
            <h2 className="text-3xl font-black text-white tracking-tight">Unit Clear</h2>
            {unitId && (
              <div className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 bg-slate-900 border border-slate-800 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <p className="text-sm text-slate-300 font-mono font-bold tracking-wider">{unitId}</p>
              </div>
            )}
            <p className="text-slate-500 mt-4 max-w-[240px] text-sm leading-relaxed">
              No active reports found. System is monitoring for new requests.
            </p>
          </div>
        )}
      </main>
      <Footer />

      {/* Glassmorphism Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900/90 border border-slate-700 rounded-[2rem] p-7 shadow-[0_0_50px_rgba(0,0,0,0.5)] transform transition-all">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-xl font-black text-white tracking-tight">Override Status?</h3>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                  You are resolving <strong className="text-rose-400">{ticketCount}</strong> open {ticketCount === 1 ? 'request' : 'requests'} for <strong className="font-mono text-blue-400">{unitId}</strong> without photographic proof.
                </p>
              </div>
              <button onClick={() => setShowConfirm(false)} className="p-2 bg-slate-800/50 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3.5 rounded-2xl bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 transition-colors active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleResolveAll(null)}
                disabled={resolving}
                className="flex-1 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
              >
                {resolving ? (
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Confirm Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global styles for dynamic animations */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.2s ease-out forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}