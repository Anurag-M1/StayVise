import React from 'react';
import { Briefcase, MapPin, Clock, ArrowRight, Zap, Coffee, Heart, Globe, Sparkles, Send, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { api } from '../lib/api';
import { toast } from 'react-hot-toast';
import SEO from '../components/SEO';
import Breadcrumbs from '../components/Breadcrumbs';

export default function Careers() {
  const [showApplyModal, setShowApplyModal] = React.useState(false);
  const [selectedJob, setSelectedJob] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formData, setFormData] = React.useState({
    name: '',
    email: '',
    portfolio: '',
    experience: '',
    summary: ''
  });

  const handleOpenApply = (title: string) => {
    setSelectedJob(title);
    setShowApplyModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/public/submit', {
        submission_type: 'career',
        payload: {
          job_title: selectedJob,
          ...formData
        }
      });
      toast.success('Application submitted! Our team will review it soon.');
      setShowApplyModal(false);
      setFormData({ name: '', email: '', portfolio: '', experience: '', summary: '' });
    } catch (error) {
      toast.error('Failed to submit application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <div className="bg-brand-white min-h-screen">
      <SEO 
        title="Careers - Join the Team"
        description="Build the future of autonomous trust with StayVise. Explore open roles in engineering, product, and design."
      />
      
      <div className="max-w-7xl mx-auto px-6 pt-12">
        <Breadcrumbs items={[{ label: 'Careers' }]} />
      </div>

      {/* Hero */}
      <section className="pt-32 pb-24 border-b border-brand-border-strong overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_30%_20%,#E1F5EE_0%,transparent_50%)] opacity-50" />
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-forest/10 text-brand-forest rounded-full text-[11px] font-bold uppercase tracking-wider mb-6">
            We're Hiring
          </div>
          <h1 className="font-display font-bold text-5xl md:text-7xl text-brand-ink mb-6 tracking-tight">
            Build the future of <br />
            <span className="text-brand-forest italic">autonomous trust</span>.
          </h1>
          <p className="text-xl text-brand-slate max-w-2xl leading-relaxed">
            StayVise is looking for dreamers, hackers, and problem-solvers to build India's largest decentralized escrow layer. 
          </p>
        </div>
      </section>

      {/* Perks */}
      <section className="py-24 max-w-7xl mx-auto px-6">
        <h2 className="font-display font-bold text-3xl mb-12">Why StayVise?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <PerkCard icon={<Globe />} title="Remote First" desc="Work from your balcony, a cafe, or our HQ in Mumbai." />
          <PerkCard icon={<Zap />} title="Ownership" desc="We give you equity and the freedom to lead your domain." />
          <PerkCard icon={<Heart />} title="Wellness" desc="Full medical insurance and 25 days of paid time off." />
          <PerkCard icon={<Sparkles />} title="The Best Tools" desc="M3 MacBook Pros and whatever else you need to build." />
        </div>
      </section>

      {/* Open Positions */}
      <section className="py-24 bg-brand-fog">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-12">
            <div>
              <h2 className="font-display font-bold text-4xl text-brand-ink mb-2">Open roles</h2>
              <p className="text-brand-slate font-medium">Join our small but high-impact engineering and product teams.</p>
            </div>
            <div className="flex gap-4">
              <span className="text-sm font-bold text-brand-forest bg-brand-forest-light px-3 py-1 rounded-full uppercase">Engineering (3)</span>
              <span className="text-sm font-bold text-brand-slate bg-brand-white border border-brand-border px-3 py-1 rounded-full uppercase">Product (1)</span>
            </div>
          </div>

          <div className="space-y-4">
            <JobRow 
              title="Senior Full Stack Engineer" 
              dept="Engineering" 
              location="Remote / Mumbai" 
              type="Full-time"
              onApply={() => handleOpenApply("Senior Full Stack Engineer")}
            />
            <JobRow 
              title="Product Designer (UI/UX)" 
              dept="Design" 
              location="Remote" 
              type="Full-time"
              onApply={() => handleOpenApply("Product Designer (UI/UX)")}
            />
            <JobRow 
              title="Backend Architect (FastAPI / Redis)" 
              dept="Engineering" 
              location="Mumbai / Hybrid" 
              type="Full-time"
              onApply={() => handleOpenApply("Backend Architect (FastAPI / Redis)")}
            />
            <JobRow 
              title="Content Strategist" 
              dept="Product" 
              location="Remote" 
              type="Contract"
              onApply={() => handleOpenApply("Content Strategist")}
            />
          </div>

          <div className="mt-16 p-8 bg-brand-ink rounded-3xl text-white flex flex-col md:flex-row items-center justify-between gap-8">
             <div>
                <h3 className="font-display font-bold text-2xl mb-2">Don't see a perfect fit?</h3>
                <p className="text-white/60">We're always looking for exceptional talent. Send your CV to careers@stayvise.in</p>
             </div>
             <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 uppercase tracking-widest text-xs font-bold px-8" onClick={() => handleOpenApply("General Application")}>General Application</Button>
          </div>

          <Modal 
            isOpen={showApplyModal} 
            onClose={() => setShowApplyModal(false)}
            title={`Apply for ${selectedJob}`}
          >
             <form onSubmit={handleSubmit} className="p-6 pt-0 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <Input 
                     label="Full Name" 
                     placeholder="e.g. Rahul Singh" 
                     required 
                     value={formData.name}
                     onChange={(e) => setFormData({...formData, name: e.target.value})}
                   />
                   <Input 
                     label="Email Address" 
                     placeholder="e.g. rahul@example.com" 
                     type="email" 
                     required 
                     value={formData.email}
                     onChange={(e) => setFormData({...formData, email: e.target.value})}
                   />
                </div>
                <Input 
                  label="Portfolio / Resume Link" 
                  placeholder="e.g. dropbox.com/cv.pdf or github.com/user" 
                  value={formData.portfolio}
                  onChange={(e) => setFormData({...formData, portfolio: e.target.value})}
                />
                <Input 
                  label="Years of Experience" 
                  placeholder="e.g. 5+ years" 
                  value={formData.experience}
                  onChange={(e) => setFormData({...formData, experience: e.target.value})}
                />
                <div className="space-y-2">
                   <label className="text-[11px] font-bold text-brand-mist uppercase tracking-widest ml-1">Why should we hire you?</label>
                   <textarea 
                     className="w-full min-h-[120px] p-4 bg-brand-fog border border-brand-border rounded-xl outline-none focus:ring-2 focus:ring-brand-forest/20 focus:border-brand-forest transition-all text-sm font-medium"
                     placeholder="Tell us about your most impactful work..."
                     required
                     value={formData.summary}
                     onChange={(e) => setFormData({...formData, summary: e.target.value})}
                   />
                </div>
                <Button type="submit" className="w-full h-12 gap-2" isLoading={isSubmitting}>
                   Submit Application <Send size={18} />
                </Button>
             </form>
          </Modal>
        </div>
      </section>
    </div>
  );
}

function PerkCard({ icon, title, desc }: any) {
  return (
    <div className="p-8 rounded-2xl border border-brand-border-strong bg-brand-white">
      <div className="w-12 h-12 rounded-xl bg-brand-fog flex items-center justify-center text-brand-forest mb-6">
        {React.cloneElement(icon, { size: 24 })}
      </div>
      <h4 className="font-display font-bold text-lg text-brand-ink mb-2">{title}</h4>
      <p className="text-sm text-brand-slate leading-relaxed">{desc}</p>
    </div>
  );
}

function JobRow({ title, dept, location, type, onApply }: any) {
  return (
    <div 
      className="group flex flex-col md:flex-row md:items-center justify-between p-6 rounded-2xl border border-brand-border-strong bg-brand-white hover:border-brand-forest transition-all duration-300 cursor-pointer"
      onClick={onApply}
    >
      <div>
        <h3 className="font-bold text-lg text-brand-ink group-hover:text-brand-forest transition-colors mb-1">{title}</h3>
        <div className="flex flex-wrap gap-4 text-xs font-bold text-brand-mist uppercase tracking-widest">
          <span className="flex items-center gap-1"><Briefcase size={12} /> {dept}</span>
          <span className="flex items-center gap-1"><MapPin size={12} /> {location}</span>
          <span className="flex items-center gap-1"><Clock size={12} /> {type}</span>
        </div>
      </div>
      <Button 
        variant="ghost" 
        className="mt-4 md:mt-0 text-brand-forest font-bold gap-2 self-start md:self-auto"
        onClick={(e) => { e.stopPropagation(); onApply(); }}
      >
        Apply Now <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
      </Button>
    </div>
  );
}
