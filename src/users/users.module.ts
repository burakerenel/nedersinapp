import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UserBlock } from './entities/user-block.entity';
import { UsersService } from './users.service';
import { BlocksService } from './blocks.service';
import { UsersController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserBlock])],
  providers: [UsersService, BlocksService],
  controllers: [UsersController],
  exports: [UsersService, BlocksService],
})
export class UsersModule {}
