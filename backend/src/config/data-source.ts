import { DataSource } from 'typeorm';
import 'dotenv/config';
import { User } from '../entities/user.entity.js';
import { Document } from '../entities/document.entity.js';
import { Analysis } from '../entities/analysis.entity.js';
import { RedactToken } from '../entities/redact-token.entity.js';
import { AuditLog } from '../entities/audit-log.entity.js';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'ClauseGuard',
  entities: [User, Document, Analysis, RedactToken, AuditLog],
  migrations: ['dist/migrations/*.{ts,js}'],
});
