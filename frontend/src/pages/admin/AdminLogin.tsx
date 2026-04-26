import React, { useState } from 'react';
import { Mail, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from '../../components/ui/Toast';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      if (!phone) return;
      setStep(2);
      return;
    }

    if (!email) return;

    setLoading(true);
    try {
      await api.post('/auth/secure-access-link', { 
        email, 
        phone_number: phone.startsWith('+') ? phone : `+91${phone.replace(/\D/g, '')}`
      });
      setSubmitted(true);
      toast.success('Secure access link sent to your admin email.');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to send secure access link.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#050C0A] flex flex-col justify-center items-center p-4 relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-[#0F6E56]/20 blur-[120px] rounded-full pointer-events-none" />
        <div className="w-full max-w-sm bg-[#0A1310] border border-white/10 rounded-2xl p-8 backdrop-blur-xl relative z-10 text-center">
          <div className="w-16 h-16 bg-[#0F6E56]/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-[#0F6E56]" />
          </div>
          <h1 className="text-2xl font-serif text-white mb-2">Check your inbox</h1>
          <p className="text-white/60 text-sm mb-6">
            We've sent a secure access link to <span className="text-white font-medium">{email}</span>.
          </p>
          <button
            onClick={() => {
              setSubmitted(false);
              setStep(1);
            }}
            className="text-[#0F6E56] hover:text-[#0D5A46] text-sm font-medium transition-colors"
          >
            Restart login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050C0A] flex flex-col justify-center items-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-[#0F6E56]/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[#D57B43]/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="w-full max-w-sm bg-[#0A1310] border border-white/10 rounded-2xl p-8 backdrop-blur-xl relative z-10">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-serif text-white mb-2">System Admin</h1>
          <p className="text-white/60 text-sm">Secure Access Verification</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {step === 1 ? (
            <div className="space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
              <label className="text-xs font-medium text-white/50 uppercase tracking-wider ml-1">
                Admin Verification Number
              </label>
              <div className="relative">
                 <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-[#0F6E56] transition-colors"
                  placeholder="+91 98765 43210"
                  required
                  autoFocus
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
              <label className="text-xs font-medium text-white/50 uppercase tracking-wider ml-1">
                Admin Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-[#0F6E56] transition-colors"
                  placeholder="admin@stayvise.in"
                  required
                  autoFocus
                />
              </div>
              <button 
                type="button" 
                onClick={() => setStep(1)}
                className="text-[10px] uppercase font-bold text-[#0F6E56] hover:underline mt-1 ml-1"
              >
                Change Phone
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (step === 1 ? !phone : !email)}
            className="w-full bg-[#0F6E56] hover:bg-[#0D5A46] text-white py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {step === 1 ? 'Continue' : 'Send Access Link'} <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
