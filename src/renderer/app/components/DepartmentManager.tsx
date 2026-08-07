import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Search, Building2, CheckCircle2, XCircle } from 'lucide-react';
import { HanetDepartment } from '@shared/types';
import { friendlyErrorMessage } from '../utils/friendlyError';

interface DepartmentManagerProps {
  onNotify: (type: 'success' | 'error', message: string) => void;
  /** Phòng ban thuộc về một place cụ thể — đổi place ở ActivePlaceSwitcher phải load lại danh sách. */
  activePlaceId: string;
}

export function DepartmentManager({ onNotify, activePlaceId }: DepartmentManagerProps) {
  const [departments, setDepartments] = useState<HanetDepartment[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadDepartments = useCallback(async (searchKeyword: string) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await window.hanetImporter.listDepartments({
        keyword: searchKeyword || undefined,
        page: 1,
        size: 100,
      });
      setDepartments(result.departments);
      setTotal(result.total);
    } catch (error) {
      setLoadError(friendlyErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activePlaceId) return;
    const timer = window.setTimeout(() => void loadDepartments(keyword), 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlaceId, keyword]);

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setIsCreating(true);
    setFeedback(null);
    try {
      const created = await window.hanetImporter.createDepartment({
        name: trimmedName,
        desc: desc.trim() || undefined,
      });
      setFeedback({ type: 'success', message: `Đã tạo phòng ban "${created.name}".` });
      onNotify('success', `Đã tạo phòng ban: ${created.name}`);
      setName('');
      setDesc('');
      await loadDepartments(keyword);
    } catch (error) {
      const message = friendlyErrorMessage(error);
      setFeedback({ type: 'error', message });
      onNotify('error', `Tạo phòng ban thất bại: ${message}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50 text-blue-600">
            <Plus size={16} />
          </div>
          <h2 className="font-semibold text-slate-800">Tạo phòng ban mới</h2>
        </div>

        <div className="grid grid-cols-5 gap-4 mb-4">
          <label className="block col-span-2">
            <span className="text-sm font-medium text-slate-600 mb-1 block">Tên phòng ban *</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Kỹ thuật"
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm placeholder:text-slate-400 placeholder:italic focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </label>
          <label className="block col-span-3">
            <span className="text-sm font-medium text-slate-600 mb-1 block">Mô tả</span>
            <input
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Mô tả phòng ban (tuỳ chọn)"
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm placeholder:text-slate-400 placeholder:italic focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </label>
        </div>

        {feedback && (
          <div
            className={`flex items-center gap-2 rounded-lg px-3 py-2 mb-3 text-sm ${
              feedback.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}
          >
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            {feedback.message}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleCreate}
            disabled={!name.trim() || isCreating}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium px-4 py-2 text-sm hover:bg-blue-700 transition-colors"
          >
            {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {isCreating ? 'Đang tạo...' : 'Tạo phòng ban'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 text-slate-600">
              <Building2 size={16} />
            </div>
            <h2 className="font-semibold text-slate-800">Danh sách phòng ban{total > 0 ? ` (${total})` : ''}</h2>
          </div>
          <div className="relative w-56">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm theo tên..."
              className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400 py-8">
            <Loader2 size={16} className="animate-spin" />
            Đang tải danh sách...
          </div>
        ) : loadError ? (
          <div className="flex items-center gap-2 rounded-lg bg-rose-50 text-rose-700 px-3 py-2 text-sm">
            <XCircle size={16} />
            {loadError}
          </div>
        ) : departments.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-8">Chưa có phòng ban nào.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {departments.map((dep) => (
              <div key={dep.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium text-slate-800">
                    {dep.name} <span className="text-slate-400 font-normal">({dep.id})</span>
                  </div>
                  {dep.desc && <div className="text-xs text-slate-400 mt-0.5">{dep.desc}</div>}
                </div>
                <div className="text-xs text-slate-400 shrink-0">{dep.numEmployee} nhân viên</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
