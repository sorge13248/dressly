import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'tags' })
@Unique(['userId', 'name'])
@Index(['userId'])
export class Tag {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar' })
	userId!: string;

	@Column({ type: 'varchar' })
	name!: string;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
