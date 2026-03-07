import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DocParserService {
  private readonly logger = new Logger(DocParserService.name);

  async extractText(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();
    const buffer = fs.readFileSync(filePath);
    return this.extractFromBuffer(buffer, filePath);
  }

  async extractFromBuffer(buffer: Buffer, fileName: string): Promise<string> {
    const ext = path.extname(fileName).toLowerCase();

    switch (ext) {
      case '.pdf':
        return this.parsePdfBuffer(buffer);
      case '.docx':
        return this.parseDocxBuffer(buffer);
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }
  }

  private async parsePdfBuffer(buffer: Buffer): Promise<string> {
    this.logger.log('Parsing PDF from buffer');
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text;
  }

  private async parseDocxBuffer(buffer: Buffer): Promise<string> {
    this.logger.log('Parsing DOCX from buffer');
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
}
