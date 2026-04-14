import type { Request, Response, NextFunction } from 'express';
import {
  REQUEST_ID_HEADER,
  VALID_REQUEST_ID,
  traceIdMiddleware,
} from '../../../services/api-gateway/src/middleware/traceId';

function mockReqRes(headers: Record<string, string> = {}): {
  req: Request;
  res: Response;
  setHeader: jest.Mock;
} {
  const setHeader = jest.fn();
  const req = {
    header: (name: string): string | undefined => headers[name.toLowerCase()],
  } as unknown as Request;
  const res = { setHeader } as unknown as Response;
  return { req, res, setHeader };
}

describe('traceIdMiddleware', () => {
  it('generates a UUIDv4 when no header is supplied', () => {
    const { req, res, setHeader } = mockReqRes();
    const next = jest.fn() as unknown as NextFunction;
    traceIdMiddleware(req, res, next);
    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.requestId);
    expect(next).toHaveBeenCalled();
  });

  it('echoes a valid client-supplied request id', () => {
    const { req, res, setHeader } = mockReqRes({ [REQUEST_ID_HEADER]: 'abc12345' });
    traceIdMiddleware(req, res, jest.fn() as unknown as NextFunction);
    expect(req.requestId).toBe('abc12345');
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'abc12345');
  });

  it('replaces an invalid client-supplied request id with a UUID', () => {
    const { req, res, setHeader } = mockReqRes({ [REQUEST_ID_HEADER]: 'bad id with spaces!' });
    traceIdMiddleware(req, res, jest.fn() as unknown as NextFunction);
    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.requestId);
  });

  it('VALID_REQUEST_ID matches expected patterns', () => {
    expect(VALID_REQUEST_ID.test('abcdefgh')).toBe(true);
    expect(VALID_REQUEST_ID.test('short')).toBe(false);
    expect(VALID_REQUEST_ID.test('bad id')).toBe(false);
  });
});
