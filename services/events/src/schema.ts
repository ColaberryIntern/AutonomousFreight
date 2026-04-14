import { z } from 'zod';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (): z.ZodString => z.string().regex(UUID_RE);

export const UserRegisteredPayload = z.object({
  userId: uuid(),
  email: z.string(),
  roles: z.array(z.string()).min(1),
});

export const ShipmentCarrierSelectedPayload = z.object({
  shipmentId: uuid(),
  carrierId: uuid(),
  score: z.number().min(0).max(1),
});

export const EVENT_SCHEMAS = {
  'user.registered@1': UserRegisteredPayload,
  'shipment.carrier_selected@1': ShipmentCarrierSelectedPayload,
} as const;

export type EventSchemaKey = keyof typeof EVENT_SCHEMAS;

export type PayloadFor<K extends EventSchemaKey> = z.infer<(typeof EVENT_SCHEMAS)[K]>;
