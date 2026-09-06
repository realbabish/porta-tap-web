import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { Clock, CheckCircle2, Image as ImageIcon, LogOut, MapPin, Settings, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';

export default function Dashboard() {
  const [requests, setRequests] = useState([]);
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState('all'); // 'all' or a specific site UUID
  const [isKing, setIsKing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [updatingRequestId, setUpdatingRequestId] = useState(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [notification, setNotification] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setAccessDenied(false);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: kingAdmin } = await supabase
        .from('king_admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      setIsKing(Boolean(kingAdmin));

      const { data: clientUser } = await supabase
        .from('client_users')
        .select('client_id')
        .eq('user_id', user.id)
        .single();

      if (!kingAdmin && !clientUser) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      // King Admins see every customer; Customer Admins see only their organization.
      let siteQuery = supabase
        .from('sites')
        .select('id, site_name')
        .order('site_name');

      if (!kingAdmin) {
        siteQuery = siteQuery.eq('client_id', clientUser.client_id);
      }

      const { data: siteData } = await siteQuery;
      if (siteData) setSites(siteData);

      let query = supabase
        .from('service_requests')
        .select(`
          *,
          units!inner (
            site_id,
            sites!inner (
              client_id,
              site_name
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (!kingAdmin) {
        query = query.eq('units.sites.client_id', clientUser.client_id);
      }

      if (selectedSite !== 'all') {
        query = query.eq('units.site_id', selectedSite);
      }

      const { data: requestData, error } = await query;
      if (!error && requestData) setRequests(requestData);
      setLoading(false);
    };

    fetchData();

    // Re-run the fetch if the selected site changes
  }, [selectedSite, refreshVersion]); 

  // Realtime subscription (Simplified for brevity, keep yours intact)
  useEffect(() => {
    const channel = supabase.channel('public:service_requests').on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, (payload) => {
       // Refetch on changes. RLS still limits which rows this account receives.
       setRefreshVersion((current) => current + 1);
       if (payload.eventType === 'INSERT') {
         setNotification('New service request received.');
         window.setTimeout(() => setNotification(''), 5000);
       }
    }).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleStatusChange = async (request, nextStatus) => {
    if (nextStatus === request.status) return;

    setUpdatingRequestId(request.id);
    const updates = {
      status: nextStatus,
      resolved_at: nextStatus === 'resolved' ? new Date().toISOString() : null,
    };

    const { error } = await supabase
      .from('service_requests')
      .update(updates)
      .eq('id', request.id);

    if (error) {
      console.error('Error updating request status:', error);
      alert('Could not update this request status.');
    } else {
      setRequests((currentRequests) => currentRequests.map((currentRequest) => (
        currentRequest.id === request.id
          ? { ...currentRequest, ...updates }
          : currentRequest
      )));
    }

    setUpdatingRequestId(null);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        {notification && <div className="mb-5 rounded-xl border border-blue-400/30 bg-blue-500/15 px-4 py-3 text-sm font-medium text-blue-100">{notification}</div>}
        
        {/* Header Area with Logo and Actions */}
        <header className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-4">
            <Logo size="sm" variant="horizontal" />
            <div className="h-8 w-px bg-slate-800 hidden sm:block"></div>
            <div>
              <h1 className="text-2xl font-bold text-white leading-tight">Live Dispatch</h1>
              <p className="text-slate-400 text-xs mt-0.5">Real-time incoming service requests</p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-semibold text-emerald-400">System Live</span>
            </div>

            {isKing ? (
              <button
                onClick={() => navigate('/king-admin')}
                className="text-amber-300 hover:text-amber-200 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-semibold transition"
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" /> King Portal
              </button>
            ) : (
              <button
                onClick={() => navigate('/customer')}
                className="text-slate-300 hover:text-white border border-slate-700 bg-slate-850 hover:bg-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-semibold transition"
              >
                <Settings className="w-3.5 h-3.5 text-blue-400" /> Manage Company
              </button>
            )}

            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-rose-300 px-2 py-1.5 flex items-center gap-1.5 text-xs transition"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </header>

        {/* Site Filter Controls */}
        <div className="mb-6 flex items-center gap-3">
          <MapPin className="w-5 h-5 text-slate-400" />
          <select 
            className="bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
          >
            <option value="all">All Company Sites</option>
            {sites.map(site => (
              <option key={site.id} value={site.id}>{site.site_name}</option>
            ))}
          </select>
        </div>

        {/* The Table (Unchanged from before) */}
        {loading ? (
           <div className="text-center py-10 text-slate-400">Loading requests...</div>
        ) : accessDenied ? (
          <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-8 text-center text-rose-200">
            This account is not a King Admin or a Customer Admin.
          </div>
        ) : (
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/50 text-slate-400 text-sm uppercase tracking-wider">
                  <th className="p-4 font-medium">Time</th>
                  <th className="p-4 font-medium">Site</th>
                  <th className="p-4 font-medium">Unit ID</th>
                  <th className="p-4 font-medium">Issue</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Admin action</th>
                  <th className="p-4 font-medium">Report photo</th>
                  <th className="p-4 font-medium">Proof photo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {requests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-750 transition animate-fade-in">
                    <td className="p-4 text-sm text-slate-300">
                      {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-4 text-sm font-medium text-blue-300">
                      {/* We joined the site_name in the query, so we can display it! */}
                      {req.units.sites.site_name}
                    </td>
                    <td className="p-4 font-semibold text-white">{req.unit_id}</td>
                    <td className="p-4">
                      <span className="capitalize text-slate-300">{req.request_type.replace('_', ' ')}</span>
                    </td>
                    <td className="p-4">
                      <select
                        aria-label={`Set status for request ${req.id}`}
                        className="rounded-md border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        value={req.status}
                        disabled={updatingRequestId === req.id}
                        onChange={(event) => handleStatusChange(req, event.target.value)}
                      >
                        <option value="pending">Mark pending</option>
                        <option value="resolved">Mark resolved</option>
                      </select>
                    </td>
                    <td className="p-4">
                      {req.status === 'pending' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Clock className="w-3.5 h-3.5" /> Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Resolved
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      {req.user_photo_url ? (
                        <a href={req.user_photo_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-sm transition">
                          <ImageIcon className="w-4 h-4" /> View
                        </a>
                      ) : (
                        <span className="text-slate-600 text-sm">None</span>
                      )}
                    </td>
                    <td className="p-4">
                      {req.proof_photo_url ? (
                        <a href={req.proof_photo_url} target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 text-sm transition">
                          <ImageIcon className="w-4 h-4" /> View
                        </a>
                      ) : (
                        <span className="text-slate-600 text-sm">None</span>
                      )}
                    </td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr>
                    <td colSpan="8" className="p-8 text-center text-slate-500">
                      No service requests found for this site.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
