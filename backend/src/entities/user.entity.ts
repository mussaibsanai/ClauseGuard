import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { Document } from './document.entity.js';
import { AuditLog } from './audit-log.entity.js';

@Entity('users')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @OneToMany(() => Document, (document) => document.user)
  documents: Document[];

  @OneToMany(() => AuditLog, (log) => log.user)
  auditLogs: AuditLog[];
}
