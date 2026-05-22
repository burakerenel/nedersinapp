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

  @Get('models/:modelId')
  @ApiOperation({ summary: 'Get a model with its sub-models' })
  findModel(@Param('modelId', ParseUUIDPipe) modelId: string) {
    return this.carsService.findModelById(modelId);
  }

  @Get('sub-models/:subModelId')
  @ApiOperation({ summary: 'Get a single sub-model' })
  findSubModel(@Param('subModelId', ParseUUIDPipe) subModelId: string) {
    return this.carsService.findSubModelByIdOnly(subModelId);
  }
}
