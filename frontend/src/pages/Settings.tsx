import React, { useEffect, useId, useState } from 'react';
import {
  Bell,
  CreditCard,
  LogOut,
  Shield,
  Trash2,
  User,
  Wallet,
  Camera,
  CheckCircle2,
  Upload,
  Smartphone,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';
import { useBillingSummary, useMyProfile } from '../lib/queries';
import { useAuthStore } from '../stores/auth';

type TabType = 'profile' | 'payout' | 'notifications' | 'security' | 'billing' | 'danger';

const defaultNotificationPrefs = {
  project_updates: true,
  payment_alerts: true,
  reminders: true,
  weekly_summary: false,
  email_monthly_statement: false,
  email_security_alerts: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
};

export default function Settings() {
  const { data: currentProfile } = useMyProfile();
  const isClient = currentProfile?.role === 'client';
  const [activeTab, setActiveTab] = useState<TabType>('profile');

  return (
    <div className="max-w-[1200px] mx-auto py-8 px-4 sm:px-6 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="w-full lg:w-72 space-y-2">
          <h2 className="px-4 text-[11px] font-bold text-brand-mist uppercase tracking-widest mb-4">Settings</h2>
          <SidebarItem active={activeTab === 'profile'} icon={<User size={18} />} label="Profile" onClick={() => setActiveTab('profile')} />
          {!isClient && <SidebarItem active={activeTab === 'payout'} icon={<Wallet size={18} />} label="Payout details" onClick={() => setActiveTab('payout')} />}
          <SidebarItem active={activeTab === 'notifications'} icon={<Bell size={18} />} label="Notifications" onClick={() => setActiveTab('notifications')} />
          <SidebarItem active={activeTab === 'security'} icon={<Shield size={18} />} label="Security" onClick={() => setActiveTab('security')} />
          <SidebarItem active={activeTab === 'billing'} icon={<CreditCard size={18} />} label="Billing" onClick={() => setActiveTab('billing')} />
          <div className="pt-8">
            <SidebarItem active={activeTab === 'danger'} icon={<Trash2 size={18} />} label="Danger zone" variant="danger" onClick={() => setActiveTab('danger')} />
          </div>
        </aside>

        <div className="flex-1 min-h-[620px] bg-brand-white rounded-[2.5rem] border border-brand-border-strong shadow-sm p-6 md:p-10 overflow-hidden">
          {activeTab === 'profile' && <ProfileTab />}
          {activeTab === 'payout' && !isClient && <PayoutTab />}
          {activeTab === 'notifications' && <NotificationsTab />}
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'billing' && <BillingTab />}
          {activeTab === 'danger' && <DangerTab />}
        </div>
      </div>
    </div>
  );
}

function ProfileTab() {
  const fileInputId = useId();
  const { data: profile } = useMyProfile();
  const { updateUser } = useAuthStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    username: '',
    bio: '',
    avatar_url: '',
  });
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (profile && !isInitialized) {
      setFormData({
        full_name: profile.full_name || '',
        email: profile.email || '',
        username: profile.username || '',
        bio: profile.bio || '',
        avatar_url: profile.avatar_url || '',
      });
      setIsInitialized(true);
    }
  }, [profile, isInitialized]);

  const updateProfile = useMutation({
    mutationFn: () => api.put('/users/me', {
      ...formData,
      email: formData.email || null,
      username: formData.username || null,
      bio: formData.bio || null,
      avatar_url: formData.avatar_url || null,
    }),
    onSuccess: ({ data }) => {
      updateUser(data);
      qc.invalidateQueries({ queryKey: ['me'] });
      toast({ title: 'Profile updated', description: 'Your profile and photo were saved.' });
    },
    onError: (error: any) => {
      toast({ title: 'Update failed', description: error.response?.data?.detail || 'Please try again.', variant: 'error' });
    },
  });

  const handleUsernameCheck = async (value: string) => {
    if (value.trim().length < 3) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    try {
      const { data } = await api.get(`/users/check-username?username=${value}`);
      const ownUsername = profile?.username?.toLowerCase() === value.toLowerCase();
      setUsernameStatus(data.available || ownUsername ? 'available' : 'taken');
    } catch {
      setUsernameStatus('idle');
    }
  };

  const onAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Image too large', description: 'Use an image under 5MB.', variant: 'error' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFormData((current) => ({ ...current, avatar_url: typeof reader.result === 'string' ? reader.result : current.avatar_url }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-3xl space-y-10 animate-in slide-in-from-right-4 duration-300">
      <SectionHeader
        title="Public Profile"
        description="Update your public identity, photo, and bio. Everything here saves to your live account profile."
      />

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <div className="rounded-[2rem] border border-brand-border-strong bg-brand-fog/50 p-6 space-y-5">
          <div className="flex flex-col items-center text-center">
            <Avatar avatarUrl={formData.avatar_url} fullName={formData.full_name || profile?.full_name || 'StayVise User'} className="w-28 h-28 text-3xl" />
            <div className="flex flex-col items-center gap-1 mt-4">
              <div className="flex items-center gap-2">
                <p className="font-bold text-brand-ink leading-none">{formData.full_name || 'Your name'}</p>
                {(profile?.billing_plan === 'premium' || profile?.billing_plan === 'pro') && (
                  <span className="bg-brand-forest text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest">Pro</span>
                )}
              </div>
              <span className="text-[10px] font-mono font-bold text-brand-mist tracking-widest uppercase">{profile?.unique_id}</span>
            </div>
            <p className="text-sm text-brand-mist mt-1">@{formData.username || 'your-handle'}</p>
          </div>
          <label htmlFor={fileInputId} className="flex items-center justify-center gap-2 w-full h-11 rounded-2xl border border-brand-border-strong bg-white text-brand-ink font-bold cursor-pointer hover:border-brand-forest transition-colors">
            <Camera size={16} /> Change photo
          </label>
          <input id={fileInputId} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onAvatarChange} />
          <p className="text-[11px] text-brand-mist font-medium leading-relaxed">
            JPG, PNG, or WEBP up to 5MB. The image is stored with your profile for local testing.
          </p>
        </div>

        <div className="space-y-6">
          <TextField label="Full name" value={formData.full_name} onChange={(value) => setFormData((current) => ({ ...current, full_name: value }))} />
          <TextField label="Email address" value={formData.email} onChange={(value) => setFormData((current) => ({ ...current, email: value }))} placeholder="Used for receipts and statements" />
          <TextField label="Mobile number" value={profile?.phone_number || ''} onChange={() => {}} readOnly helper="Verified on sign-in. Contact support if this number changes." />
          <TextField
            label="Public username"
            value={formData.username}
            onChange={(value) => setFormData((current) => ({ ...current, username: value }))}
            onBlur={() => handleUsernameCheck(formData.username)}
            helper={
              usernameStatus === 'available'
                ? 'Username is available.'
                : usernameStatus === 'taken'
                  ? 'That username is already in use.'
                  : 'Used for your public profile link.'
            }
            status={usernameStatus}
          />
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-brand-mist uppercase tracking-widest">Bio</label>
            <textarea
              rows={5}
              value={formData.bio}
              onChange={(event) => setFormData((current) => ({ ...current, bio: event.target.value }))}
              className="w-full rounded-3xl bg-brand-fog border border-brand-border-strong px-5 py-4 text-brand-ink font-medium outline-none focus:ring-2 ring-brand-forest/20 focus:border-brand-forest transition-all"
              placeholder="Tell clients and freelancers what you do, what you ship well, and how you like to work."
            />
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-brand-border-strong flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <a href={`/p/${profile?.username || profile?.id || ''}`} target="_blank" rel="noreferrer" className="text-sm font-bold text-brand-forest hover:underline">
          Preview public profile
        </a>
        <Button onClick={() => updateProfile.mutate()} className="h-12 px-8 min-w-[150px]" isLoading={updateProfile.isPending}>
          Save changes
        </Button>
      </div>
    </div>
  );
}

function PayoutTab() {
  const { data: profile } = useMyProfile();
  const { toast } = useToast();
  const qc = useQueryClient();
  const payoutDetails = (profile?.payout_details || {}) as Record<string, string>;
  const [mode, setMode] = useState<'vpa' | 'bank_account'>('vpa');
  const [formData, setFormData] = useState({
    holder_name: '',
    ifsc: '',
    account_number: '',
    vpa: '',
  });

  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (profile && !isInitialized) {
      const currentType = payoutDetails.account_type === 'bank_account' ? 'bank_account' : 'vpa';
      setMode(currentType);
      setFormData({
        holder_name: payoutDetails.holder_name || profile.full_name || '',
        ifsc: payoutDetails.ifsc || '',
        account_number: '',
        vpa: payoutDetails.address || '',
      });
      setIsInitialized(true);
    }
  }, [profile, payoutDetails, isInitialized]);

  const savePayout = useMutation({
    mutationFn: () => {
      if (mode === 'bank_account') {
        return api.post('/users/me/bank-account', {
          account_type: 'bank_account',
          bank_account: {
            name: formData.holder_name,
            ifsc: formData.ifsc.toUpperCase(),
            account_number: formData.account_number,
          },
        });
      }

      return api.post('/users/me/bank-account', {
        account_type: 'vpa',
        vpa: {
          address: formData.vpa,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      toast({ title: 'Payout details saved', description: 'Your payout method is ready for the next release.' });
      setFormData((current) => ({ ...current, account_number: '' }));
    },
    onError: (error: any) => {
      toast({ title: 'Could not save payout details', description: error.response?.data?.detail || 'Please check your inputs.', variant: 'error' });
    },
  });

  const isClient = profile?.role === 'client';

  return (
    <div className="max-w-3xl space-y-10 animate-in slide-in-from-right-4 duration-300">
      <SectionHeader
        title="Payout Details"
        description="Choose where released milestone funds should land. Saved details are masked and available for edits here."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-[2rem] border border-brand-border-strong bg-brand-fog/50 p-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-brand-forest text-white flex items-center justify-center">
              <Wallet size={32} />
            </div>
            <div>
              <h4 className="font-display font-bold text-lg text-brand-ink">Saved method</h4>
              <p className="text-sm text-brand-slate mt-1">Masked details from your last successful payout setup.</p>
            </div>
          </div>

          {payoutDetails.account_type ? (
            <div className="rounded-3xl bg-white border border-brand-border-strong p-5 space-y-2">
              <p className="text-[10px] font-bold text-brand-mist uppercase tracking-widest">{payoutDetails.account_type === 'bank_account' ? 'Bank account' : 'UPI ID'}</p>
              <p className="font-bold text-brand-ink text-lg">{payoutDetails.label || payoutDetails.address || payoutDetails.account_number_masked}</p>
              {payoutDetails.holder_name && <p className="text-sm text-brand-slate">{payoutDetails.holder_name}</p>}
              {payoutDetails.ifsc && <p className="text-xs font-mono text-brand-mist">{payoutDetails.ifsc}</p>}
              <div className="inline-flex items-center gap-2 mt-2 text-[11px] font-bold uppercase tracking-widest text-brand-forest">
                <CheckCircle2 size={14} /> Ready for payouts
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-brand-border-strong p-5 text-sm text-brand-slate">
              No payout method is saved yet. Add one on the right to unlock instant release routing.
            </div>
          )}
        </div>

        <div className="rounded-[2rem] border border-brand-border-strong p-6 md:p-8 space-y-6">
          <div className="flex p-1 bg-brand-fog rounded-2xl border border-brand-border-strong w-full sm:w-max">
            <button onClick={() => setMode('vpa')} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${mode === 'vpa' ? 'bg-white text-brand-forest shadow-sm' : 'text-brand-mist'}`}>UPI ID</button>
            <button onClick={() => setMode('bank_account')} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${mode === 'bank_account' ? 'bg-white text-brand-forest shadow-sm' : 'text-brand-mist'}`}>Bank account</button>
          </div>

          {mode === 'vpa' ? (
            <TextField label="UPI ID" value={formData.vpa} onChange={(value) => setFormData((current) => ({ ...current, vpa: value }))} placeholder="name@okaxis" />
          ) : (
            <div className="grid gap-5">
              <TextField label="Account holder" value={formData.holder_name} onChange={(value) => setFormData((current) => ({ ...current, holder_name: value }))} />
              <div className="grid sm:grid-cols-2 gap-5">
                <TextField label="IFSC code" value={formData.ifsc} onChange={(value) => setFormData((current) => ({ ...current, ifsc: value.toUpperCase() }))} placeholder="HDFC0001234" />
                <TextField label="Account number" value={formData.account_number} onChange={(value) => setFormData((current) => ({ ...current, account_number: value }))} placeholder="Enter account number" />
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button onClick={() => savePayout.mutate()} className="h-12 px-8" isLoading={savePayout.isPending}>
              Payout
            </Button>
            <div className="text-sm text-brand-slate flex items-center">
              Stored with Razorpay-linked routing and shown back to you in masked form only.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotificationsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['notification-prefs'],
    queryFn: () => api.get('/users/me/notifications').then((response) => response.data),
    refetchInterval: 5000,
  });
  const [prefs, setPrefs] = useState(defaultNotificationPrefs);

  useEffect(() => {
    if (data) {
      setPrefs({ ...defaultNotificationPrefs, ...data });
    }
  }, [data]);

  const savePrefs = useMutation({
    mutationFn: () => api.put('/users/me/notifications', prefs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-prefs'] });
      toast({ title: 'Notifications updated', description: 'Your real-time preferences are saved.' });
    },
    onError: (error: any) => {
      toast({ title: 'Could not save preferences', description: error.response?.data?.detail || 'Please try again.', variant: 'error' });
    },
  });

  return (
    <div className="max-w-3xl space-y-10 animate-in slide-in-from-right-4 duration-300">
      <SectionHeader
        title="Notification Preferences"
        description="Choose what should surface via Mobile Alerts and Email. The live feed in the app refreshes automatically."
      />

      {isLoading ? (
        <div className="rounded-[2rem] border border-brand-border-strong p-8 animate-pulse bg-brand-fog/40 h-64" />
      ) : (
        <div className="space-y-8">
          <section className="space-y-6">
            <h4 className="text-[11px] font-bold text-brand-mist uppercase tracking-widest border-b border-brand-border-strong pb-2">Mobile Alerts</h4>
            <ToggleRow checked={prefs.project_updates} label="Project updates" desc="Funding, disputes, approvals, and project movement." onChange={() => setPrefs((current) => ({ ...current, project_updates: !current.project_updates }))} />
            <ToggleRow checked={prefs.payment_alerts} label="Payment alerts" desc="When money is funded or released." onChange={() => setPrefs((current) => ({ ...current, payment_alerts: !current.payment_alerts }))} />
            <ToggleRow checked={prefs.reminders} label="Reminders" desc="Need-attention nudges for approvals and milestone actions." onChange={() => setPrefs((current) => ({ ...current, reminders: !current.reminders }))} />
            <ToggleRow checked={prefs.weekly_summary} label="Weekly summary" desc="A compact performance recap with totals and momentum." onChange={() => setPrefs((current) => ({ ...current, weekly_summary: !current.weekly_summary }))} />
          </section>

          <section className="space-y-6">
            <h4 className="text-[11px] font-bold text-brand-mist uppercase tracking-widest border-b border-brand-border-strong pb-2">Email</h4>
            <ToggleRow checked={prefs.email_monthly_statement} label="Monthly statement" desc="PDF summary of your ledger and releases." onChange={() => setPrefs((current) => ({ ...current, email_monthly_statement: !current.email_monthly_statement }))} />
            <ToggleRow checked={prefs.email_security_alerts} label="Security alerts" desc="Always-on warnings for new sessions and unusual access." disabled onChange={() => {}} />
          </section>

          <section className="rounded-[2rem] border border-brand-border-strong bg-brand-fog/50 p-6 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-brand-ink">Quiet hours</h4>
                <p className="text-sm text-brand-mist mt-1">Pause non-critical messages while you sleep.</p>
              </div>
              <Toggle checked={prefs.quiet_hours_enabled} onChange={() => setPrefs((current) => ({ ...current, quiet_hours_enabled: !current.quiet_hours_enabled }))} />
            </div>
            {prefs.quiet_hours_enabled && (
              <div className="grid sm:grid-cols-2 gap-4">
                <TextField label="Start" value={prefs.quiet_hours_start} onChange={(value) => setPrefs((current) => ({ ...current, quiet_hours_start: value }))} />
                <TextField label="End" value={prefs.quiet_hours_end} onChange={(value) => setPrefs((current) => ({ ...current, quiet_hours_end: value }))} />
              </div>
            )}
          </section>

          <div className="pt-2">
            <Button onClick={() => savePrefs.mutate()} className="h-12 px-8" isLoading={savePrefs.isPending}>
              Save notification settings
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SecurityTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get('/users/me/sessions').then((response) => response.data),
    refetchInterval: 5000,
  });
  const { data: loginHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['login-history'],
    queryFn: () => api.get('/users/me/login-history').then((response) => response.data),
    refetchInterval: 5000,
  });

  const logoutMutation = useMutation({
    mutationFn: (sessionId: string) => api.delete(sessionId === 'all' ? '/users/me/sessions/all-others' : `/users/me/sessions/${sessionId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['login-history'] });
      toast({ title: 'Session updated', description: 'Security settings were refreshed.' });
    },
  });

  return (
    <div className="max-w-3xl space-y-10 animate-in slide-in-from-right-4 duration-300">
      <SectionHeader title="Security Hub" description="Live session visibility with quick sign-out for devices you no longer trust." />

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <h4 className="text-[11px] font-bold text-brand-mist uppercase tracking-widest">Active sessions</h4>
          <Button variant="outline" className="border-brand-border-strong text-brand-danger" onClick={() => logoutMutation.mutate('all')}>
            Sign out all
          </Button>
        </div>

        {isLoading ? (
          <div className="rounded-[2rem] border border-brand-border-strong p-8 animate-pulse bg-brand-fog/40 h-48" />
        ) : !sessions?.length ? (
          <div className="rounded-[2rem] border border-brand-border-strong p-6 text-sm text-brand-slate">
            No separate sessions are active right now.
          </div>
        ) : (
          <div className="grid gap-3">
            {sessions.map((session: any) => (
              <div key={session.id} className="bg-brand-fog border border-brand-border-strong rounded-3xl p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-2xl bg-white border border-brand-border-strong flex items-center justify-center text-brand-mist">
                    <Smartphone size={20} />
                  </div>
                  <div>
                    <div className="font-bold text-brand-ink">{session.device_info || 'Unknown device'}</div>
                    <div className="text-sm text-brand-mist mt-1">
                      {session.location || session.ip_address || 'Unknown location'} • Last active {format(new Date(session.last_active_at), 'dd MMM yyyy, hh:mm a')}
                    </div>
                  </div>
                </div>
                <Button variant="ghost" className="text-brand-danger" onClick={() => logoutMutation.mutate(session.id)}>
                  <LogOut size={16} className="mr-2" /> Sign out
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-5">
        <h4 className="text-[11px] font-bold text-brand-mist uppercase tracking-widest">Login history</h4>
        {historyLoading ? (
          <div className="rounded-[2rem] border border-brand-border-strong p-8 animate-pulse bg-brand-fog/40 h-40" />
        ) : (
          <div className="overflow-hidden rounded-[2rem] border border-brand-border-strong">
            <table className="w-full text-left text-sm">
              <thead className="bg-brand-fog border-b border-brand-border-strong text-[11px] font-bold text-brand-mist uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4">Signed in</th>
                  <th className="px-6 py-4">Device</th>
                  <th className="px-6 py-4">Location</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border-strong">
                {loginHistory?.map((session: any) => (
                  <tr key={session.id}>
                    <td className="px-6 py-4 font-semibold text-brand-ink">{format(new Date(session.created_at), 'dd MMM yyyy, hh:mm a')}</td>
                    <td className="px-6 py-4 text-brand-slate">{session.device_info || 'Unknown device'}</td>
                    <td className="px-6 py-4 text-brand-slate">{session.location || session.ip_address || 'Unknown location'}</td>
                    <td className={`px-6 py-4 font-bold uppercase tracking-widest text-[11px] ${session.is_active ? 'text-brand-forest' : 'text-brand-mist'}`}>
                      {session.is_active ? 'Active' : 'Signed out'}
                    </td>
                  </tr>
                ))}
                {!loginHistory?.length && (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-brand-slate">
                      Login history will appear here as real sessions are created.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function BillingTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: billing, isLoading } = useBillingSummary();
  const [upgrading, setUpgrading] = useState(false);

  const currentPlan = billing?.billing_plan || 'free';
  const isPro = currentPlan === 'pro' || currentPlan === 'premium';
  const limits = billing?.plan_limits;

  const handleUpgradeToPro = async () => {
    setUpgrading(true);
    try {
      // Step 1: Create order on backend
      const { data } = await api.post('/users/me/billing/subscribe', { plan: 'pro' });

      const { order_id, subscription_id, razorpay_key_id, amount } = data;
      const checkoutOrderId = order_id || subscription_id;

      // Check for placeholder keys
      if (razorpay_key_id.includes('REDACTED') || razorpay_key_id === 'your_razorpay_key_id_here') {
        toast({
          title: 'Environment Unconfigured',
          description: 'Razorpay keys are currently placeholders. Please update your .env file with real keys to enable upgrades.',
          variant: 'error'
        });
        setUpgrading(false);
        return;
      }

      // Step 2: Open Razorpay Checkout
      if (!(window as any).Razorpay) {
        toast({ title: 'Checkout unavailable', description: 'Razorpay checkout is loading. Please try again in a moment.', variant: 'error' });
        setUpgrading(false);
        return;
      }

      const options = {
        key: razorpay_key_id,
        amount: amount || 29900,
        currency: 'INR',
        name: 'StayVise Pro',
        description: 'Pro Plan — ₹299/month',
        order_id: checkoutOrderId,
        handler: async (response: any) => {
          try {
            await api.post('/users/me/billing/verify-subscription', {
              razorpay_subscription_id: response.razorpay_order_id || checkoutOrderId,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast({ title: 'Welcome to Pro! 🎉', description: 'Your premium features are now active. Enjoy unlimited projects and lower fees.', variant: 'success' });
            qc.invalidateQueries({ queryKey: ['billing-summary'] });
            qc.invalidateQueries({ queryKey: ['me'] });
          } catch (err: any) {
            toast({
              title: 'Verification failed',
              description: err.response?.data?.detail || 'Could not verify payment. Please contact support.',
              variant: 'error'
            });
          } finally {
            setUpgrading(false);
          }
        },
        modal: {
          ondismiss: () => setUpgrading(false),
        },
        theme: { color: '#0F6E56' },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      toast({
        title: 'Upgrade failed',
        description: err.response?.data?.detail || 'Could not initiate upgrade. Please check your credentials.',
        variant: 'error'
      });
      setUpgrading(false);
    }
  };

  const handleDowngradeToFree = async () => {
    try {
      await api.put('/users/me/billing', { billing_plan: 'free' });
      qc.invalidateQueries({ queryKey: ['billing-summary'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      toast({ title: 'Plan changed', description: 'You are now on the Basic plan.' });
    } catch (err: any) {
      toast({ title: 'Failed', description: err.response?.data?.detail || 'Please try again.', variant: 'error' });
    }
  };

  const basicFeatures = [
    { label: '2% escrow fee per transaction', included: true },
    { label: '1 active project at a time', included: true },
    { label: 'Secure Mobile & Email alerts', included: true },
    { label: 'Basic trust score', included: true },
    { label: 'Direct Bank payouts', included: true },
    { label: 'Priority dispute resolution', included: false },
    { label: 'Verified Pro badge', included: false },
    { label: 'GST Invoice generation', included: false },
  ];

  const proFeatures = [
    { label: '1.5% escrow fee per transaction', included: true },
    { label: 'Unlimited active projects', included: true },
    { label: 'Secure Mobile & Email alerts', included: true },
    { label: 'Advanced trust score', included: true },
    { label: 'Direct Bank payouts', included: true },
    { label: 'Priority dispute resolution (24h)', included: true },
    { label: 'Verified Pro badge on profile', included: true },
    { label: 'Automated GST Invoice generation', included: true },
    { label: 'Custom profile URL (stayvise.com/p/you)', included: true },
  ];

  return (
    <div className="max-w-3xl space-y-10 animate-in slide-in-from-right-4 duration-300">
      <SectionHeader title="Billing & Plans" description="Choose the plan that fits your workflow. Upgrade or downgrade anytime." />

      {/* Current Plan Summary */}
      {limits && (
        <div className="rounded-[2rem] border border-brand-border-strong bg-brand-fog/50 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isPro ? 'bg-brand-forest text-white' : 'bg-brand-border-strong text-brand-slate'}`}>
              <CreditCard size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-display font-bold text-lg text-brand-ink">{isPro ? 'Pro Plan' : 'Basic Plan'}</h4>
                {isPro && <span className="bg-brand-forest text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-widest">Active</span>}
              </div>
              <p className="text-sm text-brand-slate mt-0.5">
                {isPro ? `${limits.escrow_fee_percent}% escrow fee · Unlimited projects` : `${limits.escrow_fee_percent}% escrow fee · ${limits.max_active_projects} active project`}
              </p>
            </div>
          </div>
          {billing?.renewal_date && (
            <p className="text-[11px] font-bold text-brand-mist uppercase tracking-widest">
              Renews {new Date(billing.renewal_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-[2rem] border border-brand-border-strong bg-brand-fog/40 p-8 animate-pulse h-48" />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Basic Plan */}
          <div className={`rounded-[2rem] border-2 p-8 space-y-6 transition-all ${!isPro ? 'border-brand-forest bg-brand-forest-light/20' : 'border-brand-border-strong bg-brand-white'}`}>
            <div>
              <p className="text-[11px] font-bold text-brand-mist uppercase tracking-widest">Basic</p>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="font-display font-bold text-4xl text-brand-ink">₹0</span>
                <span className="text-brand-mist font-medium text-sm">/month</span>
              </div>
            </div>
            <div className="space-y-3">
              {basicFeatures.map((f) => (
                <div key={f.label} className={`flex items-start gap-3 ${!f.included ? 'opacity-40' : ''}`}>
                  <CheckCircle2 size={16} className={`shrink-0 mt-0.5 ${f.included ? 'text-brand-forest' : 'text-brand-mist'}`} />
                  <span className={`text-sm font-medium ${f.included ? 'text-brand-slate' : 'text-brand-mist line-through'}`}>{f.label}</span>
                </div>
              ))}
            </div>
            {!isPro ? (
              <div className="inline-flex items-center rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-widest bg-brand-forest text-white">
                Current plan
              </div>
            ) : (
              <Button variant="outline" className="w-full border-brand-border-strong" onClick={handleDowngradeToFree}>
                Switch to Basic
              </Button>
            )}
          </div>

          {/* Pro Plan */}
          <div className={`rounded-[2rem] border-2 p-8 space-y-6 relative overflow-hidden transition-all ${isPro ? 'border-brand-forest bg-brand-forest-light/20' : 'border-brand-border-strong bg-brand-white'}`}>
            <div className="absolute top-4 right-4 bg-brand-amber text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
              Most Popular
            </div>
            <div>
              <p className="text-[11px] font-bold text-brand-mist uppercase tracking-widest">Pro</p>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="font-display font-bold text-4xl text-brand-ink">₹299</span>
                <span className="text-brand-mist font-medium text-sm">/month</span>
              </div>
            </div>
            <div className="space-y-3">
              {proFeatures.map((f) => (
                <div key={f.label} className="flex items-start gap-3">
                  <CheckCircle2 size={16} className="text-brand-forest shrink-0 mt-0.5" />
                  <span className="text-sm text-brand-slate font-medium">{f.label}</span>
                </div>
              ))}
            </div>
            {isPro ? (
              <div className="inline-flex items-center rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-widest bg-brand-forest text-white">
                Current plan
              </div>
            ) : (
              <Button className="w-full h-12 bg-brand-forest text-white border-0 shadow-lg" onClick={handleUpgradeToPro} isLoading={upgrading}>
                Upgrade to Pro
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DangerTab() {
  const [confirmValue, setConfirmValue] = useState('');
  const { logout } = useAuthStore();
  const { toast } = useToast();
  const qc = useQueryClient();

  const deleteAccount = useMutation({
    mutationFn: () => api.delete('/users/me'),
    onSuccess: () => {
      toast({ title: 'Account deleted', description: 'Your account has been deactivated. Signing out...' });
      // Clear data and logout
      qc.clear();
      setTimeout(() => {
        logout();
        window.location.href = '/';
      }, 2000);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Deletion failed', 
        description: error.response?.data?.detail || 'Please ensure all projects are completed first.', 
        variant: 'error' 
      });
    },
  });

  const isUnlocked = confirmValue === 'DELETE';

  return (
    <div className="max-w-2xl space-y-10 animate-in slide-in-from-right-4 duration-300">
      <SectionHeader title="Danger Zone" description="Irreversible actions stay fenced off here. Nothing in this section runs automatically." tone="danger" />
      <div className="rounded-[2rem] border-2 border-brand-danger/20 bg-brand-danger/5 p-8 space-y-5">
        <h4 className="font-display font-bold text-xl text-brand-ink">Delete StayVise account</h4>
        <p className="text-sm text-brand-slate leading-relaxed">
          Deleting your account will deactivate your profile and revoke all active sessions. 
          This action is blocked if you have active projects, unpaid milestones, or open disputes.
        </p>
        <TextField label='Type "DELETE" to confirm' value={confirmValue} onChange={setConfirmValue} />
        <Button 
          variant="danger"
          disabled={!isUnlocked} 
          onClick={() => deleteAccount.mutate()}
          className={`w-full sm:w-auto h-12 px-8 ${!isUnlocked ? 'opacity-50 cursor-not-allowed' : ''}`}
          isLoading={deleteAccount.isPending}
        >
          Delete account
        </Button>
      </div>
    </div>
  );
}

function SectionHeader({ title, description, tone = 'default' }: { title: string; description: string; tone?: 'default' | 'danger' }) {
  return (
    <div>
      <h3 className={`font-display font-bold text-2xl mb-2 ${tone === 'danger' ? 'text-brand-danger' : 'text-brand-ink'}`}>{title}</h3>
      <p className="text-brand-slate font-medium text-sm">{description}</p>
    </div>
  );
}

function Avatar({ avatarUrl, fullName, className = 'w-20 h-20 text-2xl' }: { avatarUrl?: string | null; fullName: string; className?: string }) {
  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'SV';

  if (avatarUrl) {
    return <img src={avatarUrl} alt={fullName} className={`rounded-full object-cover border-2 border-brand-forest/20 ${className}`} />;
  }

  return (
    <div className={`rounded-full bg-brand-forest/10 flex items-center justify-center text-brand-forest font-display font-bold border-2 border-brand-forest/20 ${className}`}>
      {initials}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  helper,
  readOnly = false,
  onBlur,
  status = 'idle',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  readOnly?: boolean;
  onBlur?: () => void;
  status?: 'idle' | 'checking' | 'available' | 'taken';
}) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-bold text-brand-mist uppercase tracking-widest">{label}</label>
      <div className="relative">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          readOnly={readOnly}
          placeholder={placeholder}
          className={`w-full h-12 bg-brand-fog rounded-2xl px-4 font-semibold text-brand-ink outline-none border border-brand-border-strong transition-all ${
            readOnly ? 'text-brand-mist cursor-not-allowed' : 'focus:ring-2 ring-brand-forest/20 focus:border-brand-forest focus:bg-white'
          }`}
        />
        {status === 'checking' && <Upload size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-mist animate-pulse" />}
        {status === 'available' && <CheckCircle2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-forest" />}
      </div>
      {helper && <p className={`text-[11px] font-medium ${status === 'taken' ? 'text-brand-danger' : 'text-brand-mist'}`}>{helper}</p>}
    </div>
  );
}

function SidebarItem({ active, icon, label, onClick, variant = 'default' }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void; variant?: 'default' | 'danger' }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all font-bold text-sm ${
        active
          ? variant === 'danger' ? 'bg-brand-danger text-white' : 'bg-brand-forest text-white'
          : variant === 'danger' ? 'text-brand-danger hover:bg-brand-danger/10' : 'text-brand-slate hover:bg-brand-fog'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function ToggleRow({ checked, label, desc, onChange, disabled = false }: { checked: boolean; label: string; desc: string; onChange: () => void; disabled?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-6 ${disabled ? 'opacity-60' : ''}`}>
      <div className="flex-1">
        <p className="font-bold text-brand-ink text-sm">{label}</p>
        <p className="text-[12px] text-brand-mist font-medium mt-1 leading-relaxed">{desc}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative w-10 h-6 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand-forest' : 'bg-brand-border-strong'}`}
    >
      <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  );
}
