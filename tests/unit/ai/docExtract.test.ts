import { extractBolFields } from '../../../services/ai/src/domain/docExtract';

describe('extractBolFields', () => {
  it('extracts BOL number from common formats', () => {
    expect(extractBolFields('Reference BOL-ABC1234').bolNumber).toBe('ABC1234');
    expect(extractBolFields('BOL: XYZ-99887').bolNumber).toBe('XYZ-99887');
    expect(extractBolFields('B/L 4477-2A').bolNumber).toBe('4477-2A');
  });

  it('extracts ISO date when present', () => {
    expect(extractBolFields('Pickup 2026-05-01').date).toBe('2026-05-01');
  });

  it('extracts freight class', () => {
    expect(extractBolFields('Freight class: 70').freightClass).toBe('70');
    expect(extractBolFields('class 92.5').freightClass).toBe('92.5');
  });

  it('returns nulls when nothing matches', () => {
    const r = extractBolFields('nothing relevant here');
    expect(r).toEqual({ bolNumber: null, date: null, freightClass: null });
  });
});
