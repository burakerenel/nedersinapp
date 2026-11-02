import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { DeleteAccountDto } from '../users/dto/delete-account.dto';

/** `DELETE /users/me` — AuthModule içinde, Apple token iptali için. */
@ApiTags('users')
@Controller('users')
export class AccountController {
  constructor(private readonly authService: AuthService) {}

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Delete own account (favorites + likes removed, reviews anonymised, old tokens become 401)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401, description: 'InvalidCredentials' })
  async deleteMe(@CurrentUser() user: User, @Body() dto: DeleteAccountDto) {
    await this.authService.deleteAccount(user, dto ?? {});
    return { message: 'Hesabınız silindi' };
  }
}
