import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: 'slate' | 'emerald' | 'amber' | 'rose';
}

const toneMap: Record<StatCardProps['tone'], string> = {
  slate: 'bg-slate-50 text-slate-700 border-slate-200/80',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  amber: 'bg-amber-50 text-amber-700 border-amber-200/80',
  rose: 'bg-rose-50 text-rose-700 border-rose-200/80',
};

export function StatCard({ label, value, icon: Icon, tone }: StatCardProps) {
  return (
    <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${toneMap[tone]}`}>
      <Icon size={20} strokeWidth={2} />
      <div>
        <div className="text-xl font-semibold leading-none">{value}</div>
        <div className="text-xs mt-1 opacity-80">{label}</div>
      </div>
    </div>
  );
}
