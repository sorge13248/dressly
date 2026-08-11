import { Column, CreateDateColumn, Entity, Index, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Clothes } from './clothes.entity';

@Entity({ name: 'drying_instructions' })
@Index(['userId'])
export class DryingInstruction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @OneToOne(() => Clothes, (clothes) => clothes.dryingInstruction, { onDelete: 'CASCADE' })
  @JoinColumn()
  clothes!: Clothes;

  @Column({ type: 'varchar', nullable: true })
  method!: string | null;

  @Column({ type: 'boolean', default: false })
  tumbleDry!: boolean;

  @Column({ type: 'varchar', nullable: true })
  tumbleDryTemperature!: 'low' | 'medium' | 'high' | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}