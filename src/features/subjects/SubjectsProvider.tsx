import { type ReactNode, createContext, useContext } from 'react';
import type { Subject } from '../../data/models';
import { subscribeSubjects } from '../../data/subjects';
import { type Live, useLive } from '../../data/useLive';
import { useSignedInUser } from '../../app/session/SessionProvider';

const SubjectsContext = createContext<Live<Subject[]>>({ status: 'loading' });

export function SubjectsProvider({ children }: { children: ReactNode }) {
  const { uid } = useSignedInUser();
  const live = useLive<Subject[]>(uid, (next, fail) => subscribeSubjects(uid, next, fail));
  return <SubjectsContext.Provider value={live}>{children}</SubjectsContext.Provider>;
}

export function useSubjects(): Live<Subject[]> {
  return useContext(SubjectsContext);
}

/** Looks up a subject by id once subjects are loaded. */
export function useSubject(id: string | null | undefined): Subject | undefined {
  const live = useSubjects();
  if (!id || live.status !== 'ready') return undefined;
  return live.data.find((s) => s.id === id);
}
