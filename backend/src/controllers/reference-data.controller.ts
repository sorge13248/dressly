import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AuthUser } from '../common/auth/auth.types';
import { ReferenceDataService, ReferenceDataType } from '../services/reference-data.service';

@Controller()
@UseGuards(BearerJwtGuard)
export class ReferenceDataController {
  constructor(private readonly referenceDataService: ReferenceDataService) {}

  @Get('colors')
  listColors(@CurrentUser() user: AuthUser) {
    return this.referenceDataService.list('colors', user);
  }

  @Post('colors')
  createColor(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.referenceDataService.create('colors', user, body);
  }

  @Put('colors/:id')
  updateColor(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.referenceDataService.update('colors', user, id, body);
  }

  @Delete('colors/:id')
  deleteColor(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.referenceDataService.remove('colors', user, id);
  }

  @Get('brands')
  listBrands(@CurrentUser() user: AuthUser) {
    return this.referenceDataService.list('brands', user);
  }

  @Post('brands')
  createBrand(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.referenceDataService.create('brands', user, body);
  }

  @Put('brands/:id')
  updateBrand(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.referenceDataService.update('brands', user, id, body);
  }

  @Delete('brands/:id')
  deleteBrand(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.referenceDataService.remove('brands', user, id);
  }

  @Get('seasons')
  listSeasons(@CurrentUser() user: AuthUser) {
    return this.referenceDataService.list('seasons', user);
  }

  @Post('seasons')
  createSeason(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.referenceDataService.create('seasons', user, body);
  }

  @Put('seasons/:id')
  updateSeason(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.referenceDataService.update('seasons', user, id, body);
  }

  @Delete('seasons/:id')
  deleteSeason(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.referenceDataService.remove('seasons', user, id);
  }

  @Get('temperatures')
  listTemperatures(@CurrentUser() user: AuthUser) {
    return this.referenceDataService.list('temperatures', user);
  }

  @Post('temperatures')
  createTemperature(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.referenceDataService.create('temperatures', user, body);
  }

  @Put('temperatures/:id')
  updateTemperature(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.referenceDataService.update('temperatures', user, id, body);
  }

  @Delete('temperatures/:id')
  deleteTemperature(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.referenceDataService.remove('temperatures', user, id);
  }

  @Get('use-cases')
  listUseCases(@CurrentUser() user: AuthUser) {
    return this.referenceDataService.list('use-cases', user);
  }

  @Post('use-cases')
  createUseCase(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.referenceDataService.create('use-cases', user, body);
  }

  @Put('use-cases/:id')
  updateUseCase(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.referenceDataService.update('use-cases', user, id, body);
  }

  @Delete('use-cases/:id')
  deleteUseCase(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.referenceDataService.remove('use-cases', user, id);
  }

  @Get('fits')
  listFits(@CurrentUser() user: AuthUser) {
    return this.referenceDataService.list('fits', user);
  }

  @Post('fits')
  createFit(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.referenceDataService.create('fits', user, body);
  }

  @Put('fits/:id')
  updateFit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.referenceDataService.update('fits', user, id, body);
  }

  @Delete('fits/:id')
  deleteFit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.referenceDataService.remove('fits', user, id);
  }

  @Get('materials')
  listMaterials(@CurrentUser() user: AuthUser) {
    return this.referenceDataService.list('materials', user);
  }

  @Post('materials')
  createMaterial(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.referenceDataService.create('materials', user, body);
  }

  @Put('materials/:id')
  updateMaterial(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.referenceDataService.update('materials', user, id, body);
  }

  @Delete('materials/:id')
  deleteMaterial(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.referenceDataService.remove('materials', user, id);
  }

  @Get('types')
  listTypes(@CurrentUser() user: AuthUser) {
    return this.referenceDataService.list('types', user);
  }

  @Post('types')
  createType(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.referenceDataService.create('types', user, body);
  }

  @Put('types/:id')
  updateType(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.referenceDataService.update('types', user, id, body);
  }

  @Delete('types/:id')
  deleteType(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.referenceDataService.remove('types', user, id);
  }

  @Get('tags')
  listTags(@CurrentUser() user: AuthUser) {
    return this.referenceDataService.list('tags', user);
  }

  @Post('tags')
  createTag(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.referenceDataService.create('tags', user, body);
  }

  @Put('tags/:id')
  updateTag(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.referenceDataService.update('tags', user, id, body);
  }

  @Delete('tags/:id')
  deleteTag(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.referenceDataService.remove('tags', user, id);
  }
}