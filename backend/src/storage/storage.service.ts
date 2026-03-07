import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const BUCKET_NAME = 'documents';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private supabase: SupabaseClient | null = null;
  private readonly useLocal: boolean;

  constructor(private readonly config: ConfigService) {
    const supabaseUrl = this.config.get<string>('SUPABASE_URL');
    const supabaseKey = this.config.get<string>('SUPABASE_SERVICE_KEY');
    this.useLocal = !supabaseUrl || !supabaseKey;

    if (!this.useLocal) {
      this.supabase = createClient(supabaseUrl!, supabaseKey!);
    }
  }

  async onModuleInit() {
    if (this.useLocal) {
      this.logger.warn(
        'SUPABASE_URL or SUPABASE_SERVICE_KEY not set — using local disk storage',
      );
      const uploadDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      return;
    }

    // Ensure bucket exists
    try {
      const { data: buckets } = await this.supabase!.storage.listBuckets();
      const exists = buckets?.some((b) => b.name === BUCKET_NAME);
      if (!exists) {
        const { error } = await this.supabase!.storage.createBucket(
          BUCKET_NAME,
          { public: false },
        );
        if (error) {
          this.logger.error(`Failed to create bucket: ${error.message}`);
        } else {
          this.logger.log(`Created storage bucket: ${BUCKET_NAME}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Storage init error: ${err.message}`);
    }
  }

  /**
   * Upload a file from local disk to Supabase Storage.
   * Returns the storage path (key).
   */
  async upload(localPath: string, storagePath: string): Promise<string> {
    if (this.useLocal) {
      // File is already on disk from Multer — just return the path
      return localPath;
    }

    const fileBuffer = fs.readFileSync(localPath);
    const { error } = await this.supabase!.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        upsert: true,
      });

    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`);
    }

    // Remove local temp file after successful upload
    fs.unlinkSync(localPath);

    return storagePath;
  }

  /**
   * Download a file from storage to a local temp path.
   * Returns the local file path.
   */
  async download(storagePath: string): Promise<Buffer> {
    if (this.useLocal) {
      return fs.readFileSync(storagePath);
    }

    const { data, error } = await this.supabase!.storage
      .from(BUCKET_NAME)
      .download(storagePath);

    if (error || !data) {
      throw new Error(`Storage download failed: ${error?.message}`);
    }

    return Buffer.from(await data.arrayBuffer());
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

    const { error } = await this.supabase!.storage
      .from(BUCKET_NAME)
      .remove([storagePath]);

    if (error) {
      this.logger.warn(`Storage delete failed: ${error.message}`);
    }
  }
}
