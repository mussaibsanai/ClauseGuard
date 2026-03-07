import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class UploadDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  hipaaMode?: boolean;
}
