import React, { useState } from 'react';
import { 
  Users, Search, Filter, Mail, Phone, 
  MapPin, ShieldCheck, ShieldAlert, MoreVertical,
  CheckCircle2, Ban, UserCheck, Star, Zap
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { format } from 'date-fns';
import { useToast } from '../../components/ui/Toast';
import { Link } from 'react-router-dom';

export default function AdminUserLookup() {
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [verifiedFilter, setVerifiedFilter] = useState<string>('all');
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: users, isLoading, isFetching } = useQuery({
    queryKey: ['admin-user-search', query, roleFilter, statusFilter, verifiedFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (query) params.append('q', query);
      if (roleFilter !== 'all') params.append('role', roleFilter);
      if (statusFilter !== 'all') params.append('is_active', statusFilter === 'active' ? 'true' : 'false');
      if (verifiedFilter !== 'all') params.append('is_verified', verifiedFilter === 'verified' ? 'true' : 'false');
      
      return api.get(`/admin/users?${params.toString()}`).then(r => r.data);
    },
    refetchInterval: 5000,
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id, verified }: { id: string, verified: boolean }) => api.patch(`/admin/users/${id}`, { is_verified: verified }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-user-search'] });
      toast({ title: 'Status updated', description: 'User verification status has been synchronized.' });
    }
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Search Header */}
      <div className="bg-white p-8 rounded-[2rem] border border-brand-border-strong shadow-sm space-y-6">
         <div className="flex flex-col md:flex-row gap-6 items-center">
            <div className="flex-1 w-full relative">
               <input 
                 value={query}
                 onChange={(e) => setQuery(e.target.value)}
                 placeholder="Search by name, phone, email or @username..."
                 className="w-full h-14 bg-brand-fog rounded-2xl pl-12 pr-6 border border-brand-border-strong focus:border-brand-forest outline-none font-medium transition-all"
               />
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-mist" size={20} />
               {isFetching && (
                 <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                   <div className="w-2 h-2 bg-brand-forest rounded-full animate-ping" />
                   <span className="text-[10px] font-bold text-brand-forest uppercase tracking-widest">Syncing</span>
                 </div>
               )}
            </div>
            <div className="flex gap-2">
               <Button 
                 variant={showFilters ? 'primary' : 'outline'}
                 onClick={() => setShowFilters(!showFilters)}
                 className={`h-14 px-6 border-brand-border-strong flex items-center gap-2 font-bold ${showFilters ? 'bg-brand-ink text-white' : 'text-brand-mist'}`}
               >
                  <Filter size={18} /> Filters
               </Button>
               <Button 
                 onClick={() => qc.invalidateQueries({ queryKey: ['admin-user-search'] })}
                 className="h-14 bg-brand-forest text-white px-8 font-bold shadow-lg shadow-brand-forest/20"
               >
                  Lookup User
               </Button>
            </div>
         </div>

         {showFilters && (
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-brand-border animate-in slide-in-from-top-2">
              <div className="space-y-2">
                 <label className="text-[10px] font-bold text-brand-mist uppercase tracking-widest pl-1">Platform Role</label>
                 <select 
                   value={roleFilter} 
                   onChange={(e) => setRoleFilter(e.target.value)}
                   className="w-full h-12 bg-brand-fog border border-brand-border-strong rounded-xl px-4 text-sm font-bold text-brand-ink outline-none"
                 >
                    <option value="all">All Roles</option>
                    <option value="freelancer">Freelancers</option>
                    <option value="client">Clients</option>
                    <option value="admin">Administrators</option>
                 </select>
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-bold text-brand-mist uppercase tracking-widest pl-1">Account Status</label>
                 <select 
                   value={statusFilter} 
                   onChange={(e) => setStatusFilter(e.target.value)}
                   className="w-full h-12 bg-brand-fog border border-brand-border-strong rounded-xl px-4 text-sm font-bold text-brand-ink outline-none"
                 >
                    <option value="all">All Statuses</option>
                    <option value="active">Active Members</option>
                    <option value="banned">Banned/Inactive</option>
                 </select>
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-bold text-brand-mist uppercase tracking-widest pl-1">Verification</label>
                 <select 
                   value={verifiedFilter} 
                   onChange={(e) => setVerifiedFilter(e.target.value)}
                   className="w-full h-12 bg-brand-fog border border-brand-border-strong rounded-xl px-4 text-sm font-bold text-brand-ink outline-none"
                 >
                    <option value="all">Verification Status</option>
                    <option value="verified">Verified Pro</option>
                    <option value="unverified">Standard User</option>
                 </select>
              </div>
           </div>
         )}
      </div>

      {/* User Table */}
      <div className="bg-white rounded-[2.5rem] border border-brand-border-strong shadow-sm overflow-hidden min-h-[400px]">
         <div className="overflow-x-auto">
            <table className="w-full text-left">
               <thead className="bg-brand-fog/50 border-b border-brand-border-strong">
                  <tr className="text-[11px] font-bold text-brand-mist uppercase tracking-widest">
                     <th className="px-8 py-5">User Identity</th>
                     <th className="px-8 py-5">Trust Score</th>
                     <th className="px-8 py-5">Account Status</th>
                     <th className="px-8 py-5">Role</th>
                     <th className="px-8 py-5">Joined</th>
                     <th className="px-8 py-5 text-right">Actions</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-brand-border-strong">
                  {isLoading ? (
                    [1,2,3].map(i => <tr key={i} className="animate-pulse h-20 bg-white/50" />)
                  ) : users?.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-8 py-20 text-center text-brand-mist font-medium">No users found matching your search.</td>
                    </tr>
                  ) : users?.map((user: any) => (
                    <tr key={user.id} className="group hover:bg-brand-fog/30 transition-colors">
                       <td className="px-8 py-5">
                          <Link to={`/admin/users/${user.id}`} className="flex items-center gap-4 hover:opacity-80 transition-opacity">
                             <div className="w-10 h-10 bg-brand-forest/10 rounded-full flex items-center justify-center text-brand-forest font-bold text-sm border-2 border-brand-forest/20">
                                {(user.full_name?.[0] || '?').toUpperCase()}
                             </div>
                             <div>
                                <h4 className="font-bold text-brand-ink text-sm flex items-center gap-2">
                                   {user.full_name || 'New Registration'}
                                   {user.is_verified && <ShieldCheck size={14} className="text-brand-forest" />}
                                </h4>
                                <p className="text-[11px] font-medium text-brand-mist">@{user.username || 'unregistered'}</p>
                             </div>
                          </Link>
                       </td>
                       <td className="px-8 py-5">
                          <div className="flex items-center gap-2">
                             <Zap size={14} className="text-brand-forest" />
                             <span className="font-mono font-bold text-sm text-brand-ink">{user.trust_score?.score || 0}</span>
                          </div>
                          <p className="text-[9px] font-bold text-brand-mist uppercase tracking-widest mt-0.5">Rolling Metric</p>
                       </td>
                       <td className="px-8 py-5">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            user.is_active ? 'bg-brand-forest-light text-brand-forest border-brand-forest/20' : 'bg-red-100 text-red-700 border-red-200'
                          }`}>
                            {user.is_active ? 'Active' : 'Banned'}
                          </span>
                       </td>
                       <td className="px-8 py-5 text-[12px] font-bold text-brand-slate uppercase tracking-tight">
                          {user.role}
                       </td>
                       <td className="px-8 py-5 text-[12px] font-medium text-brand-slate">
                          {format(new Date(user.created_at), 'MMM yyyy')}
                       </td>
                       <td className="px-8 py-5 text-right">
                          <div className="flex justify-end gap-2 px-6">
                             <Button 
                               variant="ghost" 
                               size="sm" 
                               className={`h-9 px-3 font-bold text-[11px] uppercase ${user.is_verified ? 'text-brand-mist' : 'text-brand-forest bg-brand-forest/5'}`}
                               onClick={(e) => {
                                 e.stopPropagation();
                                 verifyMutation.mutate({ id: user.id, verified: !user.is_verified })
                               }}
                             >
                                {user.is_verified ? 'Revoke Verif' : 'Verify Pro'}
                             </Button>
                             <Link to={`/admin/users/${user.id}`} className="p-2 text-brand-mist hover:text-brand-ink rounded-lg bg-brand-fog">
                                <Search size={18} />
                             </Link>
                          </div>
                       </td>
                    </tr>
                  ))}
               </tbody>
            </table>
         </div>
         
         <div className="px-8 py-6 bg-brand-fog/50 border-t border-brand-border-strong flex justify-between items-center">
            <p className="text-[11px] font-bold text-brand-mist uppercase tracking-widest">Showing {users?.length || 0} users</p>
            <div className="flex gap-4">
               <button className="text-xs font-bold text-brand-mist hover:underline uppercase tracking-widest">First</button>
               <button className="text-xs font-bold text-brand-ink hover:underline uppercase tracking-widest">Next Page</button>
            </div>
         </div>
      </div>

    </div>
  );
}
