import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import * as path from 'path';
import * as fs from 'fs';
import { Document } from '../entities/document.entity.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { DocParserService } from './doc-parser.service.js';
import { DocumentEventsService } from './document-events.service.js';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Document]),
    MulterModule.register({
      dest: UPLOAD_DIR,
    }),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocParserService, DocumentEventsService],
  exports: [DocumentsService, DocumentEventsService],
})
export class DocumentsModule {}
