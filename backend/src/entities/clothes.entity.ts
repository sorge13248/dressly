import { Column, CreateDateColumn, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn, Unique } from 'typeorm';
import { Attachment } from './attachment.entity';
import { Brand } from './brand.entity';
import { Color } from './color.entity';
import { DryingInstruction } from './drying-instruction.entity';
import { Fit } from './fit.entity';
import { IroningInstruction } from './ironing-instruction.entity';
import { Material } from './material.entity';
import { Season } from './season.entity';
import { Tag } from './tag.entity';
import { Temperature } from './temperature.entity';
import { Type } from './type.entity';
import { UseCase } from './use-case.entity';
import { WashingInstruction } from './washing-instruction.entity';
import { BuyDetail } from './buy-detail.entity';

@Entity({ name: 'clothes' })
@Unique(['userId', 'name'])
@Index(['userId'])
export class Clothes {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'varchar', nullable: true })
  name!: string | null;

  @Column({ type: 'varchar', nullable: true })
  size!: string | null;

  @Column({ type: 'varchar', nullable: true })
  notes!: string | null;

  @ManyToOne(() => Brand, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'brandId' })
  brand!: Brand | null;

  @Column({ type: 'varchar', nullable: true })
  brandId!: string | null;

  @ManyToOne(() => Fit, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'fitId' })
  fit!: Fit | null;

  @Column({ type: 'varchar', nullable: true })
  fitId!: string | null;

  @ManyToOne(() => Type, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'typeId' })
  type!: Type | null;

  @Column({ type: 'varchar', nullable: true })
  typeId!: string | null;

  @ManyToMany(() => Color)
  @JoinTable({ name: 'clothes_colors' })
  colors!: Color[];

  @ManyToMany(() => Material)
  @JoinTable({ name: 'clothes_materials' })
  materials!: Material[];

  @ManyToMany(() => Season)
  @JoinTable({ name: 'clothes_seasons' })
  seasons!: Season[];

  @ManyToMany(() => Temperature)
  @JoinTable({ name: 'clothes_temperatures' })
  temperatures!: Temperature[];

  @ManyToMany(() => UseCase)
  @JoinTable({ name: 'clothes_use_cases' })
  useCases!: UseCase[];

  @ManyToMany(() => Tag)
  @JoinTable({ name: 'clothes_tags' })
  tags!: Tag[];

  @OneToMany(() => Attachment, (attachment) => attachment.clothes, { cascade: true })
  attachments!: Attachment[];

  @OneToOne(() => WashingInstruction, (instruction) => instruction.clothes, { cascade: true })
  washingInstruction!: WashingInstruction | null;

  @OneToOne(() => DryingInstruction, (instruction) => instruction.clothes, { cascade: true })
  dryingInstruction!: DryingInstruction | null;

  @OneToOne(() => IroningInstruction, (instruction) => instruction.clothes, { cascade: true })
  ironingInstruction!: IroningInstruction | null;

  @OneToOne(() => BuyDetail, (detail) => detail.clothes, { cascade: true })
  buyDetail!: BuyDetail | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  get fullTitle(): string | null {
    const parts = [
      this.type?.name?.trim(),
      this.brand?.name?.trim(),
      this.colors?.[0]?.name?.trim(),
    ].filter((part): part is string => Boolean(part));

    if (parts.length > 0) {
      return parts.join(' ');
    }

    const fallback = this.name?.trim();
    return fallback || null;
  }
}