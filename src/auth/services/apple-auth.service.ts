import { Injectable, Logger } from '@nestjs/common';
import {
  createRemoteJWKSet,
  importPKCS8,
  jwtVerify,
  JWTPayload,
  SignJWT,
} from 'jose';
import { ApiException } from '../../common/exceptions/api.exception';
import { SocialProfile } from '../../users/users.service';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS = new URL('https://appleid.apple.com/auth/keys');

/**
 * Sign in with Apple.
 *  - identityToken: Apple'ın açık anahtarlarıyla (JWKS) doğrulanır,
 *    `aud` APPLE_CLIENT_IDS içinde olmalı (varsayılan com.gbga.nedersin).
 *  - Token iptali (hesap silme) için APPLE_TEAM_ID, APPLE_KEY_ID,
 *    APPLE_PRIVATE_KEY (PEM, satır sonları \n ile) gerekir; bunlar yoksa
 *    giriş çalışır ama iptal atlanır (log'a yazılır).
 */
@Injectable()
export class AppleAuthService {
  private readonly logger = new Logger(AppleAuthService.name);
  private readonly jwks = createRemoteJWKSet(APPLE_JWKS);
  private readonly audiences: string[] = (
    process.env.APPLE_CLIENT_IDS || 'com.gbga.nedersin'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  async verify(
    identityToken: string,
    names: { firstName?: string | null; lastName?: string | null },
  ): Promise<SocialProfile> {
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(identityToken, this.jwks, {
        issuer: APPLE_ISSUER,
        audience: this.audiences,
      });
      payload = result.payload;
    } catch (err) {
      this.logger.warn(`Apple token doğrulanamadı: ${String(err)}`);
      throw ApiException.unauthorized(
        'Apple oturumu doğrulanamadı',
        'InvalidSocialToken',
      );
    }

    const email = typeof payload.email === 'string' ? payload.email : null;
    if (!payload.sub || !email) {
      throw ApiException.unauthorized(
        'Apple hesabında e-posta bilgisi yok',
        'InvalidSocialToken',
      );
    }

    return {
      provider: 'apple',
      providerId: payload.sub,
      email, // gizli adres (@privaterelay.appleid.com) de geçerli e-posta sayılır
      firstName: names.firstName ?? null,
      lastName: names.lastName ?? null,
    };
  }

  private get revokeConfigured(): boolean {
    return !!(
      process.env.APPLE_TEAM_ID &&
      process.env.APPLE_KEY_ID &&
      process.env.APPLE_PRIVATE_KEY
    );
  }

  /** Apple'a istek atarken kullanılan client_secret (ES256 JWT, 6 ay). */
  private async clientSecret(clientId: string): Promise<string> {
    const pem = (process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    const key = await importPKCS8(pem, 'ES256');
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: process.env.APPLE_KEY_ID })
      .setIssuer(process.env.APPLE_TEAM_ID as string)
      .setIssuedAt()
      .setExpirationTime('180d')
      .setAudience(APPLE_ISSUER)
      .setSubject(clientId)
      .sign(key);
  }

  /**
   * authorizationCode → refresh token (hesap silinirken iptal için saklanır).
   * Başarısız olursa null döner, giriş akışını bozmaz.
   */
  async exchangeAuthorizationCode(code: string): Promise<string | null> {
    if (!this.revokeConfigured) return null;
    const clientId = this.audiences[0];
    try {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: await this.clientSecret(clientId),
        code,
        grant_type: 'authorization_code',
      });
      const res = await fetch(`${APPLE_ISSUER}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) {
        this.logger.warn(
          `Apple token exchange ${res.status}: ${await res.text()}`,
        );
        return null;
      }
      const json = (await res.json()) as { refresh_token?: string };
      return json.refresh_token ?? null;
    } catch (err) {
      this.logger.warn(`Apple token exchange hatası: ${String(err)}`);
      return null;
    }
  }

  /** Hesap silinirken Apple tarafında da oturumu iptal eder (best effort). */
  async revoke(refreshToken: string): Promise<boolean> {
    if (!this.revokeConfigured) {
      this.logger.warn('Apple anahtarları tanımlı değil; token iptali atlandı');
      return false;
    }
    const clientId = this.audiences[0];
    try {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: await this.clientSecret(clientId),
        token: refreshToken,
        token_type_hint: 'refresh_token',
      });
      const res = await fetch(`${APPLE_ISSUER}/auth/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) {
        this.logger.warn(`Apple revoke ${res.status}: ${await res.text()}`);
      }
      return res.ok;
    } catch (err) {
      this.logger.warn(`Apple revoke hatası: ${String(err)}`);
      return false;
    }
  }
}
