import type { Pool } from 'pg';
import { extractBolFields } from '../../../ai/src/domain/docExtract';
import type { AuditRepository } from '../../../user/src/repo/auditRepository';

export interface DocumentDeps {
  pool: Pool;
  audit: AuditRepository;
}

export interface DocumentTickResult {
  verified: number;
  exceptions: number;
  waiting: number;
}

export async function runDocumentTick(deps: DocumentDeps): Promise<DocumentTickResult> {
  const result: DocumentTickResult = { verified: 0, exceptions: 0, waiting: 0 };

  const ships = await deps.pool.query<{ id: string }>(
    `SELECT id FROM shipments WHERE status = 'delivered' LIMIT 50`,
  );

  for (const ship of ships.rows) {
    try {
      const doc = await deps.pool.query<{
        id: string;
        raw_text: string;
      }>(
        `SELECT id, raw_text FROM shipment_documents
         WHERE shipment_id = $1 AND doc_type = 'bol'
         ORDER BY uploaded_at DESC LIMIT 1`,
        [ship.id],
      );

      if (doc.rows.length === 0) {
        result.waiting++;
        continue;
      }

      const row = doc.rows[0];
      if (!row) {
        result.waiting++;
        continue;
      }
      const fields = extractBolFields(row.raw_text);

      if (fields.bolNumber && fields.date) {
        await deps.pool.query(`UPDATE shipment_documents SET extracted_fields = $1 WHERE id = $2`, [
          fields,
          row.id,
        ]);
        await deps.pool.query(
          `UPDATE shipments SET status = 'doc_verified' WHERE id = $1 AND status = 'delivered'`,
          [ship.id],
        );

        void deps.audit.record({
          action: 'agent.document.verified',
          target: ship.id,
          metadata: { bolNumber: fields.bolNumber, date: fields.date },
        });
        result.verified++;
      } else {
        void deps.audit.record({
          action: 'agent.document.exception',
          target: ship.id,
          metadata: {
            reason: 'incomplete_extraction',
            bolNumber: fields.bolNumber,
            date: fields.date,
            freightClass: fields.freightClass,
          },
        });
        result.exceptions++;
      }
    } catch (err) {
      console.error('[document-agent] error', { shipmentId: ship.id, err });
    }
  }

  return result;
}
