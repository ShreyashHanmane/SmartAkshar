import { NavLink } from 'react-router-dom';
import { t } from '../../i18n/i18n';
import { Icon } from '../../ui/Icon';
import { Wordmark } from '../../ui/Wordmark';
import { countBySubject, useNotebooks } from '../../features/notebooks/NotebooksProvider';
import { SubjectsNav } from '../../features/subjects/SubjectsNav';
import { NewNotebookButton } from './NewNotebookButton';
import { type NavItem, SIDEBAR_NAV } from './navItems';

function SideLink({ item, onNavigate }: { item: NavItem; onNavigate?: (() => void) | undefined }) {
  return (
    <NavLink
      to={item.to}
      end={item.end ?? false}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm ${isActive ? 'bg-primary-soft font-semibold text-accent-on-soft' : 'text-ink-muted hover:bg-primary-soft hover:text-ink'}`
      }
    >
      {({ isActive }) => (
        <>
          <Icon name={item.icon} filled={isActive} />
          <span className="truncate">{t(item.label)}</span>
        </>
      )}
    </NavLink>
  );
}

/** Desktop/tablet sidebar; also rendered inside the mobile drawer. */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const notebooks = useNotebooks();
  const counts = notebooks.status === 'ready' ? countBySubject(notebooks.data) : {};
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-2">
        <Wordmark />
      </div>
      <nav aria-label={t('nav.main')} className="flex flex-col gap-1">
        {SIDEBAR_NAV.map((item) => (
          <SideLink key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SubjectsNav counts={counts} {...(onNavigate ? { onNavigate } : {})} />
      </div>
      <div className="flex flex-col gap-2">
        <NewNotebookButton variant="sidebar" />
        <SideLink
          item={{ to: '/settings', label: 'nav.settings', icon: 'settings' }}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-line bg-surface md:block">
      <SidebarContent />
    </aside>
  );
}
