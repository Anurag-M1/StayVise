import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProject } from '../lib/queries';
import { useAuthStore } from '../stores/auth';
import { api } from '../lib/api';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { TrustScoreBadge } from '../components/ui/TrustScoreBadge';
import SEO from '../components/SEO';
import { Button } from '../components/ui/Button';
import { exportLedgerPdf } from '../lib/pdf';
import { fmtINR } from '../lib/currency';
import { 
  ArrowLeft, MoreHorizontal, Check, Clock, AlertCircle, ShieldCheck, 
  ChevronDown, ArrowUpRight, FileText, ChevronRight, Plus, 
  Download, MessageSquare, ShieldAlert, Search, LogOut
} from 'lucide-react';
import type { Project, Milestone } from '../lib/types';
import confetti from 'canvas-confetti';

export default function ProjectDetail() {
  const { id } = useParams<{id: string}>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  // UI States
  const [menuOpen, setMenuOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [submitMilestoneId, setSubmitMilestoneId] = useState<string | null>(null);
  const [approveMilestoneId, setApproveMilestoneId] = useState<string | null>(null);
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeMilestoneId, setDisputeMilestoneId] = useState<string | null>(null);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  
  const [disputeDetails, setDisputeDetails] = useState('');
  const [disputeEvidence, setDisputeEvidence] = useState('');
  const [submitNote, setSubmitNote] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  
  // Marketplace States
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [bidAmount, setBidAmount] = useState<number | ''>('');
  const [coverLetter, setCoverLetter] = useState('');
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);

  // 30s Polling as requested (queries.ts has 10s default, so we pass override if needed or just use current)
  const { data: project, isLoading } = useProject(id as string);

  // Success Celebration
  const fireConfetti = () => {
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#0F6E56', '#BA7517', '#E1F5EE'] // Forest + Gold + Light
    });
  };

  if (isLoading || !project) {
    return (
    <div className="bg-brand-fog min-h-screen p-4 md:p-8 animate-in fade-in duration-500">
      <SEO 
        title={project?.title || 'Loading Project'}
        description={`Manage project "${project?.title || '...'}" on StayVise. Track milestones, release payments, and communicate securely via escrow.`}
      />
      <div className="max-w-[1100px] mx-auto space-y-8">
           <div className="h-8 bg-brand-border-strong w-48 rounded mb-6" />
           <div className="bg-brand-white rounded-2xl h-24 border border-brand-border-strong" />
           <div className="bg-brand-white rounded-2xl h-96 border border-brand-border-strong" />
        </div>
      </div>
    );
  }

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://stayvise.com/"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Dashboard",
        "item": "https://stayvise.com/dashboard"
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": project.title,
        "item": `https://stayvise.com/projects/${project.id}`
      }
    ]
  };

  const isClient = user?.id === project.client_id;
  const isFreelancer = user?.id === project.freelancer_id;
  const counterparty = isFreelancer ? project.client : project.freelancer;
  const counterpartyName = counterparty?.full_name || 'Counterparty';

  const totalVal = project.total_amount || 0;
  const releasedVal = project.milestones?.filter(m => m.status === 'released' || m.status === 'approved')
                        .reduce((acc, m) => acc + m.amount, 0) || 0;
  const progressPercent = totalVal > 0 ? (releasedVal / totalVal) * 100 : 0;
  const updatedJustNow = isRecentlyUpdated(project.updated_at);
  const ledgerEntries = buildLedgerEntries(project);

  // Handlers
  const handleMilestoneAction = async (mid: string, action: 'submit' | 'approve' | 'raise-dispute', payload = {}) => {
    try {
      if (action === 'raise-dispute') {
        const disputePayload = payload as { reason?: string; details?: string; evidence_urls?: string[] };
        const reason = [disputePayload.reason, disputePayload.details].filter(Boolean).join(': ');
        await api.post(`/projects/${project.id}/dispute`, {
          milestone_id: mid,
          reason,
          evidence_urls: disputePayload.evidence_urls || [],
        });
      } else {
        await api.post(`/projects/${project.id}/milestones/${mid}/${action}`, payload);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project', project.id] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['stats'] }),
        queryClient.invalidateQueries({ queryKey: ['payment-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['payment-history'] }),
      ]);
      
      if (action === 'approve') fireConfetti();
      toast.success(
        action === 'approve'
          ? 'Milestone approved successfully.'
          : action === 'raise-dispute'
            ? 'Dispute submitted successfully.'
            : 'Action completed.'
      );
      
      // Close modals
      setSubmitMilestoneId(null);
      setApproveMilestoneId(null);
      setDisputeModalOpen(false);
      setSubmitNote('');
      setDisputeReason('');
      setDisputeDetails('');
      setDisputeEvidence('');
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Action failed. Please try again."));
    }
  };

  const handleApply = async () => {
    if (!bidAmount || !coverLetter) return;
    setIsSubmittingProposal(true);
    try {
      await api.post(`/projects/${project.id}/apply`, {
        amount: bidAmount,
        cover_letter: coverLetter
      });
      toast.success("Proposal submitted successfully!");
      setShowApplyForm(false);
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Application failed."));
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  const handleAcceptProposal = async (proposalId: string) => {
    try {
      await api.post(`/projects/proposals/${proposalId}/accept`);
      toast.success("Freelancer hired! Project moved to Awaiting Payment.");
      fireConfetti();
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to hire freelancer."));
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto py-6 md:py-8 space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-32">
      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(breadcrumbSchema)}
      </script>
      
      {/* 1. PAGE HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
           <button onClick={() => navigate('/dashboard')} className="w-10 h-10 bg-brand-white border border-brand-border-strong rounded-full flex items-center justify-center hover:bg-brand-fog transition-colors group">
              <ArrowLeft size={18} className="text-brand-slate group-hover:text-brand-ink"/>
           </button>
           <div>
              <div className="flex items-center gap-3">
                 <h1 className="font-display text-[22px] font-bold text-brand-ink">{project.title}</h1>
                 <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border ${
                    project.status === 'in_progress' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                    project.status === 'open' ? 'bg-brand-forest-light text-brand-forest border-brand-forest/20' :
                    project.status === 'completed' ? 'bg-brand-forest-light text-brand-forest border-brand-forest/20' :
                    project.status === 'disputed' ? 'bg-brand-danger/10 text-brand-danger border-brand-danger/20' :
                    'bg-brand-fog text-brand-slate border-brand-border'
                 }`}>
                   {project.status.replace('_', ' ')}
                 </span>
              </div>
              {updatedJustNow && <p className="text-[10px] font-bold text-brand-forest uppercase tracking-widest mt-1 animate-pulse">Updated just now</p>}
           </div>
        </div>

        <div className="relative">
          <button onClick={() => setMenuOpen(!menuOpen)} className="w-10 h-10 border border-brand-border-strong rounded-full flex items-center justify-center hover:bg-brand-fog transition-colors text-brand-slate">
             <MoreHorizontal size={20} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-12 w-56 bg-brand-white border border-brand-border-strong shadow-xl rounded-xl py-2 z-20 animate-in zoom-in-95">
               <ActionMenuItem
                 icon={<ArrowUpRight size={16}/>}
                 label="Copy project link"
                 onClick={() => {
                   navigator.clipboard.writeText(`${window.location.origin}/projects/${project.id}`);
                   toast.success('Project link copied to clipboard');
                   setMenuOpen(false);
                 }}
               />
               <ActionMenuItem
                 icon={<Download size={16}/>}
                 label="Download invoice PDF"
                 onClick={() => {
                   exportLedgerPdf(toPdfRows(project, ledgerEntries), `${project.title} statement`);
                   setMenuOpen(false);
                 }}
               />
               {(project.status === 'in_progress' || project.status === 'awaiting_payment') && (
                 <ActionMenuItem
                   icon={<ShieldAlert size={16}/>}
                   label="Report an issue"
                   color="text-brand-danger"
                   onClick={() => {
                     const nextMilestone = project.milestones.find(m => m.status === 'submitted' || m.status === 'pending');
                     if (nextMilestone?.id) {
                        setDisputeMilestoneId(nextMilestone.id);
                        setDisputeModalOpen(true);
                     } else {
                        toast.error('No active milestone to dispute. Use "Leave Project" for general exit.');
                     }
                     setMenuOpen(false);
                   }}
                 />
               )}
               <div className="h-px bg-brand-border-strong my-1 mx-2" />
               <ActionMenuItem
                 icon={<LogOut size={16}/>}
                 label="Leave Project"
                 color="text-brand-danger"
                 onClick={() => {
                   setLeaveModalOpen(true);
                   setMenuOpen(false);
                 }}
               />
            </div>
          )}
        </div>
      </div>

      {/* 2. TOP SUMMARY BAR */}
      <div className="bg-brand-white rounded-2xl shadow-card border border-brand-border-strong grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-brand-border-strong overflow-hidden">
         <div className="p-6">
            <p className="text-[11px] font-bold text-brand-mist uppercase tracking-widest mb-1">Total project value</p>
            <p className="font-mono text-2xl font-bold text-brand-forest leading-none">₹{fmtINR(totalVal)}</p>
         </div>
         <div className="p-6">
            <p className="text-[11px] font-bold text-brand-mist uppercase tracking-widest mb-2">
               <span className="font-mono text-brand-ink text-sm">₹{fmtINR(releasedVal)}</span> released
            </p>
            <div className="w-full h-2 bg-brand-fog rounded-full overflow-hidden">
               <div className="h-full bg-brand-forest transition-all duration-1000" style={{width: `${progressPercent}%`}} />
            </div>
         </div>
         <div className="p-6 flex items-center justify-between">
            <div>
               <p className="text-[11px] font-bold text-brand-mist uppercase tracking-widest mb-1">Working with</p>
               <p className="font-bold text-brand-ink text-[15px]">{counterpartyName}</p>
               <p className="text-[12px] text-brand-mist mt-1">
                 {counterparty?.is_verified ? 'Verified on StayVise' : `${counterparty?.role || 'Member'} account`}
               </p>
            </div>
            {counterparty?.is_verified && (
              <span className="px-3 py-1 rounded-full bg-brand-forest-light text-brand-forest text-[11px] font-bold uppercase tracking-wider">
                Verified
              </span>
            )}
         </div>
      </div>

      {/* 3. STATUS BANNERS */}
      <StatusBanner project={project} counterpartyName={counterpartyName} isClient={isClient} isFreelancer={isFreelancer} />

       {/* 4.5 MARKETPLACE VIEW (IF OPEN) */}
       {project.status === 'open' && (
         <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-6">
               <div className="bg-brand-white rounded-3xl border border-brand-border-strong p-8">
                  <h2 className="font-display font-bold text-2xl text-brand-ink mb-4">Project Scope</h2>
                  <p className="text-brand-slate text-[16px] leading-relaxed mb-8">{project.description}</p>
                  
                  <h3 className="font-bold text-brand-ink mb-4">Milestone Breakdown</h3>
                  <div className="space-y-4">
                     {project.milestones.map((m, i) => (
                        <div key={i} className="flex justify-between items-center p-4 bg-brand-fog rounded-xl border border-brand-border">
                           <span className="font-bold text-brand-ink">{m.title}</span>
                           <span className="font-mono font-bold text-brand-forest">₹{fmtINR(m.amount)}</span>
                        </div>
                     ))}
                  </div>
               </div>

               {isClient && (
                  <div className="bg-brand-white rounded-3xl border border-brand-border-strong p-8">
                     <h2 className="font-display font-bold text-2xl text-brand-ink mb-6">Applicants ({project.proposals?.length || 0})</h2>
                     <div className="space-y-4">
                        {project.proposals?.length ? project.proposals.map(proposal => (
                           <div key={proposal.id} className="p-6 rounded-2xl border border-brand-border-strong hover:shadow-md transition-all group">
                              <div className="flex justify-between items-start mb-4">
                                 <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-brand-fog flex items-center justify-center font-bold text-brand-mist">
                                       {proposal.freelancer?.full_name.substring(0,2).toUpperCase()}
                                    </div>
                                    <div>
                                       <div className="font-bold text-brand-ink hover:text-brand-forest cursor-pointer" onClick={() => navigate(`/p/${proposal.freelancer?.id}`)}>
                                          {proposal.freelancer?.full_name}
                                       </div>
                                       <div className="text-[11px] font-bold text-brand-mist uppercase tracking-widest">Verified Freelancer</div>
                                    </div>
                                 </div>
                                 <div className="text-right">
                                    <div className="font-mono font-bold text-brand-ink text-lg">₹{fmtINR(proposal.amount)}</div>
                                    <div className="text-[10px] font-bold text-brand-mist uppercase tracking-widest mt-1">Bid Amount</div>
                                 </div>
                              </div>
                              <p className="text-[14px] text-brand-slate mb-6 line-clamp-3 italic leading-relaxed">"{proposal.cover_letter}"</p>
                              <div className="flex gap-3">
                                 <Button size="sm" className="grow md:grow-0 px-8" onClick={() => handleAcceptProposal(proposal.id)}>Hire & Start Escrow</Button>
                                 <Button variant="ghost" size="sm" onClick={() => navigate(`/p/${proposal.freelancer?.id}`)}>View Profile</Button>
                              </div>
                           </div>
                        )) : (
                           <div className="py-12 text-center text-brand-mist font-medium">
                              Waiting for applications... No one has applied yet.
                           </div>
                        )}
                     </div>
                  </div>
               )}
            </div>

            <div className="lg:col-span-4 space-y-6">
               <div className="bg-brand-ink text-white rounded-3xl p-8 shadow-card flex flex-col justify-between min-h-[300px]">
                  <div>
                    <h3 className="font-display font-bold text-xl mb-2">Escrow Protected Gig</h3>
                    <p className="text-white/60 text-[14px] leading-relaxed mb-6">This client has committed ₹{fmtINR(totalVal)} to StayVise. You will be paid milestone-by-milestone upon delivery.</p>
                  </div>
                  
                  {!isClient && !isFreelancer && (
                    <>
                      {showApplyForm ? (
                        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
                           <div className="bg-white/10 p-4 rounded-xl space-y-4">
                              <div>
                                 <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1 block">Your Bid (INR)</label>
                                 <input 
                                   type="number" 
                                   value={bidAmount}
                                   onChange={e => setBidAmount(Number(e.target.value))}
                                   className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white font-mono outline-none focus:border-brand-forest"
                                 />
                              </div>
                              <div>
                                 <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1 block">Quick Note</label>
                                 <textarea 
                                   value={coverLetter}
                                   onChange={e => setCoverLetter(e.target.value)}
                                   rows={3}
                                   placeholder="Why are you a fit?"
                                   className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-brand-forest"
                                 />
                              </div>
                           </div>
                           <Button onClick={handleApply} className="w-full shadow-xl" isLoading={isSubmittingProposal}>Submit Application</Button>
                           <Button variant="ghost" className="w-full text-white/50 hover:text-white" onClick={() => setShowApplyForm(false)}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                           <Button onClick={() => setShowApplyForm(true)} className="w-full shadow-xl h-14 text-[16px]">Apply for this Gig</Button>
                           <p className="text-[11px] text-center text-white/40 font-medium">No fee to apply · StayVise takes 2% on payout</p>
                        </div>
                      )}
                    </>
                  )}
                  
                  {isFreelancer && (
                    <div className="p-4 bg-brand-forest/20 rounded-xl border border-brand-forest/40 flex items-center gap-3">
                       <Check className="text-brand-forest shrink-0" />
                       <span className="text-sm font-bold text-white">You have applied to this gig</span>
                    </div>
                  )}
               </div>
            </div>
         </div>
       )}

       {/* 4. MILESTONE TIMELINE (FOR ACTIVE PROJECTS) */}
       {project.status !== 'open' && (
         <div className="bg-brand-white rounded-3xl shadow-card border border-brand-border-strong p-6 md:p-10">
            <h2 className="font-display font-bold text-xl text-brand-ink mb-10">Milestone Pipeline</h2>
            
            <div className="relative pl-8 space-y-16">
               {/* Left spine */}
               <div className="absolute left-[15px] top-6 bottom-4 w-[2px] bg-brand-fog rounded-full" />
               
               {project.milestones.map((m, idx) => {
                  const isNext = project.milestones.findIndex(x => x.status === 'pending') === idx && project.status === 'in_progress';
                  return (
                     <MilestoneNode 
                        key={m.id || idx} 
                        milestone={m} 
                        isNext={isNext} 
                        isFreelancer={isFreelancer} 
                        setSubmitId={setSubmitMilestoneId}
                        setApproveId={setApproveMilestoneId}
                        setDispute={() => { setDisputeMilestoneId(m.id!); setDisputeModalOpen(true); }}
                     />
                  );
               })}
            </div>
         </div>
       )}

      {/* 5. TRANSACTION HISTORY */}
      <div className="border border-brand-border-strong rounded-2xl bg-brand-white overflow-hidden shadow-sm">
         <button onClick={() => setTxOpen(!txOpen)} className="w-full flex items-center justify-between p-6 bg-brand-white group transition-colors hover:bg-brand-fog/50">
            <div className="flex items-center gap-4">
               <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${txOpen ? 'bg-brand-forest text-white' : 'bg-brand-fog text-brand-slate'}`}>
                  <FileText size={20} />
               </div>
               <span className="font-display font-bold text-lg text-brand-ink">Transaction Ledger</span>
            </div>
            <ChevronDown className={`text-brand-mist transition-transform duration-300 ${txOpen ? 'rotate-180' : ''}`} />
         </button>
         {txOpen && (
            <div className="p-6 pt-0 border-t border-brand-border-strong bg-brand-fog/20 overflow-x-auto animate-in slide-in-from-top-2">
               <table className="w-full text-left min-w-[700px] mt-6">
                 <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-widest text-brand-mist border-b border-brand-border-strong">
                      <th className="pb-3">Date</th>
                      <th className="pb-3">Type</th>
                      <th className="pb-3">Amount</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3">Reference</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-brand-border text-[13px] font-medium text-brand-ink font-mono">
                   {ledgerEntries.map((entry) => (
                     <tr key={entry.id} className="hover:bg-brand-white transition-colors">
                        <td className="py-4 text-brand-mist">{formatShortDate(entry.date)}</td>
                        <td className="py-4">{entry.type}</td>
                        <td className={`py-4 font-bold ${entry.status === 'success' ? 'text-brand-forest' : 'text-brand-ink'}`}>₹{fmtINR(entry.amount)}</td>
                        <td className="py-4">
                          <span className={`${entry.status === 'success' ? 'text-brand-forest' : 'text-brand-mist'} flex items-center gap-1`}>
                            {entry.status === 'success' ? '✓ Success' : '• Pending'}
                          </span>
                        </td>
                        <td className="py-4 text-brand-mist">{entry.reference}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
               <div className="mt-6 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-brand-forest hover:bg-brand-forest/5 font-bold"
                    onClick={() => exportLedgerPdf(toPdfRows(project, ledgerEntries), `${project.title} statement`)}
                  >
                     <Download size={14} className="mr-2"/> Download Statement PDF
                  </Button>
               </div>
            </div>
         )}
      </div>

      {/* MODALS */}
      <SubmitModal id={submitMilestoneId} note={submitNote} setNote={setSubmitNote} onClose={() => setSubmitMilestoneId(null)} onConfirm={(payload) => handleMilestoneAction(submitMilestoneId!, 'submit', payload)} />
      <ApproveModal id={approveMilestoneId} counterparty={counterpartyName} onClose={() => setApproveMilestoneId(null)} onConfirm={() => handleMilestoneAction(approveMilestoneId!, 'approve')} />
      <DisputeModal
        open={disputeModalOpen}
        reason={disputeReason}
        setReason={setDisputeReason}
        details={disputeDetails}
        setDetails={setDisputeDetails}
        evidence={disputeEvidence}
        setEvidence={setDisputeEvidence}
        onClose={() => setDisputeModalOpen(false)}
        onConfirm={() => handleMilestoneAction(disputeMilestoneId!, 'raise-dispute', {
          reason: disputeReason,
          details: disputeDetails,
          evidence_urls: disputeEvidence.split('\n').map((item) => item.trim()).filter(Boolean),
        })}
      />

      <LeaveConfirmModal
        open={leaveModalOpen}
        onClose={() => setLeaveModalOpen(false)}
        status={project.status}
        onConfirm={async () => {
          try {
             await api.post(`/projects/${project.id}/leave`);
             toast.success(project.status === 'in_progress' ? 'Project moved to dispute' : 'Project cancelled');
             queryClient.invalidateQueries({ queryKey: ['project', project.id] });
             setLeaveModalOpen(false);
             if (project.status !== 'in_progress') navigate('/dashboard');
          } catch (error) {
             toast.error('Failed to leave project');
          }
        }}
      />

    </div>
  );
}

// ── Sub-Components ──────────────────────────────────────────────────────────

function ActionMenuItem({ icon, label, color = "text-brand-ink", onClick }: { icon: React.ReactNode, label: string, color?: string, onClick?: (e: React.MouseEvent) => void }) {
  return (
    <button 
      onClick={(e) => {
        if (onClick) onClick(e);
      }} 
      className={`w-full text-left px-5 py-3 text-[13px] font-bold ${color} hover:bg-brand-fog transition-colors flex items-center gap-3`}
    >
       {icon} {label}
    </button>
  );
}

function StatusBanner({ project, counterpartyName, isClient, isFreelancer }: { project: Project, counterpartyName: string, isClient: boolean, isFreelancer: boolean }) {
  const navigate = useNavigate();
  
  if (project.status === 'open') {
    return (
       <div className="bg-brand-forest-light border-2 border-brand-forest/20 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-5">
             <div className="w-10 h-10 rounded-full bg-brand-white border border-brand-forest/20 flex items-center justify-center text-brand-forest shadow-sm"><Search size={20} /></div>
             <div>
                <h3 className="font-bold text-[17px] text-brand-ink">Project is published on Marketplace</h3>
                <p className="text-[13px] text-brand-slate font-medium">Verified freelancers can discover and apply. Funds will be requested once you hire someone.</p>
             </div>
          </div>
          <span className="text-[12px] font-bold text-brand-forest bg-white px-4 py-2 rounded-xl border border-brand-forest/20 flex items-center gap-2">
            <Check size={14}/> Discovery Active
          </span>
       </div>
    );
  }

  if (project.status === 'awaiting_payment') {
    return (
       <div className="bg-brand-amber/10 border-2 border-brand-amber/30 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl shadow-brand-amber/5">
          <div className="flex items-center gap-5">
             <div className="relative">
                <div className="absolute inset-0 bg-brand-amber rounded-full animate-ping opacity-40 shadow-[0_0_20px_rgba(245,158,11,0.5)]" />
                <div className="w-4 h-4 bg-brand-amber rounded-full relative z-10 border-2 border-white" />
             </div>
             <div>
                <h3 className="font-bold text-[17px] text-brand-ink">
                  {isClient 
                    ? `Waiting for you to pay ₹${fmtINR(project.total_amount + (project.platform_fee_amount || 0))}`
                    : `Waiting for ${project.client?.full_name?.split(' ')[0] || 'client'} to pay ₹${fmtINR(project.total_amount + (project.platform_fee_amount || 0))}`
                  }
                </h3>
                <p className="text-[13px] text-brand-slate font-medium">Secure payment link has been prepared and shared.</p>
             </div>
          </div>
          {isClient ? (
            <Button 
               onClick={() => navigate(`/pay/${project.id}`)}
               className="bg-brand-amber text-white border-0 shadow-lg hover:brightness-110 transition-all font-bold px-8"
            >
               Pay & Fund Escrow Now
            </Button>
          ) : (
            <span className="text-[12px] font-bold text-brand-amber bg-white px-4 py-2 rounded-xl border border-brand-amber/20">Awaiting funding...</span>
          )}
       </div>
    );
  }
  
  if (project.status === 'in_progress') {
     return (
        <div className="bg-blue-50 border-2 border-blue-100 rounded-2xl p-6 flex items-center gap-5">
           <ShieldCheck className="text-blue-600 w-7 h-7" />
           <div>
              <h3 className="font-bold text-[17px] text-brand-ink">Project is active · Security vault enabled</h3>
              <p className="text-[13px] font-medium text-blue-800 opacity-70">Funds are strictly held in escrow until milestones are approved by you.</p>
           </div>
        </div>
     );
  }

  if (project.status === 'disputed') {
     return (
        <div className="bg-brand-danger/10 border-2 border-brand-danger/20 rounded-2xl p-6 flex items-center justify-between gap-6">
           <div className="flex items-center gap-5">
              <AlertCircle className="text-brand-danger w-7 h-7" />
              <div>
                 <h3 className="font-bold text-[17px] text-brand-danger">Dispute open</h3>
                 <p className="text-[13px] font-medium text-brand-danger/70">Our arbitration team is reviewing the latest milestone activity and evidence.</p>
              </div>
           </div>
           <button className="text-[12px] font-bold text-brand-danger hover:underline uppercase tracking-widest">View Details &rarr;</button>
        </div>
     );
  }

  if (project.status === 'completed') {
    return (
       <div className="bg-brand-forest-light border-2 border-brand-forest/20 rounded-2xl p-6 flex items-center justify-between gap-6">
          <div className="flex items-center gap-5">
             <div className="w-10 h-10 rounded-full bg-brand-forest flex items-center justify-center text-white"><Check size={24} /></div>
             <div>
                <h3 className="font-bold text-[17px] text-brand-forest">Project completed ✓ · All funds released</h3>
                <p className="text-[13px] font-medium text-brand-forest opacity-70">Last updated {formatShortDate(project.updated_at)}. Review and rating can be shared anytime.</p>
              </div>
          </div>
          <Button className="bg-brand-forest text-white border-0 shadow-lg">Leave a Review</Button>
       </div>
    );
  }
  return null;
}

function MilestoneNode({
  milestone: m,
  isNext,
  isFreelancer,
  setSubmitId,
  setApproveId,
  setDispute,
}: {
  milestone: Milestone;
  isNext: boolean;
  isFreelancer: boolean;
  setSubmitId: (id: string) => void;
  setApproveId: (id: string) => void;
  setDispute: () => void;
}) {
  const isApproved = m.status === 'released' || m.status === 'approved';
  const isSubmitted = m.status === 'submitted';
  const isPending = m.status === 'pending';

  return (
    <div className="relative z-10">
       {/* Circle Indicator */}
       <div className="absolute -left-[45px] top-1 flex flex-col items-center">
          {isApproved && <div className="w-[32px] h-[32px] rounded-full bg-brand-forest border-4 border-white flex items-center justify-center shadow-lg"><Check size={14} className="text-white" strokeWidth={4}/></div>}
          {isSubmitted && <div className="w-[32px] h-[32px] rounded-full bg-purple-600 border-4 border-white flex items-center justify-center shadow-lg animate-pulse" />}
          {isNext && <div className="w-[32px] h-[32px] rounded-full bg-blue-600 border-4 border-white flex items-center justify-center shadow-lg" />}
          {isPending && !isNext && <div className="w-[32px] h-[32px] rounded-full bg-brand-fog border-4 border-white flex items-center justify-center shadow-sm"><div className="w-2 h-2 rounded-full bg-brand-mist" /></div>}
       </div>

       {/* Item Content */}
       <div className={`max-w-2xl transition-all duration-300 ${isPending && !isNext ? 'opacity-40 grayscale-[0.5]' : 'opacity-100'}`}>
          <div className="flex items-start justify-between gap-4 mb-2">
             <div>
                <h4 className={`text-[17px] font-bold ${isApproved ? 'text-brand-forest' : isSubmitted ? 'text-purple-900' : 'text-brand-ink'}`}>{m.title}</h4>
                {isApproved && <p className="text-[12px] font-bold text-brand-forest uppercase tracking-widest mt-1">Released to account</p>}
                {isSubmitted && <p className="text-[12px] font-bold text-purple-600 uppercase tracking-widest mt-1">Submitted for approval</p>}
                {isNext && <p className="text-[12px] font-bold text-blue-600 uppercase tracking-widest mt-1">In Progress · Active</p>}
             </div>
             <span className={`font-mono text-[20px] font-bold ${isApproved ? 'text-brand-forest' : isSubmitted ? 'text-purple-600' : isNext ? 'text-brand-ink' : 'text-brand-mist'}`}>₹{fmtINR(m.amount)}</span>
          </div>

          <p className="text-[14px] font-medium text-brand-slate leading-relaxed">{m.description}</p>

          {/* Action Blocks */}
          {isNext && isFreelancer && (
             <Button size="sm" className="mt-6 h-10 px-8" onClick={() => m.id && setSubmitId(m.id)}>Submit Milestone</Button>
          )}

          {isSubmitted && (
             <div className="mt-8 space-y-4">
                <div className="p-4 bg-brand-fog rounded-2xl border border-brand-border italic text-[14px] text-brand-slate">
                   <span className="not-italic font-bold block text-[11px] uppercase tracking-widest text-brand-mist mb-2">Freelancer note</span>
                   "Deliverables sent for review. Approve once the scope is complete."
                </div>
                {!isFreelancer && (
                   <div className="bg-brand-amber/10 border-l-4 border-brand-amber rounded-xl rounded-l-none p-5 space-y-4 shadow-sm border border-brand-amber/10">
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-2 text-brand-amber font-bold text-[13px]">
                           <Clock size={16}/> Auto-releases in 3 days
                         </div>
                         <div className="w-1/2 h-1.5 bg-white rounded-full overflow-hidden border border-brand-amber/20">
                            <div className="h-full bg-brand-amber w-1/3" />
                         </div>
                      </div>
                      <div className="flex gap-4">
                         <Button onClick={() => m.id && setApproveId(m.id)} className="flex-1 bg-brand-forest text-white border-0 shadow-lg">Approve & Release Funds</Button>
                         <Button variant="ghost" className="text-brand-danger hover:bg-brand-danger/5" onClick={setDispute}>Raise Dispute</Button>
                      </div>
                   </div>
                )}
             </div>
          )}

          {isApproved && (
             <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-brand-fog border border-brand-border rounded-lg text-brand-mist font-mono text-[11px] font-bold uppercase tracking-wider">
                {m.razorpay_payout_id ? `UTR: ${m.razorpay_payout_id}` : 'Settlement recorded'} <ChevronRight size={12}/>
             </div>
          )}
       </div>
    </div>
  );
}

function buildLedgerEntries(project: Project) {
  const entries = [
    {
      id: `escrow-${project.id}`,
      date: project.escrow_held_at || project.created_at,
      type: 'Escrow hold',
      amount: project.total_amount,
      status: project.escrow_held_at ? 'success' : 'pending',
      reference: project.razorpay_order_id || 'Awaiting payment',
    },
    ...project.milestones
      .filter((milestone) => milestone.status === 'approved' || milestone.status === 'released')
      .map((milestone) => ({
        id: milestone.id || `${project.id}-${milestone.sequence_number}`,
        date: milestone.released_at || milestone.approved_at || project.updated_at,
        type: `Milestone ${milestone.sequence_number} release`,
        amount: milestone.amount,
        status: 'success',
        reference: milestone.razorpay_payout_id || 'Approved in platform',
      })),
  ];

  return entries;
}

function toPdfRows(project: Project, entries: ReturnType<typeof buildLedgerEntries>) {
  return entries.map((entry) => ({
    id: entry.id,
    created_at: entry.date,
    project_title: project.title,
    milestone_title: entry.type,
    amount: entry.amount,
    transaction_type: entry.type.toLowerCase().replace(/\s+/g, '_'),
    status: entry.status,
    razorpay_reference: entry.reference,
  }));
}

function isRecentlyUpdated(timestamp: string) {
  const updatedAt = new Date(timestamp).getTime();
  if (Number.isNaN(updatedAt)) {
    return false;
  }
  return Date.now() - updatedAt < 15_000;
}

function formatShortDate(timestamp: string | null | undefined) {
  if (!timestamp) {
    return 'Recently';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Recently';
  }

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

function getErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: unknown }).response === 'object'
  ) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    return response?.data?.detail || fallback;
  }

  return fallback;
}

// ── Modals ──────────────────────────────────────────────────────────────────

function SubmitModal({ id, note, setNote, onClose, onConfirm }: any) {
  if (!id) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
       <div className="bg-brand-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
          <div className="p-8 border-b border-brand-border-strong">
             <h3 className="font-display font-bold text-2xl text-brand-ink mb-2">Submit Milestone</h3>
             <p className="text-[14px] text-brand-slate font-medium">Your client will receive a WhatsApp notification to review and approve.</p>
          </div>
          <div className="p-8 space-y-6">
             <div>
                <label className="text-[11px] font-bold tracking-widest uppercase text-brand-mist mb-2 block">Notes for client (required)</label>
                <textarea rows={4} className="w-full bg-brand-fog border border-brand-border rounded-2xl p-4 text-[14px] focus:outline-none focus:border-brand-forest outline-none" placeholder="e.g. Logos sent to your email, please review." value={note} onChange={e => setNote(e.target.value)} />
             </div>
             <div className="h-32 border-2 border-dashed border-brand-border-strong rounded-2xl flex flex-col items-center justify-center text-brand-mist hover:bg-brand-fog transition-colors cursor-pointer">
                <Plus size={24} className="mb-2" />
                <span className="text-[13px] font-bold">Attach project files</span>
             </div>
          </div>
          <div className="p-6 bg-brand-fog/50 flex gap-3">
             <Button variant="ghost" onClick={onClose} className="grow border-white">Cancel</Button>
             <Button onClick={() => onConfirm({ note })} disabled={!note} className="grow">Confirm & Submit</Button>
          </div>
       </div>
    </div>
  );
}

function ApproveModal({ id, counterparty, onClose, onConfirm }: any) {
  if (!id) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
       <div className="bg-brand-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden text-center animate-in zoom-in-95">
          <div className="p-10 flex flex-col items-center">
             <div className="w-20 h-20 rounded-full bg-brand-forest/10 text-brand-forest flex items-center justify-center mb-6"><ShieldCheck size={40}/></div>
             <h3 className="font-display font-bold text-2xl text-brand-ink mb-3">Release payment?</h3>
             <p className="text-[15px] text-brand-slate font-medium px-4">This authorizes the permanent release of funds to {counterparty}. This action cannot be undone.</p>
          </div>
          <div className="p-6 bg-brand-fog/50 flex gap-4">
             <Button variant="ghost" onClick={onClose} className="grow bg-white">Wait, go back</Button>
             <Button onClick={onConfirm} className="grow">Release ₹ Funds Now</Button>
          </div>
       </div>
    </div>
  );
}

function DisputeModal({ open, reason, setReason, details, setDetails, evidence, setEvidence, onClose, onConfirm }: any) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/80 backdrop-blur-sm p-4 pt-10 overflow-y-auto">
       <div className="bg-brand-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden my-auto animate-in slide-in-from-bottom-10">
          <div className="p-8 border-b border-brand-border-strong bg-brand-danger/5">
             <div className="flex items-center gap-4 text-brand-danger">
                <AlertCircle size={28}/>
                <h3 className="font-display font-bold text-2xl">Raise a Dispute</h3>
             </div>
          </div>
          <div className="p-8 space-y-8">
             <div>
                <label className="text-[13px] font-bold text-brand-ink uppercase tracking-widest mb-4 block">What is the issue?</label>
                <div className="grid grid-cols-1 gap-3">
                   {["Work doesn't match scope", "Delayed delivery", "Poor quality", "Unresponsive"].map(opt => (
                      <button key={opt} onClick={() => setReason(opt)} className={`p-4 rounded-xl border text-left text-[14px] font-bold transition-all ${reason === opt ? 'border-brand-danger bg-brand-danger/5 text-brand-danger' : 'border-brand-border text-brand-slate hover:border-brand-danger/40'}`}>
                         {opt}
                      </button>
                   ))}
                </div>
             </div>
             <div>
                <div className="flex justify-between items-center mb-2">
                   <label className="text-[13px] font-bold text-brand-ink uppercase tracking-widest block">Tell us more</label>
                   <span className={`text-[11px] font-bold ${details.length < 20 ? 'text-brand-danger' : 'text-brand-forest'}`}>
                      {details.length}/20 min
                   </span>
                </div>
                <textarea rows={4} className="w-full bg-brand-fog border border-brand-border rounded-xl p-4 text-[14px] focus:outline-none focus:border-brand-danger outline-none" placeholder="Provide raw details for our arbitration team (minimum 20 characters)..." value={details} onChange={e => setDetails(e.target.value)} />
             </div>
             <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <label className="text-[13px] font-bold text-brand-ink uppercase tracking-widest block">Evidence links (optional)</label>
                  <button
                    type="button"
                    onClick={() => setEvidence((current: string) => `${current}${current.trim() ? '\n' : ''}`)}
                    className="inline-flex items-center gap-1 rounded-full border border-brand-border-strong px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-brand-slate hover:text-brand-danger"
                  >
                    <Plus size={12} />
                    Add link
                  </button>
                </div>
                <textarea
                  rows={3}
                  className="w-full bg-brand-fog border border-brand-border rounded-xl p-4 text-[14px] focus:outline-none focus:border-brand-danger outline-none"
                  placeholder="Paste one URL per line for screenshots, docs, recordings, or deliverables."
                  value={evidence}
                  onChange={e => setEvidence(e.target.value)}
                />
             </div>
          </div>
          <div className="p-6 bg-brand-fog flex gap-4">
             <Button variant="ghost" onClick={onClose} className="grow bg-white">Cancel</Button>
             <Button className="grow bg-brand-danger border-0 text-white shadow-xl" disabled={!reason || details.length < 20} onClick={onConfirm}>Submit Case</Button>
          </div>
       </div>
    </div>
  );
}
function LeaveConfirmModal({ open, onClose, onConfirm, status }: any) {
  if (!open) return null;
  const isInProgress = status === 'in_progress';
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-ink/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
       <div className="bg-brand-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
          <div className="p-10 text-center">
             <div className="w-20 h-20 rounded-full bg-brand-danger/10 text-brand-danger flex items-center justify-center mb-6 mx-auto">
                <LogOut size={40}/>
             </div>
             <h3 className="font-display font-bold text-2xl text-brand-ink mb-3">
               {isInProgress ? 'Abandon Project?' : 'Cancel Project?'}
             </h3>
             <p className="text-[15px] text-brand-slate font-medium px-4 leading-relaxed">
               {isInProgress 
                 ? 'Leaving an active project will automatically trigger a dispute to protect escrow. An admin will review the progress.'
                 : 'Are you sure you want to cancel this project? This action cannot be undone.'}
             </p>
          </div>
          <div className="p-6 bg-brand-fog/50 flex gap-4">
             <Button variant="ghost" onClick={onClose} className="grow bg-white border-brand-border">Go back</Button>
             <Button onClick={onConfirm} className="grow bg-brand-danger hover:bg-brand-danger/90">
               {isInProgress ? 'Raise Dispute' : 'Cancel Now'}
             </Button>
          </div>
       </div>
    </div>
  );
}
