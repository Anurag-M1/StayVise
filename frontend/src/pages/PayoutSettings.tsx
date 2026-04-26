import React, { useState } from 'react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';
import { 
  IndianRupee, Landmark, ShieldCheck, Loader2, 
  CreditCard, Wallet, HelpCircle, ArrowRight, ExternalLink
} from 'lucide-react';
import { Button } from '../components/ui/Button';

export default function PayoutSettings() {
  const [loading, setLoading] = useState(false);
  const [accountType, setAccountType] = useState<'bank_account' | 'vpa'>('bank_account');
  const [formData, setFormData] = useState({
    name: '',
    ifsc: '',
    accountNumber: '',
    vpa: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: any = { account_type: accountType };
      if (accountType === 'bank_account') {
        payload.bank_account = {
          name: formData.name,
          ifsc: formData.ifsc,
          account_number: formData.accountNumber
        };
      } else {
        payload.vpa = { address: formData.vpa };
      }

      await api.post('/users/me/bank-account', payload);
      toast.success('Payout account linked successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to link account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[700px] mx-auto py-8 px-4 sm:px-6 animate-in fade-in duration-500 pb-20">
      
      {/* 1. HEADER SECTION */}
      <div className="mb-10">
        <h1 className="font-display text-3xl font-bold text-brand-ink mb-2">Payout settings</h1>
        <p className="text-brand-slate text-[15px] font-medium">Where should we send your earned funds? Payouts are instant upon release.</p>
      </div>

      <div className="bg-brand-white rounded-2xl shadow-card border border-brand-border-strong overflow-hidden uppercase-labels">
        
        {/* 2. TRUST BANNER */}
        <div className="p-5 bg-brand-forest-light/60 border-b border-brand-forest/10 flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-brand-white flex items-center justify-center text-brand-forest shrink-0 shadow-sm border border-brand-forest/10">
             <ShieldCheck size={20} />
          </div>
          <div className="flex-1">
            <h4 className="text-[13px] font-bold text-brand-forest uppercase tracking-wider mb-1">RazorpayX Secured Gateway</h4>
            <p className="text-[13px] text-brand-slate font-medium leading-relaxed">
              StayVise uses **RazorpayX** to process RBI-compliant instant payouts. Your bank details are encrypted and used strictly for transferring released escrow funds to your account.
            </p>
          </div>
          <ExternalLink size={16} className="text-brand-mist hover:text-brand-forest cursor-pointer transition-colors" />
        </div>

        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            
            {/* Account Type Selector */}
            <div>
              <label className="text-[11px] font-bold text-brand-slate uppercase tracking-widest block mb-3">Payout Method</label>
              <div className="flex flex-col sm:flex-row p-1.5 bg-brand-fog rounded-xl w-full border border-brand-border-strong">
                <button
                  type="button"
                  onClick={() => setAccountType('bank_account')}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${accountType === 'bank_account' ? 'bg-brand-white text-brand-forest shadow-sm ring-1 ring-brand-border-strong' : 'text-brand-mist hover:text-brand-ink'}`}
                >
                  <Landmark size={16} />
                  Bank Account
                </button>
                <button
                  type="button"
                  onClick={() => setAccountType('vpa')}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${accountType === 'vpa' ? 'bg-brand-white text-brand-forest shadow-sm ring-1 ring-brand-border-strong' : 'text-brand-mist hover:text-brand-ink'}`}
                >
                  <Zap size={16} />
                  UPI ID (VPA)
                </button>
              </div>
            </div>

            {/* Form Fields */}
            {accountType === 'bank_account' ? (
              <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-top-2">
                <div>
                  <label className="text-[11px] font-bold text-brand-ink uppercase tracking-widest block mb-2">Full Name on Bank Account</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rajesh Kumar"
                    className="w-full px-4 py-3.5 rounded-xl border border-brand-border bg-brand-white outline-none focus:ring-1 focus:ring-brand-forest focus:border-brand-forest transition-all font-medium text-[15px] placeholder:text-brand-mist"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-brand-ink uppercase tracking-widest block mb-2">IFSC Code</label>
                    <input
                      type="text"
                      required
                      placeholder="HDFC0001234"
                      className="w-full px-4 py-3.5 rounded-xl border border-brand-border bg-brand-white outline-none focus:ring-1 focus:ring-brand-forest focus:border-brand-forest transition-all font-mono font-bold text-[15px] placeholder:text-brand-mist uppercase"
                      value={formData.ifsc}
                      onChange={e => setFormData({ ...formData, ifsc: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-brand-ink uppercase tracking-widest block mb-2">Account Number</label>
                    <input
                      type="password"
                      required
                      placeholder="Enter account number"
                      className="w-full px-4 py-3.5 rounded-xl border border-brand-border bg-brand-white outline-none focus:ring-1 focus:ring-brand-forest focus:border-brand-forest transition-all font-mono font-bold text-[15px] placeholder:text-brand-mist"
                      value={formData.accountNumber}
                      onChange={e => setFormData({ ...formData, accountNumber: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-top-2">
                <label className="text-[11px] font-bold text-brand-ink uppercase tracking-widest block mb-2">UPI ID (VPA)</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="name@okaxis"
                    className="w-full pl-4 pr-16 py-3.5 rounded-xl border border-brand-border bg-brand-white outline-none focus:ring-1 focus:ring-brand-forest focus:border-brand-forest transition-all font-bold text-[15px] placeholder:text-brand-mist"
                    value={formData.vpa}
                    onChange={e => setFormData({ ...formData, vpa: e.target.value })}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center bg-brand-white px-3 py-1.5 rounded-lg border border-brand-border-strong shrink-0 shadow-sm">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/UPI-Logo-vector.svg/1200px-UPI-Logo-vector.svg.png" className="h-4 w-auto object-contain shrink-0" alt="UPI" />
                  </div>
                </div>
                <p className="text-[11px] text-brand-mist font-bold mt-2 flex items-center gap-1">
                   <Info size={12} /> Standard UPI handles like @okhdfc, @okaxis, @ybl are supported.
                </p>
              </div>
            )}

            <div className="pt-4">
              <Button
                type="submit"
                size="lg"
                className="w-full flex items-center justify-center gap-3 group transition-all h-14 bg-brand-forest hover:bg-brand-forest/90 border-0 shadow-xl shadow-brand-forest/20 text-white font-display text-[16px]"
                isLoading={loading}
              >
                {!loading && <ShieldCheck size={20} className="group-hover:scale-110 transition-transform" />}
                <span className="font-bold tracking-tight">Secure Save & Link Account</span>
              </Button>
            </div>
          </form>
        </div>

        {/* 3. SAFETY FOOTER */}
        <div className="bg-brand-fog border-t border-brand-border-strong p-4 sm:p-6 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-brand-mist font-bold text-[10px] uppercase tracking-widest">
                 <Lock size={14} /> 256-Bit SSL
              </div>
              <div className="flex items-center gap-2 text-brand-mist font-bold text-[10px] uppercase tracking-widest">
                 <Landmark size={14} /> RBI Nodal
              </div>
           </div>
           <button type="button" className="text-brand-forest font-bold text-[12px] flex items-center gap-1 hover:underline underline-offset-4">
              <HelpCircle size={14} /> Payout Support
           </button>
        </div>
      </div>

    </div>
  );
}

function Lock(props: any) {
  return (
    <svg 
      {...props} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function Zap(props: any) {
  return (
    <svg 
      {...props} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function Info(props: any) {
  return (
    <svg 
      {...props} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
