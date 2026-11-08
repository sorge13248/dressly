import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Room } from './room.entity';
import { Clothes } from './clothes.entity';

@Entity({ name: 'locations' })
@Unique(['userId', 'roomId', 'name'])
@Index(['userId'])
export class Location {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar', nullable: true })
  roomId!: string | null;

  @ManyToOne(() => Room, (room) => room.locations, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'roomId' })
  room!: Room | null;

  @Column({ type: 'integer', default: 0 })
  sortOrder!: number;

  @OneToMany(() => Clothes, (clothes) => clothes.location)
  clothes!: Clothes[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
