import axios from 'axios';
import logger from '../logger';
import { HanetDepartment } from '../../shared/types';

function departmentUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

interface RawDepartment {
  id: number;
  placeId: string;
  name: string;
  desc?: string;
  numEmployee?: string;
  enable?: number;
  status?: number;
}

interface RawDepartmentsResponse {
  returnCode?: number;
  returnMessage?: string;
  data?: {
    count?: string;
    totals?: string;
    hits?: RawDepartment[];
  };
}

interface RawCreateDepartmentResponse {
  returnCode?: number;
  returnMessage?: string;
  data?: RawDepartment;
}

function toHanetDepartment(dep: RawDepartment): HanetDepartment {
  return {
    id: dep.id,
    placeId: dep.placeId,
    name: dep.name,
    desc: dep.desc || '',
    numEmployee: dep.numEmployee || '0',
    enable: dep.enable ?? 0,
    status: dep.status ?? 0,
  };
}

export async function listDepartments(
  baseUrl: string,
  accessToken: string,
  placeID: string,
  options: { keyword?: string; page?: number; size?: number } = {},
): Promise<{ departments: HanetDepartment[]; total: number }> {
  const body = new URLSearchParams({ token: accessToken, placeID });
  if (options.keyword) body.set('keyword', options.keyword);
  body.set('page', String(options.page ?? 1));
  body.set('size', String(options.size ?? 20));

  const response = await axios.post<RawDepartmentsResponse>(
    departmentUrl(baseUrl, '/department/list'),
    body.toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    },
  );

  const data = response.data;
  if (data?.returnCode !== 1 || !data.data) {
    logger.warn('[HanetDepartments] Phản hồi không hợp lệ:', data);
    throw new Error(data?.returnMessage || 'Không lấy được danh sách phòng ban từ Hanet.');
  }

  return {
    departments: (data.data.hits ?? []).map(toHanetDepartment),
    total: Number(data.data.totals ?? data.data.hits?.length ?? 0),
  };
}

export async function createDepartment(
  baseUrl: string,
  accessToken: string,
  placeID: string,
  name: string,
  desc?: string,
): Promise<HanetDepartment> {
  const body = new URLSearchParams({ token: accessToken, placeID, name });
  if (desc) body.set('desc', desc);

  const response = await axios.post<RawCreateDepartmentResponse>(
    departmentUrl(baseUrl, '/department/create'),
    body.toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    },
  );

  const data = response.data;
  if (data?.returnCode !== 1 || !data.data) {
    logger.warn('[HanetDepartments] Tạo phòng ban thất bại:', data);
    throw new Error(data?.returnMessage || 'Không tạo được phòng ban trên Hanet.');
  }

  return toHanetDepartment(data.data);
}
