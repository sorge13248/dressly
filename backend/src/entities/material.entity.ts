import { Entity, Index, Unique } from 'typeorm';
import { BaseReferenceEntity } from './base-reference.entity';

@Entity({ name: 'materials' })
@Unique(['userId', 'name'])
@Index(['userId'])
export class Material extends BaseReferenceEntity {}