import { isIPv4, isIPv6 } from 'node:net'

/** Expands an IPv6 address to its eight 16-bit groups, as lower case hex. */
function ipv6Groups(address: string): string[] {
  const [head = '', tail] = address.toLowerCase().split('::')
  const first = head === '' ? [] : head.split(':')
  const last = tail === undefined || tail === '' ? [] : tail.split(':')
  const missing = tail === undefined ? 0 : 8 - first.length - last.length
  return [...first, ...Array<string>(Math.max(missing, 0)).fill('0'), ...last].map((group) =>
    group.replace(/^0+(?=.)/, ''),
  )
}

/**
 * The key a client is counted under in a rate limit. An IPv4 address is its own key. An IPv6
 * address is counted as its /64 network, because one subscriber is usually given a whole /64 and
 * could otherwise make a new address for every request. An IPv4 address written as IPv6
 * (`::ffff:203.0.113.7`, which is how Node reports one on a dual-stack socket) is the IPv4 address.
 */
export function clientKey(address: string | undefined): string {
  if (!address) return 'unknown'
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address)?.[1]
  if (mapped && isIPv4(mapped)) return mapped
  if (isIPv4(address)) return address
  if (isIPv6(address.replace(/%.*$/, ''))) {
    return `v6:${ipv6Groups(address.replace(/%.*$/, '')).slice(0, 4).join(':')}`
  }
  // Not an address we know: count it as one client rather than let it through uncounted.
  return `other:${address.slice(0, 64)}`
}
