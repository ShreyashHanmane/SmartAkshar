import type { MessageKey } from '../../i18n/i18n';
import type { IconName } from '../../ui/Icon';

export interface NavItem {
  to: string;
  label: MessageKey;
  icon: IconName;
  end?: boolean;
}

export const SIDEBAR_NAV: NavItem[] = [
  { to: '/', label: 'nav.dashboard', icon: 'home', end: true },
  { to: '/notebooks', label: 'nav.whiteboard', icon: 'whiteboard' },
  { to: '/flashcards', label: 'nav.flashcards', icon: 'cards' },
  { to: '/library', label: 'nav.library', icon: 'book' },
];

export const MOBILE_TABS: NavItem[] = [
  { to: '/', label: 'nav.home', icon: 'home', end: true },
  { to: '/notebooks', label: 'nav.whiteboard', icon: 'whiteboard' },
  { to: '/flashcards', label: 'nav.flashcards', icon: 'cards' },
  { to: '/settings', label: 'nav.profile', icon: 'user' },
];
