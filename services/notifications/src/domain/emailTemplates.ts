export interface UserRegisteredVars {
  email: string;
  roles: string[];
}

export interface RenderedEmail {
  subject: string;
  text: string;
}

export function renderUserRegisteredWelcome(vars: UserRegisteredVars): RenderedEmail {
  const rolesList = vars.roles.join(', ');
  return {
    subject: 'Welcome to Autonomous Freight',
    text: [
      `Hi ${vars.email},`,
      '',
      'Your Autonomous Freight account has been created.',
      `Role${vars.roles.length === 1 ? '' : 's'} assigned: ${rolesList}.`,
      '',
      'If you did not create this account, please contact support.',
    ].join('\n'),
  };
}
