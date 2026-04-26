import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type {
  Milestone,
  Project,
  ProjectParty,
  PublicProfile,
  RecentProject,
  TrustScore,
  User,
  UserStats,
  ActivityItem,
  DashboardNotification,
  LedgerEntry,
  PaymentStats,
  BillingSummary,
} from './types';

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const normalizeTrustScore = (trustScore?: TrustScore | null): TrustScore | undefined => {
  if (!trustScore) {
    return undefined;
  }

  return {
    ...trustScore,
    score: toNumber(trustScore.score),
    avg_delivery_days: trustScore.avg_delivery_days === null ? null : toNumber(trustScore.avg_delivery_days),
    response_rate: toNumber(trustScore.response_rate),
  };
};

const normalizeProjectParty = (party?: ProjectParty | null): ProjectParty | null | undefined => {
  if (!party) {
    return party;
  }
  return {
    ...party,
    username: party.username ?? null,
    avatar_url: party.avatar_url ?? null,
  };
};

const normalizeMilestone = (milestone: Milestone): Milestone => ({
  ...milestone,
  amount: toNumber(milestone.amount),
  razorpay_payout_id: milestone.razorpay_payout_id ?? null,
});

const normalizeProject = (project: Project): Project => ({
  ...project,
  total_amount: toNumber(project.total_amount),
  platform_fee_amount: toNumber(project.platform_fee_amount),
  freelancer_payout_amount: toNumber(project.freelancer_payout_amount),
  razorpay_order_id: project.razorpay_order_id ?? null,
  razorpay_payment_id: project.razorpay_payment_id ?? null,
  escrow_held_at: project.escrow_held_at ?? null,
  deadline: project.deadline ?? null,
  auto_release_at: project.auto_release_at ?? null,
  milestones: Array.isArray(project.milestones) ? project.milestones.map(normalizeMilestone) : [],
  freelancer: normalizeProjectParty(project.freelancer),
  client: normalizeProjectParty(project.client),
});

const normalizeRecentProject = (project: RecentProject): RecentProject => ({
  ...project,
  amount_min: toNumber(project.amount_min),
  amount_max: toNumber(project.amount_max),
});

const normalizeUser = (user: User): User => ({
  ...user,
  email: user.email ?? null,
  whatsapp_name: user.whatsapp_name ?? null,
  username: user.username ?? null,
  bio: user.bio ?? null,
  avatar_url: user.avatar_url ?? null,
  payout_details: user.payout_details ?? {},
  trust_score: normalizeTrustScore(user.trust_score),
});

const normalizePublicProfile = (profile: PublicProfile): PublicProfile => ({
  ...profile,
  whatsapp_name: profile.whatsapp_name ?? null,
  username: profile.username ?? null,
  bio: profile.bio ?? null,
  avatar_url: profile.avatar_url ?? null,
  trust_score: normalizeTrustScore(profile.trust_score),
  total_secured_amount: toNumber(profile.total_secured_amount),
  recent_projects: Array.isArray(profile.recent_projects)
    ? profile.recent_projects.map(normalizeRecentProject)
    : [],
});

// ------------- Auth -------------

export const useMyProfile = () => {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data } = await api.get<User>('/users/me');
      return normalizeUser(data);
    },
    refetchInterval: 5000,
  });
};

export const useStats = () => {
  return useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const { data } = await api.get<UserStats>('/users/me/stats');
      const stats = data || {};
      return {
        ...stats,
        escrow_balance: toNumber(stats.escrow_balance),
        total_released: toNumber(stats.total_released),
        total_earned: toNumber(stats.total_earned),
        total_spent: toNumber(stats.total_spent),
        active_projects: toNumber(stats.active_projects),
        pending_actions: toNumber(stats.pending_actions),
      };
    },
    refetchInterval: 5000,
  });
};

// ------------- Projects -------------

export const useProjects = (status?: string) => {
  return useQuery({
    queryKey: ['projects', { status }],
    queryFn: async () => {
      const { data } = await api.get<{items: Project[]}>(`/projects`, { params: { status } });
      const items = Array.isArray(data?.items) ? data.items : [];
      return items.map(normalizeProject);
    },
    refetchInterval: 5000, // Sync every 5s
  });
};

export const useProject = (id: string) => {
  return useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const { data } = await api.get<Project>(`/projects/${id}`);
      return normalizeProject(data);
    },
    enabled: !!id,
    refetchInterval: 5000, // Sync every 5s
  });
};

// ------------- Profiles -------------

export const usePublicProfile = (userId: string) => {
  return useQuery({
    queryKey: ['public-profile', userId],
    queryFn: async () => {
      const { data } = await api.get<PublicProfile>(`/users/${userId}/profile`);
      return normalizePublicProfile(data);
    },
    enabled: !!userId,
  });
};

export const useActivity = (limit: number = 10) => {
  return useQuery({
    queryKey: ['activity', { limit }],
    queryFn: async () => {
      const response = await api.get<any>('/users/me/activity', { params: { limit } });
      const items = Array.isArray(response.data?.items) ? response.data.items : Array.isArray(response.data) ? response.data : [];
      return items as ActivityItem[];
    },
    refetchInterval: 5000,
  });
};

export const usePaymentStats = () => {
  return useQuery({
    queryKey: ['payment-stats'],
    queryFn: async () => {
      const { data } = await api.get<PaymentStats>('/payments/me/stats');
      return {
        ...data,
        total_received: toNumber(data.total_received),
        total_spent: toNumber(data.total_spent),
        platform_fees_paid: toNumber(data.platform_fees_paid),
        pending_escrow: toNumber(data.pending_escrow),
        verified_entries: toNumber(data.verified_entries),
        last_entry_at: data.last_entry_at ?? null,
      };
    },
    refetchInterval: 5000,
  });
};

export const usePaymentHistory = (params: {
  skip?: number;
  limit?: number;
  start_date?: string;
  end_date?: string;
}) => {
  return useQuery({
    queryKey: ['payment-history', params],
    queryFn: async () => {
      const { data } = await api.get<LedgerEntry[]>('/payments/history', { params });
      return data.map((entry) => ({
        ...entry,
        amount: toNumber(entry.amount),
        audit_hash: entry.audit_hash ?? null,
        previous_audit_hash: entry.previous_audit_hash ?? null,
      }));
    },
    refetchInterval: 5000,
  });
};

export const useBillingSummary = () => {
  return useQuery({
    queryKey: ['billing-summary'],
    queryFn: async () => {
      const { data } = await api.get<BillingSummary>('/users/me/billing');
      return data;
    },
    refetchInterval: 5000,
  });
};

export const useNotificationFeed = (limit: number = 20) => {
  return useQuery({
    queryKey: ['notification-feed', { limit }],
    queryFn: async () => {
      const { data } = await api.get<DashboardNotification[]>('/users/me/notifications/feed', {
        params: { limit },
      });
      return data;
    },
    refetchInterval: 5000,
  });
};
