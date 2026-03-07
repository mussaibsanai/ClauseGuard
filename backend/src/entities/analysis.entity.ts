import { Entity, Column, OneToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { Document } from './document.entity.js';

@Entity('analyses')
export class Analysis extends BaseEntity {
  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Column({ type: 'jsonb' })
  result: Record<string, unknown>;

  @Column({ name: 'risk_count', type: 'int', default: 0 })
  riskCount: number;

  @OneToOne(() => Document, (document) => document.analysis, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: Document;
}
