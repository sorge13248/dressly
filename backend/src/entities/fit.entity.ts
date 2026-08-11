import { Entity, Index, Unique } from 'typeorm';
import { BaseReferenceEntity } from './base-reference.entity';

@Entity({ name: 'fits' })
@Unique(['userId', 'name'])
@Index(['userId'])
export class Fit extends BaseReferenceEntity {}