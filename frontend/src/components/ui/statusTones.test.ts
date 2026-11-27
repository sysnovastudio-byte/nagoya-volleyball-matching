import { describe, expect, it } from 'vitest';
import { REPORT_STATUS_TONES, USER_STATUS_TONES } from '../../features/admin/format';
import {
  APPLICATION_STATUS_TONES,
  CLOSED_PENDING_TONE,
} from '../../features/applications/ApplicationStatusBadge';
import { EVENT_STATE_TONES } from '../../features/events/EventStateBadge';
import { BADGE_TONE_CLASSES, type BadgeTone } from './Badge';

/**
 * index.css をそのまま読む。テストでは CSS の読み込みが空になるため、Node.js の fs を使う
 * （画面のコードに Node.js の型を入れないよう、ここだけで型を付ける）。
 */
const nodeProcess = (
  globalThis as unknown as {
    process: {
      getBuiltinModule(id: 'node:fs'): { readFileSync(path: string, encoding: 'utf8'): string };
    };
  }
).process;
const css = nodeProcess.getBuiltinModule('node:fs').readFileSync('src/index.css', 'utf8');

/** index.css の @theme の色。text-white は Tailwind CSS の白。 */
function themeColors() {
  const colors: Record<string, string> = { white: '#ffffff' };
  for (const [, name, value] of css.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6});/gi)) {
    if (name && value) colors[name] = value;
  }
  return colors;
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

function toneColor(tone: BadgeTone, prefix: 'bg' | 'text') {
  const colors = themeColors();
  const name = new RegExp(`(?:^| )${prefix}-([\\w-]+)`).exec(BADGE_TONE_CLASSES[tone])?.[1];
  const value = name ? colors[name] : undefined;
  if (!value) throw new Error(`${tone} の ${prefix} の色が見つかりません`);
  return value;
}

describe('状態の色（docs/11の5-2）', () => {
  it.each(Object.keys(BADGE_TONE_CLASSES) as BadgeTone[])(
    '%s の札は、文字と面のコントラスト比が4.5以上',
    (tone) => {
      expect(contrast(toneColor(tone, 'text'), toneColor(tone, 'bg'))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([
    ['募集', Object.values(EVENT_STATE_TONES)],
    ['申請（受付終了を含む）', [...Object.values(APPLICATION_STATUS_TONES), CLOSED_PENDING_TONE]],
    ['通報', Object.values(REPORT_STATUS_TONES)],
    ['利用者', Object.values(USER_STATUS_TONES)],
  ])('%sの状態どうしで、同じ色を使わない', (_kind, tones) => {
    expect(new Set(tones).size).toBe(tones.length);
  });

  it('受付中と満員は、色みと塗りの両方で分ける', () => {
    expect(toneColor(EVENT_STATE_TONES.open, 'bg')).not.toBe(
      toneColor(EVENT_STATE_TONES.full, 'bg'),
    );
    expect(EVENT_STATE_TONES.open).toBe('main');
    expect(EVENT_STATE_TONES.full).toBe('accent');
  });
});
