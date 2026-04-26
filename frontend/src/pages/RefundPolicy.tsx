import React from 'react';
import { RefreshCcw, ShieldCheck, HelpCircle, ArrowDownCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/SEO';
import Breadcrumbs from '../components/Breadcrumbs';

export default function RefundPolicy() {
  const navigate = useNavigate();

  return (
    <div className="bg-brand-fog min-h-screen py-16 px-4 sm:px-6 lg:px-8 font-body text-brand-ink">
      <SEO 
        title="Refund Policy"
        description="Understand the StayVise refund process, escrow protection, and eligibility for refunds on your freelance projects."
      />
      <div className="max-w-3xl mx-auto mb-8">
        <Breadcrumbs items={[{ label: 'Refund Policy' }]} />
      </div>
      <div className="max-w-3xl mx-auto bg-brand-white rounded-[2.5rem] border border-brand-border-strong shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Header */}
        <div className="p-8 md:p-12 border-b border-brand-border-strong bg-brand-forest/5 relative overflow-hidden">
          <div className="relative z-10">
            <Button variant="ghost" className="mb-8 pl-0 text-brand-forest" onClick={() => navigate(-1)}>
              &larr; Back
            </Button>
            <h1 className="font-display font-bold text-4xl md:text-5xl mb-4 tracking-tight">Refund Policy</h1>
            <p className="text-brand-slate text-lg">Last updated: April 17, 2026</p>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-forest/5 blur-[100px] rounded-full -mr-32 -mt-32" />
        </div>

        {/* Content */}
        <div className="p-8 md:p-12 space-y-10 leading-relaxed text-brand-slate">
          
          <section>
            <h2 className="font-display font-bold text-2xl text-brand-ink mb-4 flex items-center gap-3">
              <ShieldCheck className="text-brand-forest" size={24} /> 1. Escrow Protection
            </h2>
            <p>
              StayVise provides a "Safe Delivery Guarantee." For clients, this means funds remain in escrow until you approve the project milestone. If a freelancer fails to deliver as per the project scope, you are entitled to a full refund of the remaining escrowed funds.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold text-2xl text-brand-ink mb-4 flex items-center gap-3">
              <RefreshCcw className="text-brand-forest" size={24} /> 2. Eligibility for Refund
            </h2>
            <p>
              Refunds can be requested under the following conditions:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-3">
              <li>Freelancer fails to initiate work within the agreed timeline.</li>
              <li>Freelancer goes silent (unresponsive for &gt;5 business days).</li>
              <li>A dispute is resolved in the client's favor by our moderation team.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display font-bold text-2xl text-brand-ink mb-4 flex items-center gap-3">
              <ArrowDownCircle className="text-brand-forest" size={24} /> 3. Processing Times
            </h2>
            <p>
              Once a refund is approved, it is initiated back to the original payment source (UPI, Credit Card, or Bank Account). Refunds typically reflect in your account within 5-7 business days, depending on your bank's processing cycles.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold text-2xl text-brand-ink mb-4 flex items-center gap-3">
              <HelpCircle className="text-brand-forest" size={24} /> 4. Non-Refundable Items
            </h2>
            <p>
              Platform service fees and GST collected by StayVise are generally non-refundable unless the refund is due to a technical error on our side. Once a milestone is approved by a client, the funds released to the freelancer are final and cannot be refunded.
            </p>
          </section>

          <div className="pt-10 border-t border-brand-border-strong text-center">
            <p className="text-sm font-medium mb-6">Need to request a refund or raise a dispute?</p>
            <Button onClick={() => navigate('/disputes')}>Go to Dispute Centre</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
