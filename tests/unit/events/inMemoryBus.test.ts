import { InMemoryEventBus } from '../../../services/events/src/inMemoryBus';
import type { DomainEvent } from '../../../services/events/src/types';

const validEvent = (): DomainEvent => ({
  name: 'user.registered',
  version: 1,
  occurredAt: new Date().toISOString(),
  payload: {
    userId: '11111111-1111-1111-1111-111111111111',
    email: 'a@b.com',
    roles: ['broker'],
  },
});

describe('InMemoryEventBus', () => {
  it('delivers events to every subscribed handler', async () => {
    const bus = new InMemoryEventBus();
    const h1 = jest.fn();
    const h2 = jest.fn();
    bus.subscribe('user.registered', h1);
    bus.subscribe('user.registered', h2);
    await bus.publish(validEvent());
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('does not deliver to handlers for other event names', async () => {
    const bus = new InMemoryEventBus();
    const otherHandler = jest.fn();
    bus.subscribe('some.other.event', otherHandler);
    await bus.publish(validEvent());
    expect(otherHandler).not.toHaveBeenCalled();
  });

  it('unsubscribe stops further delivery', async () => {
    const bus = new InMemoryEventBus();
    const h = jest.fn();
    const unsub = bus.subscribe('user.registered', h);
    await bus.publish(validEvent());
    unsub();
    await bus.publish(validEvent());
    expect(h).toHaveBeenCalledTimes(1);
  });

  it('handler throwing does not abort delivery to other handlers and does not throw back to caller', async () => {
    const captured: Record<string, unknown>[] = [];
    const logger = {
      error: (p: Record<string, unknown>): void => {
        captured.push(p);
      },
    };
    const bus = new InMemoryEventBus(logger);
    bus.subscribe('user.registered', () => {
      throw new Error('boom');
    });
    const h2 = jest.fn();
    bus.subscribe('user.registered', h2);
    await expect(bus.publish(validEvent())).resolves.toBeUndefined();
    expect(h2).toHaveBeenCalled();
    expect(captured).toHaveLength(1);
  });

  it('publish with no subscribers is a silent no-op', async () => {
    const bus = new InMemoryEventBus();
    await expect(bus.publish(validEvent())).resolves.toBeUndefined();
  });

  it('payload with invalid schema throws synchronously on publish', async () => {
    const bus = new InMemoryEventBus();
    const bad: DomainEvent = {
      name: 'user.registered',
      version: 1,
      occurredAt: new Date().toISOString(),
      payload: { userId: 'not-a-uuid', email: 'x@y.com', roles: [] },
    };
    await expect(bus.publish(bad)).rejects.toBeDefined();
  });

  it('events without a registered schema are passed through without validation', async () => {
    const bus = new InMemoryEventBus();
    const h = jest.fn();
    bus.subscribe('custom.unregistered', h);
    await bus.publish({
      name: 'custom.unregistered',
      version: 1,
      occurredAt: new Date().toISOString(),
      payload: { anything: true },
    });
    expect(h).toHaveBeenCalled();
  });
});
