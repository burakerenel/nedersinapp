import { ApiProperty } from '@nestjs/swagger';
import { User } from '../user.entity';

/** Login / register / sosyal giriş cevabındaki `user` objesi. */
export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Gökçen' })
  firstName: string;

  @ApiProperty({ example: 'Avşar' })
  lastName: string;

  @ApiProperty({ example: 'gokcen@example.com' })
  email: string;

  @ApiProperty({
    description: 'Şifresi olan hesap mı (sosyal girişte false olabilir)',
  })
  hasPassword: boolean;

  @ApiProperty({ example: ['password', 'google'] })
  authProviders: string[];

  @ApiProperty()
  createdAt: Date;

  static from(user: User): UserResponseDto {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      hasPassword: !!user.password,
      authProviders: [
        ...(user.password ? ['password'] : []),
        ...(user.googleId ? ['google'] : []),
        ...(user.appleId ? ['apple'] : []),
      ],
      createdAt: user.createdAt,
    };
  }
}
