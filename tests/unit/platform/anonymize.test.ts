import { anonymize, maskField, anonymizeRecord } from '../../../services/platform/src/privacy/anonymize';

describe('anonymize', () => {
  it('redacts email addresses', () => {
    expect(anonymize('Contact john@example.com for info')).toBe(
      'Contact [EMAIL_REDACTED] for info',
    );
  });

  it('redacts multiple emails', () => {
    const result = anonymize('a@b.com and c@d.org');
    expect(result).toBe('[EMAIL_REDACTED] and [EMAIL_REDACTED]');
  });

  it('redacts phone numbers', () => {
    expect(anonymize('Call 555-123-4567')).toBe('Call [PHONE_REDACTED]');
    expect(anonymize('Call (555) 123-4567')).toBe('Call [PHONE_REDACTED]');
    expect(anonymize('Call +1-555-123-4567')).toBe('Call [PHONE_REDACTED]');
  });

  it('redacts SSNs', () => {
    expect(anonymize('SSN: 123-45-6789')).toBe('SSN: [SSN_REDACTED]');
  });

  it('returns unchanged text with no PII', () => {
    expect(anonymize('Shipment ABC delivered')).toBe('Shipment ABC delivered');
  });

  it('handles empty string', () => {
    expect(anonymize('')).toBe('');
  });
});

describe('maskField', () => {
  it('masks after visible characters', () => {
    expect(maskField('john@example.com', 3)).toBe('joh***');
  });

  it('masks entire value when shorter than visible count', () => {
    expect(maskField('ab', 5)).toBe('**');
  });
});

describe('anonymizeRecord', () => {
  it('masks sensitive keys', () => {
    const rec = { email: 'test@example.com', shipmentId: 'ABC-123', name: 'John Doe' };
    const result = anonymizeRecord(rec);
    expect(result['email']).toBe('tes***');
    expect(result['name']).toBe('Joh***');
    expect(result['shipmentId']).toBe('ABC-123');
  });

  it('preserves non-string values', () => {
    const rec = { email: 'test@x.com', count: 42 };
    const result = anonymizeRecord(rec);
    expect(result['count']).toBe(42);
  });
});
