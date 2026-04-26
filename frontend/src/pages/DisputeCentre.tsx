import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useMyProfile } from '../lib/queries';
import toast from 'react-hot-toast';
import { 
  AlertCircle, Clock, CheckCircle2, ChevronRight, 
  Search, Filter, Inbox, ShieldAlert, Scale,
  User, Calendar, Paperclip, ArrowLeft, Send, Plus, Check
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { format } from 'date-fns';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fmtINR } from '../lib/currency';

type DisputeStatus = 'open' | 'process' | 'closed';

export default function DisputeCentre() {
  const { id: disputeId } = useParams<{ id: string }>();
  
  if (disputeId) {
    return <DisputeDetail id={disputeId} />;
  }

  return <DisputeList />;
}

// ── DISPUTE LIST VIEW ────────────────────────────────────────────────────────

function DisputeList() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DisputeStatus | 'all'>('all');
  const [showRaiseModal, setShowRaiseModal] = useState(false);

  const { data: disputes, isLoading } = useQuery({
    queryKey: ['disputes', activeTab],
    queryFn: async () => {
      const { data } = await api.get('/disputes', {
        params: activeTab === 'all' ? {} : { status: activeTab },
      });
      return data as any[];
    },
    refetchInterval: 5000,
  });

  return (
    <div className="max-w-[1000px] mx-auto py-8 px-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
         <div>
            <h1 className="font-display font-bold text-3xl text-brand-ink mb-2">Dispute Centre</h1>
            <p className="text-brand-slate font-medium">Manage and resolve project conflicts with StayVise mediation.</p>
         </div>
         <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex p-1 bg-brand-fog rounded-xl border border-brand-border-strong w-max">
              <TabButton active={activeTab === 'all'} label="All" onClick={() => setActiveTab('all')} />
              <TabButton active={activeTab === 'open'} label="Open" onClick={() => setActiveTab('open')} />
              <TabButton active={activeTab === 'process'} label="Process" onClick={() => setActiveTab('process')} />
              <TabButton active={activeTab === 'closed'} label="Closed" onClick={() => setActiveTab('closed')} />
            </div>
            <button
              onClick={() => setShowRaiseModal(true)}
              className="w-10 h-10 rounded-full bg-brand-forest text-white flex items-center justify-center shadow-lg hover:brightness-110 transition-all active:scale-95"
              title="Raise a dispute"
            >
              <Plus size={20} />
            </button>
         </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
           {[1,2,3].map(i => <div key={i} className="h-32 bg-brand-white rounded-3xl animate-pulse" />)}
        </div>
      ) : disputes?.length ? (
        <div className="grid gap-4">
           {disputes.map(dispute => (
              <DisputeCard key={dispute.id} dispute={dispute} />
           ))}
        </div>
      ) : (
        <div className="py-20 text-center bg-brand-white rounded-[2.5rem] border border-brand-border-strong shadow-sm">
           <div className="w-16 h-16 rounded-full bg-brand-fog flex items-center justify-center mx-auto mb-4 text-brand-mist">
              <Inbox size={32} />
           </div>
           <h3 className="font-bold text-brand-ink text-lg mb-1">No disputes found</h3>
           <p className="text-brand-slate text-sm max-w-sm mx-auto">Great! You have no active conflicts. Disputes raised on projects will appear here.</p>
        </div>
      )}

      {showRaiseModal && <RaiseDisputeModal onClose={() => setShowRaiseModal(false)} />}
    </div>
  );
}

function DisputeCard({ dispute }: { dispute: any }) {
  const disputeGroup = getDisputeGroup(dispute.status);
  const statusColors = {
    open: 'bg-brand-danger/10 text-brand-danger border-brand-danger/20',
    process: 'bg-amber-100 text-amber-700 border-amber-200',
    closed: 'bg-brand-forest-light text-brand-forest border-brand-forest/20'
  };

  return (
    <Link to={`/disputes/${dispute.id}`} className="group block bg-brand-white border border-brand-border-strong rounded-3xl p-6 md:p-8 hover:shadow-xl hover:border-brand-forest/30 transition-all">
       <div className="flex flex-col md:flex-row gap-6 md:items-center">
          <div className="flex-1">
             <div className="flex items-center gap-3 mb-2">
                <span className="font-mono text-[11px] font-bold text-brand-mist uppercase tracking-widest">#TL-{dispute.id.slice(0, 8).toUpperCase()}</span>
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusColors[disputeGroup]}`}>
                   {disputeGroup === 'process' ? 'In process' : disputeGroup}
                </span>
             </div>
             <h4 className="font-display font-bold text-xl text-brand-ink mb-1 group-hover:text-brand-forest transition-colors">Project Conflict: {dispute.project_id.slice(0, 6)}</h4>
             <p className="text-brand-slate text-sm font-medium line-clamp-1">{dispute.reason}</p>
          </div>
          <div className="flex items-center gap-8 md:text-right">
             <div className="hidden sm:block">
                <p className="text-[11px] font-bold text-brand-mist uppercase tracking-widest mb-1">Opened on</p>
                <p className="text-[14px] font-bold text-brand-ink">{format(new Date(dispute.created_at), 'dd MMM yyyy')}</p>
             </div>
             <ChevronRight className="text-brand-mist group-hover:text-brand-forest group-hover:translate-x-1 transition-all" />
          </div>
       </div>
    </Link>
  );
}

function getDisputeGroup(status: string): DisputeStatus {
  if (status === 'under_review' || status === 'escalated') return 'process';
  if (status === 'resolved_client' || status === 'resolved_freelancer') return 'closed';
  return 'open';
}

// ── DISPUTE DETAIL VIEW ──────────────────────────────────────────────────────

function DisputeDetail({ id }: { id: string }) {
  const { data: dispute, isLoading } = useQuery({
    queryKey: ['dispute', id],
    queryFn: async () => {
      const { data } = await api.get(`/disputes/${id}`);
      return data;
    }
  });

  if (isLoading || !dispute) return <div className="p-20 text-center animate-pulse text-brand-mist font-bold">Loading case file...</div>;
  const disputeGroup = getDisputeGroup(dispute.status);

  return (
    <div className="max-w-[1200px] mx-auto py-8 px-6 animate-in fade-in duration-500 pb-32">
      <Link to="/disputes" className="inline-flex items-center gap-2 text-brand-mist font-bold text-sm hover:text-brand-forest mb-8 transition-colors">
         <ArrowLeft size={16}/> Back to records
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
         
         {/* Left Side: Timeline & Evidence */}
         <div className="lg:col-span-2 space-y-10">
            <section>
               <div className="flex items-center justify-between mb-8">
                  <h1 className="font-display font-bold text-3xl text-brand-ink">Case Record #TL-{dispute.id.slice(0, 8).toUpperCase()}</h1>
                  <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border shadow-sm ${
                    disputeGroup === 'closed' ? 'bg-brand-forest text-white border-transparent' : 'bg-brand-danger/10 text-brand-danger border-brand-danger/20'
                  }`}>
                    {disputeGroup === 'process' ? 'In process' : disputeGroup}
                  </span>
               </div>

               {/* Timeline */}
               <div className="bg-brand-white border border-brand-border-strong rounded-[2.5rem] p-8 shadow-sm">
                  <h3 className="font-bold text-brand-ink mb-8 flex items-center gap-3">
                     <Clock size={20} className="text-brand-forest" /> Activity Timeline
                  </h3>
                  <div className="space-y-8 relative">
                     <div className="absolute left-[11px] top-2 bottom-2 w-px bg-brand-border-strong" />
                     
                     <TimelineItem 
                       date={format(new Date(dispute.created_at), 'dd MMM, HH:mm')} 
                       label="Dispute Raised" 
                       desc={`Case opened with reason: "${dispute.reason.slice(0, 100)}..."`} 
                       active
                     />
                     <TimelineItem 
                       date="Auto-generated" 
                       label="StayVise Notified" 
                       desc="System alert sent to human moderation team for assignment." 
                     />
                     {disputeGroup === 'process' && (
                        <TimelineItem 
                          date="Currently" 
                          label="Review in Progress" 
                          desc="Our specialist is reviewing evidence from both parties." 
                          highlight
                        />
                     )}
                     {disputeGroup === 'closed' && (
                        <TimelineItem 
                          date={format(new Date(dispute.resolved_at || ''), 'dd MMM, HH:mm')} 
                          label="Final Resolution" 
                          desc={dispute.resolution_notes || 'Decision reached based on evidence.'} 
                          success
                        />
                     )}
                  </div>
               </div>
            </section>

            {/* Evidence Panel */}
            <section className="space-y-6">
               <h3 className="font-display font-bold text-2xl text-brand-ink px-4">Evidence Registry</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-brand-white border border-brand-border-strong rounded-3xl p-6 shadow-sm">
                     <h4 className="font-bold text-brand-slate text-[13px] uppercase tracking-widest mb-4 flex items-center gap-2">
                        <User size={14}/> Original Submission
                     </h4>
                     <p className="text-[14px] text-brand-ink font-medium leading-relaxed mb-6">
                        {dispute.reason}
                     </p>
                     {dispute.evidence_urls?.length > 0 && (
                        <div className="flex gap-2">
                           {dispute.evidence_urls.map((url: string, i: number) => (
                              <div key={i} className="w-16 h-16 rounded-xl bg-brand-fog border border-brand-border-strong flex items-center justify-center text-brand-mist cursor-pointer hover:border-brand-forest transition-colors">
                                 <Paperclip size={20} />
                              </div>
                           ))}
                        </div>
                     )}
                  </div>

                  <div className="bg-brand-white border-2 border-dashed border-brand-border-strong rounded-3xl p-6 flex flex-col items-center justify-center text-center">
                     <ShieldAlert size={32} className="text-brand-mist mb-4" />
                     <h4 className="font-bold text-brand-mist">No Counter-Evidence Yet</h4>
                     <p className="text-[12px] text-brand-mist font-medium mt-1">Waiting for counterparty response.</p>
                  </div>
               </div>
            </section>
         </div>

         {/* Right Side: Decision & Context */}
         <div className="space-y-6">
            <div className="bg-brand-white border border-brand-border-strong rounded-[2.5rem] p-8 shadow-float sticky top-24">
               {disputeGroup === 'closed' ? (
                  <div className="space-y-6">
                     <div className="w-16 h-16 rounded-2xl bg-brand-forest flex items-center justify-center text-white shadow-lg">
                        <Scale size={32} />
                     </div>
                     <div>
                        <h3 className="font-display font-bold text-2xl text-brand-ink mb-2">Final Decision</h3>
                        <p className="text-brand-slate text-sm font-medium leading-relaxed">
                           This case has been resolved by our mediation team. Funds have been distributed according to the evidence provided.
                        </p>
                     </div>
                     <div className="p-6 bg-brand-forest/5 rounded-2xl border border-brand-forest/20">
                        <p className="text-[11px] font-bold text-brand-forest uppercase tracking-widest mb-1">Outcome</p>
                        <p className="font-bold text-brand-ink">{dispute.resolution_notes || 'Resolved in favour of freelancer.'}</p>
                     </div>
                     <Button className="w-full h-12 bg-brand-white border-brand-border-strong text-brand-ink hover:bg-brand-fog font-bold">
                        Download Report
                     </Button>
                  </div>
               ) : (
                  <div className="space-y-8">
                     <div className="p-6 bg-brand-forest-light rounded-2xl border border-brand-forest/10 flex items-start gap-4">
                         <AlertCircle className="text-brand-forest shrink-0" size={20} />
                         <div>
                            <p className="font-bold text-brand-forest text-sm">Action Required</p>
                            <p className="text-[12px] text-brand-slate font-medium mt-1">The counterparty has 3 days to respond before a default decision is made.</p>
                         </div>
                     </div>
                     
                     <div className="space-y-4">
                        <h4 className="font-bold text-brand-ink text-sm uppercase tracking-widest">Submit Response</h4>
                        <textarea 
                          placeholder="Your side of the story..."
                          className="w-full h-32 bg-brand-fog border border-brand-border-strong rounded-2xl p-4 text-sm font-medium outline-none focus:border-brand-forest focus:bg-white transition-all"
                        />
                        <button className="w-full flex items-center justify-center gap-3 p-4 bg-brand-white border border-brand-border-strong rounded-2xl text-sm font-bold text-brand-mist hover:text-brand-forest hover:border-brand-forest transition-all">
                           <Paperclip size={18}/> Attach Evidence
                        </button>
                        <Button className="w-full h-14 bg-brand-forest text-white border-0 shadow-xl shadow-brand-forest/20 font-display">
                           Finalize Response
                        </Button>
                     </div>

                     <div className="pt-6 border-t border-brand-border-strong">
                        <p className="text-[11px] text-brand-mist font-medium leading-relaxed italic">
                           Need legal help? Contact <span className="font-bold text-brand-forest">legal@stayvise.in</span> referencing this case number.
                        </p>
                     </div>
                  </div>
               )}
            </div>
         </div>

      </div>
    </div>
  );
}

// ── Components ───────────────────────────────────────────────────────────────

function TabButton({ active, label, onClick }: { active: boolean, label: string, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
        active 
          ? 'bg-brand-white text-brand-forest shadow-sm ring-1 ring-brand-border-strong' 
          : 'text-brand-mist hover:text-brand-ink'
      }`}
    >
      {label}
    </button>
  );
}

function TimelineItem({ date, label, desc, active, highlight, success }: any) {
  return (
    <div className="flex gap-6 relative z-10">
       <div className={`w-6 h-6 rounded-full border-4 border-brand-white shrink-0 mt-1 shadow-sm ${
          success ? 'bg-brand-forest' : highlight ? 'bg-amber-500' : active ? 'bg-brand-forest' : 'bg-brand-border-strong'
       }`} />
       <div>
          <div className="flex items-center gap-3 mb-1">
             <h4 className={`font-bold text-sm ${success ? 'text-brand-forest' : highlight ? 'text-amber-600' : 'text-brand-ink'}`}>{label}</h4>
             <span className="text-[10px] font-bold text-brand-mist bg-brand-fog px-2 py-0.5 rounded-full uppercase tracking-widest">{date}</span>
          </div>
          <p className="text-[13px] text-brand-slate font-medium leading-relaxed">{desc}</p>
       </div>
    </div>
  );
}

// ── Raise Dispute Modal ──────────────────────────────────────────────────────

function RaiseDisputeModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: profile } = useMyProfile();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isFreelancer = profile?.role === 'freelancer';

  const { data: projects } = useQuery({
    queryKey: ['projects-for-dispute'],
    queryFn: async () => {
      const { data } = await api.get('/projects', { params: { status: 'awaiting_payment,in_progress,disputed' } });
      return (data.items || data) as any[];
    },
  });

  const selectedProject = projects?.find((p: any) => p.id === selectedProjectId);
  const milestones = selectedProject?.milestones?.filter((m: any) => m.status === 'pending' || m.status === 'submitted') || [];

  const handleSubmit = async () => {
    if (!selectedProjectId || !title || !message) {
      toast.error('Please fill in all required fields');
      return;
    }
    if ((title + ': ' + message).length < 20) {
      toast.error('Please provide a more detailed case message (min 20 chars)');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/projects/${selectedProjectId}/dispute`, {
        milestone_id: selectedMilestoneId,
        reason: `${title}: ${message}`.trim(),
        evidence_urls: image ? ['https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&q=80&w=200'] : [],
      });
      toast.success('Dispute raised successfully');
      qc.invalidateQueries({ queryKey: ['disputes'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to raise dispute');
    } finally {
      setSubmitting(false);
    }
  };

  const reasons = isFreelancer 
    ? ["Payment not released after approval", "Unfair scope creep", "Unresponsive client", "Other"]
    : ["Work doesn't match scope", "Delayed delivery", "Poor quality", "Unresponsive"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-brand-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="p-6 border-b border-brand-border-strong bg-brand-danger/5">
          <div className="flex items-center gap-3 text-brand-danger">
            <AlertCircle size={24}/>
            <h3 className="font-display font-bold text-xl">Raise a Dispute</h3>
          </div>
        </div>
        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          <div>
            <label className="text-[11px] font-bold text-brand-mist uppercase tracking-widest mb-2 block">Select project</label>
            <div className="space-y-2">
              {!projects ? (
                <div className="py-8 text-center bg-brand-fog rounded-xl animate-pulse text-brand-mist text-xs font-bold uppercase">Discovering live projects...</div>
              ) : projects.length ? projects.map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setSelectedProjectId(p.id); setSelectedMilestoneId(null); }}
                  className={`w-full text-left p-3 rounded-xl border text-sm font-bold transition-all ${selectedProjectId === p.id ? 'border-brand-danger bg-brand-danger/5 text-brand-danger' : 'border-brand-border text-brand-ink hover:border-brand-danger/40'}`}
                >
                  {p.title} <span className="text-brand-mist font-normal">· ₹{fmtINR(p.total_amount)}</span>
                </button>
              )) : (
                <p className="text-sm text-brand-slate font-medium bg-brand-fog p-4 rounded-xl text-center">No active projects available to dispute.</p>
              )}
            </div>
          </div>

          {selectedProjectId && milestones.length > 0 && (
            <div>
              <label className="text-[11px] font-bold text-brand-mist uppercase tracking-widest mb-2 block">Select milestone</label>
              <div className="space-y-2">
                {milestones.map((m: any) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMilestoneId(m.id)}
                    className={`w-full text-left p-3 rounded-xl border text-sm font-bold transition-all ${selectedMilestoneId === m.id ? 'border-brand-danger bg-brand-danger/5 text-brand-danger' : 'border-brand-border text-brand-ink hover:border-brand-danger/40'}`}
                  >
                    {m.title} <span className="text-brand-mist font-normal">· ₹{fmtINR(m.amount)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] font-bold text-brand-mist uppercase tracking-widest mb-2 block">Choose a reason</label>
            <div className="grid grid-cols-2 gap-2">
              {reasons.map(opt => (
                <button 
                  key={opt} 
                  onClick={() => setTitle(opt)} 
                  className={`p-3 rounded-xl border text-left text-[12px] font-bold transition-all ${title === opt ? 'border-brand-danger bg-brand-danger/5 text-brand-danger' : 'border-brand-border text-brand-slate hover:border-brand-danger/40'}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-brand-mist uppercase tracking-widest mb-2 block">Case Message</label>
            <textarea 
              rows={3} 
              className="w-full bg-brand-fog border border-brand-border rounded-xl p-3 text-sm font-medium focus:outline-none focus:border-brand-danger focus:bg-white transition-all" 
              placeholder="Describe the issue in detail..." 
              value={message} 
              onChange={e => setMessage(e.target.value)} 
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-brand-mist uppercase tracking-widest mb-2 block">Optional Evidence (Image)</label>
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-brand-border-strong border-dashed rounded-xl cursor-pointer bg-brand-fog hover:bg-brand-fog/50 transition-all">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {image ? (
                    <div className="flex flex-col items-center">
                       <Check size={24} className="text-brand-forest mb-2" />
                       <p className="text-xs font-bold text-brand-forest">{image.name}</p>
                    </div>
                  ) : (
                    <>
                       <Plus size={24} className="text-brand-mist mb-2" />
                       <p className="text-[11px] font-bold text-brand-mist uppercase tracking-widest">Click to upload</p>
                    </>
                  )}
                </div>
                <input type="file" className="hidden" accept="image/*" onChange={e => setImage(e.target.files?.[0] || null)} />
              </label>
            </div>
          </div>
        </div>
        <div className="p-5 bg-brand-fog/50 flex gap-3 border-t border-brand-border-strong">
          <Button variant="ghost" onClick={onClose} className="grow font-bold">Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedProjectId || !title || !message || submitting}
            className="grow bg-brand-danger border-brand-danger text-white shadow-xl shadow-brand-danger/20 font-bold"
            isLoading={submitting}
          >
            Submit Dispute
          </Button>
        </div>
      </div>
    </div>
  );
}
