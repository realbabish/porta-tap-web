import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import App from './App.jsx';
import Dashboard from './dashboard.jsx';
import Cleaner from './cleaner.jsx';
import Login from './login.jsx';
import KingAdmin from './kingAdmin.jsx';
import CustomerWorkspace from './customerWorkspace.jsx';
import './index.css';

// A secure wrapper that checks if a user is logged in
const ProtectedRoute = ({ children }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Checking credentials...</div>;
  
  // If no session, kick them back to login
  if (!session) return <Navigate to="/login" />;
  
  return children;
};

const KingAdminRoute = ({ children }) => {
  const [allowed, setAllowed] = useState(null);

  useEffect(() => {
    const checkKingAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAllowed(false);
        return;
      }

      const { data } = await supabase
        .from('king_admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      setAllowed(Boolean(data));
    };

    checkKingAdmin();
  }, []);

  if (allowed === null) return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Checking King Admin access...</div>;
  if (!allowed) return <Navigate to="/dashboard" />;
  return children;
};

const CustomerAdminRoute = ({ children }) => {
  const [allowed, setAllowed] = useState(null);
  useEffect(() => {
    const checkCustomerAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setAllowed(false);
      const { data } = await supabase.from('client_users').select('client_id').eq('user_id', user.id).maybeSingle();
      setAllowed(Boolean(data));
    };
    checkCustomerAdmin();
  }, []);
  if (allowed === null) return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Checking customer access...</div>;
  if (!allowed) return <Navigate to="/dashboard" />;
  return children;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<App />} />
        <Route path="/login" element={<Login />} />
        
        {/* Protected Routes (Wrapped in ProtectedRoute) */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/cleaner" element={
          <ProtectedRoute>
            <Cleaner />
          </ProtectedRoute>
        } />
        <Route path="/king-admin" element={
          <KingAdminRoute>
            <KingAdmin />
          </KingAdminRoute>
        } />
        <Route path="/king-admin/customers/:clientId" element={
          <KingAdminRoute><CustomerWorkspace /></KingAdminRoute>
        } />
        <Route path="/customer" element={
          <CustomerAdminRoute><CustomerWorkspace ownCustomer /></CustomerAdminRoute>
        } />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
