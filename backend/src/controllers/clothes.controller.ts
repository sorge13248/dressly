import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AuthUser } from '../common/auth/auth.types';
import { ClothesService } from '../services/clothes.service';

interface ResponseWriter {
  setHeader(name: string, value: string | number): void;
  end(data?: Buffer): void;
}

interface UploadFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Controller('clothes')
@UseGuards(BearerJwtGuard)
export class ClothesController {
  constructor(private readonly clothesService: ClothesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: Record<string, string | undefined>) {
    return this.clothesService.list(user, query);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.clothesService.create(user, body);
  }

  @Get('laundry-counts')
  getLaundryCounts(@CurrentUser() user: AuthUser) {
    return this.clothesService.getLaundryCounts(user);
  }

  @Get('washing')
  getWashingList(@CurrentUser() user: AuthUser) {
    return this.clothesService.getWashingList(user);
  }

  @Post('washing')
  addToWashing(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.clothesService.addToWashing(user, this.extractIds(body));
  }

  @Delete('washing')
  clearWashing(@CurrentUser() user: AuthUser) {
    return this.clothesService.clearWashing(user);
  }

  @Delete('washing/:clothesId')
  removeFromWashing(
    @CurrentUser() user: AuthUser,
    @Param('clothesId') clothesId: string,
    @Query('all') all?: string,
  ) {
    return this.clothesService.removeFromWashing(user, clothesId, 1, all === 'true');
  }

  @Post('washing/:clothesId/move-to-ironing')
  moveWashingToIroning(
    @CurrentUser() user: AuthUser,
    @Param('clothesId') clothesId: string,
    @Query('all') all?: string,
  ) {
    return this.clothesService.moveWashingToIroning(user, clothesId, 1, all === 'true');
  }

  @Get('ironing')
  getIroningList(@CurrentUser() user: AuthUser, @Query('ids') ids: string | undefined) {
    return this.clothesService.getIroningList(user, ids);
  }

  @Post('ironing')
  addToIroning(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.clothesService.addToIroning(user, this.extractIds(body));
  }

  @Delete('ironing')
  clearIroning(@CurrentUser() user: AuthUser) {
    return this.clothesService.clearIroning(user);
  }

  @Delete('ironing/:clothesId')
  removeFromIroning(
    @CurrentUser() user: AuthUser,
    @Param('clothesId') clothesId: string,
    @Query('all') all?: string,
  ) {
    return this.clothesService.removeFromIroning(user, clothesId, 1, all === 'true');
  }

  private extractIds(body: Record<string, unknown>): string[] {
    if (Array.isArray(body?.clothesIds)) {
      return body.clothesIds.map(String).filter(Boolean);
    }
    if (typeof body?.clothesId === 'string' && body.clothesId.trim()) {
      return [body.clothesId.trim()];
    }
    if (Array.isArray(body?.ids)) {
      return body.ids.map(String).filter(Boolean);
    }
    return [];
  }

  @Patch('bulk-status')
  bulkUpdateStatus(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    const ids = this.extractIds(body);
    const status = String(body.status ?? 'in_wardrobe') as 'in_wardrobe' | 'in_storage' | 'dismissed';
    const rawLocationId = body.locationId !== undefined ? body.locationId : body.location_id;
    const locationId = rawLocationId !== undefined ? (rawLocationId ? String(rawLocationId).trim() : null) : undefined;
    return this.clothesService.bulkUpdateStatus(user, ids, status, locationId);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clothesService.getOne(user, id);
  }

  @Get(':id/pdf')
  async exportPdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: ResponseWriter,
  ) {
    const { buffer, filename } = await this.clothesService.generateClothPdf(user, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.clothesService.update(user, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clothesService.remove(user, id);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clothesService.duplicate(user, id);
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      // Smartphone camera photos can easily exceed a few MB; keep this in
      // sync with the client_max_body_size configured in nginx.
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: UploadFile | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.clothesService.addAttachment(user, id, file, body);
  }

  @Delete(':clothesId/attachments/:attachmentId')
  removeAttachment(
    @CurrentUser() user: AuthUser,
    @Param('clothesId') clothesId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.clothesService.removeAttachment(user, clothesId, attachmentId);
  }

  @Patch(':clothesId/attachments/order')
  reorderAttachments(
    @CurrentUser() user: AuthUser,
    @Param('clothesId') clothesId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.clothesService.reorderAttachments(user, clothesId, body.attachment_ids);
  }

  @Get(':clothesId/attachments/:attachmentId/file')
  async getAttachmentFile(
    @CurrentUser() user: AuthUser,
    @Param('clothesId') clothesId: string,
    @Param('attachmentId') attachmentId: string,
    @Query('variant') variant: string | undefined,
    @Res({ passthrough: true }) response: { setHeader: (name: string, value: string) => void },
  ) {
    const file = await this.clothesService.getAttachmentFile(user, clothesId, attachmentId, variant);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`);
    return new StreamableFile(file.content);
  }
}