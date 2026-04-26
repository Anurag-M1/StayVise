// Types reflecting backend Pydantic models
export type UserRole = 'freelancer' | 'client' | 'admin';

export interface User {
  id: string;
  unique_id: string;
  phone_number: string;
  full_name: string;
  email: string | null;
  whatsapp_name: string | null;
  username: string | null;
  avatar_url?: string | null;
  role: UserRole;
  is_verified: boolean;
  is_active: boolean;
  onboarding_complete: boolean;
  bio?: string | null;
  notification_prefs?: Record<string, unknown>;
  payout_details?: Record<string, unknown>;
  billing_plan?: string;
  created_at: string;
  updated_at: string;
  trust_score?: TrustScore;
}

export interface TrustScore {
  score: number;
  total_projects: number;
  completed_projects: number;
  disputed_projects: number;
  avg_delivery_days: number | null;
  response_rate: number;
  last_calculated_at: string | null;
}

export interface PublicProfile {
  id: string;
  unique_id: string;
  full_name: string;
  whatsapp_name: string | null;
  username: string | null;
  avatar_url?: string | null;
  role: UserRole;
  created_at: string;
  bio?: string | null;
  trust_score?: TrustScore;
  total_secured_amount: number;
  badges: string[];
  recent_projects: RecentProject[];
}

export interface RecentProject {
  id: string;
  category: string;
  anonymized_title: string;
  amount_min: number;
  amount_max: number;
  duration_days: number;
  milestone_count: number;
  completed_at: string;
}

export interface ProjectParty {
  id: string;
  unique_id: string;
  full_name: string;
  phone_number: string;
  username: string | null;
  avatar_url?: string | null;
  role: UserRole;
  is_verified: boolean;
}

export interface Milestone {
  id?: string;
  title: string;
  description: string;
  amount: number;
  sequence_number: number;
  status?: 'pending' | 'submitted' | 'approved' | 'disputed' | 'released';
  submitted_at?: string | null;
  approved_at?: string | null;
  released_at?: string | null;
  razorpay_payout_id?: string | null;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  freelancer_id: string;
  client_id: string;
  status: 'draft' | 'open' | 'awaiting_payment' | 'in_progress' | 'completed' | 'disputed' | 'cancelled';
  total_amount: number;
  platform_fee_amount: number;
  freelancer_payout_amount: number;
  currency: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  escrow_held_at: string | null;
  deadline: string | null;
  auto_release_at: string | null;
  created_at: string;
  updated_at: string;
  milestones: Milestone[];
  proposals?: Proposal[];
  freelancer?: ProjectParty | null;
  client?: ProjectParty | null;
  is_public: boolean;
}

export interface Proposal {
  id: string;
  project_id: string;
  freelancer_id: string;
  amount: number;
  cover_letter: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
  freelancer?: ProjectParty;
}

export interface ProposalCreatePayload {
  amount: number;
  cover_letter: string;
}

export interface ProjectListItem {
  id: string;
  title: string;
  freelancer_id: string | null;
  client_id: string;
  status: Project['status'];
  total_amount: number;
  currency: string;
  deadline: string | null;
  created_at: string;
  updated_at: string;
  freelancer?: ProjectParty | null;
  client?: ProjectParty | null;
}

export interface CreateProjectPayload {
  title: string;
  description: string;
  client_phone?: string;
  is_public?: boolean;
  counterparty_name?: string;
  deadline?: string;
  milestones: Milestone[];
}

export interface UserStats {
  escrow_balance: number;
  total_released: number;
  total_earned: number;
  total_spent: number;
  active_projects: number;
  pending_actions: number;
}

export interface UserLookupResponse {
  exists: boolean;
  user: (ProjectParty & { trust_score?: TrustScore }) | null;
}

export interface PaymentOrderResponse {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  project_id: string;
  description: string;
}

export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  amount?: number;
  created_at: string;
  project_id: string;
  status: string;
}

export interface PaymentStats {
  total_received: number;
  total_spent: number;
  platform_fees_paid: number;
  pending_escrow: number;
  transaction_count: number;
  verified_entries: number;
  last_entry_at: string | null;
}

export interface PlanLimits {
  max_active_projects: number;
  escrow_fee_percent: number;
  has_priority_disputes: boolean;
  has_verified_badge: boolean;
  has_gst_invoices: boolean;
  has_custom_url: boolean;
}

export interface BillingSummary {
  role: UserRole;
  billing_plan: string;
  is_subscription_active: boolean;
  renewal_date: string | null;
  features: string[];
  summary: string;
  plan_limits: PlanLimits;
}

export interface LedgerEntry {
  id: string;
  created_at: string;
  project_title: string;
  milestone_title?: string | null;
  amount: number;
  transaction_type: string;
  status: string;
  razorpay_reference?: string | null;
  audit_hash?: string | null;
  previous_audit_hash?: string | null;
  is_audit_verified: boolean;
}

export interface DashboardNotification {
  id: string;
  user_id: string;
  type: string;
  channel: string;
  payload: {
    title?: string;
    description?: string;
    path?: string;
    [key: string]: unknown;
  };
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  created_at: string;
}
