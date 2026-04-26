import React from 'react';
import { Gavel, CheckCircle2, AlertTriangle, Scale } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/SEO';
import Breadcrumbs from '../components/Breadcrumbs';

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div className="bg-brand-fog min-h-screen py-16 px-4 sm:px-6 lg:px-8 font-body text-brand-ink">
      <SEO 
        title="Terms of Service"
        description="Read the terms and conditions for using the StayVise platform, including escrow mechanics and dispute resolution."
      />
      <div className="max-w-3xl mx-auto mb-8">
        <Breadcrumbs items={[{ label: 'Terms of Service' }]} />
      </div>
      <div className="max-w-3xl mx-auto bg-brand-white rounded-[2.5rem] border border-brand-border-strong shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Header */}
        <div className="p-8 md:p-12 border-b border-brand-border-strong bg-brand-forest/5 relative overflow-hidden">
          <div className="relative z-10">
            <Button variant="ghost" className="mb-8 pl-0 text-brand-forest" onClick={() => navigate(-1)}>
              &larr; Back
            </Button>
            <h1 className="font-display font-bold text-4xl md:text-5xl mb-4 tracking-tight">Terms of Service</h1>
            <p className="text-brand-slate text-lg">Last updated: April 17, 2026</p>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-amber/10 blur-[100px] rounded-full -mr-32 -mt-32" />
        </div>

        {/* Content */}
        <div className="p-8 md:p-12 space-y-10 leading-relaxed text-brand-slate">
          
          <section>
            <h2 className="font-display font-bold text-2xl text-brand-ink mb-4 flex items-center gap-3">
              <CheckCircle2 className="text-brand-forest" size={24} /> 1. Overview
            </h2>
            <p>
              By accessing or using StayVise, you agree to be bound by these Terms of Service. StayVise is an escrow-backed marketplace designed to facilitate secure transactions between clients and freelancers in India.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold text-2xl text-brand-ink mb-4 flex items-center gap-3">
              <Scale className="text-brand-forest" size={24} /> 2. Escrow Mechanics
            </h2>
            <p>
              When a client funds a project, the money is held in a secure nodal account managed by our payment partner (Razorpay). Money is only released to the freelancer upon milestone approval by the client or through our dispute resolution process.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold text-2xl text-brand-ink mb-4 flex items-center gap-3">
              <AlertTriangle className="text-brand-amber" size={24} /> 3. Dispute Resolution
            </h2>
            <p>
              In the event of a dispute, StayVise moderators will review all project records and communications. Our decision on fund distribution (either release to freelancer or refund to client) is final and binding for users within the platform.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold text-2xl text-brand-ink mb-4 flex items-center gap-3">
              <Gavel className="text-brand-forest" size={24} /> 4. Fees and Payments
            </h2>
            <p>
              StayVise charges a service fee for processing and securing escrow transactions. All fees are clearly displayed before a payment is initiated. Freelancers are responsible for any applicable taxes on their earnings.
            </p>
          </section>

          <div className="pt-10 border-t border-brand-border-strong text-center">
            <p className="text-sm font-medium mb-6">Need clarification on these terms?</p>
            <Button onClick={() => navigate('/contact')}>Speak with Support</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
