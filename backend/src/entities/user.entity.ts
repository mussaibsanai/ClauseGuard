import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { Document } from './document.entity.js';
import { AuditLog } from './audit-log.entity.js';

@Entity('users')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  passwordHash: string | null;

  @Column({ name: 'google_id', type: 'varchar', length: 255, nullable: true, unique: true })
  googleId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ name: 'avatar_url', type: 'varchar', length: 512, nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'varchar', length: 20, default: 'free' })
  tier: string;

  @Column({ name: 'billing_cycle_start', type: 'timestamp', nullable: true })
  billingCycleStart: Date | null;

  @OneToMany(() => Document, (document) => document.user)
  documents: Document[];

  @OneToMany(() => AuditLog, (log) => log.user)
  auditLogs: AuditLog[];
}
