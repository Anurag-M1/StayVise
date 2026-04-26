import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { useMyProfile, useProjects, useStats, useActivity, usePaymentStats, usePaymentHistory } from '../lib/queries';
import { TrustScoreBadge } from '../components/ui/TrustScoreBadge';
import SEO from '../components/SEO';
import { Button } from '../components/ui/Button';
import { exportLedgerPdf } from '../lib/pdf';
import { fmtINR } from '../lib/currency';
import { 
  ArrowRight, ShieldCheck, Wallet, ChevronDown, Check, 
  Clock, FileText, Zap, RotateCcw, Landmark
} from 'lucide-react';
import type { Project, User } from '../lib/types';

export default function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  
  // Data Fetching
  const { data: profile } = useMyProfile();
  const { data: stats } = useStats();
  const { data: projects } = useProjects('awaiting_payment,in_progress,disputed');
  const { data: activityData } = useActivity(4);
  const { data: paymentStats } = usePaymentStats();
  const { data: paymentHistory } = usePaymentHistory({ skip: 0, limit: 50 });
  
  // State
  const [financialsOpen, setFinancialsOpen] = useState(false);

  const currentUser = profile ?? user;
  const userRole = currentUser?.role ?? 'freelancer';
  const isFreelancer = userRole === 'freelancer';
  const firstName = (currentUser?.full_name || 'User').split(' ')[0];
  const trustScore = profile?.trust_score?.score || 0;
  const trustTier = getTrustTier(trustScore);
  
  const activeCount = stats?.active_projects || projects?.length || 0;
  const escrowBal = stats?.escrow_balance || 0;
  const pendingActions = stats?.pending_actions || 0;
  const totalEarned = stats?.total_earned || paymentStats?.total_received || stats?.total_released || 0;
  const totalSpent = stats?.total_spent || 0;
  const totalProjects = stats?.total_projects || profile?.trust_score?.total_projects || projects?.length || 0;
  const completedProjects = profile?.trust_score?.completed_projects || 0;
  const awaitingFundingCount = projects?.filter((project) => project.status === 'awaiting_payment').length || 0;
  const disputedCount = projects?.filter((project) => project.status === 'disputed').length || 0;
  const needsAttentionCount = pendingActions + disputedCount + (!isFreelancer ? awaitingFundingCount : 0);
  const primaryAttentionProject = projects?.find((project) => project.status === 'disputed')
    || projects?.find((project) => project.status === 'awaiting_payment')
    || projects?.find((project) => project.status === 'in_progress');
  const primaryAttentionPath = primaryAttentionProject ? `/projects/${primaryAttentionProject.id}` : '/payments';
  const estimatedFees = isFreelancer ? Number((totalEarned * 0.02).toFixed(2)) : 0;
  const liveLedgerRows = (paymentHistory || []).slice(0, 5);
  const financialHighlights = [
    { label: 'Lifetime earned', value: totalEarned, tone: 'text-brand-forest' },
    { label: 'Lifetime spent', value: totalSpent, tone: 'text-brand-ink' },
    { label: 'Protected in escrow', value: escrowBal, tone: 'text-brand-slate' },
    { label: 'Estimated fees', value: estimatedFees, tone: 'text-brand-mist' },
  ];

  const snapshotBars = [
    { label: 'Earned', value: totalEarned },
    { label: 'Spent', value: totalSpent },
    { label: 'Escrow', value: escrowBal },
    { label: 'Actions', value: needsAttentionCount },
  ];
  const maxSnapshotValue = Math.max(...snapshotBars.map((bar) => bar.value), 1);

  // Header Subtitle Logic
  let subtitle = isFreelancer
    ? 'Create your first project and start getting paid safely.'
    : 'Start your first project and protect payments in escrow.';
  if (pendingActions > 0) {
    subtitle = isFreelancer
      ? `${pendingActions} milestone${pendingActions > 1 ? 's are' : ' is'} ready for your submission`
      : `${pendingActions} milestone${pendingActions > 1 ? 's' : ''} waiting for your approval`;
  } else if (awaitingFundingCount > 0) {
    subtitle = isFreelancer
      ? `${awaitingFundingCount} project${awaitingFundingCount > 1 ? 's are' : ' is'} waiting for client funding`
      : `${awaitingFundingCount} project${awaitingFundingCount > 1 ? 's are' : ' is'} ready for secure funding`;
  } else if (activeCount > 0) {
    subtitle = `You have ${activeCount} active project${activeCount > 1 ? 's' : ''} · ₹${fmtINR(escrowBal)} in escrow`;
  }

  const activities = (Array.isArray(activityData) ? activityData : []).map((act) => {
    const isFunded = act?.type === 'payment_funded';
    const isSent = act?.type === 'payment_sent' || act?.type === 'payment_received';
    const isRefund = act?.type === 'refund';

    return {
       id: act?.id || Math.random().toString(),
       text: act?.description || 'Recent activity pulse',
       time: formatRelativeDate(act?.created_at || new Date().toISOString()),
       icon: isFunded ? Wallet : isSent ? Zap : isRefund ? RotateCcw : Clock,
       color: isFunded ? 'text-brand-amber' : isSent ? 'text-brand-forest' : isRefund ? 'text-brand-danger' : 'text-brand-mist',
       bg: isFunded ? 'bg-brand-amber/10' : isSent ? 'bg-brand-forest-light' : isRefund ? 'bg-brand-danger/10' : 'bg-brand-fog',
       dot: isFunded ? 'bg-brand-amber' : isSent ? 'bg-brand-forest' : isRefund ? 'bg-brand-danger' : 'bg-brand-mist',
    };
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <SEO 
        title="Dashboard"
        description="Manage your secure escrow projects, track milestones, and view your financial overview on StayVise."
      />
      
      {/* SECTION 1: Welcome Header */}
      <div>
        <h1 className="font-display text-[28px] md:text-3xl font-bold text-brand-ink mb-1.5 tracking-tight flex items-center gap-3">
          Good morning, {firstName}
          {(currentUser?.billing_plan === 'premium' || currentUser?.billing_plan === 'pro') && (
            <span className="bg-brand-forest text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-sm">Pro</span>
          )}
        </h1>
        <p className="text-brand-slate text-[15px] cursor-pointer hover:text-brand-ink transition-colors flex items-center md:inline-flex">
          {subtitle} {pendingActions > 0 && <span className="ml-1 text-brand-amber font-semibold">View</span>}
          <span className="mx-2 text-brand-border-strong">|</span>
          <span className="font-mono text-[13px] font-bold text-brand-forest tracking-widest uppercase">ID: {currentUser?.unique_id}</span>
        </p>
      </div>

      {/* SECTION 2: Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* Card 1: Trust Score */}
        <div className="bg-brand-white p-5 rounded-2xl border border-brand-border-strong shadow-card flex flex-col justify-between group">
           <div className="flex items-center gap-3 mb-2 shrink-0">
               <TrustScoreBadge score={trustScore} size="md" animate={true} />
             <div className="flex flex-col">
               <span className="font-display font-bold text-[22px] leading-none text-brand-ink">{trustScore}</span>
               <span className="text-[11px] font-bold text-brand-gold uppercase tracking-wider">{trustTier}</span>
             </div>
           </div>
           <div className="text-[12px] font-semibold text-brand-forest group-hover:translate-x-0.5 transition-transform">
             {completedProjects} completed project{completedProjects === 1 ? '' : 's'}
           </div>
        </div>

        {/* Card 2: In Escrow */}
        <div className="bg-brand-white p-5 rounded-2xl border border-brand-border-strong shadow-card flex flex-col justify-between">
           <span className="text-[13px] font-semibold text-brand-slate uppercase tracking-wider mb-2">Held in escrow</span>
           <span className="font-mono text-2xl font-bold text-brand-ink mb-1 tracking-tight">₹{fmtINR(escrowBal)}</span>
           <span className="text-[12px] text-brand-mist font-medium">Across {activeCount} projects</span>
        </div>

        {/* Card 3: Total Earned */}
        <div className="bg-brand-white p-5 rounded-2xl border border-brand-border-strong shadow-card flex flex-col justify-between relative overflow-hidden">
           <span className="text-[13px] font-semibold text-brand-slate uppercase tracking-wider mb-2">{isFreelancer ? 'Total earning' : 'Total spent'}</span>
           <span className="font-mono text-2xl font-bold text-brand-ink mb-1 tracking-tight">₹{fmtINR((isFreelancer ? totalEarned : totalSpent) || 0)}</span>
           <span className="text-[12px] text-brand-mist font-medium">Lifetime · {totalProjects} projects</span>
           
           <div className="absolute right-4 bottom-4 flex items-end gap-1 opacity-70">
             {(Array.isArray(snapshotBars) ? snapshotBars : []).map((bar, i) => (
                <div
                  key={bar.label}
                  className={`w-1.5 rounded-t-sm ${i === 0 ? 'bg-brand-forest' : i === 1 ? 'bg-brand-ink' : i === 2 ? 'bg-brand-amber' : 'bg-brand-mist'}`}
                  style={{ height: `${Math.max((bar.value / maxSnapshotValue) * 30, 8)}px` }}
                />
             ))}
           </div>
        </div>

        {/* Card 4: Pending Action */}
        <div className={`p-5 rounded-2xl border shadow-card flex flex-col justify-between transition-colors ${needsAttentionCount > 0 ? 'bg-brand-amber border-brand-amber text-white' : 'bg-brand-white border-brand-border-strong'}`}>
           <span className={`text-[13px] font-semibold uppercase tracking-wider mb-2 ${needsAttentionCount > 0 ? 'text-white/90' : 'text-brand-slate'}`}>
             Needs attention
           </span>
           <span className={`text-[18px] md:text-xl font-bold leading-tight mb-1 ${needsAttentionCount > 0 ? 'text-white' : 'text-brand-ink'}`}>
             {needsAttentionCount > 0 ? `${needsAttentionCount} live item${needsAttentionCount > 1 ? 's' : ''} to review` : 'All clear ✓'}
           </span>
           <button
             onClick={() => navigate(needsAttentionCount > 0 ? primaryAttentionPath : '/payments')}
             className={`text-[12px] font-bold text-left group flex items-center gap-1 w-max ${needsAttentionCount > 0 ? 'text-white' : 'text-brand-mist'}`}
           >
             {needsAttentionCount > 0 ? 'Review live updates' : 'Nothing pending'}
             {needsAttentionCount > 0 && <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />}
           </button>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* SECTION 3: Active Projects (Col Span 2) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4">
               <h2 className="font-display text-xl font-bold text-brand-ink">Active projects</h2>
               <button className="text-[13px] font-semibold text-brand-forest hover:underline">View all</button>
            </div>
            <Button size="sm" onClick={() => navigate('/projects/create')}>{isFreelancer ? 'New project' : 'Start project'}</Button>
          </div>
          {!isFreelancer && (
            <p className="text-[13px] text-brand-slate -mt-2 mb-2">
              Client tools focus on funding, approvals, and disputes. Freelancer tools focus on delivery and payouts.
            </p>
          )}

          <div className="space-y-3">
             {(!Array.isArray(projects) || projects.length === 0) ? (
               <div className="border border-brand-border border-dashed rounded-2xl py-12 flex flex-col items-center justify-center text-center px-4 bg-brand-white/50">
                  <ShieldCheck className="w-12 h-12 text-brand-forest/30 mb-4" strokeWidth={1.5} />
                  <h3 className="font-display font-semibold text-brand-ink text-lg mb-1">No active projects</h3>
                  <p className="text-brand-slate text-sm mb-6 max-w-sm">Start a project and hold funds securely in escrow to guarantee payment.</p>
                  <Button onClick={() => navigate('/projects/create')}>Create project</Button>
               </div>
             ) : (
                projects.map((proj) => <ProjectCard key={proj.id} project={proj} user={currentUser} />)
             )}
          </div>
        </div>

        {/* SECTION 4: Recent Activity (Col Span 1) */}
        <div className="space-y-4">
          <h2 className="font-display text-xl font-bold text-brand-ink mb-2">Recent activity</h2>
          
          <div className="bg-brand-white border border-brand-border-strong rounded-2xl p-5 shadow-sm">
             <div className="relative border-l-2 border-brand-border ml-3 space-y-6 pb-2">
                {activities.length > 0 ? activities.map((act) => (
                  <div key={act.id} className="relative pl-6 group cursor-pointer">
                     {/* Left indicator overrides */}
                     <div className="absolute top-1 -left-[9px] w-4 h-4 rounded-full bg-brand-white border-2 border-brand-fog flex items-center justify-center shadow-sm">
                       <span className={`w-2 h-2 rounded-full ${act.dot}`} />
                     </div>
                     
                     <div className="flex gap-3 items-start">
                        <div className={`w-8 h-8 rounded-full ${act.bg} ${act.color} flex items-center justify-center shrink-0 shadow-sm`}>
                          <act.icon size={16} strokeWidth={2.5} />
                        </div>
                        <div className="flex-1 min-w-0 pt-1">
                          <p className="text-[13px] font-semibold text-brand-ink group-hover:text-brand-forest transition-colors leading-snug">{act.text}</p>
                          <span className="text-[11px] text-brand-mist font-medium mt-0.5 block">{act.time}</span>
                        </div>
                     </div>
                  </div>
                )) : (
                  <div className="pl-6 text-[13px] text-brand-slate">
                    Your latest project and payment activity will appear here once work begins.
                  </div>
                )}
             </div>
             
             <button className="w-full mt-4 py-2 border border-brand-border-strong rounded-lg text-[13px] font-semibold text-brand-slate hover:bg-brand-fog transition-colors">
               Load more
             </button>
          </div>
        </div>
      </div>

      {/* SECTION 5: Financial Summary */}
      <div className="w-full mt-2">
        <div className="bg-brand-white border border-brand-border-strong rounded-[2rem] shadow-sm overflow-hidden">
          <div
            className="w-full flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-6 md:p-8 text-left group"
          >
            <div 
              className="cursor-pointer flex-1"
              onClick={() => setFinancialsOpen(!financialsOpen)}
            >
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-xl text-brand-ink group-hover:text-brand-forest transition-colors">Financial summary</h3>
                <ChevronDown className={`w-5 h-5 text-brand-slate transition-transform duration-300 ${financialsOpen ? 'rotate-180' : ''}`} />
              </div>
              <p className="text-sm text-brand-slate mt-2">
                Live ledger and history snapshot synced every 5 seconds across earnings, spend, escrow, and review items.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                className="border-brand-border-strong text-brand-ink"
                onClick={(event) => {
                  event.stopPropagation();
                  exportLedgerPdf(paymentHistory || [], 'StayVise Financial Summary');
                }}
              >
                <FileText size={16} className="mr-2" /> Export PDF
              </Button>
              <Button
                variant="outline"
                className="border-brand-border-strong text-brand-ink"
                onClick={(event) => {
                  event.stopPropagation();
                  navigate('/payments');
                }}
              >
                <Landmark size={16} className="mr-2" /> Open ledger
              </Button>
            </div>
          </div>

          {financialsOpen && (
            <div className="border-t border-brand-border-strong p-6 md:p-8 animate-in slide-in-from-top-4 duration-300 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {(financialHighlights || []).map((item) => (
                  <div key={item.label} className="rounded-3xl border border-brand-border-strong bg-brand-fog/40 p-5">
                    <span className="text-[10px] font-bold text-brand-mist uppercase tracking-widest block mb-2">{item.label}</span>
                    <span className={`font-mono text-2xl font-bold ${item.tone}`}>₹{fmtINR(item.value)}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_0.8fr] gap-6">
                <div className="rounded-[1.75rem] border border-brand-border-strong p-5 md:p-6 bg-brand-white">
                  <div className="flex items-center justify-between mb-5 gap-4">
                    <div>
                      <h4 className="font-display font-bold text-lg text-brand-ink">Live ledger history</h4>
                      <p className="text-sm text-brand-slate">Recent verified ledger movement from your real payment history, kept in sync with the backend.</p>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-brand-forest bg-brand-forest-light px-3 py-1 rounded-full">
                      Auto sync on
                    </span>
                  </div>
                  <div className="space-y-3">
                    {(Array.isArray(liveLedgerRows) && liveLedgerRows.length > 0) ? liveLedgerRows.map((entry: any) => (
                      <div key={entry.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-[1.25rem] border border-brand-border-strong bg-brand-fog/40 px-4 py-4">
                        <div>
                          <div className="text-sm font-bold text-brand-ink">{entry.project_title}</div>
                          <div className="text-[12px] text-brand-slate">
                            {entry.milestone_title || 'Across project'} · {entry.transaction_type.replace('_', ' ')}
                          </div>
                        </div>
                        <div className="sm:text-right">
                          <div className={`font-mono text-sm font-bold ${entry.transaction_type === 'milestone_release' || entry.transaction_type === 'refund' ? 'text-brand-forest' : 'text-brand-ink'}`}>
                            ₹{fmtINR(Number(entry.amount))}
                          </div>
                          <div className="text-[11px] font-bold uppercase tracking-widest text-brand-mist">
                            {entry.is_audit_verified ? 'Verified entry' : 'Legacy entry'}
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-[1.25rem] border border-dashed border-brand-border-strong px-4 py-8 text-sm text-brand-slate">
                        Your latest funded, released, and refunded ledger rows will appear here automatically.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-brand-border-strong p-5 md:p-6 bg-brand-ink text-white space-y-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">Live monitor</p>
                    <h4 className="font-display font-bold text-xl mt-2">What changes first</h4>
                  </div>
                  <div className="space-y-3">
                    <RealtimeRow label="Protected balance" value={`₹${fmtINR(escrowBal)}`} />
                    <RealtimeRow label="Needs attention" value={`${needsAttentionCount || 0}`} />
                    <RealtimeRow label="Ledger entries" value={`${paymentStats?.transaction_count || paymentHistory?.length || 0}`} />
                    <RealtimeRow label="Verified rows" value={`${paymentStats?.verified_entries || 0}`} />
                    <RealtimeRow label="Released milestones" value={`${completedProjects || 0}`} />
                  </div>
                  <p className="text-sm text-white/70">
                    Exports use the same live ledger rows you see in the payments screen, so PDF statements stay in sync with the dashboard.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}


function ProjectCard({ project, user }: { project: Project, user: User | null }) {
  const navigate = useNavigate();
  const isFreelancer = user?.role === 'freelancer';
  
  // Status Maps
  const statusColors: Record<string, string> = {
    'awaiting_payment': 'border-brand-amber',
    'in_progress': 'border-blue-500',
    'disputed': 'border-brand-danger',
  };
  
  const statusLabels: Record<string, { label: string; bg: string }> = {
    'awaiting_payment': { label: 'Awaiting Escrow', bg: 'bg-brand-amber' },
    'open': { label: 'Marketplace Open', bg: 'bg-brand-forest-light' },
    'in_progress': { label: 'In Progress', bg: 'bg-blue-500' },
    'disputed': { label: 'Disputed', bg: 'bg-brand-danger' },
  };

  const statusConfig = statusLabels[project.status] || { label: project.status.replace('_', ' '), bg: 'bg-gray-400' };
  const leftBorderColor = statusColors[project.status] || 'border-gray-400';

  let actionBtn: React.ReactNode = null;
  if (project.status === 'awaiting_payment') {
     actionBtn = (
       <button
         onClick={() => {
           if (!isFreelancer) {
             navigate(`/pay/${project.id}`);
           }
         }}
         className="px-3 py-1.5 rounded-lg bg-brand-amber/10 text-brand-amber text-[12px] font-bold hover:bg-brand-amber/20 transition-colors"
       >
         {isFreelancer ? 'Waiting for client funding' : 'Fund project securely'}
       </button>
     );
  } else if (project.status === 'open') {
     actionBtn = <button className="px-3 py-1.5 rounded-lg bg-brand-forest-light text-brand-forest text-[12px] font-bold hover:bg-brand-forest/10 transition-colors">{isFreelancer ? 'Wait for client to hire' : 'Review applicants'}</button>;
  } else if (project.status === 'in_progress') {
     actionBtn = <button className="px-3 py-1.5 rounded-lg bg-brand-forest text-brand-white text-[12px] font-bold shadow-sm hover:brightness-110 transition-all">{isFreelancer ? 'View delivery queue' : 'Review progress'}</button>;
  } else if (project.status === 'disputed') {
     actionBtn = <button className="px-3 py-1.5 rounded-lg border border-brand-danger text-brand-danger text-[12px] font-bold hover:bg-brand-danger-light transition-colors">View dispute</button>;
  }

  // Counterparty mapping
  const cpName = isFreelancer ? project.client?.full_name : project.freelancer?.full_name;
  const cpInitials = cpName ? cpName.substring(0,2).toUpperCase() : '??';

  return (
    <div 
      onClick={() => navigate(`/projects/${project.id}`)}
      className={`relative bg-brand-white rounded-xl shadow-sm border border-brand-border-strong hover:shadow-md hover:border-brand-border transition-all cursor-pointer overflow-hidden p-5 flex flex-col justify-between pl-6 border-l-[4px] ${leftBorderColor}`}
    >
      
      {/* Top Row */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="font-body text-[15px] font-semibold text-brand-ink mb-1 truncate max-w-[200px] sm:max-w-xs">{project.title}</h3>
          <div className="flex items-center gap-2">
             <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-white uppercase tracking-wider ${statusConfig.bg}`}>
                {statusConfig.label}
             </span>
             <span className="font-mono text-[14px] font-bold text-brand-ink">₹{fmtINR(project.total_amount)}</span>
          </div>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-mist shrink-0">
          {isFreelancer ? 'Freelancer view' : 'Client view'}
        </span>
      </div>

      {/* Counterparty Row */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded-full bg-brand-fog text-brand-slate text-[10px] font-bold flex items-center justify-center shrink-0">{cpInitials}</div>
        <span className="text-[13px] text-brand-slate">with {cpName || 'Unknown'}</span>
        {((isFreelancer ? project.client : project.freelancer)?.is_verified) && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-brand-forest bg-brand-forest-light px-2 py-1 rounded-full">
            Verified
          </span>
        )}
      </div>

      {/* Bottom Action Row */}
      <div className="flex items-center justify-between border-t border-brand-border-strong pt-3">
        <div className="flex items-center gap-2 text-[12px] text-brand-mist font-medium">
           <Clock size={14} />
           <span>{getProjectNextStep(project.status, isFreelancer)}</span>
        </div>
        <div onClick={e => e.stopPropagation() /* Prevent card click when clicking action */}>
          {actionBtn}
        </div>
      </div>

    </div>
  )
}

function getProjectNextStep(status: Project['status'], isFreelancer: boolean) {
  if (status === 'awaiting_payment') {
    return isFreelancer ? 'Next: client funds escrow' : 'Next: review and fund';
  }
  if (status === 'disputed') {
    return 'Next: share evidence with support';
  }
  return isFreelancer ? 'Next: submit the next milestone' : 'Next: review submitted work';
}

function formatRelativeDate(value: string) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return 'Recently';
  }

  const diffMs = Date.now() - timestamp;
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) {
    return 'Just now';
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function getTrustTier(score: number) {
  if (score >= 90) return 'Elite';
  if (score >= 75) return 'Trusted';
  if (score >= 60) return 'Established';
  return 'Growing';
}

function RealtimeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
      <span className="text-sm text-white/70">{label}</span>
      <span className="font-mono font-bold text-white">{value}</span>
    </div>
  );
}
