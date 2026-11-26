/** 文字数。DBの char_length と同じく、絵文字なども1文字と数える。 */
export function textLength(value: string) {
  return Array.from(value).length;
}
