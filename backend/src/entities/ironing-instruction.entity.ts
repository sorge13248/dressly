import { Column, CreateDateColumn, Entity, Index, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Clothes } from './clothes.entity';

@Entity({ name: 'ironing_instructions' })
@Index(['userId'])
export class IroningInstruction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @OneToOne(() => Clothes, (clothes) => clothes.ironingInstruction, { onDelete: 'CASCADE' })
  @JoinColumn()
  clothes!: Clothes;

  @Column({ type: 'boolean', default: false })
  ironInsideOut!: boolean;

  @Column({ type: 'varchar', nullable: true })
  ironType!: 'yes' | 'without_steam' | 'no' | null;

  @Column({ type: 'varchar', nullable: true })
  temperature!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}