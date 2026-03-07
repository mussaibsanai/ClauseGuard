import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { RegisterDto, LoginDto, RefreshDto } from './dto/index.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { User } from '../entities/user.entity.js';

interface AuthenticatedRequest extends Request {
  user: User;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Request() req: AuthenticatedRequest) {
    const user = req.user;
    return { id: user.id, email: user.email, createdAt: user.createdAt };
  }
}
