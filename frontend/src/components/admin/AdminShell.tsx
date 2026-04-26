import React from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, ShieldAlert, Users, Receipt, 
  BarChart3, Settings, LogOut, ExternalLink,
  Menu, X, Bell, Mail, Clock, AlertTriangle
} from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { format } from 'date-fns';
import { Check, CheckCheck } from 'lucide-react';

export default function AdminShell() {
  const { user, isAuthenticated, logout, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [showNotifications, setShowNotifications] = React.useState(false);
  const notificationRef = React.useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  // Profile Sync Tool: Ensure user data is fresh (fixes name mismatch issues)
  React.useEffect(() => {
    if (isAuthenticated) {
      api.get('/users/me')
        .then(res => {
          const freshUser = res.data;
          if (freshUser && freshUser.full_name !== user?.full_name) {
            updateUser({ full_name: freshUser.full_name });
          }
        })
        .catch(() => { /* Profile sync failed silently in prod */ });
    }
  }, [isAuthenticated, user?.full_name, updateUser]);

  // Fetch notifications
  const { data: notifications } = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: () => api.get('/admin/notifications').then(r => r.data),
    refetchInterval: 30000, // Sync every 30s
    enabled: isAuthenticated && user?.role === 'admin'
  });

  const markReadMutation = useMutation({
    mutationFn: (notifId: string) => api.post(`/admin/notifications/${notifId}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-notifications'] })
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.post('/admin/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-notifications'] })
  });

  // Toggle notifications robustly
  const toggleNotifications = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowNotifications(!showNotifications);
  };

  // Click outside to close
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications?.filter((n: any) => n.status === 'open' || n.status === 'pending').length || 0;

  React.useEffect(() => {
    if (!isAuthenticated || user?.role !== 'admin') {
      navigate('/admin/login', { replace: true });
    }
  }, [user, isAuthenticated, navigate]);

  if (!isAuthenticated || user?.role !== 'admin') {
    return null; // Don't flash the admin UI while redirecting
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-brand-fog flex">
      
      {/* Sidebar */}
      <aside className="w-64 bg-brand-ink text-white flex flex-col fixed h-full z-50">
         <div className="p-8 border-b border-white/10 flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-forest rounded-lg flex items-center justify-center font-bold text-white text-xl">T</div>
            <span className="font-display font-bold text-xl tracking-tight">StayVise Admin</span>
         </div>

         <nav className="flex-1 p-4 space-y-1 mt-6">
            <NavItem 
              to="/admin" 
              active={location.pathname === '/admin'} 
              icon={<LayoutDashboard size={20}/>} 
              label="Overview" 
            />
            <NavItem 
              to="/admin/disputes" 
              active={location.pathname.startsWith('/admin/disputes')} 
              icon={<ShieldAlert size={20}/>} 
              label="Disputes" 
            />
            <NavItem 
              to="/admin/users" 
              active={location.pathname.startsWith('/admin/users')} 
              icon={<Users size={20}/>} 
              label="Users" 
            />
            <NavItem 
              to="/admin/transactions" 
              active={location.pathname.startsWith('/admin/transactions')} 
              icon={<Receipt size={20}/>} 
              label="Transactions" 
            />
            <NavItem 
              to="/admin/submissions" 
              active={location.pathname.startsWith('/admin/submissions')} 
              icon={<Bell size={20}/>} 
              label="Submissions" 
            />
            
            <div className="pt-8 pb-4">
               <span className="px-4 text-[10px] font-bold text-white/30 uppercase tracking-widest">Configuration</span>
            </div>
            
            <NavItem 
              to="/admin/settings" 
              active={location.pathname.startsWith('/admin/settings')} 
              icon={<Settings size={20}/>} 
              label="Platform Settings" 
            />
         </nav>

         <div className="p-4 border-t border-white/10 space-y-2">
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-white/60 hover:text-white hover:bg-white/5 rounded-xl transition-all font-bold text-sm"
            >
               <LogOut size={18} /> Sign out
            </button>
            <Link 
              to="/dashboard"
              className="w-full flex items-center gap-3 px-4 py-3 text-brand-forest hover:bg-brand-forest/10 rounded-xl transition-all font-bold text-sm"
            >
               <ExternalLink size={18} /> Back to App
            </Link>
         </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 min-h-screen flex flex-col">
         {/* Top Header */}
         <header className="h-20 bg-white border-b border-brand-border-strong px-12 flex items-center justify-between sticky top-0 z-40">
            <div className="flex items-center gap-4">
               <span className="text-[11px] font-bold text-brand-mist border-r border-brand-border-strong pr-4 uppercase tracking-widest">Admin Panel</span>
               <h2 className="font-display font-bold text-lg text-brand-ink">
                  {location.pathname === '/admin' ? 'System Overview' : 
                   location.pathname.includes('disputes') ? 'Dispute Management' :
                   location.pathname.includes('users') ? 'User Directory' :
                   location.pathname.includes('transactions') ? 'Financial Ledger' : 'StayVise Admin'}
               </h2>
            </div>
            
            <div className="flex items-center gap-6">
               <div className="relative" ref={notificationRef}>
                  <button 
                    onClick={toggleNotifications}
                    className={`relative p-2 transition-colors rounded-xl ${showNotifications ? 'bg-brand-forest/10 text-brand-forest' : 'text-brand-mist hover:text-brand-forest'}`}
                  >
                     <Bell size={20} />
                     {unreadCount > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-brand-danger rounded-full border-2 border-white" />}
                  </button>

                  {showNotifications && (
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-3xl border border-brand-border-strong shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                       <div className="px-6 py-4 border-b border-brand-border-strong flex justify-between items-center bg-white">
                          <div className="flex flex-col">
                             <span className="text-[11px] font-bold text-brand-mist uppercase tracking-widest leading-none mb-1">Alert Pulse</span>
                             <span className="text-[10px] font-bold text-brand-forest">{unreadCount} Pending Actions</span>
                          </div>
                          {unreadCount > 0 && (
                            <button 
                              onClick={() => markAllReadMutation.mutate()}
                              className="p-1.5 text-brand-mist hover:text-brand-forest hover:bg-brand-forest/5 rounded-lg transition-all"
                              title="Mark all as Read"
                            >
                               <CheckCheck size={16} />
                            </button>
                          )}
                       </div>
                       <div className="max-h-[400px] overflow-y-auto">
                           {!notifications || notifications.length === 0 ? (
                            <div className="p-12 text-center text-brand-mist flex flex-col items-center">
                               <div className="w-12 h-12 bg-brand-fog rounded-full flex items-center justify-center mb-4">
                                  <Bell className="opacity-20" size={24} />
                               </div>
                               <p className="text-[11px] font-bold uppercase tracking-widest opacity-60">System Synchronized</p>
                               <p className="text-[10px] font-medium mt-1">No critical tasks remaining in tray.</p>
                            </div>
                          ) : (
                             notifications.map((n: any) => {
                               const isActive = n.status === 'open' || n.status === 'pending';
                               return (

                                                               <div key={n.id} className={`group relative border-b border-brand-border last:border-0 transition-colors ${!isActive ? 'opacity-60 grayscale-[0.5]' : ''}`}>

                                 <Link 
                                   to={n.target_url} 
                                   onClick={() => setShowNotifications(false)}
                                      className={`block p-5 hover:bg-brand-fog transition-colors ${!isActive ? 'bg-brand-fog/30' : ''}`}

                                 >
                                    <div className="flex gap-4">
                                       <div className={`p-2.5 rounded-xl shrink-0 h-max ${
                                         n.type === 'dispute' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
                                       }`}>
                                          {n.type === 'dispute' ? <ShieldAlert size={16} /> : <Mail size={16} />}
                                       </div>
                                       <div className="space-y-1.5 overflow-hidden">
                                           <div className="flex justify-between items-start gap-2">
                                              <p className="text-[12px] font-bold text-brand-ink group-hover:text-brand-forest transition-colors leading-tight">{n.title}</p>
                                              {!isActive && (
                                                <span className="px-1.5 py-0.5 bg-brand-fog text-brand-mist text-[8px] font-bold uppercase tracking-tighter rounded border border-brand-border h-max">History</span>
                                              )}
                                           </div>
                                          <p className="text-[11px] font-medium text-brand-slate line-clamp-2 leading-relaxed">{n.message}</p>
                                          <p className="text-[9px] font-bold text-brand-mist flex items-center gap-1.5 uppercase tracking-widest pt-1">
                                             <Clock size={10} /> {format(new Date(n.timestamp), 'HH:mm | dd MMM')}
                                          </p>
                                       </div>
                                    </div>
                                 </Link>
                                    {isActive && (
                                      <button 
                                        onClick={(e) => {
                                           e.preventDefault();
                                           e.stopPropagation();
                                           markReadMutation.mutate(n.id);
                                        }}
                                        className="absolute top-4 right-4 p-1.5 opacity-0 group-hover:opacity-100 text-brand-mist hover:text-brand-forest hover:bg-brand-forest/10 rounded-lg transition-all bg-white shadow-sm border border-brand-border"
                                        title="Dismiss Action"
                                      >
                                         <Check size={14} />
                                      </button>
                                    )}
                                 </div>
                               );
                             })
                           )}
                       </div>
                       <Link 
                         to="/admin/disputes" 
                         onClick={() => setShowNotifications(false)}
                         className="block py-3.5 text-center bg-brand-fog text-[10px] font-bold text-brand-mist hover:text-brand-ink uppercase tracking-widest transition-colors border-t border-brand-border-strong hover:bg-brand-border/10"
                       >
                          Open Case Registry
                       </Link>
                    </div>
                  )}
               </div>

               <div className="flex items-center gap-3 bg-brand-fog px-4 py-2 rounded-full border border-brand-border-strong">
                  <div className="w-6 h-6 bg-brand-ink text-white rounded-full flex items-center justify-center text-[10px] font-bold">A</div>
                  <span className="text-sm font-bold text-brand-ink">{user?.full_name}</span>
               </div>
            </div>
         </header>

         <div className="p-12 flex-1 overflow-auto">
            <Outlet />
         </div>
      </main>

    </div>
  );
}

function NavItem({ to, active, icon, label }: { to: string, active: boolean, icon: React.ReactNode, label: string }) {
  return (
    <Link 
      to={to} 
      className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all font-bold text-sm ${
        active 
          ? 'bg-brand-forest text-white shadow-lg shadow-brand-forest/20' 
          : 'text-white/50 hover:text-white hover:bg-white/5'
      }`}
    >
      {icon} {label}
    </Link>
  );
}
