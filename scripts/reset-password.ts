import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { hashPassword } from '../server/auth.ts';
import { openDb } from '../server/db.ts';
import { passwordSchema } from '../src/shared/schemas.ts';

/**
 * Sets a new password for a local account (there's no email on a local-only
 * install). Usage: npm run reset-password -- <username>
 * The new password is typed in (hidden), never passed on the command line.
 */
const username = process.argv[2];
if (!username) {
  console.error('Usage: npm run reset-password -- <username>');
  process.exit(1);
}

const db = openDb(join(resolve(process.env.AKSHAR_DATA_DIR ?? 'data'), 'akshar.db'));
const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as
  { id: string } | undefined;
if (!user) {
  console.error(`No account named "${username}" on this computer.`);
  process.exit(1);
}

async function ask(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Hide what is typed.
  const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
    if (s.startsWith(prompt)) write.call(rl, prompt);
  };
  const answer = await rl.question(prompt);
  rl.close();
  process.stdout.write('\n');
  return answer;
}

const password = process.env.AKSHAR_NEW_PASSWORD ?? (await ask('New password: '));
const check = passwordSchema.safeParse(password);
if (!check.success) {
  console.error('Use 8 to 128 characters with at least one letter and one number.');
  process.exit(1);
}
if (!process.env.AKSHAR_NEW_PASSWORD && (await ask('Repeat it: ')) !== password) {
  console.error("The passwords don't match.");
  process.exit(1);
}

db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), user.id);
// Sign out everywhere: whoever had the old password loses access.
db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
db.close();
console.log(`Password updated for "${username}". All their sessions were signed out.`);
