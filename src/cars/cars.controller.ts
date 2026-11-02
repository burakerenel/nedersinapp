import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CarsService } from './cars.service';
import { SearchCarsDto } from './dto/search-cars.dto';

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

  @Get('models/:modelId')
  @ApiOperation({ summary: 'Get a model with its sub-models and review stats' })
  findModel(@Param('modelId', ParseUUIDPipe) modelId: string) {
    return this.carsService.findModelById(modelId);
  }

  @Get('sub-models/:subModelId/issues')
  @ApiOperation({
    summary: 'Chronic issues for a sub-model (topics of reviews rated 1-3)',
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
