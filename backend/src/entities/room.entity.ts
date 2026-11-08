import { Entity, Index, OneToMany, Unique } from 'typeorm';
import { BaseReferenceEntity } from './base-reference.entity';
import { Location } from './location.entity';

@Entity({ name: 'rooms' })
@Unique(['userId', 'name'])
@Index(['userId'])
export class Room extends BaseReferenceEntity {
  @OneToMany(() => Location, (location) => location.room)
  locations!: Location[];
}
