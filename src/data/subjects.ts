import { z } from 'zod';
import { LIMITS, type Subject, type SubjectColor, subjectSchema } from '../shared/schemas';
import { getJson, send } from './api';
import { live } from './events';

export function cleanSubjectName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, LIMITS.subjectName);
}

export function subscribeSubjects(_uid: string, next: (s: Subject[]) => void, fail: (e: unknown) => void) {
  return live(() => getJson('/api/subjects', z.array(subjectSchema)), ['subjects'], next, fail);
}

export async function createSubject(_uid: string, name: string, color: SubjectColor): Promise<string> {
  const res = (await send('POST', '/api/subjects', { name: cleanSubjectName(name), color })) as { id: string };
  return res.id;
}

export async function updateSubject(_uid: string, id: string, patch: { name?: string; color?: SubjectColor }) {
  await send('PATCH', `/api/subjects/${encodeURIComponent(id)}`, {
    ...(patch.name !== undefined ? { name: cleanSubjectName(patch.name) } : {}),
    ...(patch.color !== undefined ? { color: patch.color } : {}),
  });
}

/** Notebooks in the subject are kept and become "No subject". */
export async function deleteSubject(_uid: string, id: string): Promise<void> {
  await send('DELETE', `/api/subjects/${encodeURIComponent(id)}`);
}
