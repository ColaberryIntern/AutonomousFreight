import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import type { ComplianceSnapshot, OperatingStatus, SafetyRating } from '../domain/riskScore';

export interface ExpiringArtifact {
  id: string;
  artifactType: string;
  reference: string;
  expiresAt: string;
  expired: boolean;
}

export interface CarrierComplianceRow extends ComplianceSnapshot {
  carrierId: string;
  dotNumber?: string;
  snapshotAt: string;
}

export class ComplianceRepository {
  constructor(private readonly pool: Pool) {}

  async runMigrations(): Promise<void> {
    const sqlPath = join(__dirname, 'migrations', '005_compliance.sql');
    await this.pool.query(readFileSync(sqlPath, 'utf8'));
  }

  async listExpiring(withinDays: number): Promise<ExpiringArtifact[]> {
    const r = await this.pool.query<{
      id: string;
      artifact_type: string;
      reference: string;
      expires_at: Date;
    }>(
      `SELECT id, artifact_type, reference, expires_at
       FROM compliance_artifacts
       WHERE expires_at <= NOW() + ($1::int * INTERVAL '1 day')
       ORDER BY expires_at ASC`,
      [withinDays],
    );
    const now = Date.now();
    return r.rows.map((row) => ({
      id: row.id,
      artifactType: row.artifact_type,
      reference: row.reference,
      expiresAt: row.expires_at.toISOString(),
      expired: row.expires_at.getTime() < now,
    }));
  }

  async getCarrierCompliance(carrierId: string): Promise<CarrierComplianceRow | null> {
    const r = await this.pool.query<{
      carrier_id: string;
      dot_number: string | null;
      operating_status: OperatingStatus;
      safety_rating: SafetyRating;
      insurance_on_file: boolean;
      snapshot_at: Date;
    }>(
      `SELECT carrier_id, dot_number, operating_status, safety_rating, insurance_on_file, snapshot_at
       FROM carrier_compliance WHERE carrier_id = $1`,
      [carrierId],
    );
    const row = r.rows[0];
    if (!row) return null;
    const ageDays = Math.floor((Date.now() - row.snapshot_at.getTime()) / 86_400_000);
    const out: CarrierComplianceRow = {
      carrierId: row.carrier_id,
      operatingStatus: row.operating_status,
      safetyRating: row.safety_rating,
      insuranceOnFile: row.insurance_on_file,
      snapshotAgeDays: ageDays,
      snapshotAt: row.snapshot_at.toISOString(),
    };
    if (row.dot_number !== null) out.dotNumber = row.dot_number;
    return out;
  }

  async upsertCarrierComplianceForTest(
    carrierId: string,
    snapshot: Partial<ComplianceSnapshot> & {
      operatingStatus: OperatingStatus;
      safetyRating: SafetyRating;
      insuranceOnFile: boolean;
    },
  ): Promise<void> {
    process.env['NODE_ENV'] = 'test';
    await this.pool.query(
      `INSERT INTO carrier_compliance (carrier_id, operating_status, safety_rating, insurance_on_file)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (carrier_id) DO UPDATE
       SET operating_status = EXCLUDED.operating_status,
           safety_rating = EXCLUDED.safety_rating,
           insurance_on_file = EXCLUDED.insurance_on_file,
           snapshot_at = NOW()`,
      [carrierId, snapshot.operatingStatus, snapshot.safetyRating, snapshot.insuranceOnFile],
    );
  }

  async createArtifactForTest(
    artifactType: 'broker_authority' | 'surety_bond' | 'state_license',
    reference: string,
    expiresAt: Date,
  ): Promise<void> {
    process.env['NODE_ENV'] = 'test';
    await this.pool.query(
      `INSERT INTO compliance_artifacts (artifact_type, reference, issued_at, expires_at)
       VALUES ($1, $2, NOW() - INTERVAL '365 days', $3)`,
      [artifactType, reference, expiresAt.toISOString().slice(0, 10)],
    );
  }

  async truncateForTest(): Promise<void> {
    if (process.env['NODE_ENV'] !== 'test') throw new Error('test-only');
    await this.pool.query('TRUNCATE compliance_artifacts, carrier_compliance');
  }
}
