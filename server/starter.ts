import { newId } from './auth.ts';
import type { Db } from './db.ts';

/**
 * Starter content for new accounts (user decision, 2026-10-18): real, editable
 * subjects, decks, and cards, so a new student sees how AKSHAR works. Nothing
 * here is special; users can rename or delete all of it.
 */
const STARTER: { subject: string; color: string; deck: string; cards: [string, string][] }[] = [
  {
    subject: 'Physics',
    color: 'blue',
    deck: 'Mechanics essentials',
    cards: [
      [
        "State Newton's second law.",
        'The net force on an object equals its mass times its acceleration: F = ma.',
      ],
      ['What is the SI unit of force?', 'The newton (N) = 1 kg·m/s².'],
      ["State Newton's third law.", 'For every action there is an equal and opposite reaction.'],
      ['What is inertia?', 'The tendency of an object to resist changes to its state of motion.'],
    ],
  },
  {
    subject: 'Mathematics',
    color: 'purple',
    deck: 'Derivatives & integrals',
    cards: [
      ['d/dx of xⁿ', 'n·xⁿ⁻¹'],
      ['d/dx of sin x', 'cos x'],
      ['∫ 1/x dx', 'ln|x| + C'],
    ],
  },
  {
    subject: 'Chemistry',
    color: 'teal',
    deck: 'Functional groups',
    cards: [
      ['Functional group of alcohols', 'Hydroxyl group (–OH)'],
      ['Functional group of carboxylic acids', 'Carboxyl group (–COOH)'],
      ['Functional group of ketones', 'Carbonyl group (C=O) bonded to two carbon atoms'],
    ],
  },
  {
    subject: 'History',
    color: 'orange',
    deck: 'Freedom movement',
    cards: [
      ['In which year did India gain independence?', '1947'],
      ['Who led the Salt March of 1930?', 'Mahatma Gandhi'],
      ['When was the Indian National Congress founded?', '1885'],
    ],
  },
];

/** Adds the starter subjects, decks, and cards (call inside the sign-up transaction). */
export function addStarterContent(db: Db, uid: string, now: number) {
  const subject = db.prepare(
    'INSERT INTO subjects (user_id, id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const deck = db.prepare(
    'INSERT INTO decks (user_id, id, title, subject_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const card = db.prepare(
    'INSERT INTO cards (user_id, id, deck_id, front, back, box, due, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)',
  );
  STARTER.forEach((s, i) => {
    // Distinct timestamps keep the sidebar order stable.
    const t = now + i;
    const subjectId = newId();
    const deckId = newId();
    subject.run(uid, subjectId, s.subject, s.color, t, t);
    deck.run(uid, deckId, s.deck, subjectId, t, t);
    s.cards.forEach(([front, back], j) => card.run(uid, newId(), deckId, front, back, now, t + j, t + j));
  });
}
