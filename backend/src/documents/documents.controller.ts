import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Request,
  Res,
  BadRequestException,
  ForbiddenException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Response, Request as ExpressRequest } from 'express';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiQuery,
  ApiPayloadTooLargeResponse,
  ApiTooManyRequestsResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DocumentsService } from './documents.service.js';
import { DocumentEventsService } from './document-events.service.js';
import { UploadDto } from './dto/upload.dto.js';
import { User } from '../entities/user.entity.js';
import { getTierLimits } from '../config/tier-limits.js';

interface AuthenticatedRequest extends ExpressRequest {
  user: User;
}

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
// Accept up to 50MB at Multer level (the pro max).
// Per-tier file size enforcement happens in DocumentsService.
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILES = 5; // Pro limit; free users are blocked in the handler
const ALLOWED_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly events: DocumentEventsService,
  ) {}

  /**
   * POST /api/documents/upload
   * Multipart file upload (1 file for free, up to 5 for pro).
   * Returns document metadata immediately; processing runs async.
   */
  @Post('upload')
  @ApiOperation({ summary: 'Upload PDF or DOCX contracts for analysis' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'PDF or DOCX files (1 for free, up to 5 for pro)',
        },
        hipaaMode: {
          type: 'boolean',
          description: 'Enable HIPAA PII redaction before AI processing',
        },
      },
      required: ['files'],
    },
  })
  @ApiPayloadTooLargeResponse({ description: 'File size exceeds tier limit' })
  @ApiTooManyRequestsResponse({ description: 'Daily upload limit reached' })
  @ApiForbiddenResponse({ description: 'Storage limit reached or multi-file not allowed' })
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const unique = crypto.randomUUID();
          const ext = path.extname(file.originalname);
          cb(null, `${unique}${ext}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIMES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Only PDF and DOCX files are allowed',
            ),
            false,
          );
        }
      },
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async upload(
    @Request() req: AuthenticatedRequest,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: UploadDto,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }

    // Enforce per-upload file count limit by tier
    const limits = getTierLimits(req.user.tier);
    if (files.length > limits.maxFilesPerUpload) {
      throw new ForbiddenException(
        limits.maxFilesPerUpload === 1
          ? 'Multi-file upload is a Pro feature'
          : `Maximum ${limits.maxFilesPerUpload} files per upload`,
      );
    }

    const hipaaMode = dto.hipaaMode ?? false;
    const results = [];

    for (const file of files) {
      const doc = await this.documentsService.upload(
        req.user,
        file,
        hipaaMode,
      );
      results.push({
        id: doc.id,
        filename: doc.filename,
        status: doc.status,
        hipaaMode: doc.hipaaMode,
        createdAt: doc.createdAt,
      });
    }

    // Single file → return object; multi-file → return array
    return results.length === 1 ? results[0] : results;
  }

  /**
   * GET /api/documents
   * List current user's documents.
   */
  @Get()
  @ApiOperation({ summary: 'List current user\'s documents' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async list(
    @Request() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = Math.max(1, parseInt(page || '1', 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit || '20', 10) || 20));
    return this.documentsService.listByUser(req.user.id, p, l);
  }

  /**
   * GET /api/documents/:id
   * Get a single document's details.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a single document by ID' })
  async findOne(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const doc = await this.documentsService.findOneForUser(id, req.user.id);
    return {
      id: doc.id,
      filename: doc.filename,
      status: doc.status,
      hipaaMode: doc.hipaaMode,
      createdAt: doc.createdAt,
    };
  }

  /**
   * GET /api/documents/:id/status
   * SSE endpoint — streams real-time pipeline progress.
   */
  @Get(':id/status')
  @ApiOperation({ summary: 'SSE stream of document processing progress' })
  async status(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    // Verify ownership
    const doc = await this.documentsService.findOneForUser(id, req.user.id);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send current status immediately
    res.write(
      `data: ${JSON.stringify({ status: doc.status, message: `Current status: ${doc.status}` })}\n\n`,
    );

    // If already terminal, close
    if (doc.status === 'done' || doc.status === 'error') {
      res.end();
      return;
    }

    // Heartbeat every 15s to prevent reverse-proxy timeouts (Render 100s idle)
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15_000);

    // Subscribe to future updates
    const unsubscribe = this.events.subscribe(id, (event) => {
      res.write(
        `data: ${JSON.stringify({ status: event.status, message: event.message })}\n\n`,
      );

      // Close stream on terminal states
      if (event.status === 'done' || event.status === 'error') {
        clearInterval(heartbeat);
        res.end();
      }
    });

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }
}
