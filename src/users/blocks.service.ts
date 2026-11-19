import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserBlock } from './entities/user-block.entity';
import { UsersService } from './users.service';
import { ApiException } from '../common/exceptions/api.exception';

export interface BlockedUserDto {
  id: string;
  user: { id: string; firstName: string; lastName: string };
  createdAt: Date;
}

/** Kullanıcı engelleme (iş listesi #23). */
@Injectable()
export class BlocksService {
  constructor(
    @InjectRepository(UserBlock)
    private readonly blockRepo: Repository<UserBlock>,
    private readonly usersService: UsersService,
  ) {}

  /** Idempotent: zaten engelliyse tekrar eklemez. */
  async block(
    blockerId: string,
    blockedId: string,
  ): Promise<{ blocked: true; created: boolean }> {
    if (blockerId === blockedId) {
      throw ApiException.badRequest(
        'Kendinizi engelleyemezsiniz',
        'CannotBlockSelf',
      );
    }
    await this.usersService.findById(blockedId); // 404 UserNotFound (silinmiş dahil)
    const existing = await this.blockRepo.findOne({
      where: { blockerId, blockedId },
    });
    if (existing) return { blocked: true, created: false };
    await this.blockRepo.save(this.blockRepo.create({ blockerId, blockedId }));
    return { blocked: true, created: true };
  }

  /** Idempotent: kayıt yoksa da 200. */
  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.blockRepo.delete({ blockerId, blockedId });
  }

  async listBlocked(blockerId: string): Promise<BlockedUserDto[]> {
    const rows = await this.blockRepo.find({
      where: { blockerId },
      relations: ['blocked'],
      order: { createdAt: 'DESC' },
    });
    return rows.map((b) => ({
      id: b.id,
      user: {
        id: b.blockedId,
        firstName: b.blocked.firstName,
        lastName: b.blocked.lastName,
      },
      createdAt: b.createdAt,
    }));
  }

  /** Yorum listelerinde dışlanacak yazar id'leri. */
  async blockedIdsFor(blockerId: string | null): Promise<string[]> {
    if (!blockerId) return [];
    const rows = await this.blockRepo.find({
      where: { blockerId },
      select: ['blockedId'],
    });
    return rows.map((r) => r.blockedId);
  }
}
