import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Get a brand with its models' })
  findBrand(@Param('brandId', ParseUUIDPipe) brandId: string) {
    return this.carsService.findBrandById(brandId);
  }

  @Get('brands/:brandId/models/:modelId')
  @ApiOperation({ summary: 'Get a model under a brand' })
  findModel(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('modelId', ParseUUIDPipe) modelId: string,
  ) {
    return this.carsService.findModelById(brandId, modelId);
  }

  @Get('brands/:brandId/models/:modelId/sub-models')
  @ApiOperation({ summary: 'List sub-models of a model' })
  findSubModels(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('modelId', ParseUUIDPipe) modelId: string,
  ) {
    return this.carsService.findSubModelsByModelId(brandId, modelId);
  }

  @Get('brands/:brandId/models/:modelId/sub-models/:subModelId')
  @ApiOperation({ summary: 'Get a single sub-model' })
  findSubModel(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('subModelId', ParseUUIDPipe) subModelId: string,
  ) {
    return this.carsService.findSubModelById(brandId, modelId, subModelId);
  }
}
