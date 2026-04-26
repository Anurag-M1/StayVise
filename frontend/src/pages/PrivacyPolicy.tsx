import React from 'react';
import { Shield, Lock, Eye, FileText } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/SEO';
import Breadcrumbs from '../components/Breadcrumbs';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="bg-brand-fog min-h-screen py-16 px-4 sm:px-6 lg:px-8 font-body text-brand-ink">
      <SEO 
        title="Privacy Policy"
        description="Learn how StayVise protects your data and ensures the security of your financial transactions."
      />
      <div className="max-w-3xl mx-auto mb-8">
        <Breadcrumbs items={[{ label: 'Privacy Policy' }]} />
      </div>
      <div className="max-w-3xl mx-auto bg-brand-white rounded-[2.5rem] border border-brand-border-strong shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Header */}
        <div className="p-8 md:p-12 border-b border-brand-border-strong bg-brand-forest/5 relative overflow-hidden">
          <div className="relative z-10">
            <Button variant="ghost" className="mb-8 pl-0 text-brand-forest" onClick={() => navigate(-1)}>
              &larr; Back
            </Button>
            <h1 className="font-display font-bold text-4xl md:text-5xl mb-4 tracking-tight">Privacy Policy</h1>
            <p className="text-brand-slate text-lg">Last updated: April 17, 2026</p>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-forest/10 blur-[100px] rounded-full -mr-32 -mt-32" />
        </div>

        {/* Content */}
        <div className="p-8 md:p-12 space-y-10 leading-relaxed text-brand-slate">
          
          <section>
            <h2 className="font-display font-bold text-2xl text-brand-ink mb-4 flex items-center gap-3">
              <Shield className="text-brand-forest" size={24} /> 1. Commitment to Security
            </h2>
            <p>
              At StayVise (StayVise Technologies Pvt. Ltd.), we take your privacy and the security of your financial transactions seriously. This policy explains how we collect, use, and protect your data when you use our escrow-verified marketplace.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold text-2xl text-brand-ink mb-4 flex items-center gap-3">
              <Eye className="text-brand-forest" size={24} /> 2. Data We Collect
            </h2>
            <ul className="list-disc pl-6 space-y-3">
              <li><strong>Contact Information:</strong> We collect your phone number (verified via secure access link) and email to facilitate project communications.</li>
              <li><strong>Financial Data:</strong> Bank account and UPI details are collected to enable payouts. These are handled via our PCI-DSS compliant partner, Razorpay.</li>
              <li><strong>Project Activity:</strong> We store project descriptions, milestone history, and dispute communications to ensure a secure escrow process.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display font-bold text-2xl text-brand-ink mb-4 flex items-center gap-3">
              <Lock className="text-brand-forest" size={24} /> 3. How We Use Information
            </h2>
            <p>
              Your data is used strictly to provide StayVise services. This includes generating secure payment links, sending mobile and email alerts for milestone updates, and calculating your Trust Score based on successful deliveries.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold text-2xl text-brand-ink mb-4 flex items-center gap-3">
              <FileText className="text-brand-forest" size={24} /> 4. Data Retention
            </h2>
            <p>
              As a financial services platform, we retain transaction records for the period required under Indian financial regulations. You may request account deletion at any time, which will anonymize your profile data while preserving necessary transaction logs for compliance.
            </p>
          </section>

          <div className="pt-10 border-t border-brand-border-strong text-center">
            <p className="text-sm font-medium mb-6">Questions about your data? Reach out to us.</p>
            <Button onClick={() => navigate('/contact')}>Contact Privacy Team</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
