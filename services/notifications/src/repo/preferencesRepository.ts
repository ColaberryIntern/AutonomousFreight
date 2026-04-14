import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';

export interface NotificationPreferences {
  userId: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
}

const DEFAULTS = { emailEnabled: true, inAppEnabled: true } as const;

export class PreferencesRepository {
  constructor(private readonly pool: Pool) {}

  async runMigrations(): Promise<void> {
    const sqlPath = join(__dirname, 'migrations', '003_notification_prefs.sql');
    const sql = readFileSync(sqlPath, 'utf8');
    await this.pool.query(sql);
  }

  async getOrDefault(userId: string): Promise<NotificationPreferences> {
    const result = await this.pool.query<{
      user_id: string;
      email_enabled: boolean;
      in_app_enabled: boolean;
    }>(
      'SELECT user_id, email_enabled, in_app_enabled FROM notification_preferences WHERE user_id = $1',
      [userId],
    );
    const row = result.rows[0];
    if (row) {
      return {
        userId: row.user_id,
        emailEnabled: row.email_enabled,
        inAppEnabled: row.in_app_enabled,
      };
    }
    return { userId, ...DEFAULTS };
  }
}
