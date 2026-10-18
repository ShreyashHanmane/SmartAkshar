import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { t } from '../../i18n/i18n';
import { IconButton } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Wordmark } from '../../ui/Wordmark';
import { MOBILE_TABS } from './navItems';
import { SidebarContent } from './Sidebar';

export function MobileTopBar() {
  const [drawer, setDrawer] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (drawer && !d.open) d.showModal();
    if (!drawer && d.open) d.close();
  }, [drawer]);

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface px-2 py-1 md:hidden">
      <IconButton icon="menu" label={t('nav.openMenu')} onClick={() => setDrawer(true)} />
      <Link to="/" aria-label={t('nav.dashboard')}>
        <Wordmark />
      </Link>
      <Link
        to="/search"
        aria-label={t('search.title')}
        className="inline-flex size-11 items-center justify-center rounded-lg text-ink hover:bg-primary-soft"
      >
        <Icon name="search" />
      </Link>
      <dialog
        ref={dialogRef}
        aria-label={t('nav.main')}
        onClose={() => setDrawer(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setDrawer(false);
        }}
        className="m-0 h-dvh max-h-dvh w-72 max-w-[85vw] border-r border-line bg-surface p-0 text-ink backdrop:bg-ink/40"
      >
        <div className="absolute top-2 right-2">
          <IconButton icon="x" label={t('nav.closeMenu')} onClick={() => setDrawer(false)} />
        </div>
        <SidebarContent onNavigate={() => setDrawer(false)} />
      </dialog>
    </header>
  );
}

export function MobileTabBar() {
  return (
    <nav
      aria-label={t('nav.tabs')}
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {MOBILE_TABS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end ?? false}
          className={({ isActive }) =>
            `flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs ${isActive ? 'font-semibold text-accent' : 'text-ink-muted'}`
          }
        >
          {({ isActive }) => (
            <>
              <Icon name={item.icon} filled={isActive} />
              <span className="max-w-full truncate">{t(item.label)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
