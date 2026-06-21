export class ReviewUserDto {
  id: string;
  firstName: string;
  lastName: string;
}

export class ReviewCarSubModelDto {
  id: string;
  name: string;
  model: { name: string; brand: { name: string } };
}

export class ReviewResponseDto {
  id: string;
  content: string;
  title: string | null;
  rating: number;
  kilometer: number | null;
  topics: string[];
  likesCount: number;
  carSubModelId: string;
  createdAt: Date;
  user: ReviewUserDto;
}

export class RecentReviewResponseDto {
  id: string;
  content: string;
  title: string | null;
  rating: number;
  createdAt: Date;
  user: ReviewUserDto;
  carSubModel: ReviewCarSubModelDto;
}

export class MyReviewResponseDto {
  id: string;
  content: string;
  title: string | null;
  rating: number;
  kilometer: number | null;
  topics: string[];
  likesCount: number;
  createdAt: Date;
  carSubModel: ReviewCarSubModelDto;
}
