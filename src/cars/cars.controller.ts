import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { CarsService } from './cars.service';
import { CreateSubModelDto } from './dto/create-sub-model.dto';
import { SearchCarsDto } from './dto/search-cars.dto';
import { SearchModelsDto } from './dto/search-models.dto';

@ApiTags('cars')
@Controller('cars')
export class CarsController {
  constructor(private readonly carsService: CarsService) {}

  @Get('brands')
  @ApiOperation({ summary: 'List all brands' })
  findAllBrands() {
    return this.carsService.findAllBrands();
  }

  @Get('brands/popular')
  @ApiOperation({
    summary: 'Popular brands by review count (short list for home chips)',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findPopularBrands(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 8;
    return this.carsService.findPopularBrands(
      Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 8,
    );
  }

  @Get('brands/:brandId')
  @ApiOperation({ summary: 'Get a brand with its models and review counts' })
  findBrand(@Param('brandId', ParseUUIDPipe) brandId: string) {
    return this.carsService.findBrandById(brandId);
  }

  @Get('popular')
  @ApiOperation({ summary: 'Get popular sub-models by review count' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findPopular(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 10;
    return this.carsService.findPopular(
      Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 10,
    );
  }

  @Get('search')
  @ApiOperation({
    summary:
      'Search / filter sub-models (q, yearFrom, yearTo, bodyType, fuelType, sort, page, limit); paginated',
  })
  search(@Query() query: SearchCarsDto) {
    return this.carsService.search(query);
  }

  @Get('models/search')
  @ApiOperation({
    summary:
      'Search models (one card per model, stats aggregated over its sub-models); q, brandId, bodyType, fuelType, sort, page, limit',
  })
  searchModels(@Query() query: SearchModelsDto) {
    return this.carsService.searchModels(query);
  }

  @Get('models/:modelId/issues')
  @ApiOperation({
    summary:
      'Chronic issues for a model (dislikedTopics across all its sub-models)',
  })
  findModelIssues(@Param('modelId', ParseUUIDPipe) modelId: string) {
    return this.carsService.findIssuesByModel(modelId);
  }

  @Get('models/:modelId')
  @ApiOperation({
    summary:
      'Get a model with aggregated review stats (all sub-models) plus its sub-models with their own stats',
  })
  findModel(@Param('modelId', ParseUUIDPipe) modelId: string) {
    return this.carsService.findModelById(modelId);
  }

  /**
   * Dahili: marka/model/alt model bul-ya-da-oluştur. Swagger'da listelenmez,
   * `x-internal-token` başlığı (INTERNAL_API_TOKEN) ister.
   */
  @Post('sub-models')
  @UseGuards(InternalTokenGuard)
  @ApiExcludeEndpoint()
  createSubModel(@Body() dto: CreateSubModelDto) {
    return this.carsService.createSubModel(dto);
  }

  @Get('sub-models/:subModelId/issues')
  @ApiOperation({
    summary:
      'Chronic issues for a sub-model (dislikedTopics repeated in ≥2 visible reviews)',
  })
  findIssues(@Param('subModelId', ParseUUIDPipe) subModelId: string) {
    return this.carsService.findIssuesBySubModel(subModelId);
  }

  @Get('sub-models/:subModelId')
  @ApiOperation({ summary: 'Get a single sub-model with review stats' })
  findSubModel(@Param('subModelId', ParseUUIDPipe) subModelId: string) {
    return this.carsService.findSubModelDetail(subModelId);
  }
}
