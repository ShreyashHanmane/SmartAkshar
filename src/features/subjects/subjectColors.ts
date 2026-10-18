import type { SubjectColor } from '../../data/models';

/** Static class names per subject color (Tailwind needs literal class strings). */
export const SUBJECT_CLASSES: Record<
  SubjectColor,
  { dot: string; text: string; soft: string; border: string }
> = {
  blue: {
    dot: 'bg-subject-blue',
    text: 'text-subject-blue',
    soft: 'bg-subject-blue-soft',
    border: 'border-subject-blue',
  },
  purple: {
    dot: 'bg-subject-purple',
    text: 'text-subject-purple',
    soft: 'bg-subject-purple-soft',
    border: 'border-subject-purple',
  },
  teal: {
    dot: 'bg-subject-teal',
    text: 'text-subject-teal',
    soft: 'bg-subject-teal-soft',
    border: 'border-subject-teal',
  },
  orange: {
    dot: 'bg-subject-orange',
    text: 'text-subject-orange',
    soft: 'bg-subject-orange-soft',
    border: 'border-subject-orange',
  },
  green: {
    dot: 'bg-subject-green',
    text: 'text-subject-green',
    soft: 'bg-subject-green-soft',
    border: 'border-subject-green',
  },
  rose: {
    dot: 'bg-subject-rose',
    text: 'text-subject-rose',
    soft: 'bg-subject-rose-soft',
    border: 'border-subject-rose',
  },
};
