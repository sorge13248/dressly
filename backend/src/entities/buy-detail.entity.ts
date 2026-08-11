import { Column, CreateDateColumn, Entity, Index, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Clothes } from './clothes.entity';

@Entity({ name: 'buy_details' })
@Index(['userId'])
export class BuyDetail {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @OneToOne(() => Clothes, (clothes) => clothes.buyDetail, { onDelete: 'CASCADE' })
  @JoinColumn()
  clothes!: Clothes;

  @Column({ type: 'varchar', nullable: true })
  store!: string | null;

  @Column({ type: 'date', nullable: true })
  purchaseDate!: string | null;

  @Column({ type: 'integer', nullable: true })
  priceCents!: number | null;

  @Column({ type: 'varchar', nullable: true })
  shopUrl!: string | null;

  @Column({ type: 'varchar', nullable: true })
  receiptAttachmentId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}