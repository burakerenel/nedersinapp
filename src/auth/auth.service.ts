import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { createHash, randomInt } from 'crypto';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/user.entity';
import { ApiException } from '../common/exceptions/api.exception';
import { AuthResponseDto } from './dto/auth-response.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { PasswordReset } from './entities/password-reset.entity';
import { MailService } from '../mail/mail.service';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { GoogleAuthService } from './services/google-auth.service';
import { AppleAuthService } from './services/apple-auth.service';
import { AppleLoginDto, GoogleLoginDto } from './dto/social-login.dto';
import { DeleteAccountDto } from '../users/dto/delete-account.dto';

const RESET_CODE_TTL_MINUTES = 15;
const RESET_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly googleAuth: GoogleAuthService,
    private readonly appleAuth: AppleAuthService,
    @InjectRepository(PasswordReset)
    private readonly resetRepo: Repository<PasswordReset>,
  ) {}

  private issue(user: User): AuthResponseDto {
    const payload = { sub: user.id, email: user.email };
    return {
      accessToken: this.jwtService.sign(payload),
      user: UserResponseDto.from(user),
    };
  }

  async register(dto: CreateUserDto): Promise<AuthResponseDto> {
    const user = await this.usersService.create(dto);
    return this.issue(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || user.deletedAt) {
      throw ApiException.unauthorized(
        'E-posta ya da şifre hatalı',
        'InvalidCredentials',
      );
    }
    if (!user.password) {
      throw ApiException.unauthorized(
        'Bu hesap Google/Apple ile açıldı; aynı yöntemle giriş yapın ya da şifre sıfırlayın',
        'InvalidCredentials',
      );
    }
    if (!(await this.usersService.verifyPassword(user, dto.password))) {
      throw ApiException.unauthorized(
        'E-posta ya da şifre hatalı',
        'InvalidCredentials',
      );
    }
    return this.issue(user);
  }

  async validateUser(id: string): Promise<User | null> {
    return this.usersService.findActiveById(id);
  }

  // ---------- Şifre sıfırlama ----------

  private hashCode(code: string): string {
    const secret = process.env.JWT_SECRET || 'change_me_in_production';
    return createHash('sha256').update(`${secret}:${code}`).digest('hex');
  }

  /** E-posta kayıtlı olsun olmasın aynı cevabı döner (sızıntı yok). */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const message = 'E-posta adresi kayıtlıysa sıfırlama kodu gönderildi';
    const user = await this.usersService.findByEmail(email);
    if (!user || user.deletedAt) return { message };

    // Önceki aktif kodları geçersiz kıl
    await this.resetRepo.update(
      { userId: user.id, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.resetRepo.save(
      this.resetRepo.create({
        userId: user.id,
        codeHash: this.hashCode(code),
        expiresAt: new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60_000),
      }),
    );

    await this.mailService.sendPasswordResetCode(
      user.email,
      code,
      RESET_CODE_TTL_MINUTES,
    );
    return { message };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const invalid = () =>
      ApiException.badRequest(
        'Kod geçersiz ya da süresi dolmuş',
        'InvalidResetCode',
      );

    const user = await this.usersService.findByEmail(dto.email);
    if (!user || user.deletedAt) throw invalid();

    const reset = await this.resetRepo.findOne({
      where: {
        userId: user.id,
        consumedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });
    if (!reset || reset.attempts >= RESET_MAX_ATTEMPTS) throw invalid();

    if (reset.codeHash !== this.hashCode(dto.code)) {
      reset.attempts += 1;
      if (reset.attempts >= RESET_MAX_ATTEMPTS) reset.consumedAt = new Date();
      await this.resetRepo.save(reset);
      throw invalid();
    }

    reset.consumedAt = new Date();
    await this.resetRepo.save(reset);
    await this.usersService.setPassword(user, dto.newPassword);
    return {
      message: 'Şifreniz güncellendi, yeni şifrenizle giriş yapabilirsiniz',
    };
  }

  // ---------- Sosyal giriş ----------

  async loginWithGoogle(dto: GoogleLoginDto): Promise<AuthResponseDto> {
    const profile = await this.googleAuth.verify(dto.idToken);
    const user = await this.usersService.findOrCreateSocialUser(profile);
    return this.issue(user);
  }

  async loginWithApple(dto: AppleLoginDto): Promise<AuthResponseDto> {
    const profile = await this.appleAuth.verify(dto.identityToken, {
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    const user = await this.usersService.findOrCreateSocialUser(profile);

    if (dto.authorizationCode) {
      const refreshToken = await this.appleAuth.exchangeAuthorizationCode(
        dto.authorizationCode,
      );
      if (refreshToken) {
        user.appleRefreshToken = refreshToken;
        await this.usersService.save(user);
      }
    }
    return this.issue(user);
  }

  // ---------- Hesap silme ----------

  async deleteAccount(user: User, dto: DeleteAccountDto): Promise<void> {
    if (user.password) {
      if (!dto.password) {
        throw ApiException.unauthorized('Şifre gerekli', 'InvalidCredentials');
      }
      if (!(await this.usersService.verifyPassword(user, dto.password))) {
        throw ApiException.unauthorized('Şifre hatalı', 'InvalidCredentials');
      }
    }
    // Şifresi olmayan (sadece sosyal) hesapta geçerli oturum yeterli.

    if (user.appleId && user.appleRefreshToken) {
      await this.appleAuth.revoke(user.appleRefreshToken);
    }
    await this.usersService.anonymizeAndDelete(user);
    this.logger.log(`Hesap silindi: ${user.id}`);
  }
}
