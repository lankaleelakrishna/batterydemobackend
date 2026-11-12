import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampedEntity } from './base';
import { Address } from './address.entity';

export type UserRoleValue = 'customer' | 'admin';

@Entity('users')
export class User extends TimestampedEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  /** Stored lowercased and trimmed. */
  @Index('users_email_unique', { unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 100, select: false })
  passwordHash: string;

  @Column({ name: 'full_name', type: 'varchar', length: 120 })
  fullName: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 16, default: 'customer' })
  role: UserRoleValue;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** Incremented on logout or deactivation. Tokens carry the version they were issued with. */
  @Column({ name: 'token_version', type: 'int', default: 0 })
  tokenVersion: number;

  @OneToMany(() => Address, (a) => a.user)
  addresses: Address[];
}
