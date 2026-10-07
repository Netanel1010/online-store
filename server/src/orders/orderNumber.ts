import { randomInt } from 'node:crypto'

/**
 * Letters and digits that cannot be mistaken for each other when read out or copied by hand (no I,
 * L, O or U). There are 32 of them, so a character is a whole 5 bits.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const LENGTH = 8
const PREFIX = 'DEMO-'

/** What an order number looks like: the prefix says that nothing was paid for or shipped. */
export const ORDER_NUMBER_PATTERN = /^DEMO-[0-9A-HJKMNP-TV-Z]{8}$/

/**
 * A new order number, such as `DEMO-7K2M9QX4`: 32^8 (about 10^12) possibilities, chosen with
 * `crypto.randomInt`, which does not favour any of them. It is not a counter, so the number of
 * orders is not revealed and the next number cannot be guessed. Two orders can still get the same
 * number by chance: the unique index refuses the second, and the service draws again.
 */
export function generateOrderNumber(draw: (max: number) => number = randomInt): string {
  let code = ''
  for (let index = 0; index < LENGTH; index += 1) code += ALPHABET.charAt(draw(ALPHABET.length))
  return `${PREFIX}${code}`
}
