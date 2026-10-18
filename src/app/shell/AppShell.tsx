import { Outlet } from 'react-router-dom';
import { NewNotebookProvider } from '../../features/notebooks/NewNotebookProvider';
import { NotebooksProvider } from '../../features/notebooks/NotebooksProvider';
import { SubjectsProvider } from '../../features/subjects/SubjectsProvider';
import { MobileTabBar, MobileTopBar } from './MobileBars';
import { NewNotebookButton } from './NewNotebookButton';
import { Sidebar } from './Sidebar';

/** Layout for the main app areas. Editors (whiteboard, reader) render outside it, full screen. */
export function AppShell() {
  return (
    <SubjectsProvider>
      <NotebooksProvider>
        <NewNotebookProvider>
          <div className="flex min-h-dvh">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <MobileTopBar />
              <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-8 md:pb-12">
                <Outlet />
              </main>
            </div>
          </div>
          <MobileTabBar />
          <NewNotebookButton variant="fab" />
        </NewNotebookProvider>
      </NotebooksProvider>
    </SubjectsProvider>
  );
}
