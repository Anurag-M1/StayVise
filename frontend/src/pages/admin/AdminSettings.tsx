import React, { useEffect, useState } from 'react';
import { 
  Settings, 
  ShieldCheck, 
  Zap, 
  AlertTriangle, 
  Save, 
  Loader2,
  Lock,
  Globe,
  DollarSign
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { toast } from 'react-hot-toast';

export default function AdminSettings() {
  const qc = useQueryClient();
  const [localSettings, setLocalSettings] = useState<any>(null);

  const { data: settings, isLoading, isError } = useQuery({
    queryKey: ['admin-system-settings'],
    queryFn: () => api.get('/admin/settings').then(r => r.data),
    onSuccess: (data) => setLocalSettings(data)
  });

  // Sync local state when data is loaded
  React.useEffect(() => {
    if (settings && !localSettings) {
      setLocalSettings(settings);
    }
  }, [settings, localSettings]);

  const updateMutation = useMutation({
    mutationFn: (newSettings: any) => api.patch('/admin/settings', newSettings),
    onSuccess: (resp) => {
      qc.setQueryData(['admin-system-settings'], resp.data);
      setLocalSettings(resp.data);
      toast.success('System parameters updated successfully');
    },
    onError: () => toast.error('Failed to save settings')
  });

  const handleUpdate = (field: string, value: any) => {
    setLocalSettings({ ...localSettings, [field]: value });
  };

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(localSettings);
  };

  if (isLoading || !localSettings) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-forest" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-10">
        <AlertTriangle size={48} className="text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-brand-ink">Configuration Load Error</h2>
        <p className="text-brand-slate mt-2 max-w-sm">We couldn't reach the configuration server. Please check your credentials or network status.</p>
        <Button variant="outline" className="mt-6" onClick={() => qc.invalidateQueries({ queryKey: ['admin-system-settings'] })}>
           Retry Connection
        </Button>
      </div>
    );
  }

  const s = localSettings;

  return (
    <div className="max-w-4xl space-y-10 animate-in fade-in duration-500 pb-20">
      <div>
        <h1 className="font-display font-bold text-3xl text-brand-ink">System Configuration</h1>
        <p className="text-brand-slate font-medium">Manage global platform behaviors and economic constants.</p>
      </div>

      <form onSubmit={saveSettings} className="space-y-8">


        {/* Global Access Controls */}
        <section className="bg-white rounded-[2rem] border border-brand-border-strong p-10 shadow-sm relative overflow-hidden">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-blue-50 rounded-xl text-blue-600"><Globe size={20} /></div>
            <h2 className="font-display font-bold text-xl text-brand-ink">Guardrails & Access</h2>
          </div>

          <div className="space-y-6">
            <ToggleOption 
              label="Allow New Registrations" 
              description="Temporarily pause the influx of new freelancers and clients."
              checked={s.allow_new_registrations}
              onChange={(val) => handleUpdate('allow_new_registrations', val)}
              icon={<Zap size={18} className="text-brand-amber" />}
            />
            
            <div className="pt-6 border-t border-brand-border">
              <ToggleOption 
                label="Maintenance Mode" 
                description="Block web dashboard access for all users except admins. Use for critical updates."
                checked={s.maintenance_mode}
                danger
                onChange={(val) => handleUpdate('maintenance_mode', val)}
                icon={<AlertTriangle size={18} className="text-red-500" />}
              />
            </div>
          </div>
        </section>

        <div className="flex items-center justify-between p-8 bg-brand-ink rounded-[2rem] shadow-xl">
           <div className="flex items-center gap-3 text-white/60">
              <Lock size={18} />
              <span className="text-sm font-medium">Changes require Master Admin authorization</span>
           </div>
           <Button 
            type="submit" 
            disabled={updateMutation.isPending}
            className="bg-brand-forest hover:bg-brand-forest/90 text-white px-10 font-bold"
           >
             {updateMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} className="mr-2" />}
             Deploy System Changes
           </Button>
        </div>
      </form>
    </div>
  );
}

function ToggleOption({ label, description, checked, onChange, icon, danger }: any) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-start gap-4">
        <div className="mt-1">{icon}</div>
        <div>
          <div className="font-bold text-brand-ink">{label}</div>
          <p className="text-xs text-brand-slate font-medium max-w-sm mt-0.5">{description}</p>
        </div>
      </div>
      <button 
        type="button"
        onClick={() => onChange(!checked)}
        className={`w-14 h-8 rounded-full transition-all relative ${
          checked 
            ? (danger ? 'bg-red-500' : 'bg-brand-forest') 
            : 'bg-brand-fog'
        }`}
      >
        <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-sm transition-all ${
          checked ? 'left-7' : 'left-1'
        }`} />
      </button>
    </div>
  );
}
