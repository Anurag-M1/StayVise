import React from 'react';
import { Quote } from 'lucide-react';

export const AuthLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen flex font-body bg-brand-fog">
      {/* LEFT PANEL - Brand (45% Desktop) */}
      <div className="hidden md:flex flex-col justify-between w-[45%] bg-brand-forest relative overflow-hidden p-12 lg:p-16">
        
        {/* Subtle Background Elements */}
        <div className="absolute top-0 right-0 -mr-24 -mt-24 w-96 h-96 bg-brand-forest-dark rounded-full blur-3xl opacity-50" />
        <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-96 h-96 bg-brand-forest-light rounded-full blur-3xl opacity-5" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-16">
            <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-brand-white" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
              <path d="M12 15v2" strokeWidth="3"/>
            </svg>
            <span className="font-display font-bold text-2xl tracking-tight text-brand-white">StayVise</span>
          </div>

          <h1 className="font-display text-[32px] lg:text-[40px] font-bold text-white leading-[1.2] tracking-tight mb-8">
            The safest way<br />to work with anyone.
          </h1>

          <div className="flex flex-col gap-3 text-brand-forest-light/80 text-[15px] font-medium">
            <div className="flex items-center gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-gold" />
              ₹2.4Cr secured in escrow
            </div>
            <div className="flex items-center gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-gold" />
              700+ active freelancers
            </div>
            <div className="flex items-center gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-gold" />
              99.1% dispute-free delivery
            </div>
          </div>
        </div>

        {/* Floating Testimonial */}
        <div className="relative z-10 mt-auto pt-12">
          <div className="bg-brand-white p-6 rounded-2xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.3)]">
            <Quote className="text-brand-forest-light w-8 h-8 mb-3" />
            <p className="font-display italic text-brand-ink text-lg mb-4">
              "Client said payment is coming for 3 weeks. With StayVise they paid upfront before I started. Never going back."
            </p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                AS
              </div>
              <div>
                <div className="font-bold text-brand-ink text-[13px]">Anurag Singh</div>
                <div className="text-[11px] text-brand-slate">UI Designer · 94 Trust Score</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL - Form (55% Desktop, 100% Mobile) */}
      <div className="w-full md:w-[55%] flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-y-auto">
        
        {/* Mobile Header (Collapses brand panel essentially just to logo) */}
        <div className="md:hidden absolute top-6 left-6 right-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-brand-forest" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
              <path d="M12 15v2" strokeWidth="3"/>
            </svg>
            <span className="font-display font-bold text-xl tracking-tight text-brand-ink">StayVise</span>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="w-full max-w-sm mt-16 md:mt-0">
          {children}
        </div>
        
      </div>
    </div>
  );
};
