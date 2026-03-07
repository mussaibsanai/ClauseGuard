import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DocParserService {
  private readonly logger = new Logger(DocParserService.name);

  async extractText(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.pdf':
        return this.parsePdf(filePath);
      case '.docx':
        return this.parseDocx(filePath);
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }
  }

  private async parsePdf(filePath: string): Promise<string> {
    this.logger.log(`Parsing PDF: ${filePath}`);
    const { PDFParse } = await import('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text;
  }

  private async parseDocx(filePath: string): Promise<string> {
    this.logger.log(`Parsing DOCX: ${filePath}`);
    const mammoth = await import('mammoth');
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
}
