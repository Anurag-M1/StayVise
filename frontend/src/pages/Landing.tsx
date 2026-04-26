import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { TrustScoreBadge } from '../components/ui/TrustScoreBadge';
import { countUp } from '../lib/animations';
import { Lock, Menu, X, CheckCircle2, ChevronDown, RefreshCcw } from 'lucide-react';
import SEO from '../components/SEO';

/* ─── HOOKS ───────────────────────────────────────────────────────────────── */

function useIntersectionObserver(options = {}) {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsIntersecting(true);
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.1, ...options });

    if (ref.current) observer.observe(ref.current);
    
    return () => observer.disconnect();
  }, [options]);

  return [ref, isIntersecting] as const;
}

/* ─── MAIN LANDING COMPONENT ──────────────────────────────────────────────── */

export default function Landing() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "StayVise",
    "url": "https://stayvise.com",
    "logo": "https://stayvise.com/favicon.svg",
    "description": "Secure milestone-based escrow payment platform for freelancers and clients.",
    "sameAs": [
      "https://twitter.com/stayvise",
      "https://linkedin.com/company/stayvise"
    ]
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Is my money safe?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. Funds are held by Razorpay, an RBI-regulated payment aggregator. StayVise never touches the money directly; we only securely trigger the release commands."
        }
      },
      {
        "@type": "Question",
        "name": "Can I access StayVise on mobile?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. StayVise is fully responsive and accessible from any device. Clients receive secure links via Email or SMS and can pay using standard UPI, Cards, or Netbanking seamlessly."
        }
      },
      {
        "@type": "Question",
        "name": "What if my client disputes the work?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Our internal moderation team steps in to review the communication and deliverables within 24h (Pro) or 72h (Free). We have successfully resolved 99.1% of disputes without escalation."
        }
      }
    ]
  };

  return (
    <div className="bg-brand-fog min-h-screen font-body text-brand-ink selection:bg-brand-forest-light selection:text-brand-forest-dark overflow-x-hidden">
      <SEO 
        title="Secure Escrow for Freelancers & Clients"
        description="Get paid for every milestone with StayVise. Secure, RBI-compliant escrow payments built for India's independent workforce. No more ghosting."
      />
      
      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(organizationSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(faqSchema)}
      </script>
      
      {/* 1. NAVBAR */}
      <header 
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled ? 'bg-brand-white/80 backdrop-blur-[12px] border-b border-brand-border shadow-sm py-3' : 'bg-transparent py-5'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-brand-forest" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
              <path d="M12 15v2" strokeWidth="3"/>
            </svg>
            <span className="font-display font-bold text-2xl tracking-tight text-brand-forest">StayVise</span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link to="/about" className="text-[15px] font-medium text-brand-slate hover:text-brand-forest transition-colors">About Us</Link>
            <Link to="/careers" className="text-[15px] font-medium text-brand-slate hover:text-brand-forest transition-colors">Careers</Link>
            <Link to="/contact" className="text-[15px] font-medium text-brand-slate hover:text-brand-forest transition-colors">Contact</Link>
            <div className="h-4 w-px bg-brand-border-strong"></div>
            <Link to="/login" className="text-[15px] font-medium text-brand-slate hover:text-brand-forest transition-colors">Login</Link>
            <Link to="/login">
              <Button>Get started free</Button>
            </Link>
          </nav>

          {/* Mobile Toggle */}
          <button 
            className="md:hidden p-2 text-brand-ink"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle mobile menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {/* Mobile Nav */}
        <div className={`md:hidden absolute top-full left-0 right-0 bg-brand-white border-b border-brand-border shadow-md transition-all duration-base overflow-hidden ${mobileMenuOpen ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="flex flex-col px-4 py-4 space-y-4">
            <Link to="/about" onClick={() => setMobileMenuOpen(false)} className="font-medium text-brand-slate">About Us</Link>
            <Link to="/careers" onClick={() => setMobileMenuOpen(false)} className="font-medium text-brand-slate">Careers</Link>
            <Link to="/contact" onClick={() => setMobileMenuOpen(false)} className="font-medium text-brand-slate">Contact</Link>
            <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="font-medium text-brand-slate">Login</Link>
            <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
              <Button className="w-full">Get started free</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* 2. HERO */}
      <section className="pt-32 pb-16 md:pt-48 md:pb-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="flex flex-col md:flex-row items-center gap-12 md:gap-8">
          
          {/* Left Column */}
          <div className="md:w-[60%] flex flex-col items-center text-center md:items-start md:text-left z-10">
            <span className="inline-flex items-center px-3 py-1 bg-brand-amber/15 text-brand-amber font-body font-bold text-xs uppercase tracking-widest rounded-full mb-6">
              Built for India's 15M+ freelancers
            </span>
            <h1 className="font-display font-bold text-4xl sm:text-5xl md:text-[56px] leading-[1.1] text-brand-ink mb-6 tracking-[-0.03em]">
              Get paid for every milestone.<br />
              <span className="text-brand-forest">No more ghosting.</span>
            </h1>
            <p className="text-lg md:text-[18px] text-brand-slate font-body leading-relaxed max-w-xl mb-8">
              StayVise holds your client's payment securely in escrow — releases it the moment you deliver. Simple, secure, and professional.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mb-10 w-full sm:w-auto">
              <Link to="/login">
                <Button size="lg" className="w-full sm:w-auto px-8 relative overflow-hidden group">
                  <span className="relative z-10">Start free</span>
                  {/* Subtle shimmer loop */}
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_2s_infinite]" />
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button variant="ghost" size="lg" className="w-full sm:w-auto">See how it works</Button>
              </a>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 text-[13px] font-medium text-brand-slate">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-brand-forest" /> Available on all devices</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-brand-forest" /> Secure Email & SMS links</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-brand-forest" /> Powered by Razorpay</span>
            </div>
          </div>

          {/* Right Column - Mockup */}
          <div className="md:w-[40%] flex justify-center">
            <div className="w-full max-w-[400px] bg-brand-white border border-brand-border-strong rounded-2xl shadow-float overflow-hidden transform perspective-1000 rotate-1">
              <div className="bg-brand-ink p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                </div>
                <span className="text-[10px] font-bold text-brand-slate uppercase tracking-widest">Secure Ledger #8291</span>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex justify-between items-end border-b border-brand-border pb-4">
                   <div>
                     <div className="text-[11px] font-bold text-brand-slate uppercase tracking-wider mb-1">Project Status</div>
                     <div className="text-xl font-display font-bold text-brand-ink">In Progress</div>
                   </div>
                   <div className="text-right">
                     <div className="text-[11px] font-bold text-brand-slate uppercase tracking-wider mb-1">Total Amount</div>
                     <div className="text-xl font-display font-bold text-brand-forest">₹1,20,000</div>
                   </div>
                </div>

                <div className="space-y-3">
                   <div className="flex items-center justify-between p-3 bg-brand-forest-light/30 rounded-xl border border-brand-forest/10">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-brand-forest" />
                        <div>
                          <div className="text-sm font-bold text-brand-ink">Discovery & Research</div>
                          <div className="text-[10px] text-brand-slate uppercase font-medium">Released · UTR: 48291</div>
                        </div>
                      </div>
                      <div className="font-bold text-brand-forest text-sm">₹25,000</div>
                   </div>
                   <div className="flex items-center justify-between p-3 bg-brand-white rounded-xl border border-brand-border-strong animate-pulse">
                      <div className="flex items-center gap-3">
                        <RefreshCcw className="w-5 h-5 text-brand-amber animate-spin-slow" />
                        <div>
                          <div className="text-sm font-bold text-brand-ink">UI Design Phase</div>
                          <div className="text-[10px] text-brand-amber uppercase font-medium">Funds in Escrow</div>
                        </div>
                      </div>
                      <div className="font-bold text-brand-ink text-sm">₹45,000</div>
                   </div>
                   <div className="flex items-center justify-between p-3 bg-brand-white rounded-xl border border-brand-border-strong opacity-50">
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full border-2 border-brand-border" />
                        <div>
                          <div className="text-sm font-bold text-brand-ink">Development</div>
                          <div className="text-[10px] text-brand-slate uppercase font-medium">Upcoming</div>
                        </div>
                      </div>
                      <div className="font-bold text-brand-ink text-sm">₹50,000</div>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. SOCIAL PROOF BAR */}
      <section className="bg-brand-forest-light border-y border-brand-border overflow-hidden relative h-[64px] flex items-center">
        <div className="absolute inset-y-0 left-0 w-8 md:w-32 bg-gradient-to-r from-brand-forest-light to-transparent z-10" />
        <div className="absolute inset-y-0 right-0 w-8 md:w-32 bg-gradient-to-l from-brand-forest-light to-transparent z-10" />
        
        <div className="flex whitespace-nowrap animate-[marquee_30s_linear_infinite] items-center gap-12 font-medium text-brand-forest">
          <StatCounter end={700} suffix="+" text="freelancers" />
          <span className="w-1.5 h-1.5 bg-brand-forest rounded-full opacity-30" />
          <StatCounter end={2.4} suffix="Cr+" prefix="₹" decimals={1} text="secured" />
          <span className="w-1.5 h-1.5 bg-brand-forest rounded-full opacity-30" />
          <StatCounter end={99.1} suffix="%" decimals={1} text="dispute-free" />
          <span className="w-1.5 h-1.5 bg-brand-forest rounded-full opacity-30" />
          
          {/* Duplicate for infinite loop illusion */}
          <StatCounter end={700} suffix="+" text="freelancers" />
          <span className="w-1.5 h-1.5 bg-brand-forest rounded-full opacity-30" />
          <StatCounter end={2.4} suffix="Cr+" prefix="₹" decimals={1} text="secured" />
          <span className="w-1.5 h-1.5 bg-brand-forest rounded-full opacity-30" />
          <StatCounter end={99.1} suffix="%" decimals={1} text="dispute-free" />
        </div>
      </section>

      {/* 4. HOW IT WORKS */}
      <section id="how-it-works" className="py-24 bg-brand-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl md:text-[40px] text-center font-bold text-brand-ink mb-16 tracking-tight">Three steps. Zero risk.</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            {/* Desktop Connector lines */}
            <div className="hidden md:block absolute top-[120px] left-[16%] right-[16%] border-t-2 border-dashed border-brand-border-strong" />

            <StepCard 
              number="1"
              title="Create the project"
              desc="Define deliverables and milestones. Send a quick link to your client to review."
              alertMessage="New project: Logo Design | 3 milestones | ₹30,000"
            />
            <StepCard 
              number="2"
              title="Client pays into escrow"
              desc="Work confidently knowing the funds are verified and held safely by our RBI-regulated partner."
              alertMessage="Payment of ₹30,000 held safely 🔒"
            />
            <StepCard 
              number="3"
              title="Deliver and get paid"
              desc="Send work. Client approves. Money hits your bank account automatically."
              alertMessage="Milestone approved → ₹10,000 sent to your bank"
            />
          </div>
        </div>
      </section>

      {/* 5. TRUST SCORE SECTION */}
      <section className="py-24 bg-brand-fog relative overflow-hidden">
        <div className="absolute right-0 top-0 w-1/3 h-full bg-brand-white opacity-50 transform -skew-x-12 translate-x-32" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col md:flex-row items-center gap-16">
          
          <div className="w-full md:w-1/2 flex flex-col items-center">
            <div className="bg-brand-white p-8 rounded-2xl shadow-float border border-brand-border flex flex-col items-center w-full max-w-sm">
              <AnimatedTrustScore />
              
              <div className="flex gap-2 mt-6 mb-8 flex-wrap justify-center">
                <span className="px-2.5 py-1 text-[11px] font-bold bg-gray-100 text-gray-700 rounded-full uppercase tracking-wider">Veteran</span>
                <span className="px-2.5 py-1 text-[11px] font-bold bg-brand-forest-light text-brand-forest rounded-full uppercase tracking-wider">Fast Delivery</span>
                <span className="px-2.5 py-1 text-[11px] font-bold bg-blue-50 text-blue-700 rounded-full uppercase tracking-wider">Established</span>
              </div>

              <div className="grid grid-cols-2 gap-4 w-full text-center border-t border-brand-border-strong pt-6">
                <div>
                  <div className="font-display text-xl font-bold text-brand-ink">47</div>
                  <div className="text-[11px] text-brand-slate uppercase font-medium mt-1">Projects</div>
                </div>
                <div>
                  <div className="font-display text-xl font-bold text-brand-ink">₹8.4L</div>
                  <div className="text-[11px] text-brand-slate uppercase font-medium mt-1">Secured</div>
                </div>
                <div>
                  <div className="font-display text-xl font-bold text-brand-ink">4.2d</div>
                  <div className="text-[11px] text-brand-slate uppercase font-medium mt-1">Avg Delivery</div>
                </div>
                <div>
                  <div className="font-display text-xl font-bold text-brand-forest">100%</div>
                  <div className="text-[11px] text-brand-slate uppercase font-medium mt-1">Completion</div>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full md:w-1/2 text-center md:text-left">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-brand-ink mb-6 tracking-tight">Your reputation, quantified.</h2>
            <p className="text-lg text-brand-slate font-body leading-relaxed mb-8">
              Every project you complete builds your StayVise score. Share it with clients before signing to close deals faster. It's the verification badge Indian freelancers never had.
            </p>
            <Link to="/login">
              <Button>Build your score free &rarr;</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* 6. PRICING */}
      <section id="pricing" className="py-24 bg-brand-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-[40px] font-bold text-brand-ink tracking-tight mb-4">Honest pricing. No surprises.</h2>
            <p className="text-brand-slate max-w-2xl mx-auto">Platform fee is charged to the client, not you. You receive exactly 100% of your agreed amount.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center max-w-4xl mx-auto">
            {/* Free */}
            <div className="bg-brand-fog border border-brand-border-strong rounded-2xl p-8 md:scale-95 shadow-sm hover:shadow-md transition-shadow">
              <h3 className="text-xl font-bold text-brand-ink mb-2">Basic</h3>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-display font-bold text-brand-ink">₹0</span>
                <span className="text-brand-slate font-medium">/month</span>
              </div>
              <p className="text-sm font-medium text-brand-slate mb-6 pb-6 border-b border-brand-border-strong">2% escrow fee per transaction (Paid by client)</p>
              
              <ul className="space-y-4 mb-8">
                 <PricingFeature text="1 active project at a time" />
                <PricingFeature text="Secure email notifications" />
                <PricingFeature text="Basic trust score" />
                <PricingFeature text="Direct bank payouts" />
              </ul>
              <Link to="/login">
                <Button variant="secondary" className="w-full">Create Free Account</Button>
              </Link>
            </div>

            {/* Pro */}
            <div className="bg-brand-white border-2 border-brand-forest rounded-2xl p-8 shadow-float relative">
              <div className="absolute top-0 right-8 transform -translate-y-1/2 bg-brand-forest text-white text-[11px] font-bold tracking-wider uppercase px-3 py-1 rounded-full">
                Most Popular
              </div>
              <h3 className="text-xl font-bold text-brand-ink mb-2">Pro</h3>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-display font-bold text-brand-ink">₹299</span>
                <span className="text-brand-slate font-medium">/month</span>
              </div>
              <p className="text-sm font-medium text-brand-forest mb-6 pb-6 border-b border-brand-border">1.5% escrow fee per transaction (Paid by client)</p>
              
              <ul className="space-y-4 mb-8">
                <PricingFeature text="Unlimited active projects" />
                <PricingFeature text="Priority dispute resolution (24h)" />
                <PricingFeature text="Verified Pro badge on profile" />
                <PricingFeature text="Automated GST Invoice generation" />
                <PricingFeature text="Custom profile URL (stayvise.com/p/you)" />
              </ul>
              <Link to="/login">
                <Button className="w-full">Start 14-day Pro Trial</Button>
              </Link>
            </div>
          </div>
          <p className="text-center text-xs text-brand-mist mt-10 font-medium">
            <Lock className="inline w-3 h-3 mr-1 -mt-0.5" />
            Powered by Razorpay · RBI Compliant · Funds held in licensed nodel accounts
          </p>
        </div>
      </section>

      {/* 7. TESTIMONIALS */}
      <section className="py-24 bg-brand-fog">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <TestimonialCard 
              initials="AS"
              color="bg-emerald-100 text-emerald-800"
              name="Anurag Singh"
              role="Freelance UI Designer"
              score={94}
              quote="Client said payment is coming for 3 weeks. With StayVise they paid upfront into escrow before I started. Never going back."
              stats="23 projects · ₹3.2L secured"
            />
            <TestimonialCard 
              initials="RK"
              color="bg-blue-100 text-blue-800"
              name="Rahul K."
              role="Webflow Developer"
              score={88}
              quote="My trust score got me a ₹1.2L project without a single reference call. Clients trust the platform's verification."
              stats="14 projects · ₹5.8L secured"
            />
            <TestimonialCard 
              initials="SM"
              color="bg-purple-100 text-purple-800"
              name="Sneha M."
              role="Content Strategist"
              score={82}
              quote="Auto-release saved me when a client went silent for 6 days after I delivered. I got paid exactly on time."
              stats="41 projects · ₹2.1L secured"
            />
          </div>
        </div>
      </section>

      {/* 8. FAQ */}
      <section className="py-24 bg-brand-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-bold text-center text-brand-ink mb-12">Common Questions</h2>
          <div className="space-y-4">
            <FAQItem 
              q="Is my money safe?" 
              a="Yes. Funds are held by Razorpay, an RBI-regulated payment aggregator. StayVise never touches the money directly; we only securely trigger the release commands."
            />
            <FAQItem 
              q="Can I access StayVise on mobile?" 
              a="Yes. StayVise is fully responsive and works perfectly on all devices. Clients receive a clean web link via email or SMS to review milestones and pay securely."
            />
            <FAQItem 
              q="What if my client disputes the work?" 
              a="Our internal moderation team steps in to review the communication and deliverables within 24h (Pro) or 72h (Free). We have successfully resolved 99.1% of disputes without escalation."
            />
            <FAQItem 
              q="Can I use it for international clients?" 
              a="Currently, we only support INR transactions for domestic clients. International escrow support is on our roadmap for Q3 2026."
            />
            <FAQItem 
              q="What happens if I (the freelancer) don't deliver?" 
              a="The client can raise a dispute. If the work was truly not delivered upon review, the escrow amount is refunded entirely to the client."
            />
          </div>
        </div>
      </section>

      {/* 9. CTA BANNER */}
      <section className="py-24 bg-brand-forest relative overflow-hidden">
        {/* Subtle background rings */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-white/10 rounded-full pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-white/10 rounded-full pointer-events-none" />
        
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <h2 className="font-display text-3xl md:text-[44px] font-bold text-brand-white mb-6">
            Your next project shouldn't start with trust issues.
          </h2>
          <p className="text-brand-forest-light text-lg mb-10 max-w-2xl mx-auto">
            Join 700+ Indian freelancers who get paid on time, every time. No follow-ups required.
          </p>
          <Link to="/login">
            <button className="bg-brand-white text-brand-forest font-bold px-8 py-4 rounded-lg hover:shadow-[0_0_40px_rgba(255,255,255,0.3)] hover:-translate-y-1 transition-all duration-300 text-lg">
              Start free — no credit card
            </button>
          </Link>
          <p className="text-brand-forest-light/60 text-sm mt-6 font-medium">
            Takes 2 minutes · Professional Secure Access
          </p>
        </div>
      </section>

      {/* 10. FOOTER */}
      <footer className="bg-brand-ink text-brand-slate py-12 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-6">
                <Lock className="w-5 h-5 text-brand-forest" />
                <span className="font-display font-bold text-lg text-brand-white">StayVise</span>
              </div>
              <p className="text-sm mb-6">Secure escrow for India's independent workforce.</p>
              <div className="flex items-center gap-4">
                <a href="https://www.linkedin.com/in/stayvise/" target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-brand-forest hover:text-white transition-all duration-300" aria-label="LinkedIn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
                </a>
                <a href="https://x.com/StayVise" target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-brand-forest hover:text-white transition-all duration-300" aria-label="Twitter">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
                <a href="https://www.instagram.com/stayviseindia/" target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-brand-forest hover:text-white transition-all duration-300" aria-label="Instagram">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                </a>
                <a href="https://m.facebook.com/profile.php?id=61588678621069" target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-brand-forest hover:text-white transition-all duration-300" aria-label="Facebook">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </a>
              </div>
            </div>
            <div>
              <h4 className="text-brand-white font-bold mb-4">Product</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#how-it-works" className="hover:text-brand-white transition-colors">How it works</a></li>
                <li><a href="#pricing" className="hover:text-brand-white transition-colors">Pricing</a></li>
                <li><Link to="/trust-score" className="hover:text-brand-white transition-colors">Trust Score</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-brand-white font-bold mb-4">Company</h4>
              <ul className="space-y-3 text-sm">
                <li><Link to="/about" className="hover:text-brand-white transition-colors">About Us</Link></li>
                <li><Link to="/careers" className="hover:text-brand-white transition-colors">Careers</Link></li>
                <li><Link to="/contact" className="hover:text-brand-white transition-colors">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-brand-white font-bold mb-4">Legal</h4>
              <ul className="space-y-3 text-sm">
                <li><Link to="/terms" className="hover:text-brand-white transition-colors">Terms of Service</Link></li>
                <li><Link to="/privacy" className="hover:text-brand-white transition-colors">Privacy Policy</Link></li>
                <li><Link to="/refund" className="hover:text-brand-white transition-colors">Refund Policy</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 text-[12px]">
            <p>© 2026 StayVise Technologies Pvt. Ltd. · CIN: U72900MH2026PTC123456</p>
            <p>Powered securely by Razorpay nodal accounts</p>
          </div>
        </div>
      </footer>
      
      {/* Mobile Sticky CTA */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-brand-white border-t border-brand-border-strong pb-safe z-40">
        <Link to="/login">
          <Button className="w-full">Get started free</Button>
        </Link>
      </div>

    </div>
  );
}

/* ─── HELPER COMPONENTS ───────────────────────────────────────────────────── */

function StatCounter({ end, suffix = "", prefix = "", decimals = 0, text }: any) {
  const [ref, isIntersecting] = useIntersectionObserver();
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (isIntersecting) countUp(0, end, 1500, setVal);
  }, [isIntersecting, end]);

  return (
    <div ref={ref} className="inline-flex gap-1.5 items-center">
      <span className="font-display font-bold text-lg">
        {prefix}{decimals ? val.toFixed(decimals) : val}{suffix}
      </span>
      <span className="text-sm">{text}</span>
    </div>
  );
}

function StepCard({ number, title, desc, alertMessage }: any) {
  const [ref, isIntersecting] = useIntersectionObserver();
  
  return (
    <div 
      ref={ref}
      className={`relative pt-8 z-10 transition-all duration-700 delay-100 ${isIntersecting ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
    >
      <div className="absolute -top-6 -left-4 text-[100px] font-display font-bold text-brand-forest-light leading-none -z-10 select-none">
        {number}
      </div>
      <h3 className="font-display text-[22px] font-bold text-brand-ink mb-3">{title}</h3>
      <p className="text-[15px] text-brand-slate leading-relaxed mb-6 h-16">{desc}</p>
      
      {/* Mock Alert Bubble */}
      <div className="bg-brand-ink/5 rounded-lg p-3 text-[13px] text-brand-ink border border-brand-border-strong relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-brand-forest" />
        <span className="relative z-10 font-medium">{alertMessage}</span>
      </div>
    </div>
  );
}

function AnimatedTrustScore() {
  const [ref, isIntersecting] = useIntersectionObserver({ threshold: 0.5 });
  return (
    <div ref={ref}>
      <TrustScoreBadge score={91} size="xl" label="Elite" animate={isIntersecting} />
    </div>
  );
}

function PricingFeature({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircle2 className="w-4 h-4 text-brand-forest shrink-0 mt-0.5" />
      <span className="text-[14px] text-brand-slate font-medium">{text}</span>
    </li>
  );
}

function TestimonialCard({ initials, color, name, role, score, quote, stats }: any) {
  const [ref, isIntersecting] = useIntersectionObserver();
  return (
    <div 
      ref={ref}
      className={`bg-brand-white border border-brand-border-strong p-8 rounded-2xl shadow-card flex flex-col transition-all duration-500 ${isIntersecting ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${color}`}>
            {initials}
          </div>
          <div>
            <div className="font-bold text-brand-ink text-sm">{name}</div>
            <div className="text-[11px] text-brand-slate">{role}</div>
          </div>
        </div>
        <div className="bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded text-[10px] font-bold border border-yellow-200">
           {score} SCORE
        </div>
      </div>
      <p className="font-display italic text-brand-ink text-lg mb-6 flex-1">"{quote}"</p>
      <div className="pt-4 border-t border-brand-border-strong text-xs font-medium text-brand-mist">
        {stats}
      </div>
    </div>
  );
}

function FAQItem({ q, a }: { q: string, a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-brand-border-strong last:border-0">
      <button 
        onClick={() => setOpen(!open)} 
        className="w-full text-left py-5 flex items-center justify-between gap-4 group"
      >
        <span className="font-medium text-brand-ink group-hover:text-brand-forest transition-colors">{q}</span>
        <ChevronDown className={`w-5 h-5 text-brand-slate transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${open ? 'max-h-40 opacity-100 pb-5' : 'max-h-0 opacity-0'}`}>
        <p className="text-brand-slate text-[15px] leading-relaxed">{a}</p>
      </div>
    </div>
  );
}
