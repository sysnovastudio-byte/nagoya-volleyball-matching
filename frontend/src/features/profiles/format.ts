import { levelLabel } from '../events/format';
import type { PublicProfile } from './types';

/** 退会した人は、ニックネームの代わりに「退会したユーザー」と示す（docs/06の4-2）。 */
export function displayName(profile: PublicProfile) {
  return profile.isWithdrawn ? '退会したユーザー' : profile.nickname;
}

export function experienceLabel(profile: PublicProfile) {
  return profile.isWithdrawn ? null : levelLabel(profile.experienceLevel);
}
