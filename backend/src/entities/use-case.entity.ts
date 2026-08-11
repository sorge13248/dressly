import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseReferenceEntity } from './base-reference.entity';

@Entity({ name: 'use_cases' })
@Unique(['userId', 'name'])
@Index(['userId'])
export class UseCase extends BaseReferenceEntity {
  @Column({ type: 'varchar', nullable: true })
  icon!: string | null;
}