import { getPrintableCharFromKey } from '@/lib/keyboard/keyboard-utils'

describe('keyboard-utils getPrintableCharFromKey', () => {
  it('handles uiohook KeyA/Digit1 patterns', () => {
    expect(getPrintableCharFromKey('KeyA')).toBe('a')
    expect(getPrintableCharFromKey('KeyA', ['shift'])).toBe('A')
    expect(getPrintableCharFromKey('Digit1')).toBe('1')
    expect(getPrintableCharFromKey('Numpad5')).toBe('5')
  })

  it('returns null for non-printable unknown codes', () => {
    expect(getPrintableCharFromKey('999')).toBeNull()
  })
})
