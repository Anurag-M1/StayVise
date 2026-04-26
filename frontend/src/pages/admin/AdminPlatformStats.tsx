import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  ShoppingBag, 
  Activity, 
  ArrowUpRight,
  Loader2,
  PieChart,
  LineChart
} from 'lucide-react';
import { api } from '../../lib/api';
import { fmtINR } from '../../lib/currency';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart as RePieChart,
  Pie,
  Cell
} from 'recharts';

export default function AdminPlatformStats() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-overview-detailed'],
    queryFn: () => api.get('/admin/overview').then(r => r.data),
    refetchInterval: 60000 // Refresh every minute
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-forest" />
      </div>
    );
  }

  const COLORS = ['#0F6E56', '#D57B43', '#0A1310', '#E5E7EB'];

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="font-display font-bold text-3xl text-brand-ink">Platform Intelligence</h1>
          <p className="text-brand-slate font-medium">Real-time performance metrics and growth dynamics.</p>
        </div>
        <div className="px-4 py-2 bg-brand-forest/10 rounded-xl border border-brand-forest/20 text-brand-forest font-bold text-xs flex items-center gap-2">
          <Activity size={14} className="animate-pulse" /> Live Synchronized
        </div>
      </div>

      {/* Metric Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          label="Total Volume (TTV)" 
          value={`₹${fmtINR(data.stats.volume_processed_today)}`} 
          delta={`+${data.stats.volume_delta}%`}
          icon={<ShoppingBag className="text-brand-forest" />} 
        />
        <MetricCard 
          label="New Users" 
          value={data.stats.new_users_today} 
          delta={`+${data.stats.new_users_delta}`}
          icon={<Users className="text-blue-600" />} 
        />
        <MetricCard 
          label="Project Highs" 
          value={data.stats.projects_created_today} 
          delta={`+${data.stats.projects_delta}%`} 
          icon={<TrendingUp className="text-brand-amber" />} 
        />
        <MetricCard 
          label="Open Disputes" 
          value={data.stats.disputes_opened_today} 
          status={data.stats.disputes_severity}
          icon={<BarChart3 className={data.stats.disputes_severity === 'danger' ? 'text-red-500' : 'text-brand-slate'} />} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Growth Chart */}
        <div className="lg:col-span-2 bg-white rounded-[2rem] border border-brand-border-strong p-8 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-display font-bold text-xl text-brand-ink flex items-center gap-2">
              <LineChart className="text-brand-forest" size={20} /> Transaction Volume Growth
            </h3>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.charts.daily_volume}>
                <defs>
                  <linearGradient id="colorVol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0F6E56" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#0F6E56" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F2F4F7" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#98A2B3', fontSize: 10, fontWeight: 700}}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#98A2B3', fontSize: 10, fontWeight: 700}}
                  tickFormatter={(val) => `₹${val/1000}k`}
                />
                <Tooltip 
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)'}}
                  itemStyle={{fontWeight: 700, fontSize: '12px'}}
                />
                <Area type="monotone" dataKey="volume" stroke="#0F6E56" strokeWidth={3} fillOpacity={1} fill="url(#colorVol)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="bg-white rounded-[2rem] border border-brand-border-strong p-8 shadow-sm">
          <h3 className="font-display font-bold text-xl text-brand-ink mb-8 flex items-center gap-2">
            <PieChart className="text-brand-forest" size={20} /> Project Health
          </h3>
          <div className="h-[250px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie
                  data={data.charts.status_breakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="count"
                >
                  {data.charts.status_breakdown.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </RePieChart>
            </ResponsiveContainer>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
               <span className="block text-2xl font-display font-bold text-brand-ink line-height-none">
                {data.charts.status_breakdown.reduce((acc: number, curr: any) => acc + curr.count, 0)}
               </span>
               <span className="text-[10px] font-bold text-brand-mist uppercase tracking-widest">Total</span>
            </div>
          </div>
          <div className="mt-8 space-y-3">
            {data.charts.status_breakdown.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{backgroundColor: COLORS[idx % COLORS.length]}} />
                  <span className="text-xs font-bold text-brand-slate capitalize">{item.status.replace('_', ' ')}</span>
                </div>
                <span className="text-xs font-bold text-brand-ink">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, delta, status, icon }: any) {
  return (
    <div className="bg-white border border-brand-border-strong rounded-[2rem] p-8 shadow-sm relative overflow-hidden group hover:border-brand-forest transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="p-3 bg-brand-fog rounded-2xl group-hover:bg-brand-forest/10 transition-colors">{icon}</div>
        {delta && (
          <div className="flex items-center gap-1 text-brand-forest text-xs font-bold">
            <ArrowUpRight size={14} /> {delta}
          </div>
        )}
        {status && (
          <div className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest ${
            status === 'danger' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-brand-fog text-brand-slate border border-brand-border'
          }`}>
            {status}
          </div>
        )}
      </div>
      <div>
        <span className="text-[11px] font-bold text-brand-mist uppercase tracking-widest block mb-1">{label}</span>
        <div className="text-3xl font-display font-bold text-brand-ink">{value}</div>
      </div>
    </div>
  );
}
