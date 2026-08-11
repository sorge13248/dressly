import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Clothes } from './clothes.entity';

@Entity({ name: 'attachments' })
@Index(['userId'])
export class Attachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'varchar' })
  clothesId!: string;

  @ManyToOne(() => Clothes, (clothes) => clothes.attachments, { onDelete: 'CASCADE' })
  clothes!: Clothes;

  @Column({ type: 'varchar', default: 'photo' })
  kind!: string;

  @Column({ type: 'varchar' })
  fileName!: string;

  @Column({ type: 'varchar', nullable: true })
  originalName!: string | null;

  @Column({ type: 'varchar' })
  mimeType!: string;

  @Column({ type: 'integer' })
  size!: number;

  @Column({ type: 'integer', default: 0 })
  sortOrder!: number;

  @Column({ type: 'varchar' })
  path!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}