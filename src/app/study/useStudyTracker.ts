import { useEffect } from 'react';
import { addStudySeconds, dayKey, MAX_FLUSH_SECONDS } from '../../data/activity';
import { useSession } from '../session/SessionProvider';
import { StudyClock } from './studyClock';

const TICK_MS = 1000;
const FLUSH_MS = 60_000;

/**
 * Tracks real study time while a study screen (whiteboard, reader, review) is
 * open, visible, and in use. Feeds focus hours, streak, and the weekly goal.
 */
export function useStudyTracker(active = true) {
  const session = useSession();
  const uid = session.status === 'signedIn' ? session.user.uid : null;

  useEffect(() => {
    if (!uid || !active) return;
    const clock = new StudyClock(Date.now());
    const onInput = () => clock.input(Date.now());
    const flush = () => {
      clock.tick(Date.now(), document.visibilityState === 'visible');
      const seconds = clock.take(MAX_FLUSH_SECONDS);
      if (seconds > 0) addStudySeconds(uid, dayKey(new Date()), seconds).catch(() => undefined);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, onInput, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    const tick = window.setInterval(
      () => clock.tick(Date.now(), document.visibilityState === 'visible'),
      TICK_MS,
    );
    const save = window.setInterval(flush, FLUSH_MS);
    return () => {
      flush();
      for (const e of events) window.removeEventListener(e, onInput);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(tick);
      window.clearInterval(save);
    };
  }, [uid, active]);
}
