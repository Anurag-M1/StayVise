import React from 'react';
import { Shield, Zap, Heart, Globe, Target, Users } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/SEO';

export default function AboutUs() {
  const navigate = useNavigate();

  return (
    <div className="bg-brand-white min-h-screen">
      <SEO 
        title="Our Mission & Values"
        description="Learn how StayVise is securing the future of work by democratizing financial safety for freelancers and clients through secure escrow."
      />
      {/* Hero Section */}
      <section className="relative py-24 overflow-hidden bg-brand-ink text-white">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-brand-forest/10 blur-[120px] rounded-full -mr-64 -mt-64" />
        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center md:text-left">
          <h1 className="font-display font-bold text-5xl md:text-7xl mb-6 tracking-tight">
            Securing the <span className="text-brand-forest">future of work</span>.
          </h1>
          <p className="text-xl text-white/70 max-w-2xl leading-relaxed mb-10">
            StayVise was born out of a simple, urgent mission: to ensure that no freelancer ever goes unpaid, and no client ever feels unprotected.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
            <Button size="lg" onClick={() => navigate('/login')}>Join the movement</Button>
            <Button variant="outline" size="lg" className="border-white/20 text-white hover:bg-white/10" onClick={() => navigate('/#how-it-works')}>Explore features</Button>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-24 max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="font-display font-bold text-3xl md:text-4xl text-brand-ink mb-4">The StayVise Way</h2>
          <p className="text-brand-slate max-w-xl mx-auto">We don't just build software; we build trust infrastructure for the modern economy.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <ValueCard 
            icon={<Shield className="text-brand-forest" />}
            title="Ironclad Security"
            desc="We use RBI-regulated escrow accounts and bank-grade encryption to ensure funds are always safe."
          />
          <ValueCard 
            icon={<Zap className="text-brand-amber" />}
            title="Radical Efficiency"
            desc="By moving everything to WhatsApp, we remove the friction of clunky dashboards and complex portals."
          />
          <ValueCard 
            icon={<Heart className="text-brand-danger" />}
            title="Human Centric"
            desc="We believe in fair outcomes. Our dispute resolution process is handled by experts, not heartless algorithms."
          />
        </div>
      </section>

      {/* Mission Section */}
      <section className="bg-brand-fog py-24">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="relative">
             <div className="aspect-square bg-brand-border-strong rounded-[3rem] overflow-hidden shadow-2xl rotate-2">
                <img 
                  src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80" 
                  alt="Team collaboration" 
                  width={800}
                  height={800}
                  className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700"
                  loading="lazy"
                />
             </div>
             <div className="absolute -bottom-8 -left-8 bg-brand-forest p-8 rounded-3xl shadow-xl text-white md:block hidden animate-bounce-slow">
                <Users size={32} className="mb-2" />
                <div className="text-2xl font-bold font-display">15,000+</div>
                <div className="text-sm font-medium opacity-80 uppercase tracking-widest">Active Members</div>
             </div>
          </div>
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-forest-light text-brand-forest rounded-full text-[11px] font-bold uppercase tracking-wider mb-6">
              Our Mission
            </div>
            <h2 className="font-display font-bold text-4xl text-brand-ink mb-6">Democratizing Financial Safety</h2>
            <p className="text-lg text-brand-slate leading-relaxed mb-8">
              In a world where remote work is the default, trust shouldn't be a luxury. StayVise is building the tools that allow anyone, anywhere, to enter a professional agreement with total confidence.
            </p>
            <div className="space-y-4">
              <MissionPoint icon={<Target size={18}/>} text="Zero ghosting by 2030 through automated escrow." />
              <MissionPoint icon={<Globe size={18}/>} text="Empowering 1 million Indian freelancers by 2026." />
              <MissionPoint icon={<Shield size={18}/>} text="Becoming the gold standard for verified service commerce." />
            </div>
          </div>
        </div>
      </section>

      {/* Team CTA */}
      <section className="py-24 text-center">
        <h2 className="font-display font-bold text-3xl mb-6">Ready to work with trust?</h2>
        <Button size="lg" onClick={() => navigate('/login')}>Get Started for Free</Button>
      </section>
    </div>
  );
}

function ValueCard({ icon, title, desc }: any) {
  return (
    <div className="group p-8 rounded-3xl border border-brand-border-strong bg-white hover:shadow-float transition-all duration-300">
      <div className="w-14 h-14 bg-brand-fog rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
        {React.cloneElement(icon, { size: 28 })}
      </div>
      <h3 className="font-display font-bold text-xl text-brand-ink mb-3">{title}</h3>
      <p className="text-brand-slate leading-relaxed">{desc}</p>
    </div>
  );
}

function MissionPoint({ icon, text }: any) {
  return (
    <div className="flex items-center gap-3 text-brand-ink font-semibold">
      <div className="w-8 h-8 rounded-full bg-brand-white border border-brand-border-strong flex items-center justify-center text-brand-forest shadow-sm">
        {icon}
      </div>
      <span>{text}</span>
    </div>
  );
}
