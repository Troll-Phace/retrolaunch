import { classifyError } from '@/utils/errorClassifier';

describe('classifyError', () => {
  it('classifies "Emulator not found at path" as emulator not found (non-transient, with settings action)', () => {
    const result = classifyError('Emulator not found at path: /foo/bar');
    expect(result.title).toBe('Emulator Not Found');
    expect(result.isTransient).toBe(false);
    expect(result.actionLabel).toBeDefined();
    expect(result.actionRoute).toBe('/settings');
  });

  it('classifies "No emulator configured for system: nes" as no emulator configured (non-transient, with settings action)', () => {
    const result = classifyError('No emulator configured for system: nes');
    expect(result.title).toBe('No Emulator Configured');
    expect(result.isTransient).toBe(false);
    expect(result.actionLabel).toBeDefined();
    expect(result.actionRoute).toBe('/settings');
  });

  it('classifies "ROM file not found" as ROM not found (non-transient)', () => {
    const result = classifyError('ROM file not found');
    expect(result.title).toBe('ROM File Not Found');
    expect(result.isTransient).toBe(false);
  });

  it('classifies "ROM corrupt" as ROM not found (non-transient)', () => {
    const result = classifyError('ROM corrupt');
    expect(result.title).toBe('ROM File Not Found');
    expect(result.isTransient).toBe(false);
  });

  it('classifies "rate limit exceeded" as API rate limited (transient)', () => {
    const result = classifyError('rate limit exceeded');
    expect(result.title).toBe('API Rate Limited');
    expect(result.isTransient).toBe(true);
  });

  it('classifies "429 Too Many Requests" as API rate limited (transient)', () => {
    const result = classifyError('429 Too Many Requests');
    expect(result.title).toBe('API Rate Limited');
    expect(result.isTransient).toBe(true);
  });

  it('classifies "network error" as connection error (transient)', () => {
    const result = classifyError('network error');
    expect(result.title).toBe('Connection Error');
    expect(result.isTransient).toBe(true);
  });

  it('classifies "Failed to fetch" as connection error (transient)', () => {
    const result = classifyError('Failed to fetch');
    expect(result.title).toBe('Connection Error');
    expect(result.isTransient).toBe(true);
  });

  it('classifies "timeout" as connection error (transient)', () => {
    const result = classifyError('timeout');
    expect(result.title).toBe('Connection Error');
    expect(result.isTransient).toBe(true);
  });

  it('classifies "scan failed" as scan failed (transient)', () => {
    const result = classifyError('scan failed');
    expect(result.title).toBe('Scan Failed');
    expect(result.isTransient).toBe(true);
  });

  it('returns fallback for unknown errors (transient, raw message preserved)', () => {
    const result = classifyError('some weird thing happened');
    expect(result.title).toBe('Something Went Wrong');
    expect(result.description).toBe('some weird thing happened');
    expect(result.isTransient).toBe(true);
  });

  it('handles empty string input gracefully', () => {
    const result = classifyError('');
    expect(result.title).toBe('Something Went Wrong');
    expect(result.description).toBe('An unexpected error occurred.');
    expect(result.isTransient).toBe(true);
  });

  it('handles undefined/null input gracefully', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = classifyError(undefined as any);
    expect(result.title).toBe('Something Went Wrong');
    expect(result.isTransient).toBe(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result2 = classifyError(null as any);
    expect(result2.title).toBe('Something Went Wrong');
    expect(result2.isTransient).toBe(true);
  });
});
