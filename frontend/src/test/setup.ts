import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdomは画面のスクロールに対応していない
vi.stubGlobal('scrollTo', () => undefined);

afterEach(() => {
  cleanup();
});
