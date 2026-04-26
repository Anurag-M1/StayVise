import React, { useEffect, useState } from 'react';
import { Mail, Briefcase, Clock, CheckCircle, Trash2, ExternalLink, Filter, Search, AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { toast } from 'react-hot-toast';

interface Submission {
  id: string;
  submission_type: 'contact' | 'career';
  payload: any;
  status: string;
  created_at: string;
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export default function AdminSubmissions() {
  const [filter, setFilter] = useState<'all' | 'contact' | 'career'>('all');
  const qc = useQueryClient();

  const { data: submissions, isLoading, isError, isFetching } = useQuery({
    queryKey: ['admin-submissions', filter],
    queryFn: () => api.get(`/admin/submissions${filter !== 'all' ? `?submission_type=${filter}` : ''}`).then(r => r.data),
    refetchInterval: 30000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string, status: string }) => api.patch(`/admin/submissions/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-submissions'] });
      toast.success('Status updated');
    },
    onError: () => toast.error('Failed to update status')
  });

  const updateStatus = (id: string, status: string) => {
    updateStatusMutation.mutate({ id, status });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="font-display font-bold text-3xl text-brand-ink">Public Submissions</h1>
          <p className="text-brand-slate font-medium">Inquiries and job applications from stayvise.in</p>
        </div>
        
        <div className="flex bg-white border border-brand-border-strong rounded-xl p-1 p-safe">
           <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
           <FilterBtn active={filter === 'contact'} onClick={() => setFilter('contact')} label="Contacts" />
           <FilterBtn active={filter === 'career'} onClick={() => setFilter('career')} label="Careers" />
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-brand-border-strong shadow-sm overflow-hidden min-h-[400px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 rounded-full border-4 border-brand-forest border-t-transparent" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 text-brand-mist px-8 text-center">
             <AlertCircle size={48} className="mb-4 text-brand-danger" />
             <p className="font-bold text-brand-ink">Connection Interrupted</p>
             <p className="text-xs">We encountered an issue fetching submissions. Please check your connection or try again.</p>
             <Button variant="outline" className="mt-4" onClick={() => qc.invalidateQueries({ queryKey: ['admin-submissions'] })}>
                Retry Connection
             </Button>
          </div>
        ) : !submissions || submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-brand-mist px-8 text-center">
             <Mail size={48} className="mb-4 opacity-20" />
             <p className="font-bold">No submissions found.</p>
             <p className="text-xs">Incoming messages will appear here.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-fog border-b border-brand-border-strong">
                <th className="px-8 py-4 text-[11px] font-bold text-brand-mist uppercase tracking-widest">Type</th>
                <th className="px-8 py-4 text-[11px] font-bold text-brand-mist uppercase tracking-widest">Details</th>
                <th className="px-8 py-4 text-[11px] font-bold text-brand-mist uppercase tracking-widest">Date</th>
                <th className="px-8 py-4 text-[11px] font-bold text-brand-mist uppercase tracking-widest">Status</th>
                <th className="px-8 py-4 text-[11px] font-bold text-brand-mist uppercase tracking-widest text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s: any) => (
                <tr key={s.id} className="border-b border-brand-border last:border-0 hover:bg-brand-fog/50 transition-all group">
                  <td className="px-8 py-6 align-top">
                    {s.submission_type === 'contact' ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-[10px] font-bold uppercase tracking-wider border border-blue-100">
                        <Mail size={12} /> Contact
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-purple-50 text-purple-700 rounded-md text-[10px] font-bold uppercase tracking-wider border border-purple-100">
                        <Briefcase size={12} /> Career
                      </span>
                    )}
                  </td>
                  <td className="px-8 py-6">
                    <div className="space-y-1">
                      <div className="font-bold text-brand-ink text-sm flex items-center gap-2">
                        {s.payload.name} 
                        <span className="text-xs font-medium text-brand-slate">&lt;{s.payload.email}&gt;</span>
                      </div>
                      <div className="text-xs text-brand-slate font-medium line-clamp-1 italic">
                        {s.submission_type === 'career' ? `Applied for: ${s.payload.job_title}` : s.payload.subject}
                      </div>
                      <div className="mt-2 p-3 bg-brand-fog rounded-xl text-xs text-brand-ink leading-relaxed max-w-md">
                        {s.submission_type === 'career' ? s.payload.summary : s.payload.message}
                      </div>
                      {s.payload.portfolio && (
                         <a href={s.payload.portfolio} target="_blank" className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-forest hover:underline mt-2">
                            <ExternalLink size={10} /> View Portfolio/CV
                         </a>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-6 align-top">
                    <div className="text-[12px] font-medium text-brand-slate flex items-center gap-1.5">
                      <Clock size={12} className="text-brand-mist" />
                      {formatDate(s.created_at)}
                    </div>
                  </td>
                  <td className="px-8 py-6 align-top">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      s.status === 'pending' ? 'bg-brand-amber/10 text-brand-amber' : 'bg-brand-forest/10 text-brand-forest'
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-8 py-6 align-top text-right">
                    {s.status === 'pending' ? (
                      <button 
                        onClick={() => updateStatus(s.id, 'reviewed')}
                        className="p-2 text-brand-mist hover:text-brand-forest transition-colors bg-brand-fog rounded-lg"
                        title="Mark as Reviewed"
                      >
                        <CheckCircle size={18} />
                      </button>
                    ) : (
                      <button 
                         onClick={() => updateStatus(s.id, 'pending')}
                         className="p-2 text-brand-mist hover:text-brand-slate transition-colors bg-brand-fog rounded-lg"
                         title="Mark as Pending"
                      >
                         <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FilterBtn({ active, onClick, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
        active ? 'bg-brand-ink text-white shadow-sm' : 'text-brand-slate hover:bg-brand-fog'
      }`}
    >
      {label}
    </button>
  );
}
