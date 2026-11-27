import { describe, expect, it } from 'vitest';
import { sequenceElementId, parseSequenceElementId } from '../src';

describe('sequence element ids', () => {
  it('builds the id of a nested Message, a Note and a Fragment with the format `<interaction>:<path>`', () => {
    expect(sequenceElementId('login', '1.0.2')).toBe('login:1.0.2');
    expect(sequenceElementId('login', '3')).toBe('login:3');
  });

  it('builds the id of a Fragment operand with `:k`', () => {
    expect(sequenceElementId('login', '1', 0)).toBe('login:1:0');
  });

  it('parses back what it builds (nested Message, Note, Fragment and its operand)', () => {
    expect(parseSequenceElementId('login:1.0.2')).toEqual({ interaction: 'login', path: '1.0.2' });
    expect(parseSequenceElementId(sequenceElementId('a', '4'))).toEqual({ interaction: 'a', path: '4' });
    expect(parseSequenceElementId(sequenceElementId('a', '1.0', 2))).toEqual({ interaction: 'a', path: '1.0', operand: 2 });
  });

  it('does not parse ids that are not sequence ids', () => {
    expect(parseSequenceElementId('api')).toBeUndefined();
    expect(parseSequenceElementId('a -> b')).toBeUndefined();
    expect(parseSequenceElementId('login:')).toBeUndefined();
    expect(parseSequenceElementId(':1')).toBeUndefined();
    expect(parseSequenceElementId('login:x')).toBeUndefined();
  });
});
