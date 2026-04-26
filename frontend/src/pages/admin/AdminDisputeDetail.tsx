import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Gavel, 
  ArrowLeft, 
  Loader2, 
  AlertCircle, 
  ExternalLink, 
  ShieldCheck, 
  MessageSquare, 
  Percent,
  Calculator,
  User,
  Projector
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { toast } from 'react-hot-toast';
import { toRupees, fmtINR } from '../../lib/currency';

export default function AdminDisputeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [dispute, setDispute] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  
  // Resolution state
  const [payoutPct, setPayoutPct] = useState(50);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchDispute();
  }, [id]);

  const fetchDispute = async () => {
    setLoading(true);
    try {
      const resp = await api.get(`/admin/disputes/${id}`);
      setDispute(resp.data);
    } catch (error) {
      toast.error('Failed to load dispute');
      navigate('/admin/disputes');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!notes) {
      toast.error('Please provide resolution notes');
      return;
    }

    setResolving(true);
    try {
      await api.post(`/admin/disputes/${id}/resolve`, {
        freelancer_payout_pct: payoutPct,
        resolution_notes: notes
      });
      toast.success('Dispute resolved successfully');
      navigate('/admin/disputes');
    } catch (error) {
      toast.error('Failed to resolve dispute');
    } finally {
      setResolving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-forest" />
      </div>
    );
  }

  const amount = dispute.project?.total_amount || 0;
  const amountRupees = toRupees(amount);
  const freelancerGet = (amountRupees * payoutPct) / 100;
  const clientRefund = amountRupees - freelancerGet;
  
  const freelancer = dispute.project?.freelancer;
  const client = dispute.project?.client;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex items-center justify-between">
        <button 
          onClick={() => navigate('/admin/disputes')}
          className="flex items-center gap-2 text-brand-slate hover:text-brand-ink font-bold text-sm"
        >
          <ArrowLeft size={16} /> Back to Queue
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Triage Section */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Detailed Study Panel */}
          <div className="bg-white rounded-[2rem] border border-brand-border-strong p-8 shadow-sm">
             <h2 className="font-display font-bold text-xl text-brand-ink mb-6 flex items-center gap-3">
                <User size={20} className="text-brand-forest"/> Participant Detailed Study
             </h2>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Freelancer Study */}
                <div className="space-y-6">
                   <div className="flex items-center gap-3 p-4 bg-brand-forest/5 rounded-2xl border border-brand-forest/10">
                      <div className="w-12 h-12 bg-brand-forest rounded-full flex items-center justify-center font-bold text-white text-lg">
                         {freelancer?.full_name?.substring(0, 1).toUpperCase() || 'F'}
                      </div>
                      <div>
                         <p className="text-[10px] font-bold text-brand-forest uppercase tracking-widest leading-none mb-1">Freelancer</p>
                         <h3 className="font-bold text-brand-ink">{freelancer?.full_name || 'Anonymous Freelancer'}</h3>
                      </div>
                   </div>
                   
                   <div className="space-y-4 px-2">
                      <div className="flex justify-between items-center text-sm">
                         <span className="text-brand-mist font-medium">Phone</span>
                         <span className="font-bold text-brand-ink font-mono">{freelancer?.phone_number || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                         <span className="text-brand-mist font-medium">Email</span>
                         <span className="font-bold text-brand-ink">{freelancer?.email || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                         <span className="text-brand-mist font-medium">Trust Score</span>
                         <span className="flex items-center gap-2 font-bold text-brand-forest">
                            <ShieldCheck size={14}/> {Math.round(freelancer?.trust_score?.score || 0)}
                         </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                         <span className="text-brand-mist font-medium">Total Volume</span>
                         <span className="font-bold text-brand-ink">{freelancer?.trust_score?.completed_projects || 0} Projects</span>
                      </div>
                   </div>
                </div>

                {/* Client Study */}
                <div className="space-y-6">
                   <div className="flex items-center gap-3 p-4 bg-brand-amber/5 rounded-2xl border border-brand-amber/10">
                      <div className="w-12 h-12 bg-brand-amber rounded-full flex items-center justify-center font-bold text-white text-lg">
                         {client?.full_name?.substring(0, 1).toUpperCase() || 'C'}
                      </div>
                      <div>
                         <p className="text-[10px] font-bold text-brand-amber uppercase tracking-widest leading-none mb-1">Client (Requester)</p>
                         <h3 className="font-bold text-brand-ink">{client?.full_name || 'Anonymous Client'}</h3>
                      </div>
                   </div>
                   
                   <div className="space-y-4 px-2">
                      <div className="flex justify-between items-center text-sm">
                         <span className="text-brand-mist font-medium">Phone</span>
                         <span className="font-bold text-brand-ink font-mono">{client?.phone_number || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                         <span className="text-brand-mist font-medium">Email</span>
                         <span className="font-bold text-brand-ink">{client?.email || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                         <span className="text-brand-mist font-medium">Trust Score</span>
                         <span className="flex items-center gap-2 font-bold text-brand-amber">
                            <ShieldCheck size={14}/> {Math.round(client?.trust_score?.score || 0)}
                         </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                         <span className="text-brand-mist font-medium">Account Status</span>
                         <span className="font-bold text-brand-ink">{client?.is_active ? 'Active' : 'Suspended'} Participant</span>
                      </div>
                   </div>
                </div>
             </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-brand-border-strong p-8 shadow-sm">
            <div className="flex items-start justify-between mb-8">
              <div>
                <h1 className="text-2xl font-display font-bold text-brand-ink flex items-center gap-3">
                  <Gavel className="text-brand-forest" /> 
                  Resolve Dispute #{id?.slice(0, 8)}
                </h1>
                <p className="text-brand-slate font-medium text-sm mt-1">
                  Technical investigation into milestone fulfillment.
                </p>
              </div>
              <span className="px-4 py-1.5 bg-brand-amber/10 text-brand-amber rounded-full text-[10px] font-bold uppercase tracking-widest border border-brand-amber/20">
                {dispute.status}
              </span>
            </div>

            <div className="space-y-6">
              <div className="p-6 bg-brand-fog rounded-2xl border border-brand-border-strong">
                <h3 className="font-bold text-brand-ink text-sm mb-2 flex items-center gap-2">
                  <AlertCircle size={16} className="text-brand-amber" /> 
                  Allegation Summary
                </h3>
                <p className="text-brand-slate text-sm leading-relaxed italic">
                  "{dispute.reason}"
                </p>
              </div>

              <div>
                <h3 className="font-bold text-brand-ink text-sm mb-4">Evidence & Log Files</h3>
                {dispute.evidence_urls && dispute.evidence_urls.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4">
                    {dispute.evidence_urls.map((url: string, idx: number) => (
                      <a 
                        key={idx} 
                        href={url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-4 bg-white border border-brand-border-strong rounded-xl hover:bg-brand-fog transition-all group"
                      >
                        <span className="text-xs font-bold text-brand-ink truncate pr-4 flex items-center gap-2">
                           <MessageSquare size={14} className="text-brand-mist"/> Artifact_{idx+1}.dat
                        </span>
                        <ExternalLink size={14} className="text-brand-mist group-hover:text-brand-forest" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-brand-mist font-medium italic">No evidence artifacts provided for analysis.</p>
                )}
              </div>

              <div className="pt-6 border-t border-brand-border">
                <h3 className="font-bold text-brand-ink text-sm mb-4">Final Resolution Notes</h3>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full h-40 bg-brand-fog border border-brand-border-strong rounded-2xl p-6 text-sm outline-none focus:ring-2 focus:ring-brand-forest/20 text-brand-ink font-medium"
                  placeholder="Draft your final ruling based on the provided logs and profiles..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Financial Resolution Console */}
        <div className="space-y-6">
          <div className="bg-brand-ink text-white rounded-[2rem] p-8 shadow-xl">
            <h3 className="font-display font-bold text-xl mb-8 flex items-center gap-2">
              <Calculator className="text-brand-forest" /> 
              Resolution Terminal
            </h3>
            
            <div className="space-y-8">
              <div>
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-brand-mist mb-4">
                  <span>Release Split</span>
                  <span className="text-white">{payoutPct}% to Freelancer</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  step="1"
                  value={payoutPct}
                  onChange={(e) => setPayoutPct(parseInt(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-forest"
                />
              </div>

              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-4">
                <div className="flex justify-between items-center text-sm">
                   <span className="text-brand-mist font-medium">Contested Amount</span>
                   <span className="font-bold">₹{amountRupees.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                   <span className="text-brand-forest font-bold">Freelancer Payout</span>
                   <span className="font-bold text-brand-forest">₹{freelancerGet.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                   <span className="text-brand-amber font-bold">Client Refund</span>
                   <span className="font-bold text-brand-amber">₹{clientRefund.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <Button 
                onClick={handleResolve} 
                disabled={resolving || dispute.status === 'resolved'}
                className="w-full bg-brand-forest hover:bg-brand-forest/90 text-white py-6 rounded-xl font-bold shadow-lg shadow-brand-forest/20"
              >
                {resolving ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} className="mr-2" />}
                Close Case Permanently
              </Button>
              
              <p className="text-[10px] text-brand-mist text-center leading-relaxed font-medium">
                EXECUTING RESOLUTION WILL TRIGGER ATOMIC FUND REVERSAL/RELEASE. 
                THIS ACTION IS LOGGED AS PERMANENT IN THE LEDGER.
              </p>
            </div>
          </div>

          <div className="bg-white border border-brand-border-strong rounded-[2rem] p-8 shadow-sm space-y-4">
            <h3 className="font-bold text-brand-ink text-sm">Disputed Engine Context</h3>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-fog rounded-lg text-brand-mist"><Projector size={16} /></div>
              <div className="text-xs font-bold text-brand-ink truncate">{dispute.project?.title}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-fog rounded-lg text-brand-mist"><MessageSquare size={16} /></div>
              <div className="text-xs font-bold text-brand-ink">Project ID: #{dispute.project?.id.slice(0, 8)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
