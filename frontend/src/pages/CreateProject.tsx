import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { api } from '../lib/api';
import { useBillingSummary, useStats } from '../lib/queries';
import toast from 'react-hot-toast';
import { 
  ArrowLeft, Check, Trash2, ChevronUp, ChevronDown, ShieldCheck, HelpCircle, User, ArrowRight
} from 'lucide-react';
import { Input } from '../components/ui/Input';
import { PhoneInput } from '../components/ui/PhoneInput';
import { AmountInput } from '../components/ui/AmountInput';
import { Button } from '../components/ui/Button';
import { TrustScoreBadge } from '../components/ui/TrustScoreBadge';
import type { Project, UserLookupResponse } from '../lib/types';

export default function CreateProject() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isFreelancer = user?.role === 'freelancer';
  const { data: billing } = useBillingSummary();
  const { data: stats } = useStats();
  const isPro = billing?.billing_plan === 'premium' || billing?.billing_plan === 'pro';
  const maxProjects = billing?.plan_limits?.max_active_projects ?? 1;
  const activeProjects = stats?.active_projects ?? 0;
  const isAtLimit = !isPro && activeProjects >= maxProjects;
  const counterpartyLabel = isFreelancer ? 'client' : 'freelancer';
  const counterpartyLabelTitle = counterpartyLabel.charAt(0).toUpperCase() + counterpartyLabel.slice(1);
  const counterpartyPluralAction = isFreelancer ? 'pay' : 'accept and begin work';

  // Screen layout state
  const [activeStep, setActiveStep] = useState(1);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- WIZARD STATE ---
  
  // Step 1: Basics
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [category, setCategory] = useState('');

  // Step 2: Client
  const [clientPhone, setClientPhone] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('+91');
  const [clientName, setClientName] = useState('');
  const [clientStatus, setClientStatus] = useState<'idle' | 'loading' | 'found' | 'new'>('idle');
  const [clientTrustScore, setClientTrustScore] = useState(0);
  const [isPublic, setIsPublic] = useState(false);
  
  // Step 3: Milestones
  const [totalAmount, setTotalAmount] = useState<number | ''>('');
  const [milestones, setMilestones] = useState([{ id: 1, title: '', amount: '' as number|'' }]);
  
  // Step 4: Review
  const [confirmed, setConfirmed] = useState(false);
  const [understoodFees, setUnderstoodFees] = useState(false);

  // --- LOGIC & VALIDATION ---

  const normalizePhone = (val: string, country: string) => {
    const digits = val.replace(/\D/g, '');
    if (digits.length < 7) return null;
    return `${country}${digits}`;
  };

  const normalizedCounterpartyPhone = normalizePhone(clientPhone, selectedCountry);
  const isSelfPhone = normalizedCounterpartyPhone === user?.phone_number;

  // Phone lookup
  useEffect(() => {
    if (!normalizedCounterpartyPhone || isSelfPhone) {
      setClientStatus('idle');
      setClientName('');
      setClientTrustScore(0);
      return;
    }
    const timeout = window.setTimeout(async () => {
      setClientStatus('loading');
      try {
        const { data } = await api.get<UserLookupResponse>('/users/lookup', {
          params: { phone_number: normalizedCounterpartyPhone },
        });

        if (data.exists && data.user) {
          setClientStatus('found');
          setClientName(data.user.full_name);
          setClientTrustScore(data.user.trust_score?.score || 0);
          return;
        }

        setClientStatus('new');
        setClientName('');
        setClientTrustScore(0);
      } catch {
        setClientStatus('new');
        setClientName('');
        setClientTrustScore(0);
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [normalizedCounterpartyPhone, isSelfPhone]);

  // Milestone Math
  const platformFee = typeof totalAmount === 'number' ? totalAmount * 0.02 : 0;
  const clientPaysTotal = typeof totalAmount === 'number' ? totalAmount + platformFee : 0;
  
  const currentMilestoneSum = milestones.reduce((sum, m) => sum + (typeof m.amount === 'number' ? m.amount : 0), 0);
  const difference = (typeof totalAmount === 'number' ? totalAmount : 0) - currentMilestoneSum;
  
  const milestonesValid = Boolean(
    typeof totalAmount === 'number' && 
    totalAmount > 0 && 
    difference === 0 && 
    milestones.length > 0 && 
    milestones.every(m => typeof m.amount === 'number' && m.amount > 0 && m.title.trim() !== '')
  );

  // Milestone Builders
  const addMilestone = () => {
    if (milestones.length >= 10) return;
    setMilestones([...milestones, { id: Date.now(), title: '', amount: '' }]);
  };
  
  const updateMilestone = (idx: number, field: 'title' | 'amount', val: string | number | '') => {
    const newM = [...milestones];
    newM[idx] = { ...newM[idx], [field]: val };
    setMilestones(newM);
  };
  
  const removeMilestone = (idx: number) => {
    const newM = [...milestones];
    newM.splice(idx, 1);
    setMilestones(newM);
  };

  const moveMilestone = (idx: number, dir: -1 | 1) => {
    const newM = [...milestones];
    const target = idx + dir;
    if (target < 0 || target >= newM.length) return;
    const temp = newM[idx];
    newM[idx] = newM[target];
    newM[target] = temp;
    setMilestones(newM);
  };

  // Submit
  const handleFinalSubmit = async () => {
    if (!isPublic && !normalizedCounterpartyPhone) {
      toast.error(`Enter a valid ${counterpartyLabel} phone number.`);
      return;
    }

    if (!isPublic && isSelfPhone) {
      toast.error(`You cannot add yourself as the ${counterpartyLabel}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || `${title.trim()} coordinated through StayVise.`,
        is_public: isPublic,
        client_phone: isPublic ? undefined : normalizedCounterpartyPhone,
        counterparty_name: (!isPublic && clientStatus === 'new') ? clientName.trim() : undefined,
        deadline: deadline || undefined,
        milestones: milestones.map((m, i) => ({
          title: m.title.trim(),
          description: `Milestone ${i + 1}: ${m.title.trim()} for ${title.trim()}`,
          amount: Math.round(Number(m.amount) * 100), // Convert to Paise safely
          sequence_number: i + 1,
        })),
      };
      const { data } = await api.post<Project>('/projects', payload);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['stats'] }),
      ]);
      toast.success("Project created securely!");
      navigate(`/projects/${data.id}`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Error creating project."));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAtLimit) {
    return (
      <div className="min-h-screen bg-brand-fog font-body flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-brand-white rounded-[2.5rem] border border-brand-border-strong shadow-float p-10 text-center space-y-6 animate-in zoom-in-95 duration-500">
          <div className="w-20 h-20 bg-brand-amber/10 rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck className="w-10 h-10 text-brand-amber" />
          </div>
          <h2 className="font-display font-bold text-2xl text-brand-ink">Project Limit Reached</h2>
          <p className="text-brand-slate leading-relaxed">
            Your <strong>Basic plan</strong> allows <strong>{maxProjects} active project</strong>. You currently have <strong>{activeProjects}</strong>.
            Upgrade to <strong>Pro</strong> for unlimited projects, lower fees, and priority support.
          </p>
          <div className="space-y-3">
            <Button className="w-full h-12" onClick={() => navigate('/settings')}>
              Upgrade to Pro — ₹299/mo
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} className="mr-2" /> Go back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-fog font-body">
      
      {/* Top Standard Nav included in design visually */}
      <header className="h-16 bg-brand-white border-b border-brand-border-strong flex items-center px-4 sm:px-6 lg:px-8 shrink-0 z-10 relative">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-brand-slate hover:text-brand-ink transition-colors font-medium text-sm">
          <ArrowLeft size={18} /> Back
        </button>
      </header>

      <div className="max-w-[1200px] mx-auto w-full grid grid-cols-1 md:grid-cols-12 md:gap-12 lg:gap-20 p-4 sm:p-6 lg:p-8 lg:pt-12 items-start relative box-border">
        
        {/* LEFT COLUMN: FORM */}
        <div className="md:col-span-7 lg:col-span-6 space-y-8 pb-32 md:pb-12">
          
          {/* Progress Bar Header */}
          <div>
            <div className="flex gap-2 h-1.5 mb-3 w-full">
               {[1, 2, 3, 4].map(s => (
                 <div key={s} className={`h-full flex-1 rounded-full transition-colors duration-500 delay-100 ${s <= activeStep ? 'bg-brand-forest' : 'bg-brand-border-strong'}`} />
               ))}
            </div>
            <div className="flex justify-between px-1">
               <span className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${activeStep >= 1 ? 'text-brand-forest' : 'text-brand-mist'}`}>Basics</span>
               <span className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${activeStep >= 2 ? 'text-brand-forest' : 'text-brand-mist'}`}>{counterpartyLabelTitle}</span>
               <span className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${activeStep >= 3 ? 'text-brand-forest' : 'text-brand-mist'}`}>Milestones</span>
               <span className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${activeStep >= 4 ? 'text-brand-forest' : 'text-brand-mist'}`}>Review</span>
            </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); if (activeStep < 4) setActiveStep(activeStep + 1); }}>
            
            {/* --- STEP 1: BASICS --- */}
            {activeStep === 1 && (
              <div className="animate-in slide-in-from-right-8 fade-in duration-300 fill-mode-both space-y-6">
                 <div>
                   <div className="flex items-end justify-between mb-1 py-1">
                     <label className="text-[13px] font-bold text-brand-ink uppercase tracking-wider">Project title</label>
                     <span className={`text-[11px] font-bold ${title.length >= 80 ? 'text-brand-danger' : title.length >= 60 ? 'text-brand-amber' : 'text-brand-mist'}`}>
                       {title.length}/80
                     </span>
                   </div>
                   <input
                     autoFocus
                     type="text"
                     placeholder="e.g. Brand identity design for startup"
                     className={`w-full px-4 py-3 rounded-lg border bg-brand-white outline-none transition-colors ${title.length > 80 ? 'border-brand-danger ring-1 ring-brand-danger' : 'border-brand-border hover:border-brand-border-strong focus:border-brand-forest focus:ring-1 focus:ring-brand-forest'}`}
                     value={title}
                     onChange={(e) => setTitle(e.target.value)}
                     maxLength={85}
                   />
                 </div>

                 <div>
                   <label className="text-[13px] font-bold text-brand-ink uppercase tracking-wider block mb-2">Project description (optional)</label>
                   <textarea
                     rows={4}
                     placeholder="Describe the scope, deliverables, and expectations..."
                     className="w-full px-4 py-3 rounded-lg border border-brand-border hover:border-brand-border-strong focus:border-brand-forest focus:ring-1 focus:ring-brand-forest bg-brand-white outline-none transition-colors resize-none"
                     value={description}
                     onChange={(e) => setDescription(e.target.value)}
                     maxLength={500}
                   />
                   <div className="flex items-center justify-between mt-1">
                     <span className="text-[11px] text-brand-slate font-medium">This is shared with your {counterpartyLabel}. Be specific to avoid disputes.</span>
                     <span className="text-[11px] text-brand-mist font-bold">{description.length}/500</span>
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className="text-[13px] font-bold text-brand-ink uppercase tracking-wider block mb-2">Deadline (optional)</label>
                      <input 
                        type="date"
                        min={new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0]} // Tomorrow
                        className="w-full px-4 py-3 rounded-lg border border-brand-border hover:border-brand-border-strong focus:border-brand-forest focus:ring-1 focus:ring-brand-forest bg-brand-white outline-none transition-colors text-sm"
                        value={deadline}
                        onChange={e => setDeadline(e.target.value)}
                      />
                   </div>
                   <div>
                       <label className="text-[13px] font-bold text-brand-ink uppercase tracking-wider block mb-2">Category (optional)</label>
                       <select 
                         className="w-full px-4 py-3 rounded-lg border border-brand-border hover:border-brand-border-strong focus:border-brand-forest focus:ring-1 focus:ring-brand-forest bg-brand-white outline-none transition-colors text-sm appearance-none cursor-pointer"
                         value={category}
                         onChange={e => setCategory(e.target.value)}
                       >
                         <option value="">Select one...</option>
                         <option value="design">Design</option>
                         <option value="dev">Development</option>
                         <option value="writing">Writing</option>
                         <option value="marketing">Marketing</option>
                       </select>
                   </div>
                 </div>

                 <Button type="button" size="lg" className="w-full mt-8" onClick={() => setActiveStep(2)} disabled={title.length < 5 || title.length > 80}>
                   Next: {counterpartyLabelTitle} Details
                 </Button>
              </div>
            )}

            {/* --- STEP 2: CLIENT --- */}
            {activeStep === 2 && (
              <div className="animate-in slide-in-from-right-8 fade-in duration-300 fill-mode-both space-y-6">
                <div>
                  <h2 className="font-display text-3xl font-bold text-brand-ink mb-2">Who is the {counterpartyLabel}?</h2>
                  <p className="text-brand-slate text-[15px] mb-6">Enter the mobile number of your {counterpartyLabel} to invite them to this project.</p>
                </div>



                <div className="relative animate-in zoom-in-95 duration-200">
                  <PhoneInput 
                    label={`${counterpartyLabelTitle} Mobile number`} 
                    value={clientPhone} 
                    selectedCountry={selectedCountry}
                    onCountryChange={setSelectedCountry}
                    onChange={e => setClientPhone(e.target.value)}
                  />
                  {isSelfPhone && (
                    <p className="mt-2 text-[12px] font-semibold text-brand-danger">
                      You cannot create a project with your own phone number.
                    </p>
                  )}
                  
                  {/* Status Indicator Overlays */}
                  {clientStatus === 'loading' && (
                    <div className="absolute right-4 top-[38px] flex items-center gap-2 text-[11px] text-brand-mist font-bold uppercase transition-all duration-300">
                      <div className="w-3 h-3 border-2 border-brand-border border-t-brand-forest rounded-full animate-spin" /> Looking up...
                    </div>
                  )}
                  {clientStatus === 'found' && (
                    <div className="mt-4 p-4 rounded-xl border border-brand-forest/20 bg-brand-forest-light/30 flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
                       <div className="w-10 h-10 rounded-full bg-brand-forest text-white flex items-center justify-center font-bold text-sm shrink-0">
                          {clientName.substring(0,2).toUpperCase()}
                       </div>
                       <div>
                         <div className="font-bold text-brand-ink text-[15px]">{clientName}</div>
                         <div className="text-[12px] text-brand-forest font-semibold flex items-center gap-1 mt-0.5">
                            Active on StayVise <ShieldCheck size={14}/>
                         </div>
                       </div>
                       <div className="ml-auto">
                         <TrustScoreBadge score={clientTrustScore || 50} size="sm" animate={false} />
                       </div>
                    </div>
                  )}
                  {clientStatus === 'new' && (
                     <div className="mt-4 p-4 rounded-xl border border-brand-amber bg-brand-amber/5 animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-start gap-3 mb-4">
                           <HelpCircle className="w-5 h-5 text-brand-amber shrink-0 mt-0.5" />
                           <div>
                             <h4 className="text-[14px] font-bold text-brand-ink">{counterpartyLabelTitle} is not on StayVise yet</h4>
                             <p className="text-[13px] text-brand-slate leading-relaxed mt-1">We'll send an invite to join and {counterpartyPluralAction}. They'll receive a secure mobile alert from StayVise explaining the project.</p>
                           </div>
                        </div>
                        
                        <div className="bg-[#EFEAE2] p-4 rounded-xl relative border border-[#DeD4C5] mb-4">
                           <div className="text-[11px] font-bold text-brand-slate uppercase tracking-wider mb-2">Invite Preview</div>
                           <div className="bg-white px-3 py-2.5 rounded-lg rounded-bl-sm shadow-sm inline-block opacity-90 max-w-[90%]">
                             <p className="text-[13px] text-brand-ink leading-relaxed">
                               Hi! <b>{user?.full_name?.split(' ')[0] || 'User'}</b> created a secure project for you on StayVise: "{title || 'Project'}".<br/><br/>
                               Review the scope and continue securely here: stayvise.com/pay
                             </p>
                           </div>
                        </div>

                        <Input 
                          label={`${counterpartyLabelTitle} Name`} 
                          value={clientName} 
                          onChange={e => setClientName(e.target.value)}
                          placeholder={`e.g. ${counterpartyLabelTitle} name`}
                          required
                        />
                     </div>
                  )}
                </div>


                <div className="pt-4 flex gap-3">
                  <Button type="button" variant="ghost" onClick={() => setActiveStep(1)}>Back</Button>
                  <Button 
                    type="button" 
                    size="lg" 
                    className="flex-1" 
                    onClick={() => setActiveStep(3)} 
                    disabled={!isPublic && clientStatus !== 'found' && (clientStatus !== 'new' || clientName.trim() === '')}
                  >
                    Next: Milestones
                  </Button>
                </div>
              </div>
            )}

            {/* --- STEP 3: MILESTONES --- */}
            {activeStep === 3 && (
              <div className="animate-in slide-in-from-right-8 fade-in duration-300 fill-mode-both space-y-6">
                <div>
                  <h2 className="font-display text-3xl font-bold text-brand-ink mb-2">Project Milestones</h2>
                  <p className="text-brand-slate text-[15px]">
                    {isFreelancer
                      ? 'Your client funds the full amount upfront. You unlock payment milestone by milestone.'
                      : 'You fund escrow once, then approve milestones when work is delivered.'}
                  </p>
                </div>

                <div className="bg-brand-white p-5 rounded-2xl border border-brand-border-strong shadow-sm mb-6">
                   <AmountInput 
                     label="TOTAL PROJECT AMOUNT"
                     value={totalAmount}
                     onChange={val => setTotalAmount(val || '')}
                   />
                   <div className="mt-4 p-3 bg-brand-fog rounded-lg text-[13px]">
                     <div className="flex justify-between items-center mb-1">
                       <span className="text-brand-slate font-medium">{counterpartyLabelTitle === 'Client' ? 'Client pays total:' : 'You fund total:'}</span>
                       <span className="font-mono font-bold text-brand-ink whitespace-nowrap">₹{typeof totalAmount === 'number' ? totalAmount.toLocaleString() : '0'} <span className="text-brand-mist font-normal">+ ₹{platformFee.toLocaleString()} fee</span> = ₹{clientPaysTotal.toLocaleString()}</span>
                     </div>
                     <div className="flex justify-between items-center text-brand-forest">
                        <span className="font-bold">{isFreelancer ? 'You receive total:' : 'Freelancer receives total:'}</span>
                        <span className="font-mono font-bold">₹{typeof totalAmount === 'number' ? totalAmount.toLocaleString() : '0'}</span>
                     </div>
                   </div>
                </div>

                {/* Milestone Builder */}
                <div className="space-y-3">
                   <div className="flex items-center justify-between mb-1">
                      <label className="text-[13px] font-bold text-brand-ink uppercase tracking-wider block">Scope of Work (Milestones)</label>
                      <span className="text-[11px] text-brand-mist font-bold">₹1 MINIMUM PER MILESTONE</span>
                   </div>
                   
                   {milestones.map((m, idx) => (
                      <div key={m.id} className="flex items-center gap-2 md:gap-3 bg-brand-white p-2 sm:p-3 rounded-xl border border-brand-border hover:border-brand-border-strong transition-colors group relative animate-in fade-in slide-in-from-bottom-2">
                        
                        {/* Drag Handle Mock / Order Arrows */}
                        <div className="flex flex-col gap-0.5 justify-center opacity-40 hover:opacity-100">
                          <button type="button" disabled={idx === 0} onClick={() => moveMilestone(idx, -1)} className="hover:text-brand-ink disabled:opacity-30"><ChevronUp size={16} strokeWidth={3}/></button>
                          <button type="button" disabled={idx === milestones.length - 1} onClick={() => moveMilestone(idx, 1)} className="hover:text-brand-ink disabled:opacity-30"><ChevronDown size={16} strokeWidth={3}/></button>
                        </div>
                        
                        <div className="w-5 h-5 rounded-full bg-brand-fog text-brand-mist flex items-center justify-center text-[10px] font-bold shrink-0">{idx+1}</div>
                        
                        <input 
                           type="text" 
                           placeholder="Describe the deliverable (e.g. Design Concepts)" 
                           className="flex-1 bg-transparent outline-none text-[14px] font-medium text-brand-ink placeholder:text-brand-mist min-w-0"
                           value={m.title}
                           onChange={e => updateMilestone(idx, 'title', e.target.value)}
                        />
                        
                        <div className="relative shrink-0 w-24 sm:w-32">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-mist font-mono font-bold text-[14px]">₹</span>
                          <input 
                            type="number"
                            placeholder="0"
                            className="w-full bg-brand-fog rounded-md px-3 py-1.5 pl-7 text-[14px] font-mono font-bold text-brand-ink outline-none focus:ring-1 focus:ring-brand-forest transition-shadow"
                            value={m.amount === '' ? '' : m.amount}
                            onChange={e => updateMilestone(idx, 'amount', e.target.value ? Number(e.target.value) : '')}
                          />
                        </div>

                        {milestones.length > 1 && (
                          <button type="button" onClick={() => removeMilestone(idx)} className="text-brand-mist hover:text-brand-danger transition-colors p-1 opacity-0 group-hover:opacity-100 focus:opacity-100">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                   ))}

                   <button type="button" onClick={addMilestone} disabled={milestones.length >= 10 || !totalAmount} className="w-full py-4 rounded-xl border-2 border-dashed border-brand-border-strong text-brand-forest font-bold text-[13px] uppercase tracking-wider hover:bg-brand-forest-light/50 transition-colors disabled:opacity-50">
                      + Add Milestone
                   </button>
                </div>

                {/* Live Validation Logic */}
                <div className="pt-2">
                  {typeof totalAmount === 'number' && totalAmount > 0 ? (
                     <div className={`p-4 rounded-xl border ${difference === 0 ? 'bg-emerald-50 border-emerald-200' : difference > 0 ? 'bg-brand-amber/10 border-brand-amber/30' : 'bg-brand-danger/10 border-brand-danger/30'}`}>
                        {difference === 0 ? (
                          <div className="flex items-center gap-2 text-emerald-700 font-bold text-[13px]">
                             <Check size={16} /> Perfect! Milestones map exactly to ₹{totalAmount.toLocaleString()}
                          </div>
                        ) : difference > 0 ? (
                           <div className="text-brand-amber text-[13px] font-bold">
                             <div className="flex justify-between mb-2">
                               <span>Allocated: ₹{currentMilestoneSum.toLocaleString()}</span>
                               <span>Remaining: ₹{difference.toLocaleString()}</span>
                             </div>
                             <div className="w-full h-1.5 bg-brand-amber/20 rounded-full overflow-hidden">
                               <div className="h-full bg-brand-amber transition-all" style={{ width: `${(currentMilestoneSum/totalAmount)*100}%`}} />
                             </div>
                           </div>
                        ) : (
                           <div className="text-brand-danger text-[13px] font-bold">
                             Milestones exceed total by ₹{Math.abs(difference).toLocaleString()}. Please adjust amounts.
                           </div>
                        )}
                     </div>
                  ) : milestones.length === 1 && (
                     <div className="text-[12px] font-medium text-brand-slate items-center gap-1.5 flex p-3 bg-brand-fog rounded-lg">
                       <HelpCircle size={14} className="text-brand-amber" /> Consider splitting into multiple milestones for safer delivery!
                     </div>
                  )}
                </div>

                <div className="pt-4 flex gap-3">
                  <Button type="button" variant="ghost" onClick={() => setActiveStep(2)}>Back</Button>
                  <Button type="button" size="lg" className="flex-1" onClick={() => setActiveStep(4)} disabled={!milestonesValid}>
                    Next: Review
                  </Button>
                </div>

              </div>
            )}

            {/* --- STEP 4: REVIEW --- */}
            {activeStep === 4 && (
              <div className="animate-in slide-in-from-right-8 fade-in duration-300 fill-mode-both space-y-6">
                <div>
                  <h2 className="font-display text-3xl font-bold text-brand-ink mb-2">Review your project</h2>
                  <p className="text-brand-slate text-[15px]">Double check everything. We will send the escrow request immediately.</p>
                </div>

                <div className="bg-brand-white rounded-2xl border border-brand-border-strong shadow-card overflow-hidden">
                   <div className="p-5 sm:p-6 border-b border-brand-border-strong">
                      <h3 className="font-display font-bold text-xl text-brand-ink mb-2">{title}</h3>
                      <p className="text-[14px] text-brand-slate leading-relaxed mb-4">{description || 'No description provided'}</p>
                      
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 bg-brand-fog p-3 rounded-xl border border-brand-border">
                          <div className="w-8 h-8 rounded-full bg-brand-white text-brand-ink flex items-center justify-center font-bold text-sm shrink-0 border border-brand-border-strong">
                            {user?.full_name?.substring(0,2).toUpperCase() || 'U'}
                          </div>
                          <div className="flex-1 min-w-0">
                             <div className="text-[12px] font-bold text-brand-slate uppercase tracking-wider mb-0.5">Freelancer (You)</div>
                             <div className="font-semibold text-brand-ink text-sm truncate">{user?.full_name}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 bg-brand-forest-light/20 p-3 rounded-xl border border-brand-forest/20">
                          <div className="w-8 h-8 rounded-full bg-brand-forest text-white flex items-center justify-center font-bold text-sm shrink-0">
                            {clientName ? clientName.substring(0,2).toUpperCase() : 'CL'}
                          </div>
                          <div className="flex-1 min-w-0">
                             <div className="text-[12px] font-bold text-brand-forest uppercase tracking-wider mb-0.5">Client</div>
                             <div className="font-semibold text-brand-ink text-sm truncate">{clientName || normalizedCounterpartyPhone || clientPhone}</div>
                          </div>
                        </div>
                      </div>
                   </div>

                   <div className="p-5 sm:p-6 border-b border-brand-border-strong bg-brand-fog/30">
                      <h4 className="text-[12px] font-bold text-brand-slate uppercase tracking-wider mb-3">Milestone Sequence</h4>
                      <div className="space-y-2">
                        {milestones.map((m, i) => (
                           <div key={i} className="flex items-center justify-between text-[14px]">
                             <div className="flex items-center gap-2 text-brand-ink font-medium">
                               <span className="text-brand-mist">{i+1}.</span> {m.title}
                             </div>
                             <div className="font-mono font-bold text-brand-ink">₹{(m.amount as number).toLocaleString()}</div>
                           </div>
                        ))}
                      </div>
                   </div>

                   <div className="p-5 sm:p-6">
                     <table className="w-full text-[14px]">
                       <tbody>
                         <tr className="text-brand-ink font-bold border-b border-brand-border-strong">
                           <td className="py-2">{counterpartyLabelTitle === 'Client' ? 'Client pays' : 'You fund'}</td>
                           <td className="py-2 text-right font-mono">₹{clientPaysTotal.toLocaleString()}</td>
                         </tr>
                         <tr className="text-brand-forest font-bold">
                           <td className="py-2 flex items-center gap-2"><ArrowRight size={14}/>{isFreelancer ? 'Your earnings' : 'Freelancer earnings'}</td>
                           <td className="py-2 text-right font-mono">₹{(totalAmount as number).toLocaleString()}</td>
                         </tr>
                         <tr className="text-brand-slate">
                           <td className="py-1 flex items-center gap-2">— Platform fee (2%)</td>
                           <td className="py-1 text-right font-mono">₹{platformFee.toLocaleString()}</td>
                         </tr>
                       </tbody>
                     </table>
                     <div className="mt-4 p-3 bg-brand-forest-light/50 border border-brand-forest/20 rounded-lg text-[13px] text-brand-forest font-semibold flex items-start gap-2">
                        <ShieldCheck size={16} className="shrink-0 mt-0.5" />
                        ₹{clientPaysTotal.toLocaleString()} will be requested via Secure Link. No money moves until escrow is funded.
                     </div>
                   </div>
                </div>

                <div className="space-y-3 pt-4">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center mt-0.5 shrink-0">
                      <input type="checkbox" className="peer appearance-none w-5 h-5 border-2 border-brand-border-strong rounded shadow-sm checked:bg-brand-forest checked:border-brand-forest transition-colors cursor-pointer" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
                      <Check className="absolute text-white w-3 h-3 opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" strokeWidth={4} />
                    </div>
                    <span className="text-[14px] text-brand-ink font-medium leading-snug group-hover:text-brand-forest transition-colors">I confirm all project details and milestone sequences are accurate.</span>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center mt-0.5 shrink-0">
                      <input type="checkbox" className="peer appearance-none w-5 h-5 border-2 border-brand-border-strong rounded shadow-sm checked:bg-brand-forest checked:border-brand-forest transition-colors cursor-pointer" checked={understoodFees} onChange={e => setUnderstoodFees(e.target.checked)} />
                      <Check className="absolute text-white w-3 h-3 opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" strokeWidth={4} />
                    </div>
                    <span className="text-[14px] text-brand-ink font-medium leading-snug group-hover:text-brand-forest transition-colors">I understand that the 2% platform fee is deducted upon successful payout.</span>
                  </label>
                </div>

                <div className="pt-6 flex gap-3">
                  <Button type="button" variant="ghost" className="hidden sm:block" onClick={() => setActiveStep(3)}>Back</Button>
                  <Button 
                    type="button" 
                    size="lg" 
                    className="flex-1 w-full" 
                    disabled={!confirmed || !understoodFees || isSubmitting}
                    isLoading={isSubmitting}
                    onClick={handleFinalSubmit}
                  >
                    {clientStatus === 'found' ? 'Create Project' : 'Confirm & Send Invite'}
                  </Button>
                </div>
              </div>
            )}

          </form>
        </div>

        {/* RIGHT COLUMN: STICKY PREVIEW */}
        <div className="hidden md:block col-span-5 relative">
           <div className="sticky top-24 pt-6 space-y-6">
             <div className="flex items-center gap-2 text-brand-mist text-[11px] font-bold uppercase tracking-wider mb-4 border-b border-brand-border-strong pb-2">
               <ShieldCheck size={14}/> Dashboard Preview
             </div>
             
             {/* Live CSS Card Mapping */}
             <div className="bg-brand-white rounded-xl shadow-card border border-brand-border-strong p-5 flex flex-col justify-between pl-6 border-l-[4px] border-brand-border relative overflow-hidden group">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1 pr-4">
                    {title ? (
                      <h3 className="font-body text-[15px] font-semibold text-brand-ink mb-2 break-words leading-tight">{title}</h3>
                    ) : (
                      <div className="w-3/4 h-5 bg-brand-fog rounded mb-3 animate-pulse" />
                    )}
                    <div className="flex items-center gap-2">
                       <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white uppercase tracking-wider bg-brand-mist">Draft</span>
                       {typeof totalAmount === 'number' && totalAmount > 0 ? (
                         <span className="font-mono text-[14px] font-bold text-brand-ink animate-in zoom-in-95">₹{totalAmount.toLocaleString()}</span>
                       ) : (
                         <div className="w-16 h-4 bg-brand-fog rounded animate-pulse" />
                       )}
                    </div>
                  </div>
                  
                  {/* Mock Pill Dots mapped live */}
                  <div className="flex gap-1 items-center shrink-0 flex-wrap justify-end max-w-[60px]">
                    {milestones.map((m, i) => (
                       <div key={i} className={`w-2 h-2 rounded-full transition-colors ${m.title ? 'bg-brand-slate' : 'bg-brand-border-strong'}`} />
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-brand-slate">
                  <div className="w-6 h-6 rounded-full bg-brand-fog flex items-center justify-center shrink-0">
                    <User size={12} className="text-brand-mist"/>
                  </div>
                  <span className="text-[13px]">{clientName ? `with ${clientName}` : clientPhone ? 'Invite pending...' : `Awaiting ${counterpartyLabel}`}</span>
                </div>
             </div>

             {/* Live Calculator Visual Widget */}
             <div className="p-4 bg-brand-fog/50 border border-brand-border rounded-xl">
               <div className="flex justify-between items-center text-[13px] font-semibold text-brand-slate mb-1">
                 <span>{counterpartyLabelTitle === 'Client' ? 'Client pays' : 'You fund'}</span>
                 <span className="font-mono text-brand-ink transition-all">₹{clientPaysTotal.toLocaleString()}</span>
               </div>
               <div className="flex justify-between items-center text-[13px] font-semibold text-brand-forest">
                 <span>{isFreelancer ? 'You earn' : 'Freelancer earns'}</span>
                 <span className="font-mono transition-all">₹{typeof totalAmount === 'number' ? totalAmount.toLocaleString() : '0'}</span>
               </div>
             </div>
           </div>
        </div>

      </div>

      {/* MOBILE BOTTOM SHEET FOR PREVIEW */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-brand-white border-t border-brand-border-strong shadow-[0_-10px_40px_rgba(0,0,0,0.1)] transition-transform duration-300" style={{ transform: mobilePreviewOpen ? 'translateY(0)' : 'translateY(80%)'}}>
         <button onClick={() => setMobilePreviewOpen(!mobilePreviewOpen)} className="w-full py-4 flex items-center justify-center gap-2 cursor-pointer bg-brand-fog/50 outline-none">
            <span className="text-[11px] font-bold text-brand-slate uppercase tracking-wider">{mobilePreviewOpen ? 'Close Preview' : 'Live Preview'}</span>
            <ChevronUp size={16} className={`text-brand-slate transition-transform duration-300 ${mobilePreviewOpen ? 'rotate-180' : ''}`} />
         </button>
         
         <div className="p-4 pb-8 space-y-4 overflow-y-auto max-h-[60vh]">
            {/* Duplicate Preview Content simplified for mobile */}
            <div className="p-4 bg-brand-fog/50 border border-brand-border rounded-xl flex justify-between items-center">
               <div className="text-[12px] font-semibold text-brand-slate uppercase">You Earn</div>
               <div className="font-mono text-xl font-bold text-brand-forest">₹{typeof totalAmount === 'number' ? totalAmount.toLocaleString() : '0'}</div>
            </div>
            
            <div className={`p-4 bg-brand-white rounded-xl shadow-sm border-l-[4px] border border-brand-border-strong ${title ? 'border-l-brand-border' : 'border-l-brand-fog'}`}>
               <h4 className="font-semibold text-[14px] text-brand-ink mb-1 truncate">{title || 'Untitled Project'}</h4>
               <div className="text-[12px] text-brand-slate truncate">with {clientName || `Pending ${counterpartyLabel}`}</div>
            </div>
         </div>
      </div>

    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: unknown }).response === 'object'
  ) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    return response?.data?.detail || fallback;
  }

  return fallback;
}
