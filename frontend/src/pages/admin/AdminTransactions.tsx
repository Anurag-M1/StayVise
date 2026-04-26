import React, { useState } from 'react';
import { 
  Receipt, Search, Download, Filter, 
  ArrowUpRight, ArrowDownLeft, Copy, ExternalLink,
  ShieldCheck, AlertCircle, FileText, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { format } from 'date-fns';
import { fmtINR } from '../../lib/currency';
import { useToast } from '../../components/ui/Toast';

export default function AdminTransactions() {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  const { data: txs, isLoading } = useQuery({
    queryKey: ['admin-all-transactions', page],
    queryFn: () => api.get(`/admin/transactions?offset=${(page - 1) * 20}&limit=20`).then(r => r.data),
    refetchInterval: 30000,
  });

  const { data: summary } = useQuery({
    queryKey: ['admin-transactions-summary'],
    queryFn: () => api.get('/admin/transactions/summary').then(r => r.data),
    refetchInterval: 30000,
  });

  const filteredTxs = React.useMemo(() => {
    if (!txs) return [];
    if (!searchTerm) return txs;
    const term = searchTerm.toLowerCase();
    return txs.filter((tx: any) => 
      tx.project_title?.toLowerCase().includes(term) ||
      tx.id.toLowerCase().includes(term) ||
      tx.razorpay_reference?.toLowerCase().includes(term) ||
      tx.transaction_type.toLowerCase().includes(term)
    );
  }, [txs, searchTerm]);

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast({ title: 'ID Copied', description: 'Reference ID ready for audit.' });
  };

  const exportToCSV = () => {
    if (!txs || txs.length === 0) return;
    
    const headers = ['Timestamp', 'Transaction ID', 'External Ref', 'Project', 'Milestone', 'Type', 'Amount', 'Status'];
    const rows = txs.map((tx: any) => [
      format(new Date(tx.created_at), 'yyyy-MM-dd HH:mm:ss'),
      tx.id,
      tx.razorpay_reference || 'N/A',
      tx.project_title || 'N/A',
      tx.milestone_title || 'N/A',
      tx.transaction_type,
      tx.amount,
      tx.status
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `StayVise_Audit_Ledger_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({ title: 'Export Success', description: 'Transaction ledger downloaded as CSV.' });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
         <div>
            <h1 className="font-display font-bold text-2xl text-brand-ink mb-1">Financial Audit Journal</h1>
            <p className="text-brand-slate font-medium text-sm">Real-time immutable ledger of platform movement.</p>
         </div>
         <div className="flex items-center gap-3">
            <Button 
               variant="outline" 
               onClick={exportToCSV}
               className="border-brand-border-strong h-11 px-6 font-bold text-brand-mist flex items-center gap-2 hover:bg-white transition-all shadow-sm"
            >
               <Download size={18} /> Export CSV
            </Button>
            <div className="flex items-center gap-2 bg-brand-forest/5 px-4 py-2 rounded-xl border border-brand-forest/10">
               <ShieldCheck size={16} className="text-brand-forest" />
               <span className="text-[10px] font-bold text-brand-forest uppercase tracking-widest">SafeVault™ Verified</span>
            </div>
         </div>
      </div>

      {/* Tally / Quick Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <TallyCard label="Platform Reserve" value={`₹${fmtINR(summary?.platform_reserve || 0)}`} icon={<ShieldCheck className="text-brand-forest"/>} />
         <TallyCard label="Total Fees Collected" value={`₹${fmtINR(summary?.total_fees_collected || 0)}`} icon={<ArrowUpRight className="text-brand-forest"/>} />
         <TallyCard label="Failed Threshold" value={`${(summary?.failed_threshold_pct || 0).toFixed(2)}%`} icon={<AlertCircle className="text-brand-mist"/>} />
      </div>

      {/* Main Ledger Table */}
      <div className="bg-white rounded-[2.5rem] border border-brand-border-strong shadow-sm overflow-hidden">
         <div className="px-8 py-6 border-b border-brand-border-strong">
            <div className="relative max-w-md">
               <input 
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
                 placeholder="Search by Payment ID, Project, or Razorpay Ref..."
                 className="w-full h-11 bg-brand-fog rounded-xl px-10 border border-brand-border-strong focus:border-brand-forest outline-none text-sm font-medium transition-all"
               />
               <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-mist" size={16} />
            </div>
         </div>

         <div className="overflow-x-auto">
            <table className="w-full text-left">
               <thead className="bg-brand-fog/50 border-b border-brand-border-strong">
                  <tr className="text-[11px] font-bold text-brand-mist uppercase tracking-widest">
                     <th className="px-8 py-5">Timestamp</th>
                     <th className="px-8 py-5">External Ref</th>
                     <th className="px-8 py-5">Platform Entity</th>
                     <th className="px-8 py-5">Log Type</th>
                     <th className="px-8 py-5 text-right">Amount</th>
                     <th className="px-8 py-5">Status</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-brand-border-strong">
                  {isLoading ? (
                    [1,2,3,4,5].map(i => <tr key={i} className="animate-pulse h-16 bg-white/50" />)
                  ) : filteredTxs.map((tx: any) => (
                    <tr key={tx.id} className="group hover:bg-brand-fog/30 transition-colors">
                       <td className="px-8 py-5 whitespace-nowrap">
                          <p className="font-bold text-brand-ink text-sm">{format(new Date(tx.created_at), 'dd MMM, HH:mm')}</p>
                       </td>
                       <td className="px-8 py-5">
                          <div 
                            onClick={() => copyId(tx.razorpay_reference || tx.id)}
                            className="flex items-center gap-2 font-mono text-[10px] text-brand-mist hover:text-brand-forest cursor-pointer bg-brand-fog px-2.5 py-1.5 rounded-lg w-max"
                          >
                             {tx.razorpay_reference ? tx.razorpay_reference.slice(0, 12) : tx.id.slice(0, 8)}... <Copy size={10} />
                          </div>
                       </td>
                       <td className="px-8 py-5">
                          <h4 className="font-bold text-brand-ink text-xs truncate max-w-[200px]">{tx.project_title}</h4>
                          <p className="text-[10px] font-medium text-brand-mist truncate mt-0.5">{tx.milestone_title || 'Batch Process'}</p>
                       </td>
                       <td className="px-8 py-5">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                            tx.transaction_type === 'milestone_release' ? 'bg-brand-forest/10 text-brand-forest' : 'bg-brand-mist/10 text-brand-mist'
                          }`}>
                             {tx.transaction_type.replace('_', ' ')}
                          </span>
                       </td>
                       <td className="px-8 py-5 text-right font-mono font-bold text-sm text-brand-ink">
                          ₹{fmtINR(tx.amount)}
                       </td>
                       <td className="px-8 py-5">
                          <div className="flex items-center gap-2">
                             <div className={`w-1.5 h-1.5 rounded-full ${tx.status === 'success' ? 'bg-brand-forest' : 'bg-amber-500'}`} />
                             <span className={`text-[11px] font-bold uppercase tracking-wider ${tx.status === 'success' ? 'text-brand-forest' : 'text-amber-500'}`}>
                                {tx.status}
                             </span>
                          </div>
                       </td>
                    </tr>
                  ))}
               </tbody>
            </table>
         </div>

         {/* Pagination */}
         <div className="px-8 py-6 bg-brand-fog/50 border-t border-brand-border-strong flex justify-between items-center">
            <p className="text-[11px] font-bold text-brand-mist uppercase tracking-widest">Journal Page {page} of 1</p>
            <div className="flex gap-2">
               <button onClick={() => setPage(p => Math.max(1, p - 1))} className="p-2 border border-brand-border-strong rounded-xl text-brand-mist hover:bg-white transition-all"><ChevronLeft size={18}/></button>
               <button className="p-2 border border-brand-border-strong rounded-xl text-brand-mist opacity-30 cursor-not-allowed"><ChevronRight size={18}/></button>
            </div>
         </div>
      </div>

    </div>
  );
}

function TallyCard({ label, value, icon }: any) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-brand-border-strong shadow-sm hover:shadow-float transition-all">
       <div className="flex justify-between items-center mb-4">
          <span className="text-[10px] font-bold text-brand-mist uppercase tracking-widest">{label}</span>
          {icon}
       </div>
       <div className="text-2xl font-mono font-bold text-brand-ink">{value}</div>
    </div>
  );
}
