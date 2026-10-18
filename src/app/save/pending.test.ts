import { describe, expect, it } from 'vitest';
import { getSyncSummary, reportSaves, subscribeSyncSummary } from './pending';

describe('sync summary', () => {
  it('adds up unsaved changes from every saver and forgets finished ones', () => {
    const a = {};
    const b = {};
    let calls = 0;
    const off = subscribeSyncSummary(() => calls++);
    reportSaves(a, { pending: 2, failed: false });
    reportSaves(b, { pending: 1, failed: true });
    expect(getSyncSummary()).toEqual({ pending: 3, failed: true });
    reportSaves(b, { pending: 1, failed: true }); // no change, no notification
    expect(calls).toBe(2);
    reportSaves(b, { pending: 0, failed: false });
    expect(getSyncSummary()).toEqual({ pending: 2, failed: false });
    reportSaves(a, { pending: 0, failed: false });
    expect(getSyncSummary()).toEqual({ pending: 0, failed: false });
    off();
  });
});
