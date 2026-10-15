import openapi from '../../../docs/openapi.yaml?raw'
import { parseRegisterBody } from '../../../server/src/auth/schemas'
import { NAME_MAX_LENGTH, NAME_MIN_LENGTH } from '@/features/auth/rules'
import { characterCount } from '@/lib/textRules'
import { normalizePhone } from '@/lib/validation'
import { DELIVERY_LIMITS, deliveryDetailsSchema } from './delivery'

/**
 * docs/openapi.yaml says what the API accepts for the delivery details, and it must not drift from
 * what the schema (src/features/checkout/delivery.ts, which the API runs too) does. The document is
 * read here as text, with a reader for the part of YAML that those two schemas use: there is no YAML
 * dependency in the project, and a test is not a reason to add one.
 *
 * The last block does the same for the name in the registration request, whose limits are those of
 * the normalized name and so are not stated as `minLength` and `maxLength`.
 */

type Yaml = string | number | boolean | Yaml[] | { [key: string]: Yaml }
type YamlMap = { [key: string]: Yaml }

function scalar(text: string): Yaml {
  const value = text.trim()
  if (/^-?\d+$/.test(value)) return Number(value)
  if (value === 'true' || value === 'false') return value === 'true'
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'")
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value) as string
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => scalar(item))
  }
  return value
}

/** Reads the mapping that starts at `lines[from]` (keys at `indent`), and returns where it ended. */
function readMap(lines: string[], from: number, indent: number): [YamlMap, number] {
  const map: YamlMap = {}
  let index = from
  while (index < lines.length) {
    const line = lines[index]!
    if (line.trim() === '') {
      index += 1
      continue
    }
    const here = line.length - line.trimStart().length
    if (here < indent) break
    const match = /^ *([A-Za-z0-9_-]+): ?(.*)$/.exec(line)
    if (here > indent || !match) throw new Error(`Cannot read line ${index + 1}: ${line}`)
    const [, key, rest] = match as unknown as [string, string, string]
    index += 1
    if (rest === '') {
      const next = lines.slice(index).find((candidate) => candidate.trim() !== '')
      const nextIndent = next ? next.length - next.trimStart().length : 0
      if (nextIndent > indent) {
        const [child, end] = readMap(lines, index, nextIndent)
        map[key] = child
        index = end
      } else {
        map[key] = ''
      }
    } else if (rest === '>-' || rest === '|' || rest === '>') {
      const text: string[] = []
      while (
        index < lines.length &&
        (lines[index]!.trim() === '' ||
          lines[index]!.length - lines[index]!.trimStart().length > indent)
      ) {
        text.push(lines[index]!.trim())
        index += 1
      }
      map[key] = text.join(' ').replace(/ +/g, ' ').trim()
    } else {
      map[key] = scalar(rest)
    }
  }
  return [map, index]
}

/** The lines of one schema of `components.schemas` (its name at four spaces). */
function schemaLines(name: string): string[] {
  const lines = openapi.replaceAll('\r\n', '\n').split('\n')
  const start = lines.indexOf(`    ${name}:`)
  if (start < 0) throw new Error(`The schema ${name} is not in docs/openapi.yaml`)
  const end = lines.findIndex(
    (line, i) => i > start && line.trim() !== '' && line.length - line.trimStart().length <= 4,
  )
  return lines.slice(start + 1, end < 0 ? undefined : end)
}

const schema = (name: string) => readMap(schemaLines(name), 0, 6)[0]
const request = schema('DeliveryDetailsRequest')
const stored = schema('DeliveryDetails')
const properties = request.properties as Record<string, YamlMap>
const fields = Object.keys(DELIVERY_LIMITS) as (keyof typeof DELIVERY_LIMITS)[]

/** A valid value of each field, that the cases below stretch or break. */
const core: Record<string, string> = {
  fullName: 'נתנאל כהן',
  email: 'netanel@example.com',
  phone: '0501234567',
  city: 'תל אביב',
  street: 'דיזנגוף',
  houseNumber: '12',
  apartment: '4',
  postalCode: '6436901',
  notes: 'שלום',
}

/** The field alone, read by the schema of the whole details. */
function read(field: string, value: string) {
  const result = deliveryDetailsSchema.safeParse({ ...core, [field]: value })
  return result.success
    ? { ok: true as const, value: (result.data as Record<string, string>)[field]! }
    : { ok: false as const, value: undefined }
}

const normalized = (field: string) => properties[field]!['x-normalized'] as YamlMap

describe('the reader of the document', () => {
  it('reads the schemas that the tests below depend on', () => {
    expect(Object.keys(properties)).toHaveLength(9)
    expect(request.required).toEqual(Object.keys(properties))
    expect(properties.phone!.maxLength).toBe(30)
    expect(normalized('phone').pattern).toBe('^0([23489][0-9]{7}|5[0-9]{8}|7[0-9]{8})$')
  })
})

describe('the request schema of the delivery details', () => {
  it('describes every field of the schema, and only those', () => {
    expect(Object.keys(properties).sort()).toEqual(Object.keys(deliveryDetailsSchema.shape).sort())
    expect(Object.keys(properties).sort()).toEqual([...fields].sort())
  })

  it('states, for each field, the longest value that is read as it was typed', () => {
    for (const field of fields) {
      expect(properties[field]!.maxLength, field).toBe(DELIVERY_LIMITS[field].raw)
    }
  })

  it('says nothing about the value as typed but its longest length, so that no client can refuse what the API accepts', () => {
    for (const field of fields) {
      const keys = Object.keys(properties[field]!).sort()
      expect(keys, field).toEqual(['description', 'maxLength', 'type', 'x-normalized'])
    }
    expect(Object.keys(request)).not.toContain('maxProperties')
  })

  it('types every field as a string, which is what the schema reads and what it stores', () => {
    for (const field of fields) {
      expect(properties[field]!.type, field).toBe('string')
      // The schema agrees: a value that is not a string is refused...
      for (const notText of [123, null, true, ['a'], { a: 1 }]) {
        expect(deliveryDetailsSchema.shape[field].safeParse(notText).success, field).toBe(false)
      }
    }
    // ...and what it stores is a string, whatever the field.
    const kept = deliveryDetailsSchema.parse(request.example)
    for (const field of fields) expect(typeof kept[field], field).toBe('string')
  })

  it('reads the longest value that it documents, and not one character more', () => {
    for (const field of fields) {
      const longest = properties[field]!.maxLength as number
      const padded = (length: number) =>
        core[field]! + ' '.repeat(length - characterCount(core[field]!))
      expect(read(field, padded(longest)).ok, `${field} at ${longest}`).toBe(true)
      expect(read(field, padded(longest + 1)).ok, `${field} at ${longest + 1}`).toBe(false)
    }
  })

  it('counts that longest value in code points, as JSON Schema does: letters outside the Basic Multilingual Plane are one each', () => {
    const letter = String.fromCodePoint(0x10400) // two UTF-16 units, one code point
    const astralCore: Record<string, string> = {
      fullName: letter.repeat(2),
      city: letter.repeat(2),
      street: letter.repeat(2),
      houseNumber: `1${letter}`,
      apartment: letter,
      notes: '🙏',
    }
    for (const [field, value] of Object.entries(astralCore)) {
      const longest = properties[field]!.maxLength as number
      const padded = (length: number) => value + ' '.repeat(length - characterCount(value))
      expect(padded(longest).length, field).toBeGreaterThan(longest) // over the limit in UTF-16 units
      expect(read(field, padded(longest)).ok, `${field} at ${longest}`).toBe(true)
      expect(read(field, padded(longest + 1)).ok, `${field} at ${longest + 1}`).toBe(false)
    }
  })

  it('does not state a limit in its general description, where it could not be told apart per field', () => {
    expect(request.description).not.toMatch(/(?<![\w+-])(30|20|500|2,?000)(?![\w+-])/)
  })
})

describe('the limits of the normalized value, as the document states them', () => {
  it('are those of the schema', () => {
    for (const field of ['fullName', 'city', 'street'] as const) {
      expect(normalized(field), field).toEqual({
        minLength: DELIVERY_LIMITS[field].min,
        maxLength: DELIVERY_LIMITS[field].max,
      })
    }
    expect(normalized('email')).toEqual({
      format: 'email',
      maxLength: DELIVERY_LIMITS.email.max,
      maxLocalPartLength: DELIVERY_LIMITS.email.localPartMax,
    })
    expect(normalized('houseNumber')).toEqual({ maxLength: DELIVERY_LIMITS.houseNumber.max })
    expect(normalized('apartment')).toEqual({ maxLength: DELIVERY_LIMITS.apartment.max })
    expect(normalized('notes')).toEqual({
      maxLength: DELIVERY_LIMITS.notes.max,
      maxLines: DELIVERY_LIMITS.notes.maxLines,
    })
  })

  it('are enforced at the limit, and refused one past it', () => {
    for (const field of ['fullName', 'city', 'street'] as const) {
      const { minLength, maxLength } = normalized(field) as { minLength: number; maxLength: number }
      expect(read(field, 'א'.repeat(minLength)).ok, `${field} at ${minLength}`).toBe(true)
      expect(read(field, 'א'.repeat(minLength - 1)).ok, `${field} at ${minLength - 1}`).toBe(false)
      expect(read(field, 'א'.repeat(maxLength)).ok, `${field} at ${maxLength}`).toBe(true)
      expect(read(field, 'א'.repeat(maxLength + 1)).ok, `${field} at ${maxLength + 1}`).toBe(false)
    }
    for (const field of ['houseNumber', 'apartment'] as const) {
      const { maxLength } = normalized(field) as { maxLength: number }
      expect(read(field, '1'.repeat(maxLength)).ok, field).toBe(true)
      expect(read(field, '1'.repeat(maxLength + 1)).ok, field).toBe(false)
    }
    const { maxLength, maxLines } = normalized('notes') as { maxLength: number; maxLines: number }
    expect(read('notes', 'א'.repeat(maxLength)).ok).toBe(true)
    expect(read('notes', 'א'.repeat(maxLength + 1)).ok).toBe(false)
    expect(read('notes', Array.from({ length: maxLines }, () => 'א').join('\n')).ok).toBe(true)
    expect(read('notes', Array.from({ length: maxLines + 1 }, () => 'א').join('\n')).ok).toBe(false)
  })

  it('are enforced for an address: the part before the @ and the whole', () => {
    const { maxLength, maxLocalPartLength } = normalized('email') as {
      maxLength: number
      maxLocalPartLength: number
    }
    const address = (length: number) => {
      // 64 + 1 + 63 + 1 + 63 + 1 + k + 4 = 197 + k
      return `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(length - 197)}.com`
    }
    expect(read('email', address(maxLength)).ok).toBe(true)
    expect(read('email', address(maxLength + 1)).ok).toBe(false)
    expect(read('email', `${'a'.repeat(maxLocalPartLength)}@example.com`).ok).toBe(true)
    expect(read('email', `${'a'.repeat(maxLocalPartLength + 1)}@example.com`).ok).toBe(false)
  })

  it('give the pattern of a phone number that the schema stores, and of one that it refuses', () => {
    const pattern = new RegExp(normalized('phone').pattern as string)
    const written = [
      '050-1234567',
      '+972 50 123 4567',
      '+972 (0) 50-123-4567',
      '00972501234567',
      '972501234567',
      '03-1234567',
      '(04) 8651234',
      '072-2123456',
      '050 123 4567',
      '050.123.4567',
      '\u200F050-1234567\u200E',
    ]
    for (const typed of written) {
      const { ok, value } = read('phone', typed)
      expect(ok, typed).toBe(true)
      expect(pattern.test(value!), typed).toBe(true)
      expect(value, typed).toBe(normalizePhone(typed))
    }
    const wrong = ['000000000', '0123456789', '050123456', '05012345678', '+1 202 555 0100', 'abc']
    for (const typed of wrong) {
      expect(read('phone', typed).ok, typed).toBe(false)
      expect(pattern.test(normalizePhone(typed)), typed).toBe(false)
    }
  })

  it('give the pattern of a postal code that the schema stores, and of one that it refuses', () => {
    const pattern = new RegExp(normalized('postalCode').pattern as string)
    for (const typed of ['', '6436901', '64-369-01', '64 369 01', ' 6436901 ']) {
      const { ok, value } = read('postalCode', typed)
      expect(ok, typed).toBe(true)
      expect(pattern.test(value!), typed).toBe(true)
    }
    for (const typed of ['0000000', '0123456', '123456', '12345678', 'abcdefg']) {
      expect(read('postalCode', typed).ok, typed).toBe(false)
      expect(pattern.test(typed), typed).toBe(false)
    }
  })
})

describe('the example requests', () => {
  it('is read by the schema as the stored example says', () => {
    const example = request.example as Record<string, string>
    const result = deliveryDetailsSchema.safeParse(example)

    expect(result.success).toBe(true)
    expect(result.data).toEqual(stored.example)
  })

  it('is a value that the stored schema describes, field for field', () => {
    expect(Object.keys(stored.example as YamlMap).sort()).toEqual(Object.keys(properties).sort())
  })
})

describe('the stored schema of the delivery details', () => {
  const storedProperties = stored.properties as Record<string, YamlMap>

  it('describes the fields that the schema stores, the same ones as the typed schema, and requires every one', () => {
    const kept = Object.keys(deliveryDetailsSchema.parse(request.example)).sort()
    expect(Object.keys(storedProperties).sort()).toEqual(kept)
    expect(Object.keys(storedProperties).sort()).toEqual(Object.keys(properties).sort())
    expect([...(stored.required as string[])].sort()).toEqual(kept)
  })

  it('types every field as a string, and says nothing else about it but that it may be empty', () => {
    for (const [field, property] of Object.entries(storedProperties)) {
      expect(property.type, field).toBe('string')
      expect(
        Object.keys(property).every((key) => key === 'type' || key === 'description'),
        field,
      ).toBe(true)
    }
    expect(stored.type).toBe('object')
  })

  it('has no limit and no pattern, because an order placed before the rules keeps what it had', () => {
    expect(schemaLines('DeliveryDetails').join('\n')).not.toMatch(
      /\b(minLength|maxLength|pattern|format|enum):/,
    )
  })

  it('is the one that orders are read with, and the typed one is the one that is sent', () => {
    expect(openapi).toMatch(
      /PlaceOrderRequest:[\s\S]*?delivery: \{ \$ref: '#\/components\/schemas\/DeliveryDetailsRequest' \}/,
    )
    expect(openapi).toMatch(
      / {4}Order:[\s\S]*?delivery: \{ \$ref: '#\/components\/schemas\/DeliveryDetails' \}/,
    )
  })
})

describe('the name in the registration request', () => {
  const nameSchema = (schema('RegisterRequest').properties as Record<string, YamlMap>).name!
  const rules = nameSchema['x-normalized'] as YamlMap
  const NBSP = String.fromCharCode(0xa0)
  const ZWSP = String.fromCharCode(0x200b)

  /** Whether the API accepts the name, read by the schema that its route runs. */
  const accepted = (name: string) => {
    try {
      parseRegisterBody({ name, email: 'netanel@example.com', password: 'Passw0rdOK' })
      return true
    } catch {
      return false
    }
  }

  it('states the limits of the normalized name, as the code has them', () => {
    expect(rules).toEqual({ minLength: NAME_MIN_LENGTH, maxLength: NAME_MAX_LENGTH })
  })

  it('has no minLength or maxLength of its own: the limits are not those of the value as sent, so that no client can refuse what the API accepts', () => {
    expect(Object.keys(nameSchema).sort()).toEqual(['description', 'type', 'x-normalized'])
  })

  it('applies the stated limits to the normalized name, in code points', () => {
    const min = rules.minLength as number
    const max = rules.maxLength as number
    const emoji = String.fromCodePoint(0x1f600)

    expect(accepted('א'.repeat(min))).toBe(true)
    expect(accepted('א'.repeat(min - 1))).toBe(false)
    expect(accepted('א'.repeat(max))).toBe(true)
    expect(accepted('א'.repeat(max + 1))).toBe(false)
    expect(accepted(emoji.repeat(max))).toBe(true)
    expect(accepted(emoji.repeat(max + 1))).toBe(false)
  })

  it('accepts names that limits on the value as sent would have refused', () => {
    const max = rules.maxLength as number
    // Longer as sent than the longest name: the no-break spaces and the zero-width spaces are not part of it.
    expect(accepted(`${NBSP}${'א'.repeat(max)}${NBSP}`)).toBe(true)
    expect(accepted(`${'א'.repeat(max)}${ZWSP.repeat(10)}`)).toBe(true)
    // Shorter as sent than the shortest name: U+0958 is written by NFC as two code points.
    expect(Array.from(String.fromCodePoint(0x958))).toHaveLength(1)
    expect(accepted(String.fromCodePoint(0x958))).toBe(true)
  })
})
