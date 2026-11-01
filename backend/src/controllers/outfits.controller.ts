import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AuthUser } from '../common/auth/auth.types';
import { OutfitsService } from '../services/outfits.service';

type UploadFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };

@Controller('outfits')
@UseGuards(BearerJwtGuard)
export class OutfitsController {
  constructor(private readonly outfitsService: OutfitsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.outfitsService.list(user);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.outfitsService.getOne(user, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      name: string;
      description?: string | null;
      clothesIds?: string[];
      season_ids?: string[];
      temperature_ids?: string[];
      use_case_ids?: string[];
      canvasLayout?: Record<string, any> | null;
    },
  ) {
    return this.outfitsService.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string | null;
      clothesIds?: string[];
      season_ids?: string[];
      temperature_ids?: string[];
      use_case_ids?: string[];
      canvasLayout?: Record<string, any> | null;
    },
  ) {
    return this.outfitsService.update(user, id, body);
  }

  @Post(':id/clothes')
  addClothes(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { clothesIds: string[] },
  ) {
    return this.outfitsService.addClothes(user, id, body.clothesIds || []);
  }

  @Delete(':id/clothes/:clothesId')
  removeClothes(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('clothesId') clothesId: string,
  ) {
    return this.outfitsService.removeClothes(user, id, clothesId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.outfitsService.remove(user, id);
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: UploadFile | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.outfitsService.addAttachment(user, id, file, body);
  }

  @Delete(':outfitId/attachments/:attachmentId')
  removeAttachment(
    @CurrentUser() user: AuthUser,
    @Param('outfitId') outfitId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.outfitsService.removeAttachment(user, outfitId, attachmentId);
  }

  @Patch(':outfitId/attachments/order')
  reorderAttachments(
    @CurrentUser() user: AuthUser,
    @Param('outfitId') outfitId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.outfitsService.reorderAttachments(user, outfitId, body.attachment_ids);
  }

  @Get(':outfitId/attachments/:attachmentId/file')
  async getAttachmentFile(
    @CurrentUser() user: AuthUser,
    @Param('outfitId') outfitId: string,
    @Param('attachmentId') attachmentId: string,
    @Query('variant') variant: string | undefined,
    @Res({ passthrough: true }) response: { setHeader: (name: string, value: string) => void },
  ) {
    const file = await this.outfitsService.getAttachmentFile(user, outfitId, attachmentId, variant);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`);
    return new StreamableFile(file.content);
  }
}
