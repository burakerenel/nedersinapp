import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import {
  DELETED_USER_FIRST_NAME,
  DELETED_USER_LAST_NAME,
  User,
} from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserCardDto } from './dto/user-card.dto';
import { ApiException } from '../common/exceptions/api.exception';

export interface SocialProfile {
  provider: 'google' | 'apple';
  providerId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.usersRepository.findOneBy({ email });
    if (exists) {
      throw ApiException.conflict(
        'Bu e-posta adresi zaten kayıtlı',
        'EmailAlreadyInUse',
      );
    }

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = this.usersRepository.create({
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email,
      password: hashed,
      termsAccepted: dto.termsAccepted,
    });

    return this.usersRepository.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOneBy({
      email: email.trim().toLowerCase(),
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user || user.deletedAt) {
      throw ApiException.notFound('Kullanıcı bulunamadı', 'UserNotFound');
    }
    return user;
  }

  /** JWT doğrulaması için: silinmiş ya da olmayan kullanıcıda null. */
  async findActiveById(id: string): Promise<User | null> {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user || user.deletedAt) return null;
    return user;
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    if (!user.password) return false;
    return bcrypt.compare(password, user.password);
  }

  async updatePassword(id: string, dto: UpdatePasswordDto): Promise<void> {
    const user = await this.findById(id);
    if (!user.password) {
      throw ApiException.badRequest(
        'Bu hesap sosyal girişle açıldı; şifre belirlemek için şifre sıfırlama kullanın',
        'NoPasswordSet',
      );
    }
    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) {
      throw ApiException.unauthorized(
        'Mevcut şifre hatalı',
        'InvalidCredentials',
      );
    }
    user.password = await bcrypt.hash(dto.newPassword, 10);
    await this.usersRepository.save(user);
  }

  async setPassword(user: User, newPassword: string): Promise<void> {
    user.password = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.save(user);
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.findById(id);
    if (dto.firstName !== undefined) user.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) user.lastName = dto.lastName.trim();
    return this.usersRepository.save(user);
  }

  async save(user: User): Promise<User> {
    return this.usersRepository.save(user);
  }

  getUserCard(user: User): UserCardDto {
    return UserCardDto.fromUser(user);
  }

  /**
   * Sosyal giriş eşleştirmesi:
   * 1. providerId ile kayıtlı kullanıcı → o kullanıcı
   * 2. aynı e-posta ile kayıtlı kullanıcı → hesaba bağlanır
   * 3. yoksa yeni kullanıcı (termsAccepted: true, password: null)
   */
  async findOrCreateSocialUser(profile: SocialProfile): Promise<User> {
    const idColumn = profile.provider === 'google' ? 'googleId' : 'appleId';
    const email = profile.email.trim().toLowerCase();

    let user = await this.usersRepository.findOneBy(
      idColumn === 'googleId'
        ? { googleId: profile.providerId }
        : { appleId: profile.providerId },
    );
    if (user && user.deletedAt) user = null;

    if (!user) {
      const byEmail = await this.usersRepository.findOneBy({ email });
      if (byEmail && !byEmail.deletedAt) {
        byEmail[idColumn] = profile.providerId;
        user = await this.usersRepository.save(byEmail);
      }
    }

    if (!user) {
      user = this.usersRepository.create({
        firstName: (profile.firstName ?? '').trim() || 'Kullanıcı',
        lastName: (profile.lastName ?? '').trim() || '',
        email,
        password: null,
        termsAccepted: true,
        [idColumn]: profile.providerId,
      });
      user = await this.usersRepository.save(user);
    }

    return user;
  }

  /**
   * Hesap silme: favoriler ve beğeniler silinir, yorumlar "Silinmiş Kullanıcı"
   * adıyla anonim kalır (kronik sorun istatistikleri bozulmasın). Kullanıcı
   * satırı tombstone'a döner: e-posta serbest kalır, token'lar 401 olur.
   */
  async anonymizeAndDelete(user: User): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query('DELETE FROM favorites WHERE user_id = $1', [
        user.id,
      ]);
      await manager.query('DELETE FROM review_likes WHERE user_id = $1', [
        user.id,
      ]);
      // Yoruma bağlanmamış (taslak) fotoğraflar; yoruma bağlı olanlar kalır.
      await manager.query(
        'DELETE FROM review_images WHERE user_id = $1 AND review_id IS NULL',
        [user.id],
      );
      await manager.update(User, user.id, {
        firstName: DELETED_USER_FIRST_NAME,
        lastName: DELETED_USER_LAST_NAME,
        email: `deleted+${user.id}@deleted.nedersin.app`,
        password: null,
        googleId: null,
        appleId: null,
        appleRefreshToken: null,
        deletedAt: new Date(),
      });
    });
  }
}
