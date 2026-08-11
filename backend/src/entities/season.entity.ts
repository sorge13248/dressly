import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseReferenceEntity } from './base-reference.entity';

@Entity({ name: 'seasons' })
@Unique(['userId', 'name'])
@Index(['userId'])
export class Season extends BaseReferenceEntity {
  @Column({ type: 'varchar', nullable: true })
  icon!: string | null;
}