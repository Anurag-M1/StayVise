import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  Shield, 
  Ban, 
  CheckCircle, 
  ArrowLeft, 
  Edit3,
  Loader2,
  Lock,
  Zap,
  Star,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { toast } from 'react-hot-toast';
import { StatusBadge } from '../../components/ui/StatusBadge';

export default function AdminUserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchUser();
  }, [id]);

  const fetchUser = async () => {
    setLoading(true);
    try {
      const resp = await api.get(`/admin/users/${id}`);
      setUser(resp.data);
    } catch (error) {
      toast.error('Failed to load user profile');
      navigate('/admin/users');
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async () => {
    setUpdating(true);
    try {
      const nextStatus = !user.is_active;
      await api.patch(`/admin/users/${id}`, { is_active: nextStatus });
      setUser({ ...user, is_active: nextStatus });
      toast.success(nextStatus ? 'User activated' : 'User deactivated');
    } catch (error) {
      toast.error('Status update failed');
    } finally {
      setUpdating(false);
    }
  };

  const verifyUser = async () => {
    setUpdating(true);
    try {
      await api.patch(`/admin/users/${id}`, { is_verified: true });
      setUser({ ...user, is_verified: true });
      toast.success('User verified');
    } catch (error) {
      toast.error('Verification failed');
    } finally {
      setUpdating(false);
    }
  };

  const promoteToAdmin = async () => {
    if (!window.confirm('Are you sure you want to promote this user to Admin?')) return;
    setUpdating(true);
    try {
      await api.patch(`/admin/users/${id}`, { role: 'admin' });
      setUser({ ...user, role: 'admin' });
      toast.success('User promoted to Admin');
    } catch (error) {
      toast.error('Promotion failed');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-forest" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <button 
          onClick={() => navigate('/admin/users')}
          className="flex items-center gap-2 text-brand-slate hover:text-brand-ink font-bold text-sm"
        >
          <ArrowLeft size={16} /> Back to Directory
        </button>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            onClick={toggleStatus} 
            disabled={updating}
            className={user.is_active ? 'border-red-100 text-red-600 hover:bg-red-50' : 'border-green-100 text-green-600 hover:bg-green-50'}
          >
            {updating ? <Loader2 size={16} className="animate-spin" /> : user.is_active ? <Ban size={16} className="mr-2" /> : <Zap size={16} className="mr-2" />}
            {user.is_active ? 'Suspend Account' : 'Reactivate Account'}
          </Button>
          <Button 
            variant={user.is_verified ? "outline" : "default"}
            onClick={async () => {
              setUpdating(true);
              try {
                const nextVal = !user.is_verified;
                await api.patch(`/admin/users/${id}`, { is_verified: nextVal });
                setUser({ ...user, is_verified: nextVal });
                toast.success(nextVal ? 'User verified' : 'Verification revoked');
              } catch (error) {
                toast.error('Update failed');
              } finally {
                setUpdating(false);
              }
            }} 
            disabled={updating}
            className={user.is_verified ? 'border-amber-100 text-amber-600 hover:bg-amber-50' : ''}
          >
            {updating ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} className="mr-2" />}
            {user.is_verified ? 'Revoke Verification' : 'Verify User'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Card */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-[2rem] border border-brand-border-strong p-8 shadow-sm">
            <div className="flex flex-col md:flex-row gap-8">
              <div className="w-32 h-32 rounded-3xl bg-brand-fog flex items-center justify-center text-brand-mist border-2 border-dashed border-brand-border overflow-hidden">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-3xl text-brand-forest">
                    {(user.full_name?.[0] || '?').toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-3xl font-display font-bold text-brand-ink">
                      {user.full_name || 'Registration Incomplete'}
                    </h1>
                    <span className="px-3 py-1 bg-brand-forest/10 text-brand-forest rounded-full text-[10px] font-bold uppercase tracking-widest font-mono border border-brand-forest/20">
                      ID: {user.unique_id || user.id.slice(0, 8)}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-brand-fog text-brand-slate'
                    }`}>
                      {user.role}
                    </span>
                    {!user.is_active && <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-bold uppercase tracking-widest">Suspended</span>}
                  </div>
                  <p className="text-brand-slate font-medium text-lg mt-1">@{user.username || 'user'}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2 text-brand-slate text-sm font-medium">
                    <Mail size={16} className="text-brand-mist" /> {user.email || 'No email provided'}
                  </div>
                  <div className="flex items-center gap-2 text-brand-slate text-sm font-medium">
                    <Phone size={16} className="text-brand-mist" /> {user.phone_number}
                  </div>
                  <div className="flex items-center gap-2 text-brand-slate text-sm font-medium">
                    <Calendar size={16} className="text-brand-mist" /> Joined {new Date(user.created_at).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-2 text-brand-slate text-sm font-medium">
                    <Shield size={16} className={user.is_verified ? 'text-brand-forest' : 'text-brand-mist'} /> 
                    {user.is_verified ? 'Identity Verified' : 'Unverified'}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-brand-border">
              <h3 className="font-bold text-brand-ink mb-4">Biography</h3>
              <p className="text-brand-slate text-sm leading-relaxed whitespace-pre-wrap">
                {user.bio || 'This user has not set a bio yet.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StatSmall label="Plan" value={user.billing_plan} icon={<Zap className="text-brand-forest" />} />
            <StatSmall label="Trust Score" value={user.trust_score?.score ? `${user.trust_score.score}/100` : 'N/A'} icon={<Star className="text-brand-amber" />} />
            <StatSmall label="Registration" value={user.onboarding_complete ? 'Complete' : 'Incomplete'} icon={<CheckCircle className="text-blue-500" />} />
            <StatSmall label="Active Sessions" value={user.active_sessions_count || 0} icon={<RefreshCw className="text-brand-mist" />} />
          </div>
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-6">
          <div className="bg-brand-ink text-white rounded-[2rem] p-8 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-3xl rounded-full" />
            <h3 className="font-display font-bold text-xl mb-6 relative z-10">Admin Control</h3>
            <div className="space-y-4 relative z-10">
              <ActionButton 
                icon={<Edit3 size={18} />} 
                label="Edit User Meta" 
                onClick={async () => {
                  const name = window.prompt('Full Name:', user.full_name);
                  const email = window.prompt('Email:', user.email || '');
                  const username = window.prompt('Username:', user.username || '');
                  if (name !== null) {
                    setUpdating(true);
                    try {
                      const resp = await api.patch(`/admin/users/${id}`, { 
                        full_name: name,
                        email: email || null,
                        username: username || null
                      });
                      setUser(resp.data);
                      toast.success('User meta updated');
                    } catch (error: any) {
                      toast.error(error.response?.data?.detail || 'Update failed');
                    } finally {
                      setUpdating(false);
                    }
                  }
                }} 
              />
              <ActionButton 
                icon={<Lock size={18} />} 
                label="Force Logout All Sessions" 
                onClick={async () => {
                  if (!window.confirm('This will terminate ALL active sessions for this user. Continue?')) return;
                  setUpdating(true);
                  try {
                    // We use the same endpoint as the user's "sign out all" but for admin we might need a specific one
                    // For now, let's assume admins can trigger this or we add an admin-specific one.
                    // Actually, let's add POST /admin/users/{id}/logout-all
                    await api.post(`/admin/users/${id}/logout-all`);
                    toast.success('All sessions terminated');
                  } catch (error) {
                    toast.error('Failed to terminate sessions');
                  } finally {
                    setUpdating(false);
                  }
                }} 
              />
              {user.role !== 'admin' && (
                <ActionButton 
                  icon={<Shield size={18} />} 
                  label="Promote to Admin" 
                  variant="highlight"
                  onClick={promoteToAdmin} 
                />
              )}
              <ActionButton 
                icon={<Star size={18} />} 
                label="Override Trust Score" 
                onClick={async () => {
                  const score = window.prompt('Enter new trust score (0-100) or -1 to reset to auto-calculation:', user.trust_score?.score || '50');
                  if (score !== null) {
                    const val = parseFloat(score);
                    if (!isNaN(val)) {
                      setUpdating(true);
                      try {
                        const resp = await api.patch(`/admin/users/${id}`, { trust_score_override: val });
                        setUser(resp.data);
                        toast.success('Trust score updated');
                      } catch (error) {
                        toast.error('Update failed');
                      } finally {
                        setUpdating(false);
                      }
                    }
                  }
                }} 
              />
              <ActionButton 
                icon={<Ban size={18} />} 
                label="Delete User Permanently" 
                variant="highlight"
                onClick={async () => {
                  if (!window.confirm('Are you absolutely sure you want to PERMANENTLY delete this user? This action cannot be undone.')) return;
                  setUpdating(true);
                  try {
                    await api.delete(`/admin/users/${id}`);
                    toast.success('User permanently deleted');
                    navigate('/admin/users');
                  } catch (error) {
                    toast.error('Failed to delete user');
                    setUpdating(false);
                  }
                }} 
              />
            </div>
          </div>

          <div className="bg-white border border-brand-border-strong rounded-[2rem] p-8 shadow-sm">
            <h3 className="font-bold text-brand-ink mb-4">Internal Notes</h3>
            <textarea 
              className="w-full h-32 bg-brand-fog border border-brand-border-strong rounded-xl p-4 text-xs font-medium outline-none focus:ring-2 focus:ring-brand-forest/20 text-brand-ink"
              placeholder="Add private staff notes about this user..."
            />
            <Button size="sm" className="w-full mt-4">Save Notes</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatSmall({ label, value, icon }: any) {
  return (
    <div className="bg-white border border-brand-border-strong rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-brand-fog rounded-lg">{icon}</div>
        <span className="text-[11px] font-bold text-brand-mist uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-xl font-display font-bold text-brand-ink capitalize">{value}</div>
    </div>
  );
}

function ActionButton({ icon, label, onClick, variant }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm ${
        variant === 'highlight' 
          ? 'bg-brand-forest text-white hover:bg-brand-forest/90 shadow-lg shadow-brand-forest/20' 
          : 'bg-white/10 hover:bg-white/20'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
