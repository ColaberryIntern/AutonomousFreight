/**
 * VENDORED from Karun's ShipCES_EmailParsing repo (read-only reuse; do NOT edit
 * upstream). Sources:
 *   - shipces_django/core/config/vehicle_fleet.json  (dims, weight cap, RPM)
 *   - shipces_django/core/config/vehicle_specs.json  (business rules)
 *   - core/agents/prompts/extractor_fragments/fragment_{en_us,es_mx}.txt (aliases)
 *
 * This is Karun's fleet data + vehicle-alias tables, reused as-is inside our RMS
 * layer. His email-parsing system is now a component of the bigger Autonomous
 * Freight whole; this file makes his vehicle data first-class in our build.
 */
import type { EquipmentType } from '../../schema/rfq.v1';

export type RpmBand = 'under_300' | 'under_500' | 'under_700' | 'under_900' | 'under_1200' | 'over_1200';

export interface FleetVehicle {
  name: string;
  equipmentType: EquipmentType;
  palletCapacity: number;
  dims: { lengthIn: number; widthIn: number; heightIn: number };
  weightCapacityLb: number;
  /** Karun's rate-per-mile by distance band (his real pricing data). */
  rpm: Record<RpmBand, number>;
}

/** Ordered smallest -> largest by weight capacity (D5 selects the first fit). */
export const KARUN_FLEET: readonly FleetVehicle[] = [
  { name: 'Cargo Van', equipmentType: 'CARGO_VAN', palletCapacity: 2, dims: { lengthIn: 140, widthIn: 48, heightIn: 48 }, weightCapacityLb: 3400, rpm: { under_300: 1.5, under_500: 1.35, under_700: 1.25, under_900: 1.15, under_1200: 1.12, over_1200: 1.1 } },
  { name: 'Sprinter', equipmentType: 'SPRINTER', palletCapacity: 3, dims: { lengthIn: 168, widthIn: 50, heightIn: 72 }, weightCapacityLb: 3500, rpm: { under_300: 1.5, under_500: 1.35, under_700: 1.25, under_900: 1.15, under_1200: 1.12, over_1200: 1.1 } },
  { name: 'Cube', equipmentType: 'CUBE_VAN', palletCapacity: 6, dims: { lengthIn: 160, widthIn: 90, heightIn: 70 }, weightCapacityLb: 4000, rpm: { under_300: 1.9, under_500: 1.7, under_700: 1.5, under_900: 1.4, under_1200: 1.25, over_1200: 1.2 } },
  { name: 'Straight Truck', equipmentType: 'STRAIGHT_TRUCK', palletCapacity: 12, dims: { lengthIn: 288, widthIn: 96, heightIn: 100 }, weightCapacityLb: 9000, rpm: { under_300: 2.6, under_500: 2.6, under_700: 2.4, under_900: 2.25, under_1200: 2.2, over_1200: 2.1 } },
  { name: 'Tractor', equipmentType: 'VAN', palletCapacity: 26, dims: { lengthIn: 636, widthIn: 102, heightIn: 108 }, weightCapacityLb: 46000, rpm: { under_300: 3.0, under_500: 3.0, under_700: 2.55, under_900: 2.4, under_1200: 2.15, over_1200: 2.1 } },
];

/** Karun's business rules (vehicle_specs.json): these all resolve to Tractor/FTL. */
export const KARUN_FLEET_DEFAULT = 'Tractor';

/**
 * Vehicle alias tables lifted verbatim from his EN/ES prompt fragments. Maps a
 * free-text vehicle mention to a canonical equipment type. Order matters: more
 * specific aliases first. "Dry Van" must NOT match Cargo Van (his explicit note).
 */
export const VEHICLE_ALIASES: ReadonlyArray<readonly [RegExp, EquipmentType]> = [
  [/\breefer|refrigerated\b/i, 'REEFER'],
  [/\bflat ?bed\b/i, 'FLATBED'],
  [/\brabon\b/i, 'STRAIGHT_TRUCK'], // es-MX (Karun)
  [/\bstraight ?truck|box ?truck|dock ?high|1[0-9]ft|2[0-6]ft\b/i, 'STRAIGHT_TRUCK'],
  [/\b3\.5|tres y media|cube\b/i, 'CUBE_VAN'], // es-MX "tres y media"
  [/\bsprinter\b/i, 'SPRINTER'],
  [/\bcargo ?van|nissan\b/i, 'CARGO_VAN'], // es-MX "Nissan"
  [/\bdry ?van|53'?|tractor|full ?truck|ftl\b/i, 'VAN'],
];
