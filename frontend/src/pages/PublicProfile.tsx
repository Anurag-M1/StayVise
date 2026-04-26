import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePublicProfile } from '../lib/queries';
import { 
  ShieldCheck, CheckCircle2, Award, Zap, Share2,
  Clock, CheckCircle, ChevronDown, HelpCircle, ArrowRight, Globe, Link as LinkIcon, Edit3
} from 'lucide-react';
import { StatusBadge } from '../components/ui/StatusBadge';
import { fmtINR } from '../lib/currency';
import { TrustScoreBadge } from '../components/ui/TrustScoreBadge';
import SEO from '../components/SEO';
import { Button } from '../components/ui/Button';
import { useAuthStore } from '../stores/auth';
import type { PublicProfile, RecentProject } from '../lib/types';
import { format } from 'date-fns';

export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [shareOpen, setShareOpen] = useState(false);
  const [accordionOpen, setAccordionOpen] = useState(true);

  const { data: profile, isLoading } = usePublicProfile(id || '');
  const { user: currentUser } = useAuthStore();
  const isOwner = currentUser?.id === profile?.id || currentUser?.username === profile?.username;

  if (isLoading || !profile) {
    return (
      <div className="min-h-screen bg-brand-fog animate-pulse">
        <div className="h-[240px] bg-brand-border-strong opacity-20" />
        <div className="max-w-[480px] mx-auto -mt-20">
           <div className="h-64 bg-white rounded-3xl" />
        </div>
      </div>
    );
  }

  const initials = profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase();
  const score = profile.trust_score?.score || 0;
  const isVerified = profile.badges.includes('✅ Verified Pro');

  return (
    <div className="min-h-screen bg-brand-fog pb-32">
      <SEO 
        title={`${profile.full_name} (@${profile.username || profile.unique_id})`}
        description={`View ${profile.full_name}'s public profile on StayVise. Verified professional with a Trust Score of ${profile.trust_score?.score || 0}.`}
      />
      
      {/* 1. HERO SECTION */}
      <div className="relative h-[240px] md:h-[280px] bg-brand-forest overflow-hidden">
        {/* Background Texture/Pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
           <div className="absolute top-10 right-10 w-64 h-64 border-[40px] border-white rounded-full opacity-20" />
           <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-white rounded-full opacity-10" />
        </div>

        <div className="max-w-[1100px] mx-auto h-full px-6 flex flex-col items-center justify-center text-center pt-8">
           {/* Avatar */}
           {profile.avatar_url ? (
             <img src={profile.avatar_url} alt={profile.full_name} className="w-20 h-20 md:w-24 md:h-24 object-cover bg-brand-white rounded-full border-4 border-brand-white/20 flex items-center justify-center mb-4 shadow-xl" />
           ) : (
             <div className="w-20 h-20 md:w-24 md:h-24 bg-brand-white rounded-full border-4 border-brand-white/20 flex items-center justify-center mb-4 shadow-xl">
                <span className="font-display font-bold text-3xl md:text-4xl text-brand-forest">{initials}</span>
             </div>
           )}
           
           <div className="flex items-center gap-3 mb-1">
              <h1 className="font-display font-bold text-2xl md:text-3xl text-white">{profile.full_name}</h1>
           </div>

           {profile.badges && profile.badges.length > 0 && (
             <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
               {profile.badges.map((badge: string) => (
                 <span key={badge} className="bg-brand-white text-brand-forest text-[10px] font-bold py-1 px-3 rounded-full flex items-center gap-1 shadow-lg">
                    <CheckCircle2 size={12} fill="currentColor" className="text-white"/> {badge}
                 </span>
               ))}
             </div>
           )}
           
           <p className="text-white/80 font-medium text-sm md:text-[15px] mb-1">
              ID: <span className="font-mono text-white tracking-widest">{profile.unique_id}</span>
           </p>

           <p className="text-white/60 font-medium text-sm md:text-[13px]">
              {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)} · StayVise since {format(new Date(profile.created_at), 'MMM yyyy')}
           </p>

           {/* Share & Edit Buttons */}
           <div className="absolute top-6 right-6 flex items-center gap-3">
              {isOwner && (
                <Link to="/settings">
                  <button className="w-10 h-10 border border-white/20 rounded-full flex items-center justify-center text-white bg-white/5 hover:bg-white/10 transition-all tooltip" title="Edit Profile">
                    <Edit3 size={18} />
                  </button>
                </Link>
              )}
              <button 
                onClick={() => setShareOpen(!shareOpen)}
                className="w-10 h-10 border border-white/20 rounded-full flex items-center justify-center text-white bg-white/5 hover:bg-white/10 transition-all"
              >
                 <Share2 size={18} />
              </button>
              {shareOpen && (
                 <div className="absolute right-0 top-12 w-56 bg-white rounded-2xl shadow-2xl border border-brand-border-strong py-2 z-50 animate-in zoom-in-95 origin-top-right">
                    <ShareOption icon={<CheckCircle size={14}/>} label="Copy profile link" />
                    <ShareOption icon={<Globe size={14}/>} label="Open public link" />
                    <ShareOption icon={<LinkIcon size={14}/>} label="Copy profile link" />
                    <div className="h-px bg-brand-border-strong my-1" />
                    <ShareOption icon={<ShieldCheck size={14}/>} label="Download trust card" color="text-brand-forest" />
                 </div>
              )}
           </div>
        </div>
      </div>

      {/* 2. TRUST SCORE CARD */}
      <div className="max-w-[480px] mx-auto px-6 -mt-16 md:-mt-20 relative z-10">
         <div className="bg-brand-white rounded-[2.5rem] p-8 md:p-10 shadow-float border border-brand-border-strong text-center">
            
            <div className="flex flex-col items-center mb-10">
               <TrustScoreBadge score={score} size="xl" animate />
               <p className="mt-4 font-display font-bold text-lg text-brand-ink">
                  {score >= 90 ? 'Master Artisan' : score >= 70 ? 'Verified Expert' : score >= 50 ? 'Established Pro' : 'New Member'}
               </p>
               <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {profile.badges.map(badge => (
                     <span key={badge} className="bg-brand-forest-light/60 text-brand-forest text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                        {badge.replace('✅ ', '')}
                     </span>
                  ))}
               </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 divide-x divide-y divide-brand-border-strong border border-brand-border-strong rounded-3xl overflow-hidden">
               <StatBox value={profile.trust_score?.total_projects || 0} label="Projects done" />
               <StatBox value={`₹${fmtINR(profile.total_secured_amount)}`} label="Total secured" />
               <StatBox value={profile.trust_score?.avg_delivery_days ? `${profile.trust_score.avg_delivery_days} day${profile.trust_score.avg_delivery_days === 1 ? '' : 's'}` : 'N/A'} label={profile.role === 'client' ? 'Avg approval' : 'Avg delivery'} />
               <StatBox value={`${profile.trust_score?.response_rate || 100}%`} label="Response rate" />
            </div>

            {/* BIO Section */}
            {profile.bio && (
               <div className="mt-10 text-left border-t border-brand-border-strong pt-8">
                  <h4 className="font-display font-bold text-lg mb-3">About {profile.full_name.split(' ')[0]}</h4>
                  <p className="text-brand-slate text-[15px] leading-relaxed line-clamp-3 hover:line-clamp-none transition-all cursor-pointer">
                     {profile.bio}
                  </p>
               </div>
            )}
         </div>
      </div>

      {/* 3. RECENT PROJECTS */}
      <div className="max-w-[800px] mx-auto px-6 mt-16 md:mt-24">
         <div className="flex items-center justify-between mb-8">
            <h3 className="font-display font-bold text-2xl text-brand-ink">Recent Work</h3>
            <span className="text-[12px] font-bold text-brand-mist uppercase tracking-widest flex items-center gap-2">
               Live portfolio snapshot <ShieldCheck size={14} className="text-brand-forest"/>
            </span>
         </div>

         <div className="space-y-6">
            {profile.recent_projects?.length ? profile.recent_projects.map(project => (
               <ProjectCard key={project.id} project={project} />
            )) : (
               <div className="p-12 text-center bg-white rounded-3xl border border-brand-border border-dashed">
                  <p className="text-brand-mist font-medium">History starts with the first completed project.</p>
               </div>
            )}
         </div>
      </div>

      {/* 4. SCORE EXPLANATION */}
      <div className="max-w-[800px] mx-auto px-6 mt-20">
         <div className="bg-brand-white rounded-3xl border border-brand-border-strong overflow-hidden shadow-sm">
            <button 
              onClick={() => setAccordionOpen(!accordionOpen)}
              className="w-full p-8 flex items-center justify-between bg-white hover:bg-brand-fog transition-all"
            >
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-brand-forest/10 flex items-center justify-center text-brand-forest">
                     <HelpCircle size={20} />
                  </div>
                  <h4 className="font-display font-bold text-lg text-brand-ink">How is this score calculated?</h4>
               </div>
               <ChevronDown size={20} className={`text-brand-mist transition-transform ${accordionOpen ? 'rotate-180' : ''}`} />
            </button>
            {accordionOpen && (
               <div className="p-8 pt-0 space-y-8 animate-in slide-in-from-top-4">
                  {getScoreFactors(profile).map((factor) => (
                    <ScoreFactor key={factor.label} label={factor.label} value={factor.value} reason={factor.reason} />
                  ))}
                  
                  <div className="p-6 bg-brand-fog rounded-2xl flex items-center gap-4 border border-brand-border-strong">
                     <Clock size={18} className="text-brand-mist" />
                     <p className="text-[12px] text-brand-mist font-bold uppercase tracking-wider">Recalculates as projects complete, dispute, and release</p>
                  </div>
               </div>
            )}
         </div>
      </div>

      {/* 5. STICKY CTA */}
      <div className="fixed bottom-8 inset-x-6 z-50">
         <div className="max-w-[480px] mx-auto bg-brand-white rounded-[2rem] p-4 shadow-float border-2 border-brand-forest flex items-center justify-between gap-4 animate-in slide-in-from-bottom-10 md:p-6">
            <div className="hidden sm:block">
               <p className="font-bold text-brand-ink text-[15px]">Start a project securely</p>
               <p className="text-[11px] text-brand-mist font-medium">Payment held in escrow until you approve</p>
            </div>
            <Link to="/projects/create" className="flex-1 sm:grow-0">
               <Button className="w-full h-14 px-8 bg-brand-forest text-white border-0 shadow-xl shadow-brand-forest/20 flex items-center gap-2 font-display">
                  Work with {profile.full_name.split(' ')[0]} <ArrowRight size={18}/>
               </Button>
            </Link>
         </div>
      </div>

    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatBox({ value, label }: { value: string | number, label: string }) {
  return (
    <div className="p-4 md:p-6 bg-brand-fog/20 group hover:bg-brand-white transition-all cursor-default">
       <div className="font-mono text-xl md:text-2xl font-bold text-brand-ink mb-1 group-hover:scale-110 transition-transform origin-left">{value}</div>
       <div className="text-[11px] text-brand-mist font-bold uppercase tracking-widest">{label}</div>
    </div>
  );
}

function ProjectCard({ project }: { project: RecentProject }) {
  return (
    <div className="bg-white border border-brand-border-strong rounded-3xl p-6 md:p-8 hover:shadow-xl transition-all group flex flex-col md:flex-row gap-6 md:items-center">
       <div className="p-4 bg-brand-fog rounded-2xl shrink-0 h-max w-max">
          <Award className="text-brand-forest" size={24} />
       </div>
       <div className="flex-1">
          <div className="flex items-center gap-4 mb-2">
             <span className="bg-brand-white border border-brand-border-strong text-brand-mist text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                {project.category}
             </span>
             <h4 className="font-bold text-lg text-brand-ink">{project.anonymized_title}</h4>
          </div>
          <div className="flex flex-wrap gap-y-2 gap-x-6 text-[13px] font-medium text-brand-slate">
             <span className="flex items-center gap-2"><Zap size={14} className="text-amber-500" /> {project.milestone_count} Milestones</span>
             <span className="flex items-center gap-2"><Clock size={14}/> Completed in {project.duration_days} days</span>
             <span className="text-brand-forest font-bold">Approved first submission</span>
          </div>
       </div>
       <div className="text-right border-t md:border-t-0 md:border-l border-brand-border-strong pt-4 md:pt-0 md:pl-8">
          <p className="text-[11px] font-bold text-brand-mist uppercase tracking-widest mb-1">Estimated Value</p>
          <p className="font-mono font-bold text-brand-ink text-lg">
             ₹{Math.floor(project.amount_min/1000)}K — ₹{Math.ceil(project.amount_max/1000)}K
          </p>
       </div>
    </div>
  );
}

function ScoreFactor({ label, value, reason }: { label: string, value: number, reason: string }) {
  return (
    <div className="space-y-3">
       <div className="flex justify-between items-end">
          <div>
             <p className="font-bold text-brand-ink text-sm">{label}</p>
             <p className="text-[12px] text-brand-mist font-medium">{reason}</p>
          </div>
          <span className="font-mono font-bold text-brand-forest">{value}%</span>
       </div>
       <div className="w-full h-2 bg-brand-fog rounded-full overflow-hidden">
          <div className="h-full bg-brand-forest rounded-full transition-all duration-1000" style={{ width: `${value}%` }} />
       </div>
    </div>
  );
}

function getScoreFactors(profile: PublicProfile) {
  const trustScore = profile.trust_score;
  const totalProjects = trustScore?.total_projects || 0;
  const completedProjects = trustScore?.completed_projects || 0;
  const disputedProjects = trustScore?.disputed_projects || 0;
  const completionRate = totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 100) : 0;
  const disputeHealth = totalProjects > 0 ? Math.max(0, Math.round(((totalProjects - disputedProjects) / totalProjects) * 100)) : 100;

  return [
    {
      label: 'Project completion',
      value: completionRate,
      reason: `${completedProjects} of ${totalProjects || 0} tracked projects finished successfully.`,
    },
    {
      label: 'Response rate',
      value: Math.round(trustScore?.response_rate || 0),
      reason: `Current live response score is ${Math.round(trustScore?.response_rate || 0)}%.`,
    },
    {
      label: profile.role === 'client' ? 'Approval speed' : 'Delivery rhythm',
      value: trustScore?.avg_delivery_days ? Math.max(40, Math.round(100 - trustScore.avg_delivery_days * 6)) : 60,
      reason: trustScore?.avg_delivery_days
        ? `Average turnaround is about ${trustScore.avg_delivery_days} day${trustScore.avg_delivery_days === 1 ? '' : 's'}.`
        : 'Delivery speed will appear after more completed work.',
    },
    {
      label: 'Dispute health',
      value: disputeHealth,
      reason: disputedProjects > 0
        ? `${disputedProjects} dispute${disputedProjects === 1 ? '' : 's'} recorded across public history.`
        : 'No disputes recorded in visible project history.',
    },
  ];
}

function ShareOption({ icon, label, color = "text-brand-ink" }: { icon: React.ReactNode, label: string, color?: string }) {
  return (
    <button className={`w-full text-left px-4 py-2.5 text-[14px] font-semibold ${color} hover:bg-brand-fog transition-colors flex items-center gap-3 active:scale-95`}>
       {icon} {label}
    </button>
  );
}
