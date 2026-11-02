import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({ description: "Google Sign-In'den gelen ID token (JWT)" })
  @IsString({ message: 'metin olmalı' })
  @IsNotEmpty({ message: 'zorunlu' })
  idToken: string;
}

export class AppleLoginDto {
  @ApiProperty({
    description: "Sign in with Apple'dan gelen identityToken (JWT)",
  })
  @IsString({ message: 'metin olmalı' })
  @IsNotEmpty({ message: 'zorunlu' })
  identityToken: string;

  @ApiPropertyOptional({
    description: 'Apple adı sadece ilk girişte verir; uygulama iletir',
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: 'metin olmalı' })
  @MaxLength(100, { message: 'en fazla 100 karakter olabilir' })
  firstName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString({ message: 'metin olmalı' })
  @MaxLength(100, { message: 'en fazla 100 karakter olabilir' })
  lastName?: string | null;

  @ApiPropertyOptional({
    description:
      "Apple authorizationCode (opsiyonel). Verilirse refresh token alınır ve hesap silinirken Apple'da da iptal edilir.",
  })
  @IsOptional()
  @IsString({ message: 'metin olmalı' })
  authorizationCode?: string;
}
