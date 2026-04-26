import React from 'react';
import { 
  ShieldAlert, 
  ArrowUpRight, Clock, AlertTriangle,
  User, Briefcase, Zap, Users
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { fmtINR } from '../../lib/currency';
import { 
  Chart as ChartJS, 
  CategoryScale, LinearScale, PointElement, LineElement, 
  Title, Tooltip, Legend, Filler, ArcElement 
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, 
  Title, Tooltip, Legend, Filler, ArcElement
);

export default function AdminOverview() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-overview-sync'],
    queryFn: () => api.get('/admin/overview').then(r => r.data),
    refetchInterval: 5000 // Real-time pulse every 5s
  });
  
  if (isError) return (
    <div className="min-h-[600px] flex items-center justify-center p-8">
      <div className="bg-white border border-brand-border-strong rounded-[2.5rem] p-12 text-center max-w-md shadow-sm">
        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="text-red-500" size={40} />
        </div>
        <h3 className="text-2xl font-display font-bold text-brand-ink mb-2">Sync Interrupted</h3>
        <p className="text-brand-slate font-medium mb-8">We couldn't connect to the platform metrics engine. This might be a temporary network issue.</p>
        <button 
          onClick={() => refetch()}
          className="w-full bg-brand-forest text-white h-14 rounded-2xl font-bold hover:shadow-lg transition-all"
        >
          Check Pulse Again
        </button>
      </div>
    </div>
  );
  
  if (isLoading || !data) return <LoadingGrid />;

  const { stats, charts, alerts, active_disputes } = data;

  const volumeChartData = {
    labels: charts.daily_volume.map((p: any) => p.date),
    datasets: [{
      label: 'Platform Volume',
      data: charts.daily_volume.map((p: any) => p.volume),
      borderColor: '#0F6E56',
      backgroundColor: 'rgba(15, 110, 86, 0.05)',
      fill: true,
      tension: 0.4,
      pointRadius: 4,
      pointHoverRadius: 6,
    }]
  };

  const statusPieData = {
    labels: charts.status_breakdown.map((p: any) => p.status.replace('_', ' ')),
    datasets: [{
      data: charts.status_breakdown.map((p: any) => p.count),
      backgroundColor: ['#0F6E56', '#D57B43', '#0A1310', '#94A3B8'],
      borderWidth: 0,
    }]
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      
      {/* 4-Card Metrics Grid (Lifetime Totals) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
         <MetricCard 
            label="Total Users" 
            value={stats.total_users} 
            icon={<Users className="text-brand-forest" size={20}/>}
         />
         <MetricCard 
            label="Total Projects" 
            value={stats.total_projects} 
            icon={<Briefcase className="text-brand-forest" size={20}/>}
         />
         <MetricCard 
            label="Lifetime Volume" 
            value={`₹${fmtINR(stats.total_volume)}`} 
            icon={<Zap className="text-brand-amber" size={20}/>}
            isCurrency
         />
         <MetricCard 
            label="Open Disputes" 
            value={stats.total_open_disputes} 
            severity={stats.disputes_severity}
            icon={<ShieldAlert className={stats.disputes_severity === 'danger' ? 'text-brand-danger' : 'text-brand-mist'} size={20}/>}
            isUrgent={stats.total_open_disputes > 0}
         />
      </div>

      {/* Main Stats Row */}
      <div className="grid lg:grid-cols-3 gap-8">
         <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-brand-border-strong p-10 shadow-sm">
            <div className="flex justify-between items-center mb-10">
               <div>
                  <h3 className="font-display font-bold text-xl text-brand-ink">Financial Throughput</h3>
                  <p className="text-xs text-brand-mist font-medium mt-1">Daily aggregated transaction volume.</p>
               </div>
            </div>
            <div className="h-[300px]">
               <Line data={volumeChartData} options={chartOptions} />
            </div>
         </div>

         <div className="bg-white rounded-[2.5rem] border border-brand-border-strong p-10 shadow-sm">
            <h3 className="font-display font-bold text-xl text-brand-ink mb-2">Work Lifecycle</h3>
            <p className="text-xs text-brand-mist font-medium mb-10">Real-time status of platform projects.</p>
            <div className="h-[240px] flex items-center justify-center">
               <Doughnut data={statusPieData} options={donutOptions} />
            </div>
         </div>
      </div>

      {/* Main Dispute Queue - Enhanced with context */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-xl text-brand-ink px-2 flex items-center gap-2">
             <ShieldAlert className="text-brand-danger" size={20} /> Active Dispute Queue
          </h3>
          <div className="flex items-center gap-2 px-3 py-1 bg-brand-forest/5 rounded-full border border-brand-forest/10">
            <span className="w-1.5 h-1.5 bg-brand-forest rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-brand-forest uppercase tracking-widest leading-none">Live Sync</span>
          </div>
        </div>

        <div className="grid gap-4">
          {active_disputes && active_disputes.length > 0 ? (
            active_disputes.map((dispute: any) => (
              <div key={dispute.id} className="bg-white border border-brand-border-strong rounded-[2rem] p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-8 shadow-sm hover:shadow-float transition-all group">
                <div className="flex flex-col gap-4 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono font-bold text-brand-mist uppercase tracking-widest bg-brand-fog px-2 py-1 rounded-md border border-brand-border">Case #{dispute.id.slice(0, 8)}</span>
                    <span className="px-3 py-1 bg-red-50 text-red-600 rounded-full text-[10px] font-bold uppercase tracking-wider border border-red-100 flex items-center gap-1.5">
                      <Clock size={12} /> {dispute.status.replace('_', ' ')}
                    </span>
                    <span className="px-3 py-1 bg-brand-forest/5 text-brand-forest rounded-full text-[9px] font-bold uppercase tracking-widest border border-brand-forest/10">
                      Raised By: {dispute.raised_by?.full_name || 'N/A'}
                    </span>
                  </div>
                  
                  <div>
                    <h4 className="font-display font-bold text-xl text-brand-ink group-hover:text-brand-forest transition-colors leading-tight">
                      {dispute.project?.title || 'Unknown Project'}
                    </h4>
                    <p className="text-sm text-brand-mist font-medium mt-1 line-clamp-1">{dispute.reason}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-brand-fog rounded-full flex items-center justify-center text-brand-mist border border-brand-border group-hover:bg-white transition-colors">
                        <User size={18} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-brand-mist uppercase tracking-widest leading-none mb-1">Freelancer</p>
                        <p className="text-sm font-bold text-brand-ink">{dispute.project?.freelancer?.full_name || 'Anonymous'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-brand-fog rounded-full flex items-center justify-center text-brand-mist border border-brand-border group-hover:bg-white transition-colors">
                        <User size={18} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-brand-mist uppercase tracking-widest leading-none mb-1">Client</p>
                        <p className="text-sm font-bold text-brand-ink">{dispute.project?.client?.full_name || 'Anonymous'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="shrink-0">
                   <Link 
                     to={`/admin/disputes/${dispute.id}`} 
                     className="px-8 py-4 bg-brand-ink text-white rounded-2xl font-bold text-sm hover:bg-brand-forest transition-all shadow-xl shadow-brand-ink/10 flex items-center gap-2 group/btn"
                   >
                      Show Details
                      <ArrowUpRight size={18} className="transition-transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5" />
                   </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="py-24 bg-white rounded-[3rem] border-2 border-dashed border-brand-border-strong flex flex-col items-center justify-center text-center gap-6">
               <div className="w-20 h-20 bg-brand-fog rounded-full flex items-center justify-center">
                  <ShieldAlert size={40} className="text-brand-forest/20" />
               </div>
               <div>
                  <h3 className="font-display font-bold text-2xl text-brand-ink">All Clear</h3>
                  <p className="text-brand-slate font-medium max-w-sm mt-2 mx-auto">No platform disputes are currently awaiting mediation.</p>
               </div>
            </div>
          )}
        </div>
      </div>

      {/* System Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-6">
           <h3 className="font-display font-bold text-xl text-brand-ink px-2 flex items-center gap-2">
              <AlertTriangle className="text-brand-amber" size={20} /> Priority Alerts
           </h3>
           <div className="grid gap-4">
              {alerts.map((alert: any) => (
                <AlertRow key={alert.id} alert={alert} />
              ))}
           </div>
        </div>
      )}

    </div>
  );
}

// ── SHARED UI COMPONENTS ─────────────────────────────────────────────────────

function MetricCard({ label, value, delta, icon, isCurrency, severity, isUrgent }: any) {
  return (
    <div className={`bg-white border border-brand-border-strong rounded-[2rem] p-6 shadow-sm hover:shadow-float transition-all ${isUrgent ? 'ring-2 ring-brand-danger/10 border-brand-danger/20' : ''}`}>
       <div className="flex justify-between items-start mb-6">
          <div className={`p-3 rounded-xl border border-brand-border-strong ${isUrgent ? 'bg-red-50 text-red-500 shadow-inner' : 'bg-brand-fog'}`}>{icon}</div>
          {delta && (
             <div className="flex items-center gap-1 text-[10px] font-bold text-brand-forest uppercase tracking-widest bg-brand-forest/5 px-2 py-1 rounded-md">
                <ArrowUpRight size={10} /> {delta}
             </div>
          )}
       </div>
       <div className="text-2xl font-mono font-bold text-brand-ink tracking-tight">{value}</div>
       <div className="text-[10px] font-bold text-brand-mist uppercase tracking-widest mt-1.5">{label}</div>
    </div>
  );
}

function AlertRow({ alert }: { alert: any }) {
  const isRed = alert.severity === 'red';
  const isAmber = alert.severity === 'amber';

  return (
    <div className={`p-6 rounded-[2rem] border flex items-center justify-between gap-4 transition-all hover:scale-[1.005] ${
      isRed ? 'bg-red-50/50 border-red-100 shadow-inner' : isAmber ? 'bg-amber-50/50 border-amber-100' : 'bg-brand-forest/5 border-brand-forest/10'
    }`}>
       <div className="flex items-center gap-5">
          <div className={`p-3 rounded-xl ${isRed ? 'bg-red-500 text-white shadow-lg shadow-red-200' : isAmber ? 'bg-amber-500 text-white' : 'bg-brand-forest text-white'}`}>
             {isRed ? <AlertTriangle size={24}/> : <Clock size={24}/>}
          </div>
          <div>
            <p className={`font-bold text-base ${isRed ? 'text-red-900' : isAmber ? 'text-amber-900' : 'text-brand-forest'}`}>{alert.message}</p>
            <p className={`text-[11px] font-bold mt-1 uppercase tracking-widest ${isRed ? 'text-red-600' : 'text-amber-600'}`}>System Notification</p>
          </div>
       </div>
       <Link 
         to="/admin/disputes"
         className={`px-6 py-3 rounded-2xl text-xs font-bold transition-all ${
           isRed ? 'bg-red-600 text-white hover:bg-red-700 shadow-xl shadow-red-200' : 'text-brand-mist hover:text-brand-ink underline underline-offset-4'
         }`}
       >
          {isRed ? 'Investigate Now' : 'Dismiss'}
       </Link>
    </div>
  );
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1A1A1A', padding: 12, titleFont: { family: 'Inter', size: 10 }, bodyFont: { family: 'IBM Plex Mono', size: 12 } } },
  scales: { x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 10, weight: 600 } } }, y: { grid: { color: '#F1F5F9', borderDash: [4, 4] }, ticks: { color: '#94A3B8', font: { size: 10, weight: 600 } } } }
} as any;

const donutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20, font: { weight: 700, size: 10 } } } },
  cutout: '70%',
  animation: { duration: 2000, easing: 'easeOutQuart' }
} as any;

function LoadingGrid() {
  return (
    <div className="space-y-12 animate-pulse">
       <div className="grid grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-white border border-brand-border-strong rounded-[2rem]" />)}
       </div>
       <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 h-[400px] bg-white border border-brand-border-strong rounded-[2.5rem]" />
          <div className="h-[400px] bg-white border border-brand-border-strong rounded-[2.5rem]" />
       </div>
    </div>
  );
}
