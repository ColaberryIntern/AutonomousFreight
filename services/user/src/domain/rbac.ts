export type Role = 'admin' | 'broker' | 'carrier' | 'auditor';

export const ALL_ROLES: readonly Role[] = ['admin', 'broker', 'carrier', 'auditor'] as const;

export const DEFAULT_ROLE: Role = 'broker';

export function isKnownRole(candidate: string): candidate is Role {
  return (ALL_ROLES as readonly string[]).includes(candidate);
}

export function userHasAnyRole(
  userRoles: readonly string[],
  requiredRoles: readonly Role[],
): boolean {
  if (requiredRoles.length === 0) return true;
  return requiredRoles.some((required) => userRoles.includes(required));
}
