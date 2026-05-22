import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CarsService } from './cars.service';

@ApiTags('cars')
@Controller('cars')
export class CarsController {
  constructor(private readonly carsService: CarsService) {}

  // ── Brands ──────────────────────────────────────────────────────────────

  @Get('brands')
  @ApiOperation({ summary: 'List all brands with models and sub-models' })
  findAllBrands() {
    return this.carsService.findAllBrands();
  }

  @Get('brands/:id')
  @ApiOperation({ summary: 'Get a single brand' })
  findBrand(@Param('id', ParseUUIDPipe) id: string) {
    return this.carsService.findBrandById(id);
  }

  // ── Models ───────────────────────────────────────────────────────────────

  @Get('models')
  @ApiOperation({ summary: 'List all models with brand and sub-models' })
  findAllModels() {
    return this.carsService.findAllModels();
  }

  @Get('models/:id')
  @ApiOperation({ summary: 'Get a single model' })
  findModel(@Param('id', ParseUUIDPipe) id: string) {
    return this.carsService.findModelById(id);
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
