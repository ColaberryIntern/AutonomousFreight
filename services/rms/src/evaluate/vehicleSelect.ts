/**
 * D5 vehicle inference + his rate-per-mile lookup, built on Karun's vendored
 * fleet data. When an RFQ does not declare a vehicle, we select the smallest
 * fleet vehicle that satisfies the weight (and dims), per his
 * aiX_vehicle_selector logic; "no cargo details" defaults to Tractor/FTL.
 */
import type { EquipmentType } from '../schema/rfq.v1';
import { KARUN_FLEET, VEHICLE_ALIASES, type FleetVehicle, type RpmBand } from '../vendor/karun/fleetConfig';

export interface VehicleSelection {
  vehicle: string;
  equipmentType: EquipmentType;
  source: 'from_email' | 'from_fallback_dims_weight' | 'from_fallback_ftl';
}

export interface Dims {
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
}

/** D5/D22: normalize a free-text vehicle mention via Karun's EN/ES alias tables. */
export function normalizeVehicle(text: string): EquipmentType | undefined {
  for (const [re, eq] of VEHICLE_ALIASES) {
    if (re.test(text)) return eq;
  }
  return undefined;
}

function dimsFit(v: FleetVehicle, dims?: Dims): boolean {
  if (!dims) return true;
  return (
    (dims.lengthIn === undefined || dims.lengthIn <= v.dims.lengthIn) &&
    (dims.widthIn === undefined || dims.widthIn <= v.dims.widthIn) &&
    (dims.heightIn === undefined || dims.heightIn <= v.dims.heightIn)
  );
}

const TRACTOR = KARUN_FLEET[KARUN_FLEET.length - 1]!;

/** D5: smallest fleet vehicle that fits weight + dims; Tractor when unknown. */
export function selectVehicle(input: { weightLb?: number | undefined; dims?: Dims | undefined }): VehicleSelection {
  if (input.weightLb === undefined && !input.dims) {
    return { vehicle: TRACTOR.name, equipmentType: TRACTOR.equipmentType, source: 'from_fallback_ftl' };
  }
  for (const v of KARUN_FLEET) {
    const weightOk = input.weightLb === undefined || v.weightCapacityLb >= input.weightLb;
    if (weightOk && dimsFit(v, input.dims)) {
      return { vehicle: v.name, equipmentType: v.equipmentType, source: 'from_fallback_dims_weight' };
    }
  }
  return { vehicle: TRACTOR.name, equipmentType: TRACTOR.equipmentType, source: 'from_fallback_dims_weight' };
}

/** Map miles to Karun's RPM distance band. */
export function rpmBand(miles: number): RpmBand {
  if (miles < 300) return 'under_300';
  if (miles < 500) return 'under_500';
  if (miles < 700) return 'under_700';
  if (miles < 900) return 'under_900';
  if (miles < 1200) return 'under_1200';
  return 'over_1200';
}

/** His rate-per-mile for an equipment type at a given distance. */
export function rpmFor(equipmentType: EquipmentType, miles: number): number | undefined {
  const v = KARUN_FLEET.find((x) => x.equipmentType === equipmentType);
  return v ? v.rpm[rpmBand(miles)] : undefined;
}
