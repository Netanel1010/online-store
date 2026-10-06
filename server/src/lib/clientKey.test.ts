import { describe, expect, it } from 'vitest'
import { clientKey } from './clientKey.ts'

describe('clientKey', () => {
  it('is an IPv4 address as it is', () => {
    expect(clientKey('203.0.113.7')).toBe('203.0.113.7')
  })

  it('is the IPv4 address of an IPv4 address written as IPv6, as Node reports one', () => {
    expect(clientKey('::ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(clientKey('::FFFF:203.0.113.7')).toBe('203.0.113.7')
  })

  it('counts every address of one IPv6 /64 as one client', () => {
    const a = clientKey('2001:db8:abcd:12:1:2:3:4')
    const b = clientKey('2001:DB8:ABCD:12:ffff:ffff:ffff:ffff')
    const c = clientKey('2001:db8:abcd:12::1')

    expect(a).toBe('v6:2001:db8:abcd:12')
    expect(b).toBe(a)
    expect(c).toBe(a)
  })

  it('tells two /64 networks apart, however the address is abbreviated', () => {
    expect(clientKey('2001:db8:abcd:13::1')).not.toBe(clientKey('2001:db8:abcd:12::1'))
    expect(clientKey('2001:db8::1')).toBe('v6:2001:db8:0:0')
    expect(clientKey('::1')).toBe('v6:0:0:0:0')
  })

  it('ignores the zone of a link-local address', () => {
    expect(clientKey('fe80::1%eth0')).toBe(clientKey('fe80::2'))
  })

  it('never lets a missing or unknown address through uncounted', () => {
    expect(clientKey(undefined)).toBe('unknown')
    expect(clientKey('')).toBe('unknown')
    expect(clientKey('not an address')).toBe('other:not an address')
    expect(clientKey('x'.repeat(500))).toHaveLength('other:'.length + 64)
  })
})
