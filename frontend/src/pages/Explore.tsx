import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { ShieldCheck, ArrowRight, Wallet, Clock, Search, Filter } from 'lucide-react';
import { TrustScoreBadge } from '../components/ui/TrustScoreBadge';
import type { ProjectListItem } from '../lib/types';
import { fmtINR } from '../lib/currency';
import SEO from '../components/SEO';
import Breadcrumbs from '../components/Breadcrumbs';

export default function Explore() {
  const navigate = useNavigate();
  const [search, setSearch] = React.useState('');
  
  const { data: projects, isLoading } = useQuery({
    queryKey: ['marketplace-explore', search],
    queryFn: () => api.get('/projects/marketplace/explore', { params: { q: search || undefined } }).then(r => r.data)
  });

  return (
    <main className="max-w-[1280px] mx-auto py-12 px-6 animate-in fade-in duration-500 pb-24">
      <SEO 
        title="Escrow Marketplace"
        description="Browse and apply for verified escrow-protected freelance projects. Work with confidence knowing your payments are secure with StayVise."
      />
      
      <Breadcrumbs 
        items={[{ label: 'Explore Marketplace' }]}
      />
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <div>
          <h1 className="font-display font-bold text-4xl text-brand-ink mb-3 tracking-tight">Marketplace</h1>
          <p className="text-brand-slate text-lg font-medium">Browse verified escrow projects and secure your next gig.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
           <div className="relative flex-1 md:w-64">
             <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-mist" />
             <input 
               type="text" 
               placeholder="Search gigs..." 
               value={search}
               onChange={e => setSearch(e.target.value)}
               className="w-full pl-10 pr-4 py-2 bg-brand-white border border-brand-border-strong rounded-xl text-sm focus:ring-2 focus:ring-brand-forest/20 outline-none transition-all"
             />
           </div>
           <Button variant="outline" className="h-10 gap-2 border-brand-border-strong">
             <Filter size={16} /> Filter
           </Button>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {[1,2,3,4,5,6].map(i => (
             <div key={i} className="h-64 bg-brand-fog animate-pulse rounded-2xl border border-brand-border-strong" />
           ))}
        </div>
      ) : (!projects?.items || projects.items.length === 0) ? (
        <div className="py-24 text-center border-2 border-dashed border-brand-border rounded-3xl bg-brand-white">
           <div className="w-16 h-16 bg-brand-fog rounded-full flex items-center justify-center mx-auto mb-4 text-brand-mist">
             <Search size={32} />
           </div>
           <h3 className="font-display font-bold text-xl text-brand-ink mb-1">No open projects found</h3>
           <p className="text-brand-slate">Check back soon for new escrow-verified opportunities.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.items.map((project: ProjectListItem) => (
            <MarketplaceCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {/* Trust Banner */}
      <div className="mt-20 p-8 rounded-[2.5rem] bg-brand-ink text-white relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8">
         <div className="relative z-10 text-center md:text-left">
            <h2 className="font-display font-bold text-2xl mb-2">Work with 100% Payment Guarantee</h2>
            <p className="text-white/70 max-w-md">Every project on this marketplace is backed by StayVise Escrow. No money moves until you deliver.</p>
         </div>
         <div className="flex gap-4 relative z-10 shrink-0">
            <div className="flex flex-col items-center">
               <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-2">
                  <ShieldCheck size={24} className="text-brand-forest" />
               </div>
               <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Secure</span>
            </div>
            <div className="w-px h-12 bg-white/10" />
            <div className="flex flex-col items-center">
               <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-2">
                  <Wallet size={24} className="text-brand-amber" />
               </div>
               <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Funded</span>
            </div>
         </div>
         {/* Background pattern */}
         <div className="absolute top-0 right-0 w-64 h-64 bg-brand-forest/20 blur-[100px] rounded-full -mr-32 -mt-32" />
      </div>

    </main>
  );
}

function MarketplaceCard({ project }: { project: ProjectListItem }) {
  const navigate = useNavigate();
  const cpName = project.client?.full_name || 'Verified Client';
  const cpInitials = cpName.substring(0, 2).toUpperCase();

  return (
    <div 
      onClick={() => navigate(`/projects/${project.id}`)}
      className="group bg-brand-white border border-brand-border-strong rounded-2xl p-6 shadow-sm hover:shadow-float hover:border-brand-border transition-all cursor-pointer flex flex-col justify-between h-full"
    >
       <div>
          <div className="flex justify-between items-start mb-4">
             <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-brand-fog text-brand-slate text-[11px] font-bold flex items-center justify-center border border-brand-border-strong">
                   {cpInitials}
                </div>
                <div className="flex flex-col">
                   <span className="text-[13px] font-bold text-brand-ink leading-tight">{cpName}</span>
                   <div className="flex items-center gap-1">
                      <TrustScoreBadge score={project.client?.is_verified ? 100 : 50} size="xs" animate={false} />
                      <span className="text-[10px] font-bold text-brand-mist uppercase tracking-tighter">Verified</span>
                   </div>
                </div>
             </div>
             <div className="text-right">
                <div className="font-mono font-bold text-brand-ink text-sm">₹{fmtINR(project.total_amount)}</div>
                <div className="text-[10px] font-bold text-brand-forest uppercase tracking-widest mt-0.5">Escrow Ready</div>
             </div>
          </div>

          <h3 className="font-display font-bold text-lg text-brand-ink mb-2 group-hover:text-brand-forest transition-colors leading-snug">
            {project.title}
          </h3>
          <p className="text-[13px] text-brand-slate line-clamp-2 mb-6">
            Help with {project.title}. Milestone-based payments guaranteed via StayVise.
          </p>
       </div>

       <div className="flex items-center justify-between pt-6 border-t border-brand-border-strong">
          <div className="flex items-center gap-2 text-[12px] text-brand-mist font-medium">
             <Clock size={14} />
             <span>{formatDate(project.created_at)}</span>
          </div>
          <Button 
            variant="ghost" 
            className="text-brand-forest hover:bg-brand-forest-light font-bold text-[13px] h-9 gap-2 group/btn"
          >
             Apply Now <ArrowRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
          </Button>
       </div>
    </div>
  );
}

function formatDate(dateStr: string | Date) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
