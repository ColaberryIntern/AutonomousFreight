/**
 * Carrier sourcing (W2) — queries the DAT adapter for truck capacity on the
 * shipment's lane, then vets each candidate through the FMCSA adapter
 * (authority + insurance) so only bookable carriers are surfaced.
 *
 * The core talks ONLY to the adapter contracts (DatEngine / FmcsaEngine), never
 * a vendor directly, so the mock engines drive this in tests and a real DAT/
 * FMCSA engine drops in unchanged (BC TMS: "W2 sourcing logic queries DAT
 * adapter for truck capacity").
 */
import type { ErrorCategory } from '../../adapters/src/contract';
import type { DatEngine, DatLane } from '../../adapters/src/dat/datAdapter';
import type { FmcsaEngine } from '../../adapters/src/fmcsa/fmcsaAdapter';
import { isBookable } from '../../adapters/src/fmcsa/fmcsaAdapter';
import { DAT_EQUIPMENT } from '../../adapters/src/dat/datAdapter';
import type { Shipment } from '../../oms/src/schema/shipment.v1';

export interface CarrierCandidate {
  carrierName: string;
  mcNumber?: string;
  availableDate: string;
  contact?: string;
  bookable: boolean;
  reason: string;
}

export interface SourcingResult {
  lane: DatLane;
  laneRatePerMile?: number;
  candidates: CarrierCandidate[];
  bookableCount: number;
  /**
   * Set when the DAT capacity lookup itself failed. Distinguishes a real "no
   * trucks on this lane" (empty candidates, no error) from a transient outage
   * (empty candidates, error present) so the caller can retry by category
   * instead of treating an outage as a dead lane.
   */
  sourcingError?: { category: ErrorCategory; message: string };
}

export interface SourcingEngines {
  dat: DatEngine;
  fmcsa: FmcsaEngine;
}

function laneFromShipment(shipment: Shipment): DatLane {
  return {
    origin: { ...(shipment.lane.origin.city ? { city: shipment.lane.origin.city } : {}), ...(shipment.lane.origin.state ? { state: shipment.lane.origin.state } : {}), country: shipment.lane.origin.country },
    destination: { ...(shipment.lane.destination.city ? { city: shipment.lane.destination.city } : {}), ...(shipment.lane.destination.state ? { state: shipment.lane.destination.state } : {}), country: shipment.lane.destination.country },
    equipmentCode: DAT_EQUIPMENT[shipment.equipmentType] ?? 'V',
  };
}

/**
 * Source carriers for a shipment. Requires a required-cargo insurance floor to
 * vet against (defaults to a conservative 100k). Bookable candidates first.
 */
export async function sourceCarriers(shipment: Shipment, engines: SourcingEngines, requiredCargoUsd = 100000): Promise<SourcingResult> {
  const lane = laneFromShipment(shipment);
  const pickupDate = shipment.pickupDate ?? '1970-01-01';
  const seed = shipment.shipmentId;

  const rate = await engines.dat.getLaneRate(lane, seed);
  const capacity = await engines.dat.searchCapacity(lane, pickupDate, seed);

  const candidates: CarrierCandidate[] = [];
  if (capacity.ok) {
    for (const truck of capacity.value) {
      let bookable = false;
      let reason = 'no MC number to verify';
      if (truck.mcNumber) {
        const auth = await engines.fmcsa.getCarrierAuthority(truck.mcNumber, seed);
        if (auth.ok) {
          const ins = await engines.fmcsa.getInsurance(auth.value.dotNumber, seed);
          if (ins.ok) {
            bookable = isBookable(auth.value, ins.value, requiredCargoUsd);
            reason = bookable ? 'authority active + insurance on file' : 'failed authority/insurance check';
          } else {
            reason = 'insurance lookup failed';
          }
        } else {
          reason = `authority lookup failed (${auth.error.category})`;
        }
      }
      candidates.push({
        carrierName: truck.carrierName,
        ...(truck.mcNumber ? { mcNumber: truck.mcNumber } : {}),
        availableDate: truck.availableDate,
        ...(truck.contact ? { contact: truck.contact } : {}),
        bookable,
        reason,
      });
    }
  }

  candidates.sort((a, b) => Number(b.bookable) - Number(a.bookable));
  const result: SourcingResult = {
    lane,
    candidates,
    bookableCount: candidates.filter((c) => c.bookable).length,
  };
  if (rate.ok) result.laneRatePerMile = rate.value.avgRatePerMile;
  if (!capacity.ok) result.sourcingError = { category: capacity.error.category, message: capacity.error.message };
  return result;
}
