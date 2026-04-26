import React, { useMemo, useState } from 'react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { LogOut, User, Receipt, ShieldAlert, Bell, X, AlertCircle, CheckCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useMyProfile, useNotificationFeed } from '../lib/queries';

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const { data: profile } = useMyProfile();
  const { data: notificationFeed } = useNotificationFeed(24);
  const currentUser = profile ?? user;
  const notifications = useMemo(() => (notificationFeed || []).map((notification) => ({
    id: notification?.id || Math.random().toString(),
    title: notification?.payload?.title || 'Workspace update',
    desc: notification?.payload?.description || 'A new account event is available.',
    time: formatRelativeTime(notification?.created_at || new Date().toISOString()),
    path: typeof notification?.payload?.path === 'string' ? notification.payload.path : '/dashboard',
    readAt: notification?.read_at || null,
    emphasis: !notification?.read_at,
  })), [notificationFeed]);
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  const markNotificationRead = useMutation({
    mutationFn: async (notificationId: string) => {
      await api.post(`/users/me/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-feed'] });
    },
  });

  const markAllNotificationsRead = useMutation({
    mutationFn: async () => {
      await api.post('/users/me/notifications/read-all');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-feed'] });
    },
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {isNotifOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsNotifOpen(false)} />
          <div className="fixed right-4 sm:right-8 top-14 z-50 w-[380px] max-w-[calc(100vw-2rem)] bg-brand-white border border-brand-border-strong shadow-2xl rounded-2xl overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-brand-border-strong">
              <h2 className="font-display font-bold text-[15px] text-brand-ink">Notifications</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => markAllNotificationsRead.mutate()}
                  className="inline-flex items-center gap-1 rounded-full border border-brand-border-strong px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-slate hover:text-brand-forest transition-colors"
                >
                  <CheckCheck size={10} />
                  Read all
                </button>
                <button onClick={() => setIsNotifOpen(false)} className="text-brand-slate hover:bg-brand-fog p-1 rounded-md transition-colors"><X size={16}/></button>
              </div>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {notifications.slice(0, 10).map((notification) => (
                <button
                  key={notification.id}
                  onClick={async () => {
                    if (!notification.readAt) {
                      await markNotificationRead.mutateAsync(notification.id);
                    }
                    setIsNotifOpen(false);
                    navigate(notification.path);
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-brand-border flex gap-3 hover:bg-brand-fog/50 transition-colors ${notification.emphasis ? 'bg-brand-forest-light/20' : 'bg-transparent'}`}
                >
                  <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center mt-0.5 ${notification.emphasis ? 'bg-brand-forest text-brand-white' : 'bg-brand-fog text-brand-slate'}`}>
                    <AlertCircle size={13} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className={`text-[13px] font-semibold truncate ${notification.emphasis ? 'text-brand-ink' : 'text-brand-slate'}`}>{notification.title}</h4>
                    <p className="text-[11px] text-brand-slate mt-0.5 leading-snug line-clamp-2">{notification.desc}</p>
                    <span className="text-[10px] text-brand-mist font-medium mt-1 block">{notification.time}</span>
                  </div>
                </button>
              ))}
              {!notifications.length && (
                <div className="px-5 py-8 text-center text-sm text-brand-slate">
                  No notifications yet.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link 
              to="/dashboard"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity outline-none"
            >
              <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-brand-forest" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
                <path d="M12 15v2" strokeWidth="3"/>
              </svg>
              <span className="font-display font-bold text-xl text-brand-forest tracking-tight">StayVise</span>
            </Link>
            
            <div className="flex items-center gap-4 sm:gap-6">
              <button
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className="relative text-gray-500 hover:text-brand-forest transition-colors p-2 rounded-full hover:bg-brand-fog"
                aria-label="Toggle notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-0 right-0 w-4 h-4 bg-brand-danger border-2 border-white rounded-full flex items-center justify-center text-[9px] font-bold text-white">
                    {Math.min(unreadCount, 9)}
                  </span>
                )}
              </button>

              <Link to="/payments" className="text-gray-500 hover:text-brand-forest transition-colors flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider" aria-label="View payments ledger">
                <Receipt className="w-4 h-4" />
                <span className="hidden md:inline">Ledger</span>
              </Link>
              
              <Link to="/disputes" className="text-gray-500 hover:text-brand-forest transition-colors flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider" aria-label="View dispute centre">
                <ShieldAlert className="w-4 h-4" />
                <span className="hidden md:inline">Disputes</span>
              </Link>
              
              <Link to="/settings" className="flex items-center gap-2 text-gray-600 hover:text-brand-forest transition-colors group" aria-label="User settings">
                <div className="bg-gray-100 rounded-full p-2 group-hover:bg-brand-fog transition-colors border border-transparent hover:border-brand-border">
                  <User className="h-4 w-4" />
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-bold hidden sm:block leading-none">{currentUser?.full_name}</span>
                  <span className="text-[9px] font-mono font-bold text-brand-mist tracking-widest hidden sm:block mt-1 uppercase">{currentUser?.unique_id}</span>
                </div>
              </Link>
              <button 
                onClick={handleLogout}
                className="text-gray-400 hover:text-brand-danger transition-colors p-2 rounded-full hover:bg-brand-danger/5"
                aria-label="Logout"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return 'Recently';
  }
  const diffMinutes = Math.floor((Date.now() - timestamp) / (1000 * 60));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}
