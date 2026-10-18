import { type ReactNode, createContext, useContext } from 'react';
import { useSignedInUser } from '../../app/session/SessionProvider';
import { type Notebook, subscribeNotebooks } from '../../data/notebooks';
import { type Live, useLive } from '../../data/useLive';

const NotebooksContext = createContext<Live<Notebook[]>>({ status: 'loading' });

/** One live subscription shared by the dashboard, notebooks page, and sidebar counts. */
export function NotebooksProvider({ children }: { children: ReactNode }) {
  const { uid } = useSignedInUser();
  const live = useLive<Notebook[]>(uid, (next, fail) => subscribeNotebooks(uid, next, fail));
  return <NotebooksContext.Provider value={live}>{children}</NotebooksContext.Provider>;
}

export function useNotebooks(): Live<Notebook[]> {
  return useContext(NotebooksContext);
}

export function countBySubject(notebooks: Notebook[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const n of notebooks) if (n.subjectId) counts[n.subjectId] = (counts[n.subjectId] ?? 0) + 1;
  return counts;
}
