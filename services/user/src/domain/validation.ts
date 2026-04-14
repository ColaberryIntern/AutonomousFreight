import { z } from 'zod';
import { ALL_ROLES } from './rbac';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PASSWORD_POLICY = {
  minLength: 12,
  requiresLetter: /[A-Za-z]/,
  requiresDigit: /\d/,
} as const;

export const RegisterSchema = z.object({
  email: z.string().regex(EMAIL_RE).max(254),
  password: z
    .string()
    .min(PASSWORD_POLICY.minLength)
    .regex(PASSWORD_POLICY.requiresLetter)
    .regex(PASSWORD_POLICY.requiresDigit)
    .max(200),
  role: z.enum([ALL_ROLES[0], ...ALL_ROLES.slice(1)] as [string, ...string[]]).optional(),
});

export const LoginSchema = z.object({
  email: z.string().regex(EMAIL_RE).max(254),
  password: z.string().min(1).max(200),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
