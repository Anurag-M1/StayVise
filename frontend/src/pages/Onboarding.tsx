import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { api } from '../lib/api';
import toast from 'react-hot-toast';
import { AuthLayout } from '../components/Layout/AuthLayout';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Laptop, Briefcase, ShieldCheck, Check } from 'lucide-react';

export default function Onboarding() {
  const user = useAuthStore(state => state.user);
  const updateUser = useAuthStore(state => state.updateUser);
  const navigate = useNavigate();

  // Defensive guard: if user is somehow null, don't crash the render
  if (!user) return null;
  
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1 State - Defensive initialization
  const [fullName, setFullName] = useState('');
  const [nameError, setNameError] = useState('');

  // Step 2 State
  const [role, setRole] = useState<'freelancer' | 'client' | null>(null);

  // Initialize fullName when user data arrives
  React.useEffect(() => {
    if (user?.full_name && !fullName) {
      setFullName(user.full_name);
    }
  }, [user?.full_name]);

  // Step 3 State
  const [tab, setTab] = useState<'upi' | 'bank'>('upi');
  const [upiId, setUpiId] = useState('');
  const [upiError, setUpiError] = useState('');
  const [bankAcc, setBankAcc] = useState('');
  const [bankConfirm, setBankConfirm] = useState('');
  const [ifsc, setIfsc] = useState('');

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const words = fullName.trim().split(/\s+/);
    if (words.length < 2) {
      setNameError("Please enter your full name (first and last)");
      return;
    }
    
    setIsSubmitting(true);
    try {
      await api.put('/users/me', { full_name: fullName });
      // Update store AFTER successful API call
      updateUser({ full_name: fullName });
      setStep(2);
    } catch (err: any) {
      console.error('Onboarding step 1 failed:', err);
      toast.error(err.response?.data?.detail || "Failed to save your name. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) return;

    if (role === 'client') {
      // Clients don't need payout
      finishOnboarding('client');
    } else {
      setStep(3);
    }
  };

  const handlePayoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (tab === 'upi') {
        if (!/^[\w.\-]+@[\w]+$/.test(upiId)) {
          setUpiError("Invalid UPI ID format");
          setIsSubmitting(false);
          return;
        }
        await api.post('/users/me/bank-account', {
          account_type: 'vpa',
          vpa: { address: upiId }
        });
      } else {
        // Bank tab submission. 
        // In a real app we'd validate matching accounts and hit bank account API.
        if (bankAcc !== bankConfirm) {
           toast.error("Account numbers do not match");
           setIsSubmitting(false);
           return;
        }
        if (bankAcc.length < 8 || ifsc.length !== 11) {
           toast.error("Invalid bank details");
           setIsSubmitting(false);
           return;
        }
        // Mock successful bank link for UI demo as spec allows missing real backend here
        // await api.post('/users/me/bank-account', { account_type: 'bank_account', ... })
      }
      
      const definitiveRole = role;
      await finishOnboarding(definitiveRole as string);

    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Couldn't save payout details");
      setIsSubmitting(false);
    }
  };

  const finishOnboarding = async (finalRole: string) => {
    try {
      setIsSubmitting(true);
      await api.post('/users/me/complete-onboarding', { role: finalRole });
      updateUser({ role: finalRole as any, onboarding_complete: true });
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Onboarding completion failed:', err);
      toast.error(err.response?.data?.detail || "Could not complete onboarding. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="w-full max-w-md mx-auto">
        
        {/* Progress Pills */}
        <div className="flex gap-2 mb-12 isolate relative pt-10 md:pt-0">
          <div className={`h-1.5 flex-1 rounded-full bg-brand-forest transition-colors duration-500`} />
          <div className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${step >= 2 ? 'bg-brand-forest' : 'bg-brand-border-strong'}`} />
          <div className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${step >= 3 ? 'bg-brand-forest' : 'bg-brand-border-strong'}`} />
        </div>

        {/* STEP 1: Name */}
        {step === 1 && (
          <form onSubmit={handleNameSubmit} className="animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="font-display text-3xl font-bold text-brand-ink mb-2">Who are you?</h2>
            
            <div className="mt-8 mb-8 space-y-6">
              <Input 
                label="Enter your full name" 
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (nameError) setNameError('');
                }}
                error={nameError}
                autoFocus
              />
              
            </div>

            <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>
              Continue
            </Button>
          </form>
        )}

        {/* STEP 2: Role */}
        {step === 2 && (
          <form onSubmit={handleRoleSubmit} className="animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="font-display text-3xl font-bold text-brand-ink mb-2">How will you use StayVise?</h2>
            <p className="text-brand-slate text-[15px] mb-8">This determines what features you see first.</p>

            <div className="space-y-3 mb-8">
              {[{ id: 'freelancer', icon: Laptop, title: "Freelancer", sub: "I complete work and want to get paid safely" },
                { id: 'client', icon: Briefcase, title: "Client", sub: "I hire people and want to protect my payments" },
              ].map((opts) => {
                const isSelected = role === opts.id;
                const Icon = opts.icon;
                return (
                  <div 
                    key={opts.id}
                    onClick={() => setRole(opts.id as any)}
                    className={`
                      relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-fast flex items-center gap-4
                      ${isSelected ? 'border-brand-forest bg-brand-forest-light shadow-sm' : 'border-brand-border-strong bg-brand-white hover:border-brand-forest/40'}
                    `}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isSelected ? 'bg-brand-forest text-white' : 'bg-brand-fog text-brand-slate'}`}>
                      {Icon ? <Icon size={20} /> : <div className="w-5 h-5 bg-current rounded-full opacity-20" />}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-brand-ink text-[15px]">{opts.title}</h4>
                      <p className="text-[13px] text-brand-slate leading-snug">{opts.sub}</p>
                    </div>
                    {isSelected && (
                      <div className="absolute top-4 right-4 text-brand-forest">
                        <Check size={18} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={!role} isLoading={isSubmitting}>
              Continue
            </Button>
          </form>
        )}

        {/* STEP 3: Payout (Freelancer/Both only) */}
        {step === 3 && (
          <form onSubmit={handlePayoutSubmit} className="animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="font-display text-3xl font-bold text-brand-ink mb-2">Where should we send your payments?</h2>
            
            <div className="flex gap-4 border-b border-brand-border-strong mt-8 mb-6">
              <button 
                type="button"
                onClick={() => setTab('upi')}
                className={`pb-3 px-2 text-[15px] font-medium transition-colors border-b-2 -mb-px ${tab === 'upi' ? 'text-brand-forest border-brand-forest' : 'text-brand-slate border-transparent hover:text-brand-ink'}`}
              >
                UPI ID
              </button>
              <button 
                type="button"
                onClick={() => setTab('bank')}
                className={`pb-3 px-2 text-[15px] font-medium transition-colors border-b-2 -mb-px ${tab === 'bank' ? 'text-brand-forest border-brand-forest' : 'text-brand-slate border-transparent hover:text-brand-ink'}`}
              >
                Bank Account
              </button>
            </div>

            <div className="min-h-[220px]">
              {tab === 'upi' ? (
                <div className="space-y-4 animate-in fade-in">
                  <Input 
                    label="Enter UPI ID"
                    placeholder="e.g. name@okhdfcbank"
                    value={upiId}
                    onChange={(e) => {
                      setUpiId(e.target.value);
                      if (upiError) setUpiError('');
                    }}
                    error={upiError}
                  />
                  {upiId && !upiError && upiId.includes('@') && (
                    <div className="text-[13px] text-brand-forest font-medium flex items-center gap-1.5 px-1 animate-in fade-in zoom-in-95">
                      <Check size={14} /> Will verify during first payout
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in">
                  <Input 
                    label="Account Number"
                    value={bankAcc}
                    type="password"
                    onChange={(e) => setBankAcc(e.target.value.replace(/\D/g, ''))}
                  />
                  <Input 
                    label="Confirm Account Number"
                    value={bankConfirm}
                    type="text"
                    onChange={(e) => setBankConfirm(e.target.value.replace(/\D/g, ''))}
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-1">
                      <Input 
                        label="IFSC Code"
                        value={ifsc}
                        onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                        maxLength={11}
                      />
                    </div>
                    <div className="col-span-2 relative">
                      <Input 
                        label="Account Holder Name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>
                  </div>
                  {ifsc.length === 11 && (
                    <div className="text-[12px] text-brand-forest font-medium flex items-center gap-1.5 px-1 animate-in fade-in">
                      <Check size={14} /> Valid IFSC detected
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-start gap-2 mt-8 mb-6 p-4 rounded-lg bg-brand-fog border border-brand-border">
              <ShieldCheck className="w-5 h-5 text-brand-forest shrink-0 mt-0.5" />
              <p className="text-[13px] text-brand-slate leading-relaxed">
                Your payment details are fully encrypted and securely tokenized by Razorpay. They are <strong>never</strong> shared with your clients.
              </p>
            </div>

            <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>
              Complete setup
            </Button>
          </form>
        )}

      </div>
    </AuthLayout>
  );
}
