import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Clothes } from './clothes.entity';
import { Outfit } from './outfit.entity';

@Entity({ name: 'attachments' })
@Index(['userId'])
export class Attachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'varchar', nullable: true })
  clothesId!: string | null;

  @ManyToOne(() => Clothes, (clothes) => clothes.attachments, { onDelete: 'CASCADE', nullable: true })
  clothes!: Clothes | null;

  @Column({ type: 'varchar', nullable: true })
  outfitId!: string | null;

  @ManyToOne(() => Outfit, (outfit) => outfit.attachments, { onDelete: 'CASCADE', nullable: true })
  outfit!: Outfit | null;

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

  @Column({ type: 'varchar', nullable: true })
  previewPath!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}