import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/ui/Toast';
import { useAuthStore } from './stores/auth';
import Layout from './components/Layout';
import WhatsAppWidget from './components/WhatsAppWidget';
const Login = lazy(() => import('./pages/Login'));
const VerifyLink = lazy(() => import('./pages/VerifyLink'));
const Landing = lazy(() => import('./pages/Landing'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const OnboardingComplete = lazy(() => import('./pages/OnboardingComplete'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CreateProject = lazy(() => import('./pages/CreateProject'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const PaymentPage = lazy(() => import('./pages/PaymentPage'));
const PublicProfile = lazy(() => import('./pages/PublicProfile'));
const Settings = lazy(() => import('./pages/Settings'));
const PaymentsHistory = lazy(() => import('./pages/PaymentsHistory'));
const DisputeCentre = lazy(() => import('./pages/DisputeCentre'));
const Explore = lazy(() => import('./pages/Explore'));
const AboutUs = lazy(() => import('./pages/AboutUs'));
const Careers = lazy(() => import('./pages/Careers'));
const ContactUs = lazy(() => import('./pages/ContactUs'));
const TrustScoreInfo = lazy(() => import('./pages/TrustScoreInfo'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const RefundPolicy = lazy(() => import('./pages/RefundPolicy'));

const AdminShell = lazy(() => import('./components/admin/AdminShell'));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'));
const AdminDisputeQueue = lazy(() => import('./pages/admin/AdminDisputeQueue'));
const AdminUserLookup = lazy(() => import('./pages/admin/AdminUserLookup'));
const AdminTransactions = lazy(() => import('./pages/admin/AdminTransactions'));
const AdminSubmissions = lazy(() => import('./pages/admin/AdminSubmissions'));
const AdminDisputeDetail = lazy(() => import('./pages/admin/AdminDisputeDetail'));
const AdminUserDetail = lazy(() => import('./pages/admin/AdminUserDetail'));
const AdminPlatformStats = lazy(() => import('./pages/admin/AdminPlatformStats'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('StayVise App Crash:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-brand-fog p-4 text-center">
          <div className="bg-white p-8 rounded-3xl shadow-card border border-brand-border-strong max-w-md">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <RotateCcw className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="font-display text-2xl font-bold text-brand-ink mb-2">Something went wrong</h2>
            <p className="text-brand-slate mb-8">We encountered an error while rendering your dashboard. This usually happens during data sync.</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-brand-forest text-white font-bold rounded-lg hover:bg-brand-forest/90 transition-colors w-full"
            >
              Refresh Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import { RotateCcw as RotateCcwIcon } from 'lucide-react';
const RotateCcw = RotateCcwIcon;

// Auth Guard
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, user } = useAuthStore();
  
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  
  // If we are authenticated but user object isn't in store yet, wait for rehydration/fetch
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-fog">
        <div className="animate-spin w-8 h-8 rounded-full border-4 border-brand-forest border-t-transparent" />
      </div>
    );
  }

  // Force basic onboarding gate unless we are actually on the onboarding page
  if (!user.onboarding_complete && window.location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  // Prevent going back to onboarding if already complete
  if (user.onboarding_complete && window.location.pathname === '/onboarding') {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
};

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <ToastProvider />
        <Suspense fallback={
          <div className="min-h-screen flex items-center justify-center bg-brand-fog">
            <div className="animate-spin w-8 h-8 rounded-full border-4 border-brand-forest border-t-transparent" />
          </div>
        }>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/verify-link" element={<VerifyLink />} />
            <Route path="/pay/:id" element={<PaymentPage />} />
            <Route path="/p/:id" element={<PublicProfile />} />
            <Route path="/about" element={<AboutUs />} />
            <Route path="/careers" element={<Careers />} />
            <Route path="/contact" element={<ContactUs />} />
            <Route path="/trust-score" element={<TrustScoreInfo />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/refund" element={<RefundPolicy />} />

            {/* Protected Routes directly outside standard layout if special */}
            <Route path="/onboarding" element={
              <ProtectedRoute><Onboarding /></ProtectedRoute>
            } />
            <Route path="/onboarding/complete" element={
              <ProtectedRoute><OnboardingComplete /></ProtectedRoute>
            } />
            
            {/* Dashboard area wrapped in Layout */}
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/projects/create" element={<CreateProject />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/payments" element={<PaymentsHistory />} />
              <Route path="/disputes" element={<DisputeCentre />} />
              <Route path="/disputes/:id" element={<DisputeCentre />} />
            </Route>

            <Route path="/p/:id" element={<PublicProfile />} />

            {/* Admin Login - Public but Hidden */}
            <Route path="/admin/login" element={<AdminLogin />} />

            {/* Admin Section - Dedicated Shell */}
            <Route path="/admin" element={<AdminShell />}>
              <Route index element={<AdminOverview />} />
              <Route path="disputes" element={<AdminDisputeQueue />} />
              <Route path="disputes/:id" element={<AdminDisputeDetail />} />
              <Route path="users" element={<AdminUserLookup />} />
              <Route path="users/:id" element={<AdminUserDetail />} />
              <Route path="transactions" element={<AdminTransactions />} />
              <Route path="submissions" element={<AdminSubmissions />} />
              <Route path="stats" element={<AdminPlatformStats />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
        <WhatsAppWidget />
      </ErrorBoundary>
    </BrowserRouter>
  );
}

