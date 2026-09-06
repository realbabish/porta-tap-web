import React, { useState, useEffect, useRef } from 'react';
import { supabase, createReporterClient } from './supabaseClient';
import { Droplets, Sparkles, AlertTriangle, ShieldAlert, CheckCircle2, Camera, ArrowRight, Wifi } from 'lucide-react';
import confetti from 'canvas-confetti';
import Footer from './footer';

const SERVICE_TYPES = [
  {
    type: 'cleaning',
    label: 'Needs Cleaning',
    sublabel: 'Pump out / full clean',
    icon: Droplets,
    color: 'blue',
    gradient: 'from-blue-600/20 to-blue-500/5',
    border: 'border-blue-500/30 hover:border-blue-400/70',
    iconBg: 'bg-blue-500/20 text-blue-300',
    glow: 'shadow-blue-500/20',
    activeBg: 'bg-blue-600/30 border-blue-400',
  },
  {
    type: 'supplies',
    label: 'Out of Supplies',
    sublabel: 'TP / hand sanitizer empty',
    icon: Sparkles,
    color: 'emerald',
    gradient: 'from-emerald-600/20 to-emerald-500/5',
    border: 'border-emerald-500/30 hover:border-emerald-400/70',
    iconBg: 'bg-emerald-500/20 text-emerald-300',
    glow: 'shadow-emerald-500/20',
    activeBg: 'bg-emerald-600/30 border-emerald-400',
  },
  {
    type: 'repair',
    label: 'Needs Repair',
    sublabel: 'Damage / malfunction',
    icon: AlertTriangle,
    color: 'amber',
    gradient: 'from-amber-600/20 to-amber-500/5',
    border: 'border-amber-500/30 hover:border-amber-400/70',
    iconBg: 'bg-amber-500/20 text-amber-300',
    glow: 'shadow-amber-500/20',
    activeBg: 'bg-amber-600/30 border-amber-400',
  },
];

export default function App() {
  const [unitId, setUnitId] = useState('');
  const [unitValid, setUnitValid] = useState(null); // null = checking, true = valid, false = invalid
  const [submitting, setSubmitting] = useState(false);
  const [activeType, setActiveType] = useState(null);
  const [submittedRequest, setSubmittedRequest] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUploaded, setPhotoUploaded] = useState(false);
  const [alreadyReported, setAlreadyReported] = useState(null); // {type} if dupe
  const [mounted, setMounted] = useState(false);
  const particleRef = useRef(null);

  useEffect(() => {
    const validateUnit = async () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('unit_id');

      if (!id) {
        setUnitValid(false);
        return;
      }

      setUnitId(id);

      // Verify the unit actually exists in the database
      try {
        const { data } = await supabase
          .from('units')
          .select('id')
          .eq('id', id)
          .maybeSingle();

        if (data) {
          setUnitValid(true);
        } else {
          setUnitValid(false);
        }
      } catch (err) {
        console.error("Validation error:", err);
        setUnitValid(false);
      }

      // Trigger mount animation
      setTimeout(() => setMounted(true), 50);
    };

    validateUnit();
  }, []);

  const handleQuickRequest = async (requestType) => {
    if (submitting) return;
    setSubmitting(true);
    setActiveType(requestType);
    setAlreadyReported(null);

    try {
      const reporterToken = crypto.randomUUID();
      const reporterSupabase = createReporterClient(reporterToken);

      // DEDUP CHECK: Does an open ticket already exist for this unit + type?
      const { data: existing } = await reporterSupabase
        .from('service_requests')
        .select('id, request_type')
        .eq('unit_id', unitId)
        .eq('request_type', requestType)
        .in('status', ['pending', 'in_progress'])
        .maybeSingle();

      if (existing) {
        // Already reported — don't create a duplicate
        setAlreadyReported(requestType);
        setSubmitting(false);
        setActiveType(null);
        return;
      }

      // No duplicate — insert new ticket
      const { data, error } = await reporterSupabase
        .from('service_requests')
        .insert([{
          unit_id: unitId,
          request_type: requestType,
          status: 'pending',
          reporter_token: reporterToken,
        }])
        .select()
        .single();

      if (error) throw error;

      setSubmittedRequest({ ...data, reporterToken });

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.65 },
        colors: ['#6ee7b7', '#34d399', '#a7f3d0'],
      });
    } catch (err) {
      console.error('Error submitting request:', err);
      alert('Could not submit request. Please try again.');
    } finally {
      setSubmitting(false);
      setActiveType(null);
    }
  };

  const handleOutOfOrder = async () => {
    if (!submittedRequest) return;
    await handleQuickRequest('out_of_order');
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !submittedRequest) return;

    setUploadingPhoto(true);
    try {
      const reporterSupabase = createReporterClient(submittedRequest.reporterToken);
      const fileExt = file.name.split('.').pop();
      const fileName = `${submittedRequest.id}_${Date.now()}.${fileExt}`;
      const filePath = `user_reports/${fileName}`;

      const { error: uploadError } = await reporterSupabase.storage
        .from('service-photos')
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = reporterSupabase.storage
        .from('service-photos')
        .getPublicUrl(filePath);

      const { error: updateError } = await reporterSupabase
        .from('service_requests')
        .update({ user_photo_url: publicUrl })
        .eq('id', submittedRequest.id);
      if (updateError) throw updateError;

      setPhotoUploaded(true);
    } catch (err) {
      console.error('Photo upload failed:', err);
      alert('Failed to upload photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // --- Loading State (Checking DB) ---
  if (unitValid === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mb-4"></div>
        <p className="text-slate-400">Verifying unit location...</p>
      </div>
    );
  }

  // --- Invalid unit (Fake or no unit_id param) ---
  if (unitValid === false) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_0_15px_rgba(244,63,94,0.2)]">
            <ShieldAlert className="w-8 h-8 text-rose-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Invalid Unit Tag</h1>
          <p className="text-slate-400 text-sm">This QR code or NFC tag doesn't have a valid unit ID. Please contact your site manager.</p>
        </div>
      </div>
    );
  }

  // --- Success State ---
  if (submittedRequest) {
    const typeInfo = SERVICE_TYPES.find(s => s.type === submittedRequest.request_type) || SERVICE_TYPES[0];
    const Icon = typeInfo.icon;
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 font-sans">
        <div
          className="w-full max-w-sm transition-all duration-700"
          style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(20px)' }}
        >
          {/* Success card */}
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center relative overflow-hidden">
            {/* Ambient glow */}
            <div className="absolute inset-0 bg-emerald-500/5 pointer-events-none" />
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10">
              <div className="w-20 h-20 bg-emerald-500/15 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-5 shadow-[0_0_30px_rgba(16,185,129,0.15)]">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>

              <h2 className="text-2xl font-black text-white mb-1">Request Sent!</h2>
              <p className="text-slate-400 text-sm mb-1">Your service alert has been dispatched.</p>

              <div className="mt-4 mb-6 inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-full">
                <Icon className={`w-3.5 h-3.5 ${typeInfo.iconBg.split(' ')[1]}`} />
                <span className="text-xs font-semibold text-slate-300 capitalize">
                  {submittedRequest.request_type.replace(/_/g, ' ')}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-xs font-mono text-slate-500">{unitId}</span>
              </div>

              <div className="border-t border-slate-800/80 pt-5 space-y-3 text-left">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 text-center mb-3">
                  Optional — Add More Detail
                </p>

                {!photoUploaded ? (
                  <label className="flex items-center gap-3 w-full py-3.5 px-4 bg-slate-800/60 hover:bg-slate-800 rounded-2xl border border-dashed border-slate-600 hover:border-slate-500 text-sm font-medium text-slate-300 cursor-pointer transition-all group">
                    <div className="w-8 h-8 bg-slate-700 group-hover:bg-slate-600 rounded-xl flex items-center justify-center shrink-0 transition">
                      <Camera className="w-4 h-4 text-slate-400" />
                    </div>
                    <span>{uploadingPhoto ? 'Uploading...' : 'Snap or upload a photo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handlePhotoUpload}
                      disabled={uploadingPhoto}
                    />
                  </label>
                ) : (
                  <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs py-2.5 px-3.5 rounded-xl">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Photo attached to your request.
                  </div>
                )}

                <button
                  onClick={handleOutOfOrder}
                  disabled={submitting}
                  className="w-full py-3 px-4 bg-rose-950/30 hover:bg-rose-950/50 border border-rose-800/40 hover:border-rose-700/60 rounded-2xl text-rose-300 text-xs font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  <ShieldAlert className="w-4 h-4" />
                  Also mark as completely out of order
                </button>
              </div>
            </div>
          </div>

          <p className="text-center text-[11px] text-slate-600 mt-5">
            Powered by SmartTap Field Service
          </p>
        </div>
      </div>
    );
  }

  // --- Main Tap Interface ---
  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col">

      {/* Background ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen max-w-md mx-auto w-full p-6">

        {/* Header */}
        <header
          className="pt-8 pb-6 text-center transition-all duration-700"
          style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(-16px)' }}
        >
          {/* Live indicator */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-full mb-5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-xs text-slate-400 font-medium">Live Dispatch Active</span>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white leading-tight">
            Need Service?
          </h1>
          <p className="text-slate-400 text-sm mt-2 leading-relaxed">
            Tap below to instantly alert the field team.<br />
            Average response: <span className="text-emerald-400 font-semibold">under 2 hours.</span>
          </p>

          {/* Unit badge */}
          <div className="mt-4 inline-flex items-center gap-2 px-3.5 py-1.5 bg-slate-900/80 border border-slate-700/80 rounded-full backdrop-blur">
            <Wifi className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs text-slate-300 font-mono font-semibold">{unitId}</span>
          </div>
        </header>

        {/* Already Reported Banner */}
        {alreadyReported && (
          <div className="mb-4 flex items-start gap-3 bg-amber-950/40 border border-amber-700/50 rounded-2xl p-4 animate-fade-in">
            <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-300">Already reported!</p>
              <p className="text-xs text-amber-400/80 mt-0.5">
                A "{alreadyReported.replace(/_/g, ' ')}" request for this unit is already open. Help is on the way.
              </p>
            </div>
          </div>
        )}

        {/* Service Buttons */}
        <main
          className="flex-1 flex flex-col justify-center gap-3 transition-all duration-700 delay-100"
          style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(16px)' }}
        >
          {SERVICE_TYPES.map((service, i) => {
            const Icon = service.icon;
            const isActive = activeType === service.type;
            return (
              <button
                key={service.type}
                disabled={submitting}
                onClick={() => handleQuickRequest(service.type)}
                style={{ transitionDelay: `${i * 60}ms` }}
                className={`
                  group relative w-full p-5 rounded-2xl border text-left
                  bg-gradient-to-br ${service.gradient}
                  ${isActive ? service.activeBg : service.border}
                  transition-all duration-300 active:scale-[0.97]
                  shadow-lg ${service.glow}
                  disabled:cursor-not-allowed disabled:opacity-60
                  overflow-hidden
                `}
              >
                {/* Button shimmer on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-r from-transparent via-white/3 to-transparent pointer-events-none" />

                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl ${service.iconBg} flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110`}>
                    {isActive ? (
                      <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin opacity-70" />
                    ) : (
                      <Icon className="w-6 h-6" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-base leading-tight">
                      {isActive ? 'Sending...' : service.label}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{service.sublabel}</p>
                  </div>

                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
                </div>
              </button>
            );
          })}
        </main>

        {/* Footer */}
        <div className="transition-all duration-700 delay-300" style={{ opacity: mounted ? 1 : 0 }}>
          <Footer />
        </div>
      </div>
    </div>
  );
}