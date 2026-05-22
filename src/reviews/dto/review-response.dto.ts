export class ReviewUserDto {
  id: string;
  firstName: string;
  lastName: string;
}

export class ReviewResponseDto {
  id: string;
  content: string;
  carSubModelId: string;
  createdAt: Date;
  user: ReviewUserDto;
}
