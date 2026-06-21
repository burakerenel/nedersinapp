import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CarsService } from './cars.service';

@ApiTags('cars')
@Controller('cars')
export class CarsController {
  constructor(private readonly carsService: CarsService) {}

  @Get('brands')
  @ApiOperation({ summary: 'List all brands' })
  findAllBrands() {
    return this.carsService.findAllBrands();
  }

  @Get('brands/:brandId')
  @ApiOperation({ summary: 'Get a brand with its models and review counts' })
  findBrand(@Param('brandId', ParseUUIDPipe) brandId: string) {
    return this.carsService.findBrandById(brandId);
  }

  @Get('popular')
  @ApiOperation({ summary: 'Get popular cars by review count' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findPopular(@Query('limit') limit?: string) {
    return this.carsService.findPopular(limit ? parseInt(limit, 10) : 10);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search cars by brand, model, or sub-model name' })
  @ApiQuery({ name: 'q', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  search(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.carsService.search(q ?? '', limit ? parseInt(limit, 10) : 20);
  }

  @Get('models/:modelId')
  @ApiOperation({ summary: 'Get a model with its sub-models and review counts' })
  findModel(@Param('modelId', ParseUUIDPipe) modelId: string) {
    return this.carsService.findModelById(modelId);
  }

  @Get('sub-models/:subModelId/issues')
  @ApiOperation({ summary: 'Get common issues for a sub-model based on review topics' })
  findIssues(@Param('subModelId', ParseUUIDPipe) subModelId: string) {
    return this.carsService.findIssuesBySubModel(subModelId);
  }

  @Get('sub-models/:subModelId')
  @ApiOperation({ summary: 'Get a single sub-model with review stats' })
  findSubModel(@Param('subModelId', ParseUUIDPipe) subModelId: string) {
    return this.carsService.findSubModelByIdOnly(subModelId);
  }
}
