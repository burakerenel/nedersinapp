import { ApiProperty } from '@nestjs/swagger';
import { User } from '../user.entity';

export class UserCardDto {
  @ApiProperty({ example: 'Ahmet' })
  firstName: string;

  @ApiProperty({ example: 'Y****', description: 'Last name with first letter visible, rest masked' })
  lastName: string;

  static fromUser(user: User): UserCardDto {
    const card = new UserCardDto();
    card.firstName = user.firstName;
    card.lastName =
      user.lastName.charAt(0) + '*'.repeat(Math.max(0, user.lastName.length - 1));
    return card;
  }
}
