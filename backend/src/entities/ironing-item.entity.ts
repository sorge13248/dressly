import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Clothes } from './clothes.entity';
import { User } from './user.entity';

@Entity({ name: 'ironing_items' })
@Unique(['userId', 'clothesId'])
@Index(['userId'])
@Index(['clothesId'])
export class IroningItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  clothesId!: string;

  @ManyToOne(() => Clothes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clothesId' })
  clothes!: Clothes;

  @Column({ type: 'varchar' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @CreateDateColumn()
  addedAt!: Date;
}

