import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { api } from '../lib/api';
import toast from 'react-hot-toast';
import { AuthLayout } from '../components/Layout/AuthLayout';
import { Loader2, MailCheck, AlertCircle } from 'lucide-react';

export default function VerifyLink() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.login);
  
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  
  const hasCalled = React.useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg('No verification token found in the link.');
      return;
    }

    if (hasCalled.current) return;
    hasCalled.current = true;

    const verifyToken = async () => {
      try {
        const response = await api.post('/auth/verify-secure-access', { token });

        const { access_token, refresh_token, user, is_new_user } = response.data;
        
        setAuth(access_token, refresh_token, user);
        setStatus('success');
        toast.success("Successfully signed in!");
        
        // Navigate after a short delay to show the success state
        setTimeout(() => {
          if (user.role === 'admin') {
            navigate('/admin', { replace: true });
          } else if (is_new_user || !user.onboarding_complete) {
            navigate('/onboarding', { replace: true });
          } else {
            navigate('/dashboard', { replace: true });
          }
        }, 1200);

      } catch (err: any) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        
        setStatus('error');
        setErrorMsg(err.response?.data?.detail || "The link is invalid or has expired.");
      }
    };

    verifyToken();
  }, [token, setAuth, navigate]);

  return (
    <AuthLayout>
      <div className="w-full max-w-md mx-auto text-center py-8">
        {status === 'verifying' && (
          <div className="animate-in fade-in duration-500">
            <div className="w-16 h-16 bg-brand-forest-light rounded-full flex items-center justify-center mx-auto mb-6">
              <Loader2 className="w-8 h-8 text-brand-forest animate-spin" />
            </div>
            <h2 className="font-display text-2xl font-bold text-brand-ink mb-2">Verifying Link</h2>
            <p className="text-brand-slate">Please wait while we secure your session…</p>
          </div>
        )}

        {status === 'success' && (
          <div className="animate-in zoom-in-95 fade-in duration-500">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <MailCheck className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="font-display text-2xl font-bold text-brand-ink mb-2">Authenticated!</h2>
            <p className="text-brand-slate">Welcome to StayVise. Redirecting you now…</p>
          </div>
        )}

        {status === 'error' && (
          <div className="animate-in slide-in-from-bottom-4 duration-500">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="font-display text-2xl font-bold text-brand-ink mb-2">Verification Failed</h2>
            <p className="text-brand-slate mb-8">{errorMsg}</p>
            <button 
              onClick={() => navigate('/login')}
              className="px-6 py-2 bg-brand-forest text-white font-bold rounded-lg hover:bg-brand-forest/90 transition-colors"
            >
              Back to Login
            </button>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
