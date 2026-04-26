import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { ShieldCheck, Target, ArrowRight, Wallet } from 'lucide-react';
import { Button } from '../components/ui/Button';

export default function OnboardingComplete() {
  const user = useAuthStore(state => state.user);
  const navigate = useNavigate();
  const [timeLeft, setTimeLeft] = useState(8);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/dashboard', { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-brand-fog flex flex-col font-body selection:bg-brand-forest-light selection:text-brand-forest-dark">
      
      {/* Top Drain Bar */}
      <div className="h-1.5 w-full bg-brand-border-strong relative overflow-hidden">
         <div 
           className="absolute top-0 bottom-0 left-0 bg-brand-forest transition-all"
           style={{ width: `${(timeLeft / 8) * 100}%`, transitionDuration: '1000ms', transitionTimingFunction: 'linear' }}
         />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 max-w-4xl mx-auto w-full">
        
        {/* Checkmark Animation Sequence */}
        <div className="relative w-24 h-24 mb-6">
          <div className="absolute inset-0 bg-brand-forest-light rounded-full animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_1]" />
          <svg className="w-24 h-24 relative z-10" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="46" stroke="var(--brand-forest)" strokeWidth="6" strokeDasharray="290" strokeDashoffset="290" className="animate-[dash_0.8s_ease-out_forwards]" />
            <path d="M28 52L43 67L74 34" stroke="var(--brand-forest)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="80" strokeDashoffset="80" className="animate-[dash_0.6s_ease-out_0.6s_forwards]" />
          </svg>
        </div>

        <h1 className="font-display text-3xl sm:text-[40px] font-bold text-brand-ink mb-4 text-center animate-in fade-in slide-in-from-bottom-4 duration-500 delay-1000 fill-mode-both">
          You're all set, {user?.full_name?.split(' ')[0] || 'there'}!
        </h1>

        <div className="bg-brand-white border border-brand-border p-3 px-5 rounded-full inline-flex items-center gap-2 mb-12 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500 delay-1200 fill-mode-both">
          <ShieldCheck className="text-brand-gold w-5 h-5" />
          <span className="text-brand-ink font-semibold text-sm">Your StayVise score: 50 · Neutral (builds with projects)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full animate-in fade-in slide-in-from-bottom-8 duration-700 delay-1500 fill-mode-both">
          
          <div className="bg-brand-white p-6 rounded-2xl border border-brand-border-strong shadow-card text-center md:text-left flex flex-col items-center md:items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-[#EFEAE2] flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-brand-forest" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                 <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
                 <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-brand-ink mb-1">Your first project is waiting</h3>
              <p className="text-[13px] text-brand-slate leading-snug">Create an escrow project via WhatsApp or right here on the dashboard.</p>
            </div>
          </div>

          <div className="bg-brand-white p-6 rounded-2xl border border-brand-border-strong shadow-card text-center md:text-left flex flex-col items-center md:items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-forest-light flex items-center justify-center">
              <Target className="w-5 h-5 text-brand-forest" />
            </div>
            <div>
              <h3 className="font-bold text-brand-ink mb-1">Build your score</h3>
              <p className="text-[13px] text-brand-slate leading-snug">Complete projects successfully to unlock Verified Pro badge and credibility.</p>
            </div>
          </div>

          <div className="bg-brand-white p-6 rounded-2xl border border-brand-border-strong shadow-card text-center md:text-left flex flex-col items-center md:items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-brand-ink mb-1">Paid rapidly via UPI</h3>
              <p className="text-[13px] text-brand-slate leading-snug">Automated payouts hit your linked account usually within 2 hours of approval.</p>
            </div>
          </div>

        </div>

        <div className="mt-12 w-full max-w-sm flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-2000 fill-mode-both">
          <Button size="lg" className="w-full flex items-center justify-center gap-2 group" onClick={() => navigate('/dashboard')}>
            Enter Dashboard 
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Button>
          <div className="text-center">
            <span className="text-[13px] text-brand-mist font-medium">Auto-redirecting in {timeLeft}s</span>
          </div>
        </div>

      </div>

      <style>{`
        @keyframes dash {
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
}
