import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { DocumentStatus } from '../entities/document.entity.js';

export interface DocumentStatusEvent {
  documentId: string;
  status: DocumentStatus;
  message?: string;
}

@Injectable()
export class DocumentEventsService {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Allow many listeners (one per SSE connection)
    this.emitter.setMaxListeners(100);
  }

  emit(event: DocumentStatusEvent): void {
    this.emitter.emit(`doc:${event.documentId}`, event);
  }

  subscribe(
    documentId: string,
    listener: (event: DocumentStatusEvent) => void,
  ): () => void {
    const channel = `doc:${documentId}`;
    this.emitter.on(channel, listener);
    return () => {
      this.emitter.removeListener(channel, listener);
    };
  }
}
