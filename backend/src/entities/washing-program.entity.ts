import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseReferenceEntity } from './base-reference.entity';

@Entity({ name: 'washing_programs' })
@Unique(['userId', 'name'])
@Index(['userId'])
export class WashingProgram extends BaseReferenceEntity {
  @Column({ type: 'integer', nullable: true })
  temperature!: number | null;

  @Column({ type: 'integer', nullable: true })
  spinSpeed!: number | null;
}
