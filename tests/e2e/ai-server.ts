import { resolve } from 'node:path';
import { createApp } from '../../server/app.ts';
import type { AiInput, AiProvider } from '../../server/ai/provider.ts';

/**
 * Test-only server: the real app with a deterministic stand-in for Gemini, so
 * end-to-end tests can exercise AI flows without a key or the internet.
 * Never used by `npm start` / `npm run serve`.
 */
class ScriptedAi implements AiProvider {
  readonly name = 'scripted';
  async generate(input: AiInput) {
    const material = /<student_material>\n?([\s\S]*?)\n?<\/student_material>/.exec(input.prompt)?.[1] ?? '';
    if (material.includes('SLOW'))
      await new Promise((r, reject) => {
        const t = setTimeout(r, 5000);
        input.signal.addEventListener('abort', () => (clearTimeout(t), reject(new Error('aborted'))));
      });
    if (material.includes('HTML')) return { text: '<img src=x onerror="window.__aiPwned=1"><b>bold</b>' };
    const p = input.prompt;
    if (input.json)
      return {
        text: JSON.stringify([
          { front: 'What does F = ma relate?', back: 'Force, mass and acceleration' },
          { front: 'Unit of force?', back: 'newton' },
        ]),
      };
    if (input.imagePng)
      return {
        text: p.startsWith('The image shows handwritten')
          ? 'F = ma'
          : `About the handwriting: ${p.split('.')[0]}`,
      };
    if (p.startsWith('Summarize')) return { text: `• Summary: ${material.slice(0, 40)}` };
    if (p.startsWith('Translate')) return { text: `[${/into (\w+)/.exec(p)?.[1]}] ${material.slice(0, 40)}` };
    return { text: `Explanation: ${material.slice(0, 60)}` };
  }
}

const app = createApp({
  dataDir: resolve(process.env.AKSHAR_DATA_DIR ?? '.tmp-test/e2e-ai'),
  distDir: resolve('dist'),
  ai: new ScriptedAi(),
});
app.server.listen(Number(process.env.PORT ?? 4174), '127.0.0.1');
