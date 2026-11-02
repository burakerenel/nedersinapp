import {
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { MAX_IMAGE_BYTES, UploadsService } from './uploads.service';

export function publicBaseUrl(req: Request): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  const proto =
    (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ||
    req.protocol;
  const host =
    (req.headers['x-forwarded-host'] as string | undefined) || req.get('host');
  return `${proto}://${host}`;
}

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('review-images')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({
    summary:
      'Upload a review photo (jpg/png/heic, max 5 MB); returns { id, url }',
  })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 413, description: 'FileTooLarge' })
  @ApiResponse({ status: 415, description: 'UnsupportedFileType' })
  upload(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    return this.uploadsService.storeReviewImage(
      user.id,
      file,
      publicBaseUrl(req),
    );
  }
}
