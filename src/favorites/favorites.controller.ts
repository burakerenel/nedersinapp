import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { User } from '../users/user.entity';
import { FavoritesService } from './favorites.service';
import { CreateFavoriteDto } from './dto/create-favorite.dto';

@ApiTags('favorites')
@Controller('favorites')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a car to favorites' })
  @ApiResponse({ status: 201 })
  create(@CurrentUser() user: User, @Body() dto: CreateFavoriteDto) {
    return this.favoritesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: "Get the current user's favorites" })
  findAll(@CurrentUser() user: User) {
    return this.favoritesService.findByUser(user.id);
  }

  @Delete(':favoriteId')
  @ApiOperation({ summary: 'Remove a favorite' })
  @ApiResponse({ status: 200 })
  async remove(
    @CurrentUser() user: User,
    @Param('favoriteId', ParseUUIDPipe) favoriteId: string,
  ) {
    await this.favoritesService.delete(user.id, favoriteId);
    return { message: 'Favorite removed' };
  }
}
