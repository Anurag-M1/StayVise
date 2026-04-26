import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useProject } from '../lib/queries';
import { api } from '../lib/api';
import toast from 'react-hot-toast';
import { ShieldCheck, Lock, ChevronDown, Check, ArrowRight, Loader2, Play, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { fmtINR } from '../lib/currency';
import type { PaymentOrderResponse, Project } from '../lib/types';

type PaymentVerifyPayload = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: PaymentVerifyPayload) => void;
  modal?: { ondismiss?: () => void };
};

type RazorpayConstructor = new (options: RazorpayCheckoutOptions) => { open: () => void };

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

export default function PaymentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: project, isLoading, error } = useProject(id || '');

  const [milestonesOpen, setMilestonesOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [razorpayReady, setRazorpayReady] = useState(false);

  useEffect(() => {
    if (window.Razorpay) {
      setRazorpayReady(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => setRazorpayReady(true);
    script.onerror = () => setRazorpayReady(false);
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const totalAmount = project?.total_amount || 0;
  const platformFee = project?.platform_fee_amount || 0;
  const grandTotal = totalAmount + platformFee;
  const freelancerName = project?.freelancer?.full_name || 'Freelancer';
  const clientName = project?.client?.full_name || 'Client';

  const handlePayment = async () => {
    if (!project) return;

    if (project.status === 'in_progress' || project.status === 'completed') {
      toast.success('This project is already funded.');
      navigate(`/projects/${project.id}`);
      return;
    }

    setIsProcessing(true);
    try {
      const { data: order } = await api.post<PaymentOrderResponse>('/payments/create-order', {
        project_id: project.id,
      });

      const isUnconfigured = order.key_id.includes('REDACTED') || order.key_id === 'your_razorpay_key_id_here';

      if (isUnconfigured) {
          toast.error('Environment Unconfigured: Razorpay key is a placeholder. Please update your .env file with real keys.', { duration: 6000 });
          setIsProcessing(false);
          return;
      }

      if (!window.Razorpay) {
        toast.error('Razorpay checkout is not available right now. Please refresh and try again.');
        setIsProcessing(false);
        return;
      }

      const checkout = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: 'StayVise',
        description: order.description,
        order_id: order.order_id,
        prefill: {
          name: clientName,
          contact: project.client?.phone_number?.replace('+91', '') || '',
        },
        theme: { color: '#0F6E56' },
        handler: (response) => {
          verifyPayment(response, project.id).catch((err) => {
            toast.error(getErrorMessage(err, 'Payment verification failed. Please contact support.'));
            setIsProcessing(false);
          });
        },
        modal: {
          ondismiss: () => setIsProcessing(false),
        },
      });

      checkout.open();
    } catch (paymentError) {
      toast.error(getErrorMessage(paymentError, 'Could not start payment. Please try again.'));
      setIsProcessing(false);
    }
  };

  const verifyPayment = async (payload: PaymentVerifyPayload, projectId: string) => {
    try {
      await api.post('/payments/verify', payload);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['stats'] }),
      ]);
      setShowSuccess(true);
      toast.success('Payment secured in escrow.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-fog font-body">
        <HeaderShell />
        <div className="max-w-[560px] mx-auto px-4 md:px-0 py-6">
          <div className="w-full h-12 bg-white/50 animate-pulse rounded-t-xl mb-4" />
          <div className="bg-white rounded-xl h-[400px] border border-brand-border-strong p-6 mb-4 animate-pulse" />
          <div className="bg-white rounded-xl h-[200px] border border-brand-border-strong animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-brand-fog font-body flex items-center justify-center p-4">
        <div className="text-center max-w-sm w-full bg-brand-white p-8 rounded-3xl border border-brand-border-strong shadow-card">
          <AlertCircle className="w-12 h-12 text-brand-danger mx-auto mb-4" />
          <h2 className="font-display font-bold text-2xl text-brand-ink mb-2">Payment page unavailable</h2>
          <p className="text-[15px] text-brand-slate leading-relaxed mb-6">
            We could not load this project. Go back to the dashboard and try again.
          </p>
          <Button onClick={() => navigate('/dashboard')} className="w-full">Back to dashboard</Button>
        </div>
      </div>
    );
  }

  if (showSuccess) {
    return <PaymentSuccess project={project} grandTotal={grandTotal} onDashboard={() => navigate(`/projects/${project.id}`)} />;
  }

  return (
    <div className="min-h-screen bg-brand-fog font-body">
      {isProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-brand-white p-6 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.2)] flex flex-col items-center">
            <Loader2 className="w-10 h-10 text-brand-forest animate-spin mb-4" />
            <h3 className="font-bold text-brand-ink text-lg">Opening secure checkout...</h3>
            <p className="text-[13px] text-brand-slate mt-1">Connecting to Razorpay escrow flow</p>
          </div>
        </div>
      )}

      <HeaderShell />

      <main className="max-w-[560px] mx-auto px-4 md:px-0 py-6 pb-40 md:pb-12">
        <div className="h-12 bg-brand-forest rounded-t-xl px-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2 text-white text-[12px] md:text-[13px] font-bold tracking-wide">
            <Lock size={14} /> Held securely by Razorpay
          </div>
          <span className="text-white/80 text-[11px] font-bold uppercase tracking-widest">Escrow</span>
        </div>

        <div className="bg-brand-white rounded-b-xl shadow-[0_10px_30px_-10px_rgba(0,0,0,0.1)] border border-brand-border-strong border-t-0 p-6 mb-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-14 h-14 rounded-full bg-brand-forest text-white flex items-center justify-center font-bold text-lg shrink-0 outline outline-4 outline-brand-fog">
              {freelancerName.substring(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 pt-1">
              <h3 className="font-display font-bold text-lg text-brand-ink leading-tight mb-1">{freelancerName}</h3>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-slate ml-1">Freelancer on this project</span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-mist ml-1">·</span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-slate">Paying as {clientName}</span>
                {!razorpayReady && <span className="text-[11px] font-bold uppercase tracking-wider text-brand-amber ml-2">Loading Razorpay</span>}
              </div>
              {project.freelancer?.is_verified && (
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold">VERIFIED</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 my-6 opacity-40">
            <div className="flex-1 border-t border-brand-border-strong" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-slate">FOR</span>
            <div className="flex-1 border-t border-brand-border-strong" />
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="font-display font-bold text-[16px] text-brand-ink leading-tight mb-1">{project.title}</h4>
              <p className="text-[13px] text-brand-slate leading-relaxed">
                {project.description || 'Secure escrow project on StayVise.'}
              </p>
              {project.deadline && (
                <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-brand-slate bg-brand-fog w-max px-2.5 py-1 rounded-md">
                  <ShieldCheck size={12} /> DELIVER BY {new Date(project.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}
                </div>
              )}
            </div>

            <div className="border border-brand-border rounded-xl bg-brand-white overflow-hidden mt-4 transition-all">
              <button onClick={() => setMilestonesOpen(!milestonesOpen)} className="w-full flex items-center justify-between p-3.5 bg-brand-fog/50 hover:bg-brand-fog transition-colors outline-none group text-left">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-brand-white flex items-center justify-center border border-brand-border-strong text-[11px] font-bold text-brand-slate">{project.milestones.length}</span>
                  <span className="text-[13px] font-bold text-brand-ink">Project Milestones</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] font-bold text-brand-ink group-hover:text-brand-forest transition-colors">₹{fmtINR(totalAmount)} Total</span>
                  <ChevronDown size={16} className={`text-brand-mist transition-transform ${milestonesOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {milestonesOpen && (
                <div className="px-3.5 py-3 border-t border-brand-border-strong divide-y divide-brand-border-strong">
                  {project.milestones.map((milestone) => (
                    <div key={milestone.id || milestone.sequence_number} className="flex justify-between items-center py-2.5 group cursor-default">
                      <div className="flex items-center gap-2.5">
                        <span className="text-brand-mist font-mono text-[11px] font-bold">{milestone.sequence_number}.</span>
                        <span className="text-[13px] font-medium text-brand-ink">{milestone.title}</span>
                      </div>
                      <span className="font-mono text-[13px] font-bold text-brand-slate">₹{fmtINR(milestone.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-brand-white rounded-xl shadow-card border border-brand-border-strong p-6 mb-8">
          <h4 className="text-[12px] font-bold tracking-wider text-brand-slate uppercase mb-4">Payment Summary</h4>

          <div className="space-y-3 font-body text-[14px]">
            <div className="flex justify-between items-center">
              <span className="text-brand-slate font-medium">Project amount</span>
              <span className="text-brand-ink font-mono font-bold">₹{fmtINR(totalAmount)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-brand-slate font-medium">Platform fee</span>
              <span className="text-brand-ink font-mono font-medium">₹{fmtINR(platformFee)}</span>
            </div>
            <div className="border-t border-brand-border pt-3 mt-1 flex justify-between items-end">
              <span className="text-[15px] font-bold text-brand-ink">Total to pay</span>
              <span className="text-[24px] font-mono font-bold text-brand-forest leading-none">₹{fmtINR(grandTotal)}</span>
            </div>
          </div>

          <div className="mt-6 p-4 rounded-xl relative border-l-[3px] border-l-brand-forest bg-brand-forest-light/60">
            <div className="flex gap-3">
              <ShieldCheck size={20} className="text-brand-forest shrink-0 mt-0.5" />
              <p className="text-[13px] text-brand-slate leading-relaxed font-medium">
                Your payment of <strong className="text-brand-ink font-bold">₹{fmtINR(grandTotal)}</strong> is held securely. It is released to {freelancerName} only when you approve milestones.
              </p>
            </div>
          </div>
        </div>

        <div className="sticky bottom-4 left-0 right-0 z-10 px-4 md:px-0">
          <div className="w-full max-w-[560px] mx-auto hidden md:block">
            <button onClick={handlePayment} className="w-full bg-brand-forest text-brand-white rounded-xl py-4 font-bold text-xl flex items-center justify-center gap-2 hover:bg-brand-forest-dark hover:-translate-y-0.5 transition-all shadow-[0_10px_20px_rgba(15,110,86,0.3)]">
              <Lock size={18} strokeWidth={2.5} /> Pay ₹{fmtINR(grandTotal)} securely <ArrowRight size={18} />
            </button>
          </div>
        </div>

        <div className="fixed md:hidden bottom-0 left-0 right-0 p-4 bg-brand-white border-t border-brand-border shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-10 pb-safe pb-4">
          <button onClick={handlePayment} className="w-full bg-brand-forest text-brand-white rounded-xl py-4 font-bold md:text-xl flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-[0_10px_20px_rgba(15,110,86,0.2)]">
            <Lock size={16} strokeWidth={2.5} /> Pay ₹{fmtINR(grandTotal)} <ArrowRight size={16} />
          </button>
        </div>

        <div className="pt-6 pb-2 text-center md:pb-0">
          <div className="flex justify-center flex-wrap items-center gap-6 md:gap-8 mb-6">
            <TrustMark icon={<Lock size={18} />} label="256-Bit SSL" />
            <TrustMark icon={<ShieldCheck size={18} />} label="Escrow Guard" />
            <TrustMark icon={<Play size={18} className="text-blue-500 fill-current" />} label="Razorpay" />
          </div>
          <p className="text-[12px] font-semibold text-brand-slate">Questions? Contact StayVise support from your dashboard.</p>
        </div>
      </main>
    </div>
  );
}

function PaymentSuccess({ project, grandTotal, onDashboard }: { project: Project; grandTotal: number; onDashboard: () => void }) {
  return (
    <div className="min-h-screen bg-brand-white font-body py-12 px-4 animate-in fade-in zoom-in-95 duration-500">
      <div className="max-w-[480px] mx-auto">
        <div className="flex justify-center mb-6">
          <div className="w-24 h-24 bg-brand-forest-light/40 rounded-full flex items-center justify-center">
            <Check className="w-14 h-14 text-brand-forest" strokeWidth={4} />
          </div>
        </div>

        <h2 className="font-display text-center text-3xl font-bold text-brand-ink mb-2">Payment secured!</h2>
        <p className="text-center text-brand-slate text-[15px] mb-8">₹{fmtINR(grandTotal)} is held safely until you approve the work.</p>

        <div className="bg-brand-fog p-6 rounded-2xl border border-brand-border mb-8">
          <h3 className="font-bold text-brand-ink mb-4 text-[15px]">What happens next?</h3>
          <div className="space-y-4">
            <NextStep number="1" text="Freelancer starts work according to the project scope." />
            <NextStep number="2" text="You receive updates when each milestone is submitted." />
            <NextStep number="3" text="Approve completed work to release milestone funds." />
            <NextStep number="4" text="Raise a dispute if the work does not match the scope." />
          </div>
        </div>

        <button onClick={onDashboard} className="w-full bg-brand-forest text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-brand-forest-dark transition-colors shadow-[0_4px_16px_rgba(15,110,86,0.2)]">
          Go to project dashboard <ArrowRight size={18} />
        </button>
        <p className="text-center text-[12px] text-brand-mist mt-4">Project: {project.title}</p>
      </div>
    </div>
  );
}

function NextStep({ number, text }: { number: string; text: string }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="w-6 h-6 rounded-full bg-brand-border-strong text-brand-slate font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">{number}</div>
      <p className="text-[14px] text-brand-slate font-medium">{text}</p>
    </div>
  );
}

function TrustMark({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all cursor-default">
      <span className="text-brand-slate">{icon}</span>
      <span className="text-[10px] font-bold tracking-widest uppercase text-brand-slate">{label}</span>
    </div>
  );
}

function HeaderShell() {
  return (
    <div className="h-16 flex items-center justify-center border-b border-brand-border-strong bg-brand-white">
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-brand-forest" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
          <path d="M12 15v2" strokeWidth="3" />
        </svg>
        <span className="font-display font-bold text-xl text-brand-ink tracking-tight">StayVise</span>
      </div>
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { data?: { detail?: string } } }).response?.data?.detail === 'string'
  ) {
    return (error as { response?: { data?: { detail?: string } } }).response?.data?.detail || fallback;
  }

  return fallback;
}
