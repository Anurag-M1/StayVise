import React from 'react';
import { ShieldCheck, Info, TrendingUp, AlertCircle, CheckCircle2, Award, Zap, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TrustScoreBadge } from '../components/ui/TrustScoreBadge';
import { Button } from '../components/ui/Button';
import SEO from '../components/SEO';
import Breadcrumbs from '../components/Breadcrumbs';

export default function TrustScoreInfo() {
  return (
    <div className="bg-brand-white min-h-screen font-body">
      <SEO 
        title="Trust Score - Your Reputation Dashboard"
        description="Understand your StayVise Trust Score. One dynamic metric to prove your reliability and close more projects through secure escrow."
      />
      <div className="max-w-7xl mx-auto px-6 pt-12">
        <Breadcrumbs items={[{ label: 'Trust Score Info' }]} />
      </div>
      {/* Hero */}
      <section className="pt-32 pb-24 bg-brand-ink text-white relative overflow-hidden">
        <div className="absolute bottom-0 right-0 w-1/2 h-full bg-brand-forest/10 blur-[120px] rounded-full -mr-32 -mb-32" />
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
           <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 text-brand-forest rounded-full text-[11px] font-bold uppercase tracking-wider mb-6">
                 Trust Infrastructure
              </div>
              <h1 className="font-display font-bold text-5xl md:text-7xl mb-6 tracking-tight">
                Your reputation is <span className="text-brand-forest">gold</span>.
              </h1>
              <p className="text-xl text-white/70 max-w-xl leading-relaxed">
                The StayVise TrustScore is India's first dynamic reputation metric for freelancers and clients. One score to prove you're reliable.
              </p>
           </div>
           <div className="flex justify-center lg:justify-end pr-8">
              <div className="bg-white/5 border border-white/10 p-12 rounded-[3.5rem] backdrop-blur-md relative group">
                 <div className="absolute -top-4 -right-4 bg-brand-forest text-white p-3 rounded-2xl shadow-xl animate-bounce-slow">
                    <Award size={32}/>
                 </div>
                 <TrustScoreBadge score={92} size="xl" label="Elite" animate={true} />
                 <div className="mt-8 grid grid-cols-2 gap-4 text-center">
                    <div>
                       <div className="text-2xl font-bold font-mono">100%</div>
                       <div className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Completion</div>
                    </div>
                    <div>
                       <div className="text-2xl font-bold font-mono">4y</div>
                       <div className="text-[10px] uppercase font-bold text-white/40 tracking-widest">History</div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 max-w-7xl mx-auto px-6">
         <div className="text-center mb-20">
            <h2 className="font-display font-bold text-3xl md:text-4xl text-brand-ink mb-4">How we calculate your score</h2>
            <p className="text-brand-slate max-w-xl mx-auto font-medium">Our proprietary algorithm analyzes hundreds of data points from every transaction to generate a real-time trust metric.</p>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <MetricCard 
              icon={<TrendingUp />} 
              title="Volume" 
              desc="The total amount of funds you have successfully secured and moved through escrow."
              impact="High Impact"
            />
            <MetricCard 
              icon={<CheckCircle2 />} 
              title="Completion" 
              desc="The percentage of projects that reached successful approval without significant delays."
              impact="Critical"
            />
            <MetricCard 
              icon={<AlertCircle />} 
              title="Dispute Rate" 
              desc="The frequency and outcome of disputes raised against your account. Lower is better."
              impact="Heavy Penalty"
            />
            <MetricCard 
              icon={<ShieldCheck />} 
              title="Verification" 
              desc="Completing PAN/GST verification and KYC instantly boosts your baseline score."
              impact="Instant Boost"
            />
         </div>
      </section>

      {/* Tiers */}
      <section className="py-24 bg-brand-fog border-y border-brand-border-strong px-6">
         <div className="max-w-4xl mx-auto">
            <h2 className="font-display font-bold text-3xl text-brand-ink mb-12 text-center md:text-left">Trust Tiers</h2>
            <div className="space-y-4">
               <TierRow score="90+" label="Elite" desc="The gold standard. Priority support, lower platform fees, and instant payouts." color="text-brand-forest" bg="bg-brand-forest-light" />
               <TierRow score="75-89" label="Trusted" desc="Highly reliable. Verified badge on marketplace and faster dispute resolution." color="text-brand-forest" bg="bg-brand-forest-light/50" />
               <TierRow score="60-74" label="Established" desc="Consistent track record. Regular features and standard protection." color="text-brand-ink" bg="bg-white" />
               <TierRow score="0-59" label="Growing" desc="New accounts or accounts recovering from a dispute. Basic protection only." color="text-brand-slate" bg="bg-white/50" />
            </div>
         </div>
      </section>

      {/* CTA */}
      <section className="py-24 max-w-7xl mx-auto px-6 text-center">
         <div className="max-w-3xl mx-auto">
            <h2 className="font-display font-bold text-3xl md:text-4xl text-brand-ink mb-8">Stop sending reference calls. <br /> Start sending your StayVise score.</h2>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
               <Link to="/login">
                  <Button size="lg" className="px-12 w-full sm:w-auto">Claim your score</Button>
               </Link>
            </div>
            <p className="mt-8 text-xs font-bold text-brand-mist uppercase tracking-widest flex items-center justify-center gap-2">
               <ShieldCheck size={14} /> Powered by Razorpay Audit Logs
            </p>
         </div>
      </section>
    </div>
  );
}

function MetricCard({ icon, title, desc, impact }: any) {
  return (
    <div className="p-8 rounded-3xl border border-brand-border-strong bg-white hover:shadow-card transition-all group">
       <div className="w-12 h-12 rounded-2xl bg-brand-fog flex items-center justify-center text-brand-forest mb-6 group-hover:bg-brand-forest-light transition-colors">
          {React.cloneElement(icon, { size: 24 })}
       </div>
       <h3 className="font-bold text-lg text-brand-ink mb-2">{title}</h3>
       <p className="text-sm text-brand-slate leading-relaxed mb-4">{desc}</p>
       <span className="text-[10px] font-bold uppercase tracking-widest text-brand-forest bg-brand-forest-light px-2 py-0.5 rounded-full">{impact}</span>
    </div>
  );
}

function TierRow({ score, label, desc, color, bg }: any) {
  return (
    <div className={`flex flex-col md:flex-row md:items-center gap-4 md:gap-8 p-6 rounded-2xl border border-brand-border-strong ${bg}`}>
       <div className="flex items-center gap-4 shrink-0 min-w-[120px]">
          <span className={`text-2xl font-mono font-bold ${color}`}>{score}</span>
          <span className={`text-[12px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border border-current opacity-70 ${color}`}>{label}</span>
       </div>
       <p className="text-[15px] font-medium text-brand-ink leading-relaxed">{desc}</p>
    </div>
  );
}
