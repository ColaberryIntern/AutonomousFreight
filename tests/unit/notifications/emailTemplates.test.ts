import { renderUserRegisteredWelcome } from '../../../services/notifications/src/domain/emailTemplates';

describe('renderUserRegisteredWelcome', () => {
  it('renders a welcome subject and includes the user email + roles', () => {
    const r = renderUserRegisteredWelcome({ email: 'a@b.com', roles: ['broker'] });
    expect(r.subject).toBe('Welcome to Autonomous Freight');
    expect(r.text).toContain('a@b.com');
    expect(r.text).toContain('broker');
    expect(r.text).toContain('Role assigned');
  });

  it('pluralizes "Roles" when multiple roles are present', () => {
    const r = renderUserRegisteredWelcome({
      email: 'admin@af.test',
      roles: ['admin', 'auditor'],
    });
    expect(r.text).toContain('Roles assigned: admin, auditor');
  });

  it('never contains password, token, or bearer markers', () => {
    const r = renderUserRegisteredWelcome({ email: 'x@y.com', roles: ['broker'] });
    expect(r.text.toLowerCase()).not.toContain('password');
    expect(r.text.toLowerCase()).not.toContain('bearer');
    expect(r.text.toLowerCase()).not.toContain('token');
  });
});
