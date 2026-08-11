import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseReferenceEntity } from './base-reference.entity';

@Entity({ name: 'temperatures' })
@Unique(['userId', 'name'])
@Index(['userId'])
export class Temperature extends BaseReferenceEntity {
  @Column({ type: 'varchar', nullable: true })
  icon!: string | null;
}