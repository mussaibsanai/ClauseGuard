import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { Document } from './document.entity.js';
import { User } from './user.entity.js';

@Entity('audit_logs')
export class AuditLog extends BaseEntity {
  @Column({ name: 'document_id', type: 'uuid', nullable: true })
  documentId: string | null;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @ManyToOne(() => Document, (document) => document.auditLogs, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'document_id' })
  document: Document | null;

  @ManyToOne(() => User, (user) => user.auditLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
