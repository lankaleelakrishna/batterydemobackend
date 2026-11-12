import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampedEntity } from './base';

/** A product manufacturer. VOLTEX is the retailer and is never stored here. */
@Entity('brands')
export class Brand extends TimestampedEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Index('brands_name_unique', { unique: true })
  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Index('brands_slug_unique', { unique: true })
  @Column({ type: 'varchar', length: 140 })
  slug: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ name: 'logo_url', type: 'varchar', length: 500, nullable: true })
  logoUrl: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
