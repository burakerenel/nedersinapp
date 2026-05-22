import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CarsService } from './cars.service';

@ApiTags('cars')
@Controller('cars')
export class CarsController {
  constructor(private readonly carsService: CarsService) {}

  // ── Brands ──────────────────────────────────────────────────────────────

  @Get('brands')
  @ApiOperation({ summary: 'List all brands (id, name, logo)' })
  findAllBrands() {
    return this.carsService.findAllBrands();
  }

  @Get('brands/:id')
  @ApiOperation({ summary: 'Get a brand with its models and sub-models' })
  findBrand(@Param('id', ParseUUIDPipe) id: string) {
    return this.carsService.findBrandById(id);
  }

  // ── SubModels ─────────────────────────────────────────────────────────────

  @Get('sub-models')
  @ApiOperation({ summary: 'List all sub-models (brand, model, name, engineCC, year)' })
  findAllSubModels() {
    return this.carsService.findAllSubModels();
  }

  @Get('sub-models/:id')
  @ApiOperation({ summary: 'Get a single sub-model' })
  findSubModel(@Param('id', ParseUUIDPipe) id: string) {
    return this.carsService.findSubModelById(id);
  }
}
