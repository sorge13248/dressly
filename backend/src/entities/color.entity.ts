import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseReferenceEntity } from './base-reference.entity';

@Entity({ name: 'colors' })
@Unique(['userId', 'name'])
@Index(['userId'])
export class Color extends BaseReferenceEntity {
  @Column({ type: 'varchar', nullable: true })
  hexCode!: string | null;
}