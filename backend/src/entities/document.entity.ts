import { Entity, Column, ManyToOne, OneToMany, OneToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { User } from './user.entity.js';
import { Analysis } from './analysis.entity.js';
import { RedactToken } from './redact-token.entity.js';
import { AuditLog } from './audit-log.entity.js';

export enum DocumentStatus {
  PENDING = 'pending',
  EXTRACTING = 'extracting',
  DETECTING_PII = 'detecting_pii',
  ANALYZING = 'analyzing',
  DONE = 'done',
  ERROR = 'error',
}

@Entity('documents')
export class Document extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 500 })
  filename: string;

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.PENDING,
  })
  status: DocumentStatus;

  @Column({ name: 'hipaa_mode', type: 'boolean', default: false })
  hipaaMode: boolean;

  @Column({ name: 'raw_text', type: 'text', nullable: true })
  rawText: string | null;

  @Column({ name: 'redacted_text', type: 'text', nullable: true })
  redactedText: string | null;

  @ManyToOne(() => User, (user) => user.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToOne(() => Analysis, (analysis) => analysis.document)
  analysis: Analysis;

  @OneToMany(() => RedactToken, (token) => token.document)
  redactTokens: RedactToken[];

  @OneToMany(() => AuditLog, (log) => log.document)
  auditLogs: AuditLog[];
}
