import { Injectable, Logger } from '@nestjs/common';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { ApiException } from '../../common/exceptions/api.exception';
import { SocialProfile } from '../../users/users.service';

/**
 * Google ID token doğrulaması (google-auth-library).
 * GOOGLE_CLIENT_IDS: virgülle ayrılmış iOS + Android (+ web) client ID'leri;
 * token'ın `aud` alanı bunlardan biri olmalı.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly client = new OAuth2Client();
  private readonly audiences: string[] = (process.env.GOOGLE_CLIENT_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  async verify(idToken: string): Promise<SocialProfile> {
    if (this.audiences.length === 0) {
      this.logger.error(
        'GOOGLE_CLIENT_IDS tanımlı değil; Google girişi kapalı',
      );
      throw ApiException.unauthorized(
        'Google ile giriş şu an kullanılamıyor',
        'InvalidSocialToken',
      );
    }

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.audiences,
      });
      payload = ticket.getPayload();
    } catch (err) {
      this.logger.warn(`Google token doğrulanamadı: ${String(err)}`);
      throw ApiException.unauthorized(
        'Google oturumu doğrulanamadı',
        'InvalidSocialToken',
      );
    }

    if (!payload?.sub || !payload.email) {
      throw ApiException.unauthorized(
        'Google hesabında e-posta bilgisi yok',
        'InvalidSocialToken',
      );
    }

    return {
      provider: 'google',
      providerId: payload.sub,
      email: payload.email,
      firstName: payload.given_name ?? payload.name ?? null,
      lastName: payload.family_name ?? null,
    };
  }
}
