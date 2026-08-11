import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AuthUser } from '../common/auth/auth.types';
import { ClothesService } from '../services/clothes.service';

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

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clothesService.getOne(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.clothesService.update(user, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clothesService.remove(user, id);
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file'))
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
    @Res({ passthrough: true }) response: { setHeader: (name: string, value: string) => void },
  ) {
    const file = await this.clothesService.getAttachmentFile(user, clothesId, attachmentId);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`);
    return new StreamableFile(file.content);
  }
}