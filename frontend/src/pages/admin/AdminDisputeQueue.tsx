import React, { useState } from 'react';
import { 
  ShieldAlert, ShieldCheck, Clock, User as UserIcon, 
  ArrowRight, Search, Filter, MoreVertical, 
  MessageSquare, Gavel, CheckCircle2, AlertCircle
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { format } from 'date-fns';
import { useToast } from '../../components/ui/Toast';
import { Link } from 'react-router-dom';
import { toRupees } from '../../lib/currency';

export default function AdminDisputeQueue() {
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [selectedDispute, setSelectedDispute] = useState<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: disputes, isLoading } = useQuery({
    queryKey: ['admin-disputes', filter],
    queryFn: () => api.get(`/admin/disputes${filter !== 'all' ? `?status=${filter}` : ''}`).then(r => r.data)
  });

  const claimMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/disputes/${id}/claim`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-disputes'] });
      toast({ title: 'Case claimed', description: 'You are now assigned to this dispute.' });
    }
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Header & Filter */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
         <div>
            <h1 className="font-display font-bold text-2xl text-brand-ink mb-1">Dispute Management</h1>
            <p className="text-brand-slate font-medium text-sm">Review evidence and mediate platform conflicts.</p>
         </div>
         <div className="flex p-1 bg-white rounded-xl border border-brand-border-strong text-[11px] font-bold shadow-sm">
            <FilterButton active={filter === 'all'} label="All cases" onClick={() => setFilter('all')} />
            <FilterButton active={filter === 'open'} label="Open" count={disputes?.filter((d: any) => d.status === 'open').length} onClick={() => setFilter('open')} />
            <FilterButton active={filter === 'resolved'} label="Resolved" onClick={() => setFilter('resolved')} />
         </div>
      </div>

      {/* Grid of Cases */}
      <div className="grid gap-4">
         {isLoading ? (
            [1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-[1.5rem] animate-pulse border border-brand-border-strong" />)
         ) : !disputes?.length ? (
            <div className="py-20 bg-white rounded-[2rem] border-2 border-dashed border-brand-border-strong flex flex-col items-center gap-3">
               <ShieldCheck size={48} className="text-brand-forest/20" />
               <h3 className="font-bold text-brand-ink">All clear!</h3>
               <p className="text-sm text-brand-mist font-medium">No disputes matching your current filter.</p>
            </div>
         ) : (
            disputes.map((dispute: any) => (
               <DisputeCard 
                 key={dispute.id} 
                 dispute={dispute} 
                 onClaim={() => claimMutation.mutate(dispute.id)} 
                 onMediate={() => setSelectedDispute(dispute)}
               />
            ))
         )}
      </div>

      {/* Resolution Modal */}
      {selectedDispute && (
        <ResolutionModal 
          dispute={selectedDispute} 
          onClose={() => setSelectedDispute(null)} 
        />
      )}

    </div>
  );
}

function DisputeCard({ dispute, onMediate }: any) {
  const isResolved = dispute.status === 'resolved';

  return (
    <div className="bg-white border border-brand-border-strong rounded-[2rem] p-6 flex flex-col lg:flex-row lg:items-center gap-8 shadow-sm hover:shadow-float transition-all group">
       <div className="flex items-center gap-6 flex-1">
          <div className={`p-4 rounded-2xl ${isResolved ? 'bg-brand-forest/10 text-brand-forest' : 'bg-brand-danger/10 text-brand-danger shadow-inner'}`}>
             {isResolved ? <ShieldCheck size={28}/> : <ShieldAlert size={28}/>}
          </div>
          <div className="space-y-1">
             <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-brand-mist uppercase tracking-widest">Case #{dispute.id.slice(0, 8)}</span>
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${isResolved ? 'bg-brand-forest/10 text-brand-forest' : 'bg-amber-100 text-amber-700'}`}>
                   {dispute.status}
                </span>
             </div>
             <h4 className="font-display font-bold text-lg text-brand-ink group-hover:text-brand-forest transition-colors">
                {dispute.project?.title || 'Unknown Project'}
             </h4>
             <div className="flex items-center gap-4 text-[12px] font-medium text-brand-slate">
                <span className="flex items-center gap-1.5"><Clock size={14}/> {format(new Date(dispute.created_at), 'dd MMM')}</span>
                <span className="flex items-center gap-1.5 font-bold text-brand-forest">
                   <ArrowRight size={14}/> Reason: {dispute.reason.slice(0, 40)}...
                </span>
             </div>
          </div>
       </div>

       <div className="lg:border-l border-brand-border-strong lg:pl-8 flex items-center gap-4">
          <Link 
            to={`/admin/disputes/${dispute.id}`}
            className="h-11 px-6 border border-brand-border-strong rounded-xl text-brand-mist hover:text-brand-ink flex items-center justify-center font-bold text-sm transition-all shadow-sm hover:shadow-md"
          >
             Show Details
          </Link>
          {!isResolved ? (
            <Button className="bg-brand-ink text-white h-11 px-8 rounded-xl font-bold gap-2 shadow-lg shadow-brand-ink/10" onClick={onMediate}>
               Close Case <CheckCircle2 size={16}/>
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-brand-forest font-bold text-sm bg-brand-forest/5 px-4 py-2 rounded-xl border border-brand-forest/10">
               <CheckCircle2 size={16} /> Resolved
            </div>
          )}
       </div>
    </div>
  );
}

function ResolutionModal({ dispute, onClose }: any) {
  const [split, setSplit] = useState(50);
  const [notes, setNotes] = useState('');
  const qc = useQueryClient();
  const { toast } = useToast();

  const resolveMutation = useMutation({
    mutationFn: (data: any) => api.post(`/admin/disputes/${dispute.id}/resolve`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-disputes'] });
      toast({ title: 'Decision rendered', description: 'Funds have been distributed per your ruling.' });
      onClose();
    }
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-[100] animate-in fade-in backdrop-blur-sm">
       <div className="bg-white rounded-[2.5rem] p-10 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-start mb-8">
             <div>
                <h3 className="font-display font-bold text-2xl text-brand-ink">Resolution Console</h3>
                <p className="text-brand-slate text-sm font-medium mt-1">Closing Case: {dispute.project.title}</p>
             </div>
             <button onClick={onClose} className="p-2 hover:bg-brand-fog rounded-full transition-colors text-brand-mist hover:text-brand-ink"><AlertCircle size={20}/></button>
          </div>

          <div className="space-y-8">
             {/* Evidence Section */}
             <div className="bg-brand-fog p-6 rounded-[2rem] border border-brand-border-strong">
                <h4 className="text-[11px] font-bold text-brand-mist uppercase tracking-widest mb-4 flex items-center gap-2">
                   <Gavel size={14}/> Final Arbitration Split
                </h4>
                
                <div className="flex items-center justify-between mb-2">
                   <span className="text-xs font-bold text-brand-ink">Freelancer Payout</span>
                   <span className="font-mono font-bold text-brand-forest text-lg">{split}%</span>
                </div>
                
                <div className="relative h-12 bg-white/50 rounded-2xl flex items-center px-4 border border-brand-border-strong mb-6">
                   <input 
                     type="range" min="0" max="100" value={split} 
                     onChange={(e) => setSplit(parseInt(e.target.value))}
                     className="w-full h-1.5 bg-brand-border-strong rounded-lg appearance-none cursor-pointer accent-brand-forest"
                   />
                </div>

                <div className="flex justify-between px-2 py-4 bg-white/40 rounded-xl border border-white/50">
                   <div className="text-center">
                      <p className="text-[10px] font-bold text-brand-mist uppercase">Release to Freelancer</p>
                      <p className="font-bold text-brand-ink text-lg">₹{(toRupees(dispute.milestone?.amount || dispute.project?.total_amount || 0) * (split / 100)).toLocaleString('en-IN')}</p>
                   </div>
                   <div className="text-center">
                      <p className="text-[10px] font-bold text-brand-mist uppercase">Refund to Client</p>
                      <p className="font-bold text-brand-amber text-lg">₹{(toRupees(dispute.milestone?.amount || dispute.project?.total_amount || 0) * ((100-split) / 100)).toLocaleString('en-IN')}</p>
                   </div>
                </div>
             </div>

             {/* Notes */}
             <div className="space-y-2">
                <label className="text-[11px] font-bold text-brand-mist uppercase tracking-widest">Resolution Summary</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full h-32 bg-brand-fog rounded-2xl p-6 border border-brand-border-strong outline-none focus:ring-2 focus:ring-brand-forest/20 text-sm font-medium text-brand-ink"
                  placeholder="Summarize the logic behind this final split decision..."
                />
             </div>

             <div className="flex gap-4 pt-4 border-t border-brand-border-strong">
                <Button variant="ghost" className="flex-1 h-14 rounded-xl font-bold text-brand-mist" onClick={onClose}>Cancel</Button>
                <Button 
                   className="flex-1 bg-brand-forest text-white h-14 rounded-xl font-bold shadow-lg shadow-brand-forest/20 hover:bg-brand-forest/90 transition-all flex items-center justify-center gap-2"
                   onClick={() => resolveMutation.mutate({ freelancer_payout_pct: split, resolution_notes: notes })}
                >
                  <ShieldCheck size={18}/> Close Case Permanently
                </Button>
             </div>
          </div>
       </div>
    </div>
  );
}

function FilterButton({ active, label, count, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${active ? 'bg-brand-ink text-white shadow-md' : 'text-brand-mist hover:text-brand-ink'}`}
    >
      {label}
      {count !== undefined && <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${active ? 'bg-white/20' : 'bg-brand-fog text-brand-mist'}`}>{count}</span>}
    </button>
  );
}
