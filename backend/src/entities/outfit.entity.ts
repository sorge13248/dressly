import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Attachment } from './attachment.entity';
import { Clothes } from './clothes.entity';
import { Season } from './season.entity';
import { Temperature } from './temperature.entity';
import { UseCase } from './use-case.entity';
import { User } from './user.entity';

@Entity({ name: 'outfits' })
@Index(['userId'])
export class Outfit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar', nullable: true })
  description!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  canvasLayout!: Record<string, { x: number; y: number; scale?: number; rotation?: number; zIndex?: number }> | null;

  @ManyToMany(() => Clothes, { cascade: false })
  @JoinTable({
    name: 'outfit_clothes',
    joinColumn: { name: 'outfitId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'clothesId', referencedColumnName: 'id' },
  })
  clothes!: Clothes[];

  @ManyToMany(() => Season)
  @JoinTable({
    name: 'outfit_seasons',
    joinColumn: { name: 'outfitId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'seasonId', referencedColumnName: 'id' },
  })
  seasons!: Season[];

  @ManyToMany(() => Temperature)
  @JoinTable({
    name: 'outfit_temperatures',
    joinColumn: { name: 'outfitId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'temperatureId', referencedColumnName: 'id' },
  })
  temperatures!: Temperature[];

  @ManyToMany(() => UseCase)
  @JoinTable({
    name: 'outfit_use_cases',
    joinColumn: { name: 'outfitId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'useCaseId', referencedColumnName: 'id' },
  })
  useCases!: UseCase[];

  @OneToMany(() => Attachment, (attachment) => attachment.outfit, { cascade: true })
  attachments!: Attachment[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

