import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from './user.entity';
import { UsersService } from './users.service';
import { BlocksService } from './blocks.service';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly blocksService: BlocksService,
  ) {}

  // ---------- engelleme (#23) ----------

  @Get('me/blocks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Users blocked by the current user' })
  @ApiResponse({ status: 200 })
  listBlocks(@CurrentUser() user: User) {
    return this.blocksService.listBlocked(user.id);
  }

  @Post(':userId/block')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Block a user (their reviews disappear from your lists). Idempotent.',
  })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 400, description: 'CannotBlockSelf' })
  @ApiResponse({ status: 404, description: 'UserNotFound' })
  block(
    @CurrentUser() user: User,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.blocksService.block(user.id, userId);
  }

  @Delete(':userId/block')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unblock a user. Idempotent.' })
  @ApiResponse({ status: 200 })
  async unblock(
    @CurrentUser() user: User,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.blocksService.unblock(user.id, userId);
    return { message: 'Engel kaldırıldı' };
  }

  @Get(':id/card')
  @ApiOperation({
    summary: 'Get public user card (first name + masked last name)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async getUserCard(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.usersService.findById(id);
    return this.usersService.getUserCard(user);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ) {
    const updated = await this.usersService.updateProfile(user.id, dto);
    return UserResponseDto.from(updated);
  }

  @Patch('me/password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user password' })
  @ApiResponse({ status: 200, description: 'Password updated successfully' })
  @ApiResponse({ status: 401, description: 'Current password is incorrect' })
  async updatePassword(
    @CurrentUser() user: User,
    @Body() dto: UpdatePasswordDto,
  ) {
    await this.usersService.updatePassword(user.id, dto);
    return { message: 'Şifre güncellendi' };
  }
}
