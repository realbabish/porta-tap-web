import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Lock, Shield } from 'lucide-react';
import Logo from './Logo';
import Footer from './footer';
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // THE USERNAME HACK: If they don't type an '@', treat it as a cleaner username
    let loginIdentifier = email.trim().toLowerCase();
    if (!loginIdentifier.includes('@')) {
      loginIdentifier = `${loginIdentifier.replace(/\s+/g, '')}@cleaners.local`;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: loginIdentifier,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Could not retrieve session user.");

      // Check all 3 roles explicitly in parallel
      const [kingRes, cleanerRes, customerRes] = await Promise.all([
        supabase.from('king_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
        supabase.from('cleaner_users').select('user_id').eq('user_id', user.id).maybeSingle(),
        supabase.from('client_users').select('user_id').eq('user_id', user.id).maybeSingle(),
      ]);

      // Bulletproof routing based strictly on database reality
      if (kingRes.data) {
        navigate('/king-admin');
      } else if (cleanerRes.data) {
        navigate('/cleaner');
      } else if (customerRes.data) {
        navigate('/customer');
      } else {
        // If they have no role, kick them out
        setError("Your account does not have an assigned portal role.");
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error('Role check error after login:', err);
      setError("An error occurred while verifying your permissions.");
      await supabase.auth.signOut();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 selection:bg-amber-500 selection:text-black">
      <div className="w-full max-w-md bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo variant="stacked" size="lg" />
          </div>
          <p className="text-slate-400 text-xs mt-2">
            Field Service Management & Dispatch Portal
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 bg-rose-950/40 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <Lock className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} noValidate className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Username or Email
            </label>
            <input
              type="text"
              required
              placeholder="Username or email"
              className="w-full bg-slate-950 border border-slate-700/80 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Password
              </label>
            </div>
            <input
              type="password"
              required
              placeholder="••••••••"
              className="w-full bg-slate-950 border border-slate-700/80 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-bold py-3.5 px-4 rounded-xl transition mt-5 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 text-sm"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-800/80 text-center">
          <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            Protected by Shrestha Integrated Systems RLS
          </p>
        </div>
      </div>
      <Footer className="absolute bottom-0" />
    </div>
  );
}
