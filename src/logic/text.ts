/** "a" or "an" in front of a noun: an Eagle, an Elephant, a Tiger. */
export function withArticle(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}
