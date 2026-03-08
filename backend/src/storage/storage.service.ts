import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3: S3Client | null = null;
  private readonly bucket: string;
  private readonly useLocal: boolean;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    const region = this.config.get<string>('S3_REGION') || 'us-east-1';
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY');
    this.bucket = this.config.get<string>('S3_BUCKET') || 'documents';

    this.useLocal = !endpoint || !accessKeyId || !secretAccessKey;

    if (!this.useLocal) {
      this.s3 = new S3Client({
        endpoint,
        region,
        credentials: {
          accessKeyId: accessKeyId!,
          secretAccessKey: secretAccessKey!,
        },
        forcePathStyle: true, // Required for Supabase / MinIO / R2
      });
    }
  }

  async onModuleInit() {
    if (this.useLocal) {
      this.logger.warn(
        'S3 env vars not set — using local disk storage',
      );
      const uploadDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      return;
    }

    // Verify S3 connectivity
    try {
      await this.s3!.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`S3 bucket "${this.bucket}" is accessible`);
    } catch (err: any) {
      this.logger.error(
        `S3 connectivity check failed for bucket "${this.bucket}": ${err.message}`,
      );
    }
  }

  /**
   * Upload a file from local disk to S3-compatible storage.
   * Returns the storage path (key).
   */
  async upload(localPath: string, storagePath: string): Promise<string> {
    if (this.useLocal) {
      // File is already on disk from Multer — just return the path
      return localPath;
    }

    const fileBuffer = fs.readFileSync(localPath);

    await this.s3!.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storagePath,
        Body: fileBuffer,
      }),
    );

    // Remove local temp file after successful upload
    fs.unlinkSync(localPath);

    return storagePath;
  }

  /**
   * Download a file from storage.
   * Returns the file contents as a Buffer.
   */
  async download(storagePath: string): Promise<Buffer> {
    if (this.useLocal) {
      return fs.readFileSync(storagePath);
    }

    const response = await this.s3!.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storagePath,
      }),
    );

    if (!response.Body) {
      throw new Error(`S3 download returned empty body for key "${storagePath}"`);
    }

    // response.Body is a Readable stream — collect into Buffer
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Delete a file from storage.
   */
  async delete(storagePath: string): Promise<void> {
    if (this.useLocal) {
      if (fs.existsSync(storagePath)) {
        fs.unlinkSync(storagePath);
      }
      return;
    }

    try {
      await this.s3!.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: storagePath,
        }),
      );
    } catch (err: any) {
      this.logger.warn(`S3 delete failed for key "${storagePath}": ${err.message}`);
    }
  }
}
