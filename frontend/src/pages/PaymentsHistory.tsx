import React, { useState } from 'react';
import { 
  ArrowUpRight, ArrowDownLeft, Filter, Download, 
  Search, Copy, Check, FileText, ChevronLeft, 
  ChevronRight, Calendar, Receipt, Info, Zap
} from 'lucide-react';
import { useMyProfile, usePaymentHistory, usePaymentStats } from '../lib/queries';
import { Button } from '../components/ui/Button';
import { format } from 'date-fns';
import { useToast } from '../components/ui/Toast';
import { exportLedgerPdf } from '../lib/pdf';
import { fmtINR } from '../lib/currency';

export default function PaymentsHistory() {
  const [range, setRange] = useState<'month' | '3months' | 'year' | 'custom'>('month');
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  const dateParams = React.useMemo(() => getRangeParams(range), [range]);
  const { data: profile } = useMyProfile();
  const { data: stats, isLoading: statsLoading } = usePaymentStats();
  const { data: history, isLoading: historyLoading } = usePaymentHistory({
    skip: (page - 1) * 20,
    limit: 20,
    ...dateParams,
  });

  const handleRangeChange = (newRange: typeof range) => {
    setRange(newRange);
    setPage(1);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied', description: 'Reference ID copied to clipboard.' });
  };
  const isClient = profile?.role === 'client';

  return (
    <div className="max-w-[1280px] mx-auto py-8 px-6 animate-in fade-in duration-500 pb-20">
      
      {/* Header & Global Filters */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
         <div>
            <h1 className="font-display font-bold text-3xl text-brand-ink mb-2">{isClient ? 'Client Ledger' : 'Freelancer Ledger'}</h1>
            <p className="text-brand-slate font-medium">
              {isClient ? 'Client ledger for escrow funding, approvals, and protected spend.' : 'Freelancer ledger for releases, payouts, and earned funds.'}
            </p>
         </div>
         <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <div className="flex p-1 bg-brand-fog rounded-xl border border-brand-border-strong text-[11px] font-bold overflow-x-auto scrollbar-none">
               <RangeButton active={range === 'month'} label="This month" onClick={() => handleRangeChange('month')} />
               <RangeButton active={range === '3months'} label="Last 3 months" onClick={() => handleRangeChange('3months')} />
               <RangeButton active={range === 'year'} label="This year" onClick={() => handleRangeChange('year')} />
            </div>
            <Button
              variant="outline"
              className="border-brand-border-strong h-10 px-4 text-brand-ink text-xs font-bold gap-2 whitespace-nowrap"
              onClick={() => exportLedgerPdf(history || [], 'StayVise Payment History')}
            >
               <Download size={14} /> Export PDF
            </Button>
         </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
         <SummaryCard 
            label={isClient ? 'Protected spend' : 'Total earned'} 
            value={`₹${fmtINR(getPrimaryLedgerTotal(stats, isClient))}`} 
            icon={<ArrowDownLeft className="text-brand-forest" size={20}/>} 
            loading={statsLoading}
         />
         <SummaryCard 
            label={isClient ? 'Escrow in progress' : 'Platform fees'} 
            value={isClient ? `₹${fmtINR(stats?.pending_escrow)}` : `₹${fmtINR(getSecondaryLedgerTotal(stats))}`} 
            icon={<ArrowUpRight className="text-brand-danger" size={20}/>} 
            loading={statsLoading}
         />
         <SummaryCard 
            label={isClient ? 'Verified rows' : 'Total spent'} 
            value={isClient ? `${stats?.verified_entries || 0}` : `₹${fmtINR(stats?.total_spent)}`} 
            icon={<Zap className="text-amber-500" size={20}/>} 
            loading={statsLoading}
         />
         <SummaryCard 
            label="Transactions" 
            value={stats?.transaction_count || '0'} 
            icon={<Receipt className="text-brand-mist" size={20}/>} 
            loading={statsLoading}
         />
      </div>

      {/* Main Ledger */}
      <div className="bg-brand-white rounded-[2.5rem] border border-brand-border-strong shadow-sm overflow-hidden">
         <div className="px-8 py-6 border-b border-brand-border-strong flex flex-col md:flex-row justify-between items-center gap-4">
            <h3 className="font-display font-bold text-xl text-brand-ink">Combined ledger history</h3>
            <div className="flex items-center gap-2 bg-brand-fog px-4 py-2 rounded-full border border-brand-border-strong">
               <Info size={14} className="text-brand-mist" />
               <span className="text-[10px] font-bold text-brand-mist uppercase tracking-widest">
                 {stats?.verified_entries || 0} hash-verified rows{stats?.last_entry_at ? ` · updated ${format(new Date(stats.last_entry_at), 'dd MMM, HH:mm')}` : ''}
               </span>
            </div>
         </div>

         <div className="overflow-x-auto">
            <table className="w-full text-left">
               <thead className="bg-brand-fog/50 border-b border-brand-border-strong">
                  <tr className="text-[11px] font-bold text-brand-mist uppercase tracking-widest">
                     <th className="px-8 py-4">Date</th>
                     <th className="px-8 py-4">Project / Milestone</th>
                     <th className="px-8 py-4">Reference</th>
                     <th className="px-8 py-4">Type</th>
                     <th className="px-8 py-4">Status</th>
                     <th className="px-8 py-4 text-right">Amount</th>
                     <th className="px-8 py-4">Invoice</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-brand-border-strong">
                   {historyLoading ? (
                    <tr>
                       <td colSpan={7} className="py-20 text-center">
                          <div className="flex flex-col items-center gap-4">
                             <div className="animate-spin h-8 w-8 border-4 border-brand-forest border-t-transparent rounded-full" />
                             <p className="text-sm font-bold text-brand-mist uppercase tracking-widest">Loading ledger...</p>
                          </div>
                       </td>
                     </tr>
                    ) : (history && history.length > 0) ? (
                      history.map((tx: any) => (
                        <tr key={tx.id} className="group hover:bg-brand-fog/30 transition-colors">
                           <td className="px-8 py-5">
                              <p className="font-bold text-brand-ink text-sm">{format(new Date(tx.created_at), 'dd MMM yyyy')}</p>
                              <p className="text-[10px] font-medium text-brand-mist mt-0.5">{format(new Date(tx.created_at), 'HH:mm')}</p>
                           </td>
                           <td className="px-8 py-5">
                              <p className="font-bold text-brand-ink text-sm truncate max-w-[200px]">{tx.project_title}</p>
                              <p className="text-[11px] font-medium text-brand-slate mt-0.5">{tx.milestone_title || 'Across project'}</p>
                           </td>
                           <td className="px-8 py-5">
                              <div 
                                onClick={() => copyToClipboard(tx.razorpay_reference || tx.id)}
                                className="flex items-center gap-2 font-mono text-[11px] text-brand-mist cursor-pointer hover:text-brand-forest transition-colors bg-brand-fog/40 px-3 py-1.5 rounded-lg w-max"
                              >
                                 {tx.razorpay_reference ? tx.razorpay_reference.slice(0, 14) : tx.id.slice(0, 8)}... <Copy size={10} />
                              </div>
                           </td>
                         <td className="px-8 py-5">
                              <TypePill type={tx.transaction_type} />
                           </td>
                           <td className="px-8 py-5">
                              <StatusPill status={tx.status} verified={tx.is_audit_verified} />
                           </td>
                           <td className={`px-8 py-5 text-right font-mono font-bold text-sm ${getAmountColor(tx.transaction_type)}`}>
                              {getAmountSign(tx.transaction_type, isClient)}₹{fmtINR(tx.amount)}
                           </td>
                           <td className="px-8 py-5">
                              {tx.transaction_type === 'milestone_release' && tx.status === 'success' && (
                                 <button className="p-2 text-brand-mist hover:text-brand-forest hover:bg-brand-forest/10 rounded-lg transition-all active:scale-95">
                                    <FileText size={18} />
                                 </button>
                              )}
                           </td>
                        </tr>
                      ))
                    ) : (
                    <tr>
                       <td colSpan={7} className="py-20 text-center">
                          <div className="flex flex-col items-center gap-3">
                             <div className="p-4 bg-brand-fog rounded-full text-brand-mist"><Calendar size={32}/></div>
                             <h4 className="font-bold text-brand-ink">
                               {(history && !historyLoading) ? 'No financial records found' : 'Failed to load ledger'}
                             </h4>
                             <p className="text-sm text-brand-slate font-medium">
                               {(history && !historyLoading) 
                                 ? 'No transactions in this time range. Try adjusting your filters.' 
                                 : 'There was a problem connecting to the vault. Please refresh.'}
                             </p>
                          </div>
                       </td>
                    </tr>
                   )}
                </tbody>
            </table>
         </div>

         {/* Pagination */}
         <div className="px-8 py-6 border-t border-brand-border-strong flex items-center justify-between">
            <p className="text-[12px] text-brand-mist font-bold uppercase tracking-widest">Page {page} of 1</p>
            <div className="flex gap-2">
               <button 
                 disabled={page === 1}
                 onClick={() => setPage(p => p - 1)}
                 className="p-2 border border-brand-border-strong rounded-xl text-brand-mist disabled:opacity-30 hover:bg-brand-fog transition-all"
               >
                 <ChevronLeft size={18} />
               </button>
               <button 
                 disabled
                 className="p-2 border border-brand-border-strong rounded-xl text-brand-mist disabled:opacity-30 hover:bg-brand-fog transition-all"
               >
                 <ChevronRight size={18} />
               </button>
            </div>
         </div>
      </div>

    </div>
  );
}

function getRangeParams(range: 'month' | '3months' | 'year' | 'custom') {
  const now = new Date();
  now.setSeconds(0, 0); // Stabilize to the minute
  const start = new Date(now);

  if (range === 'month') {
    start.setMonth(now.getMonth() - 1);
  } else if (range === '3months') {
    start.setMonth(now.getMonth() - 3);
  } else if (range === 'year') {
    start.setFullYear(now.getFullYear() - 1);
  } else {
    return {};
  }

  return {
    start_date: start.toISOString(),
    end_date: now.toISOString(),
  };
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function RangeButton({ active, label, onClick }: { active: boolean, label: string, onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 rounded-lg transition-all ${active ? 'bg-brand-white text-brand-forest shadow-sm' : 'text-brand-mist hover:text-brand-ink'}`}>
       {label}
    </button>
  );
}

function SummaryCard({ label, value, icon, loading }: any) {
  return (
    <div className="bg-brand-white border border-brand-border-strong rounded-3xl p-6 shadow-sm hover:shadow-float transition-all group">
       <div className="flex justify-between items-start mb-4">
          <div className="p-3 bg-brand-fog rounded-2xl border border-brand-border-strong group-hover:bg-brand-white transition-colors">
             {icon}
          </div>
       </div>
       {loading ? (
          <div className="space-y-2">
             <div className="h-6 w-24 bg-brand-fog animate-pulse rounded" />
             <div className="h-4 w-16 bg-brand-fog animate-pulse rounded" />
          </div>
       ) : (
          <>
             <div className="text-2xl font-mono font-bold text-brand-ink tracking-tight">{value}</div>
             <div className="text-[10px] font-bold text-brand-mist uppercase tracking-widest mt-1">{label}</div>
          </>
       )}
    </div>
  );
}

function TypePill({ type }: { type: string }) {
  const styles: any = {
    escrow_hold: 'bg-amber-100 text-amber-700 border-amber-200',
    milestone_release: 'bg-brand-forest-light text-brand-forest border-brand-forest/20',
    platform_fee: 'bg-brand-mist/10 text-brand-mist border-brand-border-strong',
    refund: 'bg-blue-100 text-blue-700 border-blue-200'
  };

  const labels: any = {
    escrow_hold: 'Escrow Auth',
    milestone_release: 'Milestone Rel',
    platform_fee: 'StayVise Fee',
    refund: 'Project Refund'
  };

  return (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${styles[type] || 'bg-gray-100'}`}>
       {labels[type] || type.replace('_', ' ')}
    </span>
  );
}

function StatusPill({ status, verified }: { status: string; verified: boolean }) {
  const styles: any = {
    success: 'text-brand-forest',
    pending: 'text-amber-500',
    failed: 'text-brand-danger'
  };

  return (
    <div className="flex items-center gap-2 font-bold text-[11px] uppercase tracking-wider">
       <div className={`w-1.5 h-1.5 rounded-full ${status === 'success' ? 'bg-brand-forest' : status === 'pending' ? 'bg-amber-500' : 'bg-brand-danger'}`} />
       <span className={styles[status]}>{status}</span>
       <span className={`rounded-full px-2 py-1 text-[9px] ${verified ? 'bg-brand-forest-light text-brand-forest' : 'bg-brand-fog text-brand-mist'}`}>
         {verified ? 'verified' : 'legacy'}
       </span>
    </div>
  );
}

function getAmountSign(type: string, isClient: boolean) {
  if (type === 'refund') return '+';
  if (isClient) {
    return type === 'escrow_hold' ? '-' : '';
  }
  if (type === 'milestone_release') return '+';
  if (type === 'platform_fee') return '-';
  return '';
}

function getAmountColor(type: string) {
  if (type === 'milestone_release') return 'text-brand-forest';
  if (type === 'platform_fee') return 'text-brand-danger';
  return 'text-brand-mist';
}

function getPrimaryLedgerTotal(stats: any, isClient: boolean) {
  if (!stats) return 0;
  return Number(isClient ? stats.total_spent : stats.total_received);
}

function getSecondaryLedgerTotal(stats: any) {
  if (!stats) return 0;
  return Number(stats.platform_fees_paid || 0);
}
