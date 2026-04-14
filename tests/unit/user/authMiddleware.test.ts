import type { Request, Response, NextFunction } from 'express';
import { requireAuth, requireRole } from '../../../services/user/src/api/authMiddleware';
import { issueAccessToken } from '../../../services/user/src/domain/jwt';

const SECRET = 'unit-test-secret-12345678';

function mockRes(): { res: Response; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

describe('requireAuth middleware', () => {
  it('401 when Authorization header is missing', () => {
    const { res, status } = mockRes();
    const next = jest.fn() as unknown as NextFunction;
    requireAuth(SECRET)({ headers: {} } as Request, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('401 when scheme is not Bearer', () => {
    const { res, status } = mockRes();
    const next = jest.fn() as unknown as NextFunction;
    requireAuth(SECRET)({ headers: { authorization: 'Basic abc' } } as Request, res, next);
    expect(status).toHaveBeenCalledWith(401);
  });

  it('401 when signature invalid', () => {
    const token = issueAccessToken(
      { sub: 'u', email: 'e@e.com', roles: ['broker'] },
      'different-secret-also-long',
      '15m',
    );
    const { res, status } = mockRes();
    const next = jest.fn() as unknown as NextFunction;
    requireAuth(SECRET)({ headers: { authorization: `Bearer ${token}` } } as Request, res, next);
    expect(status).toHaveBeenCalledWith(401);
  });

  it('populates req.user and calls next() on a valid token', () => {
    const token = issueAccessToken(
      { sub: 'u-123', email: 'ok@x.com', roles: ['broker', 'auditor'] },
      SECRET,
      '15m',
    );
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as Request;
    const { res } = mockRes();
    const next = jest.fn() as unknown as NextFunction;
    requireAuth(SECRET)(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({
      userId: 'u-123',
      email: 'ok@x.com',
      roles: ['broker', 'auditor'],
    });
  });
});

describe('requireRole middleware', () => {
  it('401 when no req.user is present', () => {
    const { res, status } = mockRes();
    const next = jest.fn() as unknown as NextFunction;
    requireRole('admin')({ headers: {} } as Request, res, next);
    expect(status).toHaveBeenCalledWith(401);
  });

  it('403 when user lacks overlapping role', () => {
    const req = {
      headers: {},
      user: { userId: 'u', email: 'e@e.com', roles: ['broker'] },
    } as Request;
    const { res, status } = mockRes();
    const next = jest.fn() as unknown as NextFunction;
    requireRole('admin')(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when user has at least one required role', () => {
    const req = {
      headers: {},
      user: { userId: 'u', email: 'e@e.com', roles: ['admin', 'broker'] },
    } as Request;
    const { res } = mockRes();
    const next = jest.fn() as unknown as NextFunction;
    requireRole('admin', 'auditor')(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
