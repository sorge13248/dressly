import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'sync_tombstones' })
@Index(['userId', 'entityType'])
@Index(['userId', 'deletedAt'])
export class SyncTombstone {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'varchar' })
  entityType!: string;

  @Column({ type: 'varchar' })
  entityId!: string;

  @CreateDateColumn()
  deletedAt!: Date;
}

