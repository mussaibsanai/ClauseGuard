import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  PayloadTooLargeException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Document, DocumentStatus } from '../entities/document.entity.js';
import { User } from '../entities/user.entity.js';
import { DocParserService } from './doc-parser.service.js';
import { DocumentEventsService } from './document-events.service.js';
import { StorageService } from '../storage/storage.service.js';
import { getTierLimits } from '../config/tier-limits.js';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(Document)
    private readonly docRepo: Repository<Document>,
    private readonly docParser: DocParserService,
    private readonly events: DocumentEventsService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Create a document record and kick off async processing.
   * Enforces tier-based limits before accepting the upload.
   * Returns immediately with the document metadata.
   */
  async upload(
    user: User,
    file: Express.Multer.File,
    hipaaMode: boolean,
  ): Promise<Document> {
    const limits = getTierLimits(user.tier);

    // ── Check 1: File size ──────────────────────────────────────────
    const maxBytes = limits.maxFileSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new PayloadTooLargeException(
        `File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds the ${limits.maxFileSizeMB}MB limit for your ${user.tier} plan`,
      );
    }

    // ── Check 2: Daily upload limit ─────────────────────────────────
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dailyCount = await this.docRepo.count({
      where: {
        userId: user.id,
        createdAt: MoreThan(twentyFourHoursAgo),
      },
    });
    if (dailyCount >= limits.dailyUploads) {
      throw new HttpException(
        `Daily upload limit reached (${limits.dailyUploads}/day for ${user.tier} plan). Try again later.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // ── Check 3: Total file cap ─────────────────────────────────────
    const totalCount = await this.docRepo.count({
      where: { userId: user.id },
    });
    if (totalCount >= limits.maxTotalFiles) {
      throw new ForbiddenException(
        `Storage limit reached (${limits.maxTotalFiles} files for ${user.tier} plan). Delete old files or upgrade.`,
      );
    }

    // ── All checks passed — create document ─────────────────────────
    const doc = this.docRepo.create({
      userId: user.id,
      filename: file.originalname,
      status: DocumentStatus.PENDING,
      hipaaMode,
    });
    await this.docRepo.save(doc);

    // Upload file to object storage (or keep on disk if local)
    const ext = file.originalname.split('.').pop() || 'bin';
    const storagePath = `${user.id}/${doc.id}.${ext}`;
    const resolvedPath = await this.storage.upload(file.path, storagePath);
    await this.docRepo.update(doc.id, { storagePath: resolvedPath });

    // Fire-and-forget: do NOT await
    this.processDocument(doc.id, resolvedPath).catch((err) => {
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
    storagePath: string,
  ): Promise<void> {
    try {
      // Step 1: Extract text
      await this.updateStatus(documentId, DocumentStatus.EXTRACTING);
      const fileBuffer = await this.storage.download(storagePath);
      const rawText = await this.docParser.extractFromBuffer(fileBuffer, storagePath);

      await this.docRepo.update(documentId, { rawText });
      this.logger.log(
        `Extracted ${rawText.length} chars from document ${documentId}`,
      );

      // Step 2: PII detection (placeholder — Phase 5 will implement)
      const doc = await this.docRepo.findOneOrFail({
        where: { id: documentId },
      });

      if (doc.hipaaMode) {
        await this.updateStatus(documentId, DocumentStatus.DETECTING_PII);
        // Phase 5 will add: regex PII scan + AI PII scan + token mapping
        // For now, just copy rawText to redactedText as-is
        await this.docRepo.update(documentId, { redactedText: rawText });
        this.logger.log(`PII detection placeholder for document ${documentId}`);
      }

      // Step 3: AI Analysis (placeholder — Phase 6 will implement)
      await this.updateStatus(documentId, DocumentStatus.ANALYZING);
      // Phase 6 will add: Claude Sonnet call + Zod validation + Analysis record
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
