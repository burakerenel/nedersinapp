import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { StringValue } from 'ms';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AccountController } from './account.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PasswordReset } from './entities/password-reset.entity';
import { GoogleAuthService } from './services/google-auth.service';
import { AppleAuthService } from './services/apple-auth.service';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    TypeOrmModule.forFeature([PasswordReset]),
    // registerAsync: .env ConfigModule tarafından yüklendikten SONRA okunsun
    // (register() import anında çalışır ve JWT_SECRET'ı göremez → token'lar 401 olur)
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'change_me_in_production',
        signOptions: {
          expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as StringValue,
        },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, GoogleAuthService, AppleAuthService],
  controllers: [AuthController, AccountController],
})
export class AuthModule {}
