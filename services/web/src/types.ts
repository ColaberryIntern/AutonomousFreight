export interface User {
  userId: string;
  email: string;
  roles: string[];
}

export interface Shipment {
  id: string;
  origin: string;
  destination: string;
  distanceMiles: number;
  status: 'quoting' | 'assigned' | 'in_transit' | 'delivered' | 'cancelled';
}

export interface Carrier {
  id: string;
  name: string;
  rating: number;
  active: boolean;
}

export interface Bid {
  carrierId: string;
  carrierName: string;
  rating: number;
  costUsd: number;
  pickupDistanceMiles: number;
}

export interface Ranking extends Bid {
  score: number;
}

export interface ShipmentDetail {
  shipment: Shipment;
  bids: Bid[];
  rankings: Ranking[];
}

export interface ComplianceSnap {
  carrierId: string;
  dotNumber?: string;
  operatingStatus: string;
  safetyRating: string;
  insuranceOnFile: boolean;
  snapshotAgeDays: number;
  riskScore: number;
  snapshotAt: string;
}

export interface Overview {
  shipments: { byStatus: Record<string, number>; quoting: number; total: number };
  carriers: { active: number };
  compliance: {
    riskBuckets: { green: number; amber: number; red: number; unknown: number };
    artifactsExpiringWithin30d: number;
    artifactsExpired: number;
  };
  auditEventsLast24h: number;
}

export interface ComplianceSummary {
  riskBuckets: { green: number; amber: number; red: number; unknown: number };
  artifactsByType: Record<string, number>;
  artifactsExpiring: { total: number; expired: number };
}

export interface AuditItem {
  id: string;
  actorUserId?: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
  occurredAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  roles: string[];
  mfaEnabled: boolean;
  createdAt: string;
}

export interface ExpiringArtifact {
  id: string;
  artifactType: string;
  reference: string;
  expiresAt: string;
  expired: boolean;
}

export interface ScoringWeights {
  weights: { cost: number; distance: number; rating: number };
  formula: string;
  notes: string;
}
