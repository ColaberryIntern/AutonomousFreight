import {
  parseAuditLogsQuery,
  AUDIT_LOGS_DEFAULT_LIMIT,
  AUDIT_LOGS_MAX_LIMIT,
} from '../../../services/user/src/domain/auditLogsQuery';

describe('parseAuditLogsQuery', () => {
  it('returns defaults for empty input', () => {
    expect(parseAuditLogsQuery({})).toEqual({
      limit: AUDIT_LOGS_DEFAULT_LIMIT,
      offset: 0,
    });
  });

  it('clamps limit to the maximum', () => {
    const out = parseAuditLogsQuery({ limit: '99999' });
    expect(out.limit).toBe(AUDIT_LOGS_MAX_LIMIT);
    expect(out.offset).toBe(0);
  });

  it('falls back to default for invalid limit', () => {
    expect(parseAuditLogsQuery({ limit: 'abc' }).limit).toBe(AUDIT_LOGS_DEFAULT_LIMIT);
    expect(parseAuditLogsQuery({ limit: '-5' }).limit).toBe(AUDIT_LOGS_DEFAULT_LIMIT);
    expect(parseAuditLogsQuery({ limit: '0' }).limit).toBe(AUDIT_LOGS_DEFAULT_LIMIT);
  });

  it('coerces negative offset to 0 and floors fractions', () => {
    expect(parseAuditLogsQuery({ offset: '-10' }).offset).toBe(0);
    expect(parseAuditLogsQuery({ offset: '12.7' }).offset).toBe(12);
  });

  it('accepts a well-formed action filter', () => {
    const out = parseAuditLogsQuery({ action: 'agent.health_monitor.alert' });
    expect(out.action).toBe('agent.health_monitor.alert');
  });

  it('drops malformed action filters', () => {
    expect(parseAuditLogsQuery({ action: 'DROP TABLE users' }).action).toBeUndefined();
    expect(parseAuditLogsQuery({ action: '' }).action).toBeUndefined();
    expect(parseAuditLogsQuery({ action: 123 }).action).toBeUndefined();
  });
});
