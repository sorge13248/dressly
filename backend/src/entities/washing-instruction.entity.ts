import { Column, CreateDateColumn, Entity, Index, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Clothes } from './clothes.entity';

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

  @Column({ type: 'boolean', default: false })
  colorLossRisk!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}