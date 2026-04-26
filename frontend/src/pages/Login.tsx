import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { api } from '../lib/api';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { AuthLayout } from '../components/Layout/AuthLayout';
import { PhoneInput } from '../components/ui/PhoneInput';
import { OTPInput } from '../components/ui/OTPInput';
import { Button } from '../components/ui/Button';

export default function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.login);
  
  // URL Param logic
  const isNew = searchParams.get('mode') === 'signup';

  // State
  const [step, setStep] = useState<1 | 2>(1);
  
  // Phone State
  const [phone, setPhone] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('+91');
  const [phoneError, setPhoneError] = useState('');
  
  // Email State
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [debugLink, setDebugLink] = useState<string | null>(null);

  const [isSending, setIsSending] = useState(false);


  // Handle Email Submit
  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) {
      setEmailError("Enter a valid email address");
      return;
    }
    
    setIsSending(true);
    setDebugLink(null);
    try {
      const response = await api.post('/auth/secure-access-link', { 
        email,
        phone_number: `${selectedCountry}${phone.replace(/\D/g, '')}`
      });
      setEmailSent(true);
      
      // Capture debug link in dev mode
      if (response.data?.debug_link) {
        setDebugLink(response.data.debug_link);
      }
      
      toast.success("Secure access link sent! Check your inbox.");
    } catch (error: any) {
      toast.error(getRequestErrorMessage(error) || "Failed to send email.");
    } finally {
      setIsSending(false);
    }
  };


  return (
    <AuthLayout>
        <div className="animate-in fade-in slide-in-from-left-4 duration-300">
          <h2 className="font-display text-3xl font-bold text-brand-ink mb-2 tracking-tight">
            {isNew ? 'Get started' : 'Welcome back'}
          </h2>
          <p className="text-brand-slate text-[15px] mb-8">
            {step === 1 
              ? 'Enter your mobile number to begin secure access'
              : 'Now enter your email to receive a secure access link'}
          </p>

          <form onSubmit={(e) => {
            if (step === 1) {
              e.preventDefault();
              if (phone.length < 10) {
                setPhoneError("Enter a valid mobile number");
                return;
              }
              setStep(2);
            } else {
              handleSendMagicLink(e);
            }
          }} className="space-y-6">
             {emailSent ? (
               <div className="p-4 rounded-xl bg-brand-forest-light border border-brand-forest/20 text-center animate-in zoom-in-95">
                  <p className="text-brand-ink font-medium mb-1">Check your inbox!</p>
                  <p className="text-[13px] text-brand-slate">We've sent a secure access link to <span className="font-bold">{email}</span>. Click it to log in instantly.</p>
                  
                  <button 
                    type="button"
                    onClick={() => {
                      setEmailSent(false);
                      setStep(1);
                    }}
                    className="mt-6 text-brand-forest text-xs font-bold uppercase tracking-wider hover:underline"
                  >
                    Restart login
                  </button>
               </div>
             ) : (
               <>
                {step === 1 ? (
                  <div className="animate-in slide-in-from-right-4 duration-300 space-y-6">
                    <div>
                      <label className="block text-[13px] font-bold text-brand-ink ml-1 uppercase tracking-wider mb-2">Mobile Number</label>
                      <PhoneInput 
                        label="" 
                        value={phone}
                        selectedCountry={selectedCountry}
                        onCountryChange={setSelectedCountry}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          if (phoneError) setPhoneError('');
                        }}
                      />
                      {phoneError && <p className="text-xs text-red-500 ml-1 mt-1">{phoneError}</p>}
                    </div>
                    <Button type="submit" className="w-full" size="lg">
                      Proceed to Secure Link
                    </Button>
                  </div>
                ) : (
                  <div className="animate-in slide-in-from-right-4 duration-300 space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between ml-1">
                        <label className="block text-[13px] font-bold text-brand-ink uppercase tracking-wider">Email Address</label>
                        <button type="button" onClick={() => setStep(1)} className="text-[11px] font-bold text-brand-forest hover:underline uppercase tracking-wide">Change Number</button>
                      </div>
                      <input 
                        type="email"
                        autoFocus
                        required
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (emailError) setEmailError('');
                        }}
                        className="w-full h-12 px-4 rounded-xl border-2 border-brand-border-strong focus:border-brand-forest focus:outline-none transition-all placeholder:text-brand-border-strong font-medium text-brand-ink"
                      />
                      {emailError && <p className="text-xs text-red-500 ml-1">{emailError}</p>}
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full" 
                      size="lg"
                      isLoading={isSending}
                    >
                      Send Secure Access Link
                    </Button>
                  </div>
                )}
               </>
             )}
          </form>

          <p className="text-[13px] text-brand-mist text-center mt-6 px-4 leading-relaxed">
            By continuing, you agree to our{' '}
            <Link to="/terms" className="text-brand-forest hover:underline">Terms of Service</Link>
            {' '}and{' '}
            <Link to="/privacy" className="text-brand-forest hover:underline">Privacy Policy</Link>
          </p>
        </div>
    </AuthLayout>
  );
}

function getHttpStatus(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { status?: number } }).response?.status === 'number'
  ) {
    return (error as { response?: { status?: number } }).response?.status;
  }

  return undefined;
}

function getRequestErrorMessage(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { data?: { detail?: string } } }).response?.data?.detail === 'string'
  ) {
    return (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
  }

  return null;
}

function isNetworkError(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ERR_NETWORK'
  ) {
    return true;
  }

  return getHttpStatus(error) === undefined;
}
