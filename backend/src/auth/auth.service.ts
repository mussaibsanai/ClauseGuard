import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity.js';
import { RegisterDto, LoginDto } from './dto/index.js';
import { JwtPayload } from './strategies/jwt.strategy.js';
import type { GoogleProfile } from './strategies/google.strategy.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends TokenPair {
  user: { id: string; email: string; name?: string | null };
}

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 12;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    const user = this.userRepo.create({
      email: dto.email,
      passwordHash,
    });
    await this.userRepo.save(user);

    const tokens = await this.generateTokens(user);
    return {
      ...tokens,
      user: { id: user.id, email: user.email },
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('This account uses Google sign-in');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user);
    return {
      ...tokens,
      user: { id: user.id, email: user.email },
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.userRepo.findOne({
        where: { id: payload.sub },
      });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async googleLogin(profile: GoogleProfile): Promise<AuthResponse> {
    let user = await this.userRepo.findOne({
      where: { googleId: profile.googleId },
    });

    if (!user) {
      // Check if email already exists (registered via password)
      user = await this.userRepo.findOne({
        where: { email: profile.email },
      });

      if (user) {
        // Link Google account to existing user
        user.googleId = profile.googleId;
        user.name = user.name || profile.name;
        user.avatarUrl = user.avatarUrl || profile.avatarUrl;
        await this.userRepo.save(user);
      } else {
        // Create new user from Google profile
        user = this.userRepo.create({
          email: profile.email,
          googleId: profile.googleId,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          passwordHash: null,
        });
        await this.userRepo.save(user);
      }
    }

    const tokens = await this.generateTokens(user);
    return {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  private async generateTokens(user: User): Promise<TokenPair> {
    const payload: JwtPayload = { sub: user.id, email: user.email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '15m') as any,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d') as any,
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
