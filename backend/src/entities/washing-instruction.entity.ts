import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Clothes } from './clothes.entity';
import { WashingProgram } from './washing-program.entity';
import { Detergent } from './detergent.entity';

@Entity({ name: 'washing_instructions' })
@Index(['userId'])
export class WashingInstruction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @OneToOne(() => Clothes, (clothes) => clothes.washingInstruction, { onDelete: 'CASCADE' })
  @JoinColumn()
  clothes!: Clothes;

  @ManyToOne(() => WashingProgram, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'washingProgramId' })
  washingProgram!: WashingProgram | null;

  @Column({ type: 'varchar', nullable: true })
  washingProgramId!: string | null;

  @ManyToOne(() => Detergent, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'detergentId' })
  detergent!: Detergent | null;

  @Column({ type: 'varchar', nullable: true })
  detergentId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  temperature!: string | null;

  @Column({ type: 'varchar', nullable: true })
  washType!: 'do_not_wash' | 'hand_wash_only' | 'washer_ok' | null;

  @Column({ type: 'varchar', nullable: true })
  bleachType!: 'no_bleach' | 'non_chlorine_bleach' | 'any_bleach' | null;

  @Column({ type: 'boolean', default: false })
  stretch!: boolean;

  @Column({ type: 'boolean', default: false })
  reverseWashing!: boolean;

  @Column({ type: 'boolean', default: false })
  closedZips!: boolean;

  @Column({ type: 'boolean', default: false })
  similarColors!: boolean;

  @Column({ type: 'boolean', default: false })
  washSeparately!: boolean;

  @Column({ type: 'integer', nullable: true })
  colorLossTestTemperature!: number | null;

  @Column({ type: 'boolean', default: false })
  useColorCatcher!: boolean;

  @Column({ type: 'integer', nullable: true, default: null })
  colorLossRisk!: number | null;

  @Column({ type: 'varchar', nullable: true })
  notes!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}