import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { Document } from './document.entity.js';

@Entity('redact_tokens')
export class RedactToken extends BaseEntity {
  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Column({ type: 'varchar', length: 100 })
  token: string;

  @Column({ name: 'encrypted_value', type: 'text' })
  encryptedValue: string;

  @ManyToOne(() => Document, (document) => document.redactTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: Document;
}
