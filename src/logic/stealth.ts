/** AI states in which a wild animal is reacting to the player: chasing, fighting or running from it. */
const NOTICING_STATES = ['chase', 'windup', 'charging', 'recover', 'flee'];

/**
 * The player is "unseen" while no awake wild animal has noticed it. Takes the AI state of every
 * awake animal. Animals that are idle, wandering or heading home have not noticed the player.
 */
export function playerIsUnseen(awakeEnemyStates: readonly string[]): boolean {
  return !awakeEnemyStates.some((state) => NOTICING_STATES.includes(state));
}
