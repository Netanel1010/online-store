import {
  asciiDigits,
  characterCount,
  hasNonText,
  normalizeLine,
  normalizeLines,
  startsLikeFormula,
  stripInvisible,
} from './textRules'

describe('characterCount', () => {
  it('counts Unicode code points, not UTF-16 units', () => {
    expect(characterCount('שלום')).toBe(4)
    expect(characterCount('🙏🙏')).toBe(2)
    expect(characterCount('')).toBe(0)
  })

  it('counts a simple emoji as one, and a sequence of them as several', () => {
    expect(characterCount('🙏')).toBe(1) // two UTF-16 units
    expect(characterCount('🇮🇱')).toBe(2) // a flag is two regional indicators
    expect(characterCount('👍🏽')).toBe(2) // an emoji and a skin tone
    expect(characterCount('👨\u200D👩\u200D👧')).toBe(5) // three emoji and two joiners
    expect(characterCount('❤\uFE0F')).toBe(2) // a heart and a variation selector
  })

  it('counts a letter with niqqud or another combining mark as the letter and each mark', () => {
    expect(characterCount('ש\u05B8\u05C1לו\u05B9ם')).toBe(7) // four letters you see
    expect(characterCount('e\u0301')).toBe(2)
  })
})

describe('stripInvisible', () => {
  it.each([
    ['a right-to-left mark', 'נתנאל\u200F'],
    ['a left-to-right mark', '\u200Eabc'],
    ['an Arabic letter mark', 'a\u061Cb'],
    ['a zero-width space', 'a\u200Bb'],
    ['a word joiner', 'a\u2060b'],
    ['a byte order mark', '\uFEFFabc'],
  ])('drops %s', (_name, value) => {
    expect(stripInvisible(value)).toMatch(/^[\p{L}]+$/u)
  })

  it('leaves the joiners that Persian and emoji need', () => {
    expect(stripInvisible('می\u200Cخواهم')).toBe('می\u200Cخواهم')
  })
})

describe('normalizeLine', () => {
  it('turns every kind of space into one space and trims', () => {
    expect(normalizeLine('  תל\u00A0\u00A0אביב\u2009 ')).toBe('תל אביב')
    expect(normalizeLine('a\u3000b')).toBe('a b')
  })

  it('composes a Hebrew word typed with its points apart into the usual form', () => {
    const decomposed = 'e\u0301' // e + combining acute
    expect(normalizeLine(decomposed)).toBe('é')
  })

  it('drops an invisible mark before composing, so the result is stable', () => {
    const once = normalizeLine('e\u200B\u0301')
    expect(once).toBe('é')
    expect(normalizeLine(once)).toBe(once)
  })

  it('keeps Hebrew, Arabic, English and a mixed value as they are', () => {
    for (const value of ['נתנאל כהן', 'محمد أحمد', 'Dana Levi', 'שדרות Rothschild 12']) {
      expect(normalizeLine(value)).toBe(value)
    }
  })

  it('does not change a value it already changed', () => {
    for (const value of ['  a\u00A0 b ', 'x\u200Fy', 'e\u200B\u0301', '\uFEFF שלום  עולם ']) {
      const once = normalizeLine(value)
      expect(normalizeLine(once)).toBe(once)
    }
  })

  it('leaves control characters for the check (it does not hide them)', () => {
    expect(normalizeLine('a\tb')).toBe('a\tb')
    expect(normalizeLine('a\u0000b')).toBe('a\u0000b')
  })

  it('removes spaces at either end and nothing else: not a tab, a line break or a separator', () => {
    for (const control of ['\t', '\n', '\r', '\u000b', '\u000c', '\u2028', '\u2029']) {
      expect(normalizeLine(`${control}a${control}`), JSON.stringify(control)).toBe(
        `${control}a${control}`,
      )
      expect(normalizeLine(` ${control}a${control} `), JSON.stringify(control)).toBe(
        `${control}a${control}`,
      )
    }
  })
})

describe('normalizeLines', () => {
  it('turns every kind of line break into \\n and trims each line', () => {
    expect(normalizeLines(' שורה 1 \r\n  שורה 2\rשורה 3 ')).toBe('שורה 1\nשורה 2\nשורה 3')
  })

  it('removes blank lines around the lines and spaces around each line, but not another control character', () => {
    for (const control of ['\t', '\u000b', '\u000c', '\u2028', '\u2029']) {
      expect(normalizeLines(`${control}a${control}`), JSON.stringify(control)).toBe(
        `${control}a${control}`,
      )
    }
    expect(normalizeLines('\n\n a \n\n')).toBe('a')
  })

  it('does not change a value it already changed', () => {
    const once = normalizeLines('a \u200F\r\n\u00A0b\u2009\n\n c')
    expect(normalizeLines(once)).toBe(once)
  })
})

describe('asciiDigits', () => {
  it('converts Arabic-Indic, Persian and full-width digits', () => {
    expect(asciiDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789')
    expect(asciiDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789')
    expect(asciiDigits('\uFF10\uFF11\uFF12\uFF13\uFF14\uFF15\uFF16\uFF17\uFF18\uFF19')).toBe(
      '0123456789',
    )
  })

  it('leaves everything else', () => {
    expect(asciiDigits('050-abc')).toBe('050-abc')
  })
})

describe('hasNonText', () => {
  it.each([
    ['a NUL', 'a\u0000b'],
    ['a tab', 'a\tb'],
    ['a line break', 'a\nb'],
    ['a delete', 'a\u007fb'],
    ['a C1 control', 'a\u0085b'],
    ['a line separator', 'a\u2028b'],
    ['a paragraph separator', 'a\u2029b'],
    ['a right-to-left override', 'abc\u202Egpj.exe'],
    ['a left-to-right override', 'a\u202Db'],
    ['an embedding', 'a\u202Ab'],
    ['a pop of a direction', 'a\u202Cb'],
    ['an isolate', 'a\u2066b'],
    ['a first-strong isolate', 'a\u2068b'],
    ['a pop of an isolate', 'a\u2069b'],
    ['an invisible separator', 'a\u2063b'],
    ['a lone surrogate', 'a\ud800b'],
    ['a private-use character', 'a\uE000b'],
  ])('finds %s', (_name, value) => {
    expect(hasNonText(value)).toBe(true)
  })

  it('finds every control character and every override or isolate', () => {
    const codes = [
      ...Array.from({ length: 0x20 }, (_, i) => i),
      ...Array.from({ length: 0x21 }, (_, i) => 0x7f + i),
      ...[0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069],
    ]
    for (const code of codes) {
      expect(hasNonText(`a${String.fromCharCode(code)}b`), code.toString(16)).toBe(true)
    }
  })

  it.each([
    'נתנאל כהן',
    'محمد أحمد',
    "Sinéad O'Brien",
    'שדרות Rothschild 12',
    'תודה 🙏',
    'می\u200Cخواهم', // a zero-width non-joiner
    '👨\u200D👩\u200D👧', // an emoji joined with zero-width joiners
  ])('does not find anything in %s', (value) => {
    expect(hasNonText(value)).toBe(false)
  })

  it('does not find the marks that normalizing drops, nor the joiners', () => {
    for (const mark of [
      '\u200B',
      '\u200E',
      '\u200F',
      '\u061C',
      '\u2060',
      '\uFEFF',
      '\u200C',
      '\u200D',
    ]) {
      expect(hasNonText(`a${mark}b`), mark).toBe(false)
    }
  })

  it('finds a control character that sits at the start or at the end, where trim() would hide it', () => {
    for (const control of ['\t', '\n', '\r', '\u000b', '\u000c', '\u2028', '\u2029']) {
      expect(hasNonText(`${control}a`), JSON.stringify(control)).toBe(true)
      expect(hasNonText(`a${control}`), JSON.stringify(control)).toBe(true)
    }
  })

  it('allows a line break only when asked to', () => {
    expect(hasNonText('a\nb')).toBe(true)
    expect(hasNonText('a\nb', { allowLineBreaks: true })).toBe(false)
    expect(hasNonText('a\rb', { allowLineBreaks: true })).toBe(false)
    expect(hasNonText('a\tb', { allowLineBreaks: true })).toBe(true)
    expect(hasNonText('a\u2028b', { allowLineBreaks: true })).toBe(true)
    expect(hasNonText('a\u0000b', { allowLineBreaks: true })).toBe(true)
  })
})

describe('startsLikeFormula', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', "=cmd|' /C calc'!A0"])('finds %s', (value) => {
    expect(startsLikeFormula(value)).toBe(true)
  })

  it.each(['הרצל', '12', 'a=b', "ז'בוטינסקי", '(1)', ''])('does not find %s', (value) => {
    expect(startsLikeFormula(value)).toBe(false)
  })
})
