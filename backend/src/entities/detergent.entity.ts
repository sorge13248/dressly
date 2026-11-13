import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseReferenceEntity } from './base-reference.entity';

@Entity({ name: 'detergents' })
@Unique(['userId', 'name'])
@Index(['userId'])
export class Detergent extends BaseReferenceEntity {
  @Column({ type: 'varchar', nullable: true })
  description!: string | null;
}
