import { Writable } from 'node:stream';
import type pino from 'pino';
import { buildLogger } from '../../../services/api-gateway/src/middleware/logger';

function captureSink(): { sink: pino.DestinationStream; read: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb): void {
      chunks.push(chunk.toString());
      cb();
    },
  });
  const sink: pino.DestinationStream = {
    write: (msg: string): void => {
      chunks.push(msg);
    },
  };
  void stream;
  return { sink, read: (): string => chunks.join('') };
}

describe('pino logger redaction', () => {
  it('removes req.headers.authorization and req.body.password from output', () => {
    const { sink, read } = captureSink();
    const logger = buildLogger({ level: 'info', destination: sink });

    logger.info(
      {
        req: {
          headers: { authorization: 'Bearer SECRET_TOKEN', cookie: 'session=abc' },
          body: { password: 'hunter2', email: 'a@b.com' },
        },
      },
      'test event',
    );

    const output = read();
    expect(output).not.toContain('SECRET_TOKEN');
    expect(output).not.toContain('hunter2');
    expect(output).not.toContain('session=abc');
    expect(output).toContain('a@b.com');
  });
});
