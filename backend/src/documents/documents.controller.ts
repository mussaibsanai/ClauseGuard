import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  FileTypeValidator,
  MaxFileSizeValidator,
  Request,
  Res,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Response, Request as ExpressRequest } from 'express';
import * as path from 'path';
import * as crypto from 'crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DocumentsService } from './documents.service.js';
import { DocumentEventsService } from './document-events.service.js';
import { UploadDto } from './dto/upload.dto.js';
import { User } from '../entities/user.entity.js';

interface AuthenticatedRequest extends ExpressRequest {
  user: User;
}

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly events: DocumentEventsService,
  ) {}

  /**
   * POST /api/documents/upload
   * Multipart file upload. Returns document metadata immediately.
   * Processing runs async in background.
   */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
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
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDto,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const doc = await this.documentsService.upload(
      req.user.id,
      file,
      dto.hipaaMode ?? false,
    );

    return {
      id: doc.id,
      filename: doc.filename,
      status: doc.status,
      hipaaMode: doc.hipaaMode,
      createdAt: doc.createdAt,
    };
  }

  /**
   * GET /api/documents
   * List current user's documents.
   */
  @Get()
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
