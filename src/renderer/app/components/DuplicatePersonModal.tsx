import { X } from 'lucide-react';
import { HanetExistingPerson } from '@shared/types';

interface Props {
  open: boolean;
  onClose: () => void;
  employeeName: string;
  existingPerson: HanetExistingPerson;
}

export function DuplicatePersonModal({ open, onClose, employeeName, existingPerson }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <h3 className="font-semibold text-slate-800 text-lg">FaceID đã tồn tại</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Ảnh của <strong>{employeeName}</strong> trùng với một hồ sơ đã có trong hệ thống.
        </p>

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
          {existingPerson.avatarUrl ? (
            <img src={existingPerson.avatarUrl} className="h-12 w-12 rounded-full object-cover" alt="" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-slate-200" />
          )}
          <div>
            <div className="font-medium text-slate-800 text-sm">{existingPerson.name}</div>
            <div className="text-xs text-slate-400">{existingPerson.placeName}</div>
          </div>
        </div>

        <dl className="mt-4 divide-y divide-slate-100 text-sm">
          <Row label="Họ và tên" value={existingPerson.name} />
          <Row label="Loại" value={existingPerson.title || 'Nhân viên'} />
          <Row label="Địa điểm" value={existingPerson.placeName} />
        </dl>

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
        >
          Đóng
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2">
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-700">{value || '—'}</dd>
    </div>
  );
}
