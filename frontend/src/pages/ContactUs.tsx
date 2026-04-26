import React from 'react';
import { Mail, Phone, MapPin, MessageCircle, ArrowRight, ShieldCheck, Clock } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { api } from '../lib/api';
import { toast } from 'react-hot-toast';
import SEO from '../components/SEO';
import Breadcrumbs from '../components/Breadcrumbs';

export default function ContactUs() {
  const [sent, setSent] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [formData, setFormData] = React.useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await api.post('/public/submit', {
        submission_type: 'contact',
        payload: formData
      });
      setSent(true);
      toast.success('Message sent! We\'ll get back to you soon.');
    } catch (error) {
      toast.error('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-brand-white min-h-screen">
      <SEO 
        title="Contact Us - Support & Inquiries"
        description="Have questions about StayVise escrow or payments? Reach out to our support team. We're here to help you secure your freelance projects."
      />
      
      <div className="max-w-7xl mx-auto px-6 pt-12">
        <Breadcrumbs items={[{ label: 'Contact Us' }]} />
      </div>

      {/* Header */}
      <section className="pt-32 pb-24 bg-brand-fog border-b border-brand-border-strong px-6 overflow-hidden relative">
         <div className="absolute top-0 right-0 w-64 h-64 bg-brand-forest/5 blur-[80px] rounded-full -mr-32 -mt-32" />
         <div className="max-w-7xl mx-auto flex flex-col items-center text-center relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-white border border-brand-border-strong text-brand-forest rounded-full text-[11px] font-bold uppercase tracking-wider mb-6">
              Contact Us
            </div>
            <h1 className="font-display font-bold text-4xl md:text-6xl text-brand-ink mb-6 tracking-tight">
              We're here to <span className="text-brand-forest">help</span>.
            </h1>
            <p className="text-lg text-brand-slate max-w-xl leading-relaxed font-medium">
              Questions about escrow, disputes, or business accounts? Our team typically responds within 2 hours during business hours.
            </p>
         </div>
      </section>

      <section className="py-24 max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-16 items-start">
        
        {/* Contact Info Side */}
        <div className="space-y-12">
           <div>
              <h2 className="font-display font-bold text-2xl text-brand-ink mb-8">Reach out directly</h2>
              <div className="space-y-8">
                 <ContactItem 
                   icon={<Mail />} 
                   title="General Support" 
                   value="support@stayvise.in" 
                   href="mailto:support@stayvise.in"
                 />
                 <ContactItem 
                   icon={<MessageCircle />} 
                   title="Founder's Office" 
                   value="anurag@stayvise.in" 
                   href="mailto:anurag@stayvise.in"
                 />
                 <ContactItem 
                   icon={<Phone />} 
                   title="Support Helpline" 
                   value="+91 94709 61258" 
                   href="tel:+919470961258"
                 />
                 <ContactItem 
                   icon={<MapPin />} 
                   title="HQ" 
                   value="Vile Parle West, Mumbai, MH" 
                   href="#"
                 />
              </div>
           </div>

           <div className="p-8 rounded-[2rem] bg-brand-forest text-white">
              <ShieldCheck className="w-10 h-10 mb-4 opacity-50" />
              <h3 className="font-display font-bold text-xl mb-2">Escrow Inquiries</h3>
              <p className="text-brand-forest-light text-sm leading-relaxed">
                If you have an ongoing project dispute, please use the "Dispute Centre" in your dashboard for faster resolution and audit tracking.
              </p>
           </div>
        </div>

        {/* Form Side */}
        <div className="bg-brand-white border-2 border-brand-border-strong rounded-[2.5rem] p-8 md:p-12 shadow-sm">
           {sent ? (
              <div className="py-12 text-center animate-in zoom-in-95 duration-500">
                 <div className="w-20 h-20 bg-brand-forest-light rounded-full flex items-center justify-center mx-auto mb-6 text-brand-forest">
                    <ShieldCheck size={40} />
                 </div>
                 <h2 className="font-display font-bold text-3xl text-brand-ink mb-4">Message delivered!</h2>
                 <p className="text-brand-slate font-medium mb-8">We've received your inquiry and assigned it to our support pod. Expect a reply shortly.</p>
                 <Button onClick={() => setSent(false)}>Send another message</Button>
              </div>
           ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    label="Subject" 
                    placeholder="How can we help?" 
                    required 
                    value={formData.subject}
                    onChange={(e) => setFormData({...formData, subject: e.target.value})}
                 />
                 <div className="space-y-2">
                    <label className="text-[13px] font-bold text-brand-ink uppercase tracking-wider ml-1">Message</label>
                    <textarea 
                      className="w-full min-h-[160px] p-4 bg-brand-fog border border-brand-border-strong rounded-xl outline-none focus:ring-2 focus:ring-brand-forest/20 focus:border-brand-forest transition-all text-sm font-medium"
                      placeholder="Tell us more about your inquiry..."
                      required
                      value={formData.message}
                      onChange={(e) => setFormData({...formData, message: e.target.value})}
                    />
                 </div>
                 <Button type="submit" size="lg" className="w-full group" isLoading={isLoading}>
                    Send Message <ArrowRight className="group-hover:translate-x-1 transition-transform" />
                 </Button>
                 <div className="flex items-center gap-4 text-[12px] text-brand-mist font-bold uppercase tracking-widest pt-4 border-t border-brand-border-strong">
                    <div className="flex items-center gap-1"><Clock size={12}/> Response: ~2h</div>
                    <div className="flex items-center gap-1"><ShieldCheck size={12}/> Encrypted</div>
                 </div>
              </form>
           )}
        </div>

      </section>
    </div>
  );
}

function ContactItem({ icon, title, value, href }: any) {
  return (
    <div className="flex items-start gap-4">
       <div className="w-12 h-12 rounded-2xl bg-brand-fog border border-brand-border-strong flex items-center justify-center text-brand-forest shrink-0">
          {React.cloneElement(icon, { size: 24 })}
       </div>
       <div>
          <h4 className="text-[13px] font-bold text-brand-mist uppercase tracking-widest mb-1">{title}</h4>
          <a href={href} className="text-lg font-bold text-brand-ink hover:text-brand-forest transition-colors break-all">
            {value}
          </a>
       </div>
    </div>
  );
}
