import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UploadDto {
  @ApiPropertyOptional({ example: false, description: 'Enable HIPAA PII redaction before AI processing', default: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  hipaaMode?: boolean;
}
