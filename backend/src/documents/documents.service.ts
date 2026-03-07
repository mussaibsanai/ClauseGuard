import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import { Document, DocumentStatus } from '../entities/document.entity.js';
import { DocParserService } from './doc-parser.service.js';
import { DocumentEventsService } from './document-events.service.js';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(Document)
    private readonly docRepo: Repository<Document>,
    private readonly docParser: DocParserService,
    private readonly events: DocumentEventsService,
  ) {}

  /**
   * Create a document record and kick off async processing.
   * Returns immediately with the document metadata.
   */
  async upload(
    userId: string,
    file: Express.Multer.File,
    hipaaMode: boolean,
  ): Promise<Document> {
    const doc = this.docRepo.create({
      userId,
      filename: file.originalname,
      status: DocumentStatus.PENDING,
      hipaaMode,
    });
    await this.docRepo.save(doc);

    // Fire-and-forget: do NOT await
    this.processDocument(doc.id, file.path).catch((err) => {
      this.logger.error(
        `Pipeline failed for document ${doc.id}: ${err.message}`,
        err.stack,
      );
    });

    return doc;
  }

  /**
   * List documents for a user, ordered by newest first.
   */
  async listByUser(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: Document[]; total: number }> {
    const [data, total] = await this.docRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  /**
   * Get a single document, verifying ownership.
   */
  async findOneForUser(
    documentId: string,
    userId: string,
  ): Promise<Document> {
    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    if (doc.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return doc;
  }

  // ─── Async Pipeline ────────────────────────────────────────────────

  private async processDocument(
    documentId: string,
    filePath: string,
  ): Promise<void> {
    try {
      // Step 1: Extract text
      await this.updateStatus(documentId, DocumentStatus.EXTRACTING);
      const rawText = await this.docParser.extractText(filePath);

      await this.docRepo.update(documentId, { rawText });
      this.logger.log(
        `Extracted ${rawText.length} chars from document ${documentId}`,
      );

      // Step 2: PII detection (placeholder — Phase 4 will implement)
      const doc = await this.docRepo.findOneOrFail({
        where: { id: documentId },
      });

      if (doc.hipaaMode) {
        await this.updateStatus(documentId, DocumentStatus.DETECTING_PII);
        // Phase 4 will add: regex PII scan + AI PII scan + token mapping
        // For now, just copy rawText to redactedText as-is
        await this.docRepo.update(documentId, { redactedText: rawText });
        this.logger.log(`PII detection placeholder for document ${documentId}`);
      }

      // Step 3: AI Analysis (placeholder — Phase 5 will implement)
      await this.updateStatus(documentId, DocumentStatus.ANALYZING);
      // Phase 5 will add: Claude Sonnet call + Zod validation + Analysis record
      this.logger.log(`Analysis placeholder for document ${documentId}`);

      // Step 4: Done
      await this.updateStatus(documentId, DocumentStatus.DONE);
      this.logger.log(`Pipeline complete for document ${documentId}`);
    } catch (err: any) {
      this.logger.error(
        `Pipeline error for ${documentId}: ${err.message}`,
        err.stack,
      );
      await this.updateStatus(documentId, DocumentStatus.ERROR, err.message);
    } finally {
      // Clean up temp file
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          this.logger.log(`Deleted temp file: ${filePath}`);
        }
      } catch {
        // non-critical
      }
    }
  }

  private async updateStatus(
    documentId: string,
    status: DocumentStatus,
    errorMessage?: string,
  ): Promise<void> {
    await this.docRepo.update(documentId, { status });
    this.events.emit({
      documentId,
      status,
      message:
        errorMessage ?? `Status changed to ${status}`,
    });
  }
}
