import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { User } from './entities/user.entity.js';
import { Document } from './entities/document.entity.js';
import { Analysis } from './entities/analysis.entity.js';
import { RedactToken } from './entities/redact-token.entity.js';
import { AuditLog } from './entities/audit-log.entity.js';

const ALL_ENTITIES = [User, Document, Analysis, RedactToken, AuditLog];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const isProduction = config.get('NODE_ENV') === 'production';
        const databaseUrl = config.get<string>('DATABASE_URL');
        const shouldSync =
          config.get('TYPEORM_SYNC') === 'true' ||
          config.get('NODE_ENV') === 'development';

        const base = {
          type: 'postgres' as const,
          entities: ALL_ENTITIES,
          autoLoadEntities: true,
          synchronize: shouldSync,
        };

        if (databaseUrl) {
          return {
            ...base,
            url: databaseUrl,
            ssl: isProduction ? { rejectUnauthorized: false } : false,
          };
        }

        return {
          ...base,
          host: config.get<string>('DB_HOST'),
          port: config.get<number>('DB_PORT'),
          username: config.get<string>('DB_USERNAME'),
          password: config.get<string>('DB_PASSWORD'),
          database: config.get<string>('DB_NAME'),
        };
      },
    }),
    AuthModule,
    DocumentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
