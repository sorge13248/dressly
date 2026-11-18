import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, Not } from 'typeorm';
import { Clothes } from '../entities/clothes.entity';
import { generateUniqueTagCode } from '../common/utils/tag-code.util';

@Injectable()
export class ClothesMigrationService {
  private readonly logger = new Logger(ClothesMigrationService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async runStartupMigrations(): Promise<void> {
    await this.backfillMissingTagCodes();
    await this.migrateColorLossRiskTriState();
  }

  async migrateColorLossRiskTriState(): Promise<void> {
    try {
      await this.dataSource.query(
        'CREATE TABLE IF NOT EXISTS _app_migrations (id TEXT PRIMARY KEY, appliedAt DATETIME);',
      );
      const applied = await this.dataSource.query(
        'SELECT id FROM _app_migrations WHERE id = ?;',
        ['20261113_color_loss_risk_tri_state'],
      );
      if (applied && applied.length > 0) {
        return;
      }

      this.logger.log('Running one-time migration: 20261113_color_loss_risk_tri_state...');
      // Treat false (0) as null if test temperature was not set, otherwise keep false (0)
      await this.dataSource.query(`
        UPDATE washing_instructions
        SET colorLossRisk = NULL
        WHERE (colorLossRisk = 0 OR colorLossRisk = FALSE)
          AND colorLossTestTemperature IS NULL;
      `);

      await this.dataSource.query(
        'INSERT INTO _app_migrations (id, appliedAt) VALUES (?, CURRENT_TIMESTAMP);',
        ['20261113_color_loss_risk_tri_state'],
      );
      this.logger.log('Migration 20261113_color_loss_risk_tri_state completed successfully.');
    } catch (err) {
      this.logger.warn(`Could not run colorLossRisk migration: ${String(err)}`);
    }
  }

  async backfillMissingTagCodes(): Promise<void> {
    const repository = this.dataSource.getRepository(Clothes);
    const unassigned = await repository.find({
      where: { code: IsNull() },
      order: { createdAt: 'ASC' },
    });

    if (unassigned.length === 0) return;

    this.logger.log(`Backfilling tag codes for ${unassigned.length} clothes items...`);

    const byUser = new Map<string, Clothes[]>();
    for (const item of unassigned) {
      const list = byUser.get(item.userId) ?? [];
      list.push(item);
      byUser.set(item.userId, list);
    }

    for (const [userId, items] of byUser.entries()) {
      const assigned = await repository.find({
        where: { userId, code: Not(IsNull()) },
        select: { code: true },
      });
      const userCodes = new Set(assigned.map((c) => c.code).filter(Boolean) as string[]);

      for (const item of items) {
        const newCode = generateUniqueTagCode(userCodes);
        userCodes.add(newCode);
        await repository.update(item.id, { code: newCode });
      }
    }

    this.logger.log(`Successfully backfilled tag codes for ${unassigned.length} clothes items.`);
  }
}
