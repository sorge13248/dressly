import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { AuthUser } from '../common/auth/auth.types';
import { sortAttachments } from '../common/utils/attachment-preview.util';
import { Clothes } from '../entities/clothes.entity';
import { WashingItem } from '../entities/washing-item.entity';
import { IroningItem } from '../entities/ironing-item.entity';

function parseCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

@Injectable()
export class LaundryService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getWashingList(user: AuthUser) {
    const washingEntries = await this.dataSource.getRepository(WashingItem).find({
      where: { userId: user.id },
      order: { addedAt: 'DESC' },
      select: { clothesId: true, quantity: true },
    });
    const ids = washingEntries.map((w) => w.clothesId);
    if (ids.length === 0) {
      return { items: [] };
    }
    const quantitiesByClothesId = new Map(washingEntries.map((w) => [w.clothesId, w.quantity || 1]));

    const qb = this.dataSource
      .getRepository(Clothes)
      .createQueryBuilder('clothes')
      .leftJoinAndSelect('clothes.brand', 'brand')
      .leftJoinAndSelect('clothes.type', 'type')
      .leftJoinAndSelect('clothes.colors', 'colors')
      .leftJoinAndSelect('clothes.washingInstruction', 'washingInstruction')
      .leftJoinAndSelect('washingInstruction.washingProgram', 'washingProgram')
      .leftJoinAndSelect('washingInstruction.detergent', 'detergent')
      .leftJoinAndSelect('clothes.ironingInstruction', 'ironingInstruction')
      .leftJoinAndSelect('clothes.attachments', 'attachments')
      .where('clothes.userId = :userId', { userId: user.id })
      .andWhere('clothes.id IN (:...ids)', { ids });

    const items = await qb.getMany();
    const itemsById = new Map(items.map((i) => [i.id, i]));
    const orderedItems = ids.map((id) => itemsById.get(id)).filter((item): item is Clothes => Boolean(item));

    for (const item of orderedItems) {
      if (item.attachments) {
        item.attachments = sortAttachments(item.attachments);
      }
    }

    return {
      items: orderedItems.map((item) => {
        const primaryAttachment =
          (item.attachments ?? []).find((att) => att.mimeType?.startsWith('image/')) ??
          item.attachments?.[0] ??
          null;
        return {
          id: item.id,
          code: item.code,
          name: item.name,
          fullTitle: item.fullTitle,
          isCumulative: item.isCumulative ?? false,
          quantity: item.quantity ?? 1,
          washingQuantity: quantitiesByClothesId.get(item.id) ?? 1,
          isInWashing: true,
          brand: item.brand ? { id: item.brand.id, name: item.brand.name } : null,
          type: item.type ? { id: item.type.id, name: item.type.name } : null,
          colors: (item.colors ?? []).map((c) => ({ id: c.id, name: c.name, hexCode: c.hexCode })),
          washingInstruction: item.washingInstruction
            ? {
                id: item.washingInstruction.id,
                temperature: item.washingInstruction.temperature,
                washType: item.washingInstruction.washType,
                bleachType: item.washingInstruction.bleachType,
                stretch: item.washingInstruction.stretch,
                reverseWashing: item.washingInstruction.reverseWashing,
                closedZips: item.washingInstruction.closedZips,
                similarColors: item.washingInstruction.similarColors,
                washSeparately: item.washingInstruction.washSeparately,
                useColorCatcher: item.washingInstruction.useColorCatcher,
                colorLossRisk: item.washingInstruction.colorLossRisk,
                colorLossTestTemperature: item.washingInstruction.colorLossTestTemperature,
                notes: item.washingInstruction.notes,
                washingProgramId: item.washingInstruction.washingProgramId,
                washingProgram: item.washingInstruction.washingProgram
                  ? {
                      id: item.washingInstruction.washingProgram.id,
                      name: item.washingInstruction.washingProgram.name,
                      temperature: item.washingInstruction.washingProgram.temperature,
                      spinSpeed: item.washingInstruction.washingProgram.spinSpeed,
                    }
                  : null,
                detergentId: item.washingInstruction.detergentId,
                detergent: item.washingInstruction.detergent
                  ? {
                      id: item.washingInstruction.detergent.id,
                      name: item.washingInstruction.detergent.name,
                      description: item.washingInstruction.detergent.description,
                    }
                  : null,
              }
            : null,
          ironingInstruction: item.ironingInstruction
            ? {
                id: item.ironingInstruction.id,
                temperature: item.ironingInstruction.temperature,
                ironType: item.ironingInstruction.ironType,
                ironInsideOut: item.ironingInstruction.ironInsideOut,
              }
            : null,
          primaryAttachment: primaryAttachment
            ? {
                id: primaryAttachment.id,
                fileName: primaryAttachment.fileName,
                previewPath: primaryAttachment.previewPath,
                mimeType: primaryAttachment.mimeType,
              }
            : null,
        };
      }),
    };
  }

  async addToWashing(user: AuthUser, clothesIds: string[]) {
    if (!clothesIds || clothesIds.length === 0) {
      return { added: 0, existing: 0, total: 0 };
    }
    const countById = new Map<string, number>();
    for (const id of clothesIds.filter(Boolean)) {
      countById.set(id, (countById.get(id) ?? 0) + 1);
    }
    const uniqueIds = Array.from(countById.keys());
    const validClothes = await this.dataSource.getRepository(Clothes).find({
      where: { userId: user.id, id: In(uniqueIds) },
      select: { id: true, isCumulative: true, quantity: true },
    });
    if (validClothes.length === 0) {
      return { added: 0, existing: 0, total: 0 };
    }

    const washingRepo = this.dataSource.getRepository(WashingItem);
    const existingItems = await washingRepo.find({
      where: { userId: user.id, clothesId: In(validClothes.map((c) => c.id)) },
    });
    const existingMap = new Map(existingItems.map((e) => [e.clothesId, e]));

    let addedCount = 0;
    for (const cloth of validClothes) {
      const requested = countById.get(cloth.id) ?? 1;
      const existing = existingMap.get(cloth.id);
      if (existing) {
        if (cloth.isCumulative) {
          const maxQty = cloth.quantity && cloth.quantity > 0 ? cloth.quantity : 1;
          const newQty = Math.min(maxQty, (existing.quantity || 1) + requested);
          if (newQty > (existing.quantity || 1)) {
            addedCount += newQty - (existing.quantity || 1);
            existing.quantity = newQty;
            await washingRepo.save(existing);
          }
        }
      } else {
        const initialQty = cloth.isCumulative
          ? Math.min(cloth.quantity && cloth.quantity > 0 ? cloth.quantity : 1, requested)
          : 1;
        await washingRepo.save(washingRepo.create({ userId: user.id, clothesId: cloth.id, quantity: initialQty }));
        addedCount += initialQty;
      }
    }

    const counts = await this.getLaundryCounts(user);
    return {
      added: addedCount,
      existing: existingItems.length,
      total: counts.washingCount,
    };
  }

  async removeFromWashing(user: AuthUser, clothesId: string, quantityToRemove = 1, removeAll = false) {
    const washingRepo = this.dataSource.getRepository(WashingItem);
    const existing = await washingRepo.findOne({ where: { userId: user.id, clothesId } });
    if (existing) {
      const cloth = await this.dataSource.getRepository(Clothes).findOne({ where: { id: clothesId, userId: user.id } });
      if (removeAll || !cloth?.isCumulative || (existing.quantity || 1) <= quantityToRemove) {
        await washingRepo.delete({ id: existing.id });
      } else {
        existing.quantity = (existing.quantity || 1) - quantityToRemove;
        await washingRepo.save(existing);
      }
    }
    const counts = await this.getLaundryCounts(user);
    return { removed: true, total: counts.washingCount };
  }

  async clearWashing(user: AuthUser) {
    const washingRepo = this.dataSource.getRepository(WashingItem);
    await washingRepo.delete({ userId: user.id });
    return { cleared: true };
  }

  async moveWashingToIroning(user: AuthUser, clothesId: string, quantityToMove = 1, moveAll = false) {
    const washingRepo = this.dataSource.getRepository(WashingItem);
    const ironingRepo = this.dataSource.getRepository(IroningItem);

    const existingWashing = await washingRepo.findOne({ where: { userId: user.id, clothesId } });
    if (!existingWashing) {
      throw new NotFoundException('Capo non trovato nella lavatrice');
    }

    const cloth = await this.dataSource.getRepository(Clothes).findOne({
      where: { id: clothesId, userId: user.id },
    });
    if (!cloth) {
      throw new NotFoundException('Capo non trovato');
    }

    const actualMoveCount = moveAll || !cloth.isCumulative || (existingWashing.quantity || 1) <= quantityToMove
      ? (existingWashing.quantity || 1)
      : quantityToMove;

    if (actualMoveCount >= (existingWashing.quantity || 1)) {
      await washingRepo.delete({ id: existingWashing.id });
    } else {
      existingWashing.quantity = (existingWashing.quantity || 1) - actualMoveCount;
      await washingRepo.save(existingWashing);
    }

    const existingIroning = await ironingRepo.findOne({ where: { userId: user.id, clothesId } });
    if (existingIroning) {
      if (cloth.isCumulative) {
        const maxQty = cloth.quantity && cloth.quantity > 0 ? cloth.quantity : 1;
        existingIroning.quantity = Math.min(maxQty, (existingIroning.quantity || 1) + actualMoveCount);
        await ironingRepo.save(existingIroning);
      }
    } else {
      await ironingRepo.save(
        ironingRepo.create({
          userId: user.id,
          clothesId,
          quantity: cloth.isCumulative ? actualMoveCount : 1,
        }),
      );
    }

    const counts = await this.getLaundryCounts(user);
    return { moved: true, washingCount: counts.washingCount, ironingCount: counts.ironingCount };
  }

  async getIroningList(user: AuthUser, rawIds?: string) {
    let ids = parseCsv(rawIds);
    let ironingEntries: Array<{ clothesId: string; quantity: number }> = [];
    if (ids.length === 0) {
      ironingEntries = await this.dataSource.getRepository(IroningItem).find({
        where: { userId: user.id },
        order: { addedAt: 'DESC' },
        select: { clothesId: true, quantity: true },
      });
      ids = ironingEntries.map((item) => item.clothesId);
    } else {
      ironingEntries = await this.dataSource.getRepository(IroningItem).find({
        where: { userId: user.id, clothesId: In(ids) },
        select: { clothesId: true, quantity: true },
      });
    }
    if (ids.length === 0) {
      return { items: [] };
    }
    const ironingQuantities = new Map(ironingEntries.map((i) => [i.clothesId, i.quantity || 1]));

    const qb = this.dataSource
      .getRepository(Clothes)
      .createQueryBuilder('clothes')
      .leftJoinAndSelect('clothes.brand', 'brand')
      .leftJoinAndSelect('clothes.type', 'type')
      .leftJoinAndSelect('clothes.colors', 'colors')
      .leftJoinAndSelect('clothes.ironingInstruction', 'ironingInstruction')
      .leftJoinAndSelect('clothes.attachments', 'attachments')
      .where('clothes.userId = :userId', { userId: user.id })
      .andWhere('clothes.id IN (:...ids)', { ids });

    const items = await qb.getMany();
    const itemsById = new Map(items.map((i) => [i.id, i]));
    const orderedItems = ids.map((id) => itemsById.get(id)).filter((item): item is Clothes => Boolean(item));

    for (const item of orderedItems) {
      if (item.attachments) {
        item.attachments = sortAttachments(item.attachments);
      }
    }

    return {
      items: orderedItems.map((item) => {
        const primaryAttachment =
          (item.attachments ?? []).find((att) => att.mimeType?.startsWith('image/')) ??
          item.attachments?.[0] ??
          null;
        return {
          id: item.id,
          code: item.code,
          name: item.name,
          fullTitle: item.fullTitle,
          isCumulative: item.isCumulative ?? false,
          quantity: item.quantity ?? 1,
          ironingQuantity: ironingQuantities.get(item.id) ?? 1,
          isInIroning: true,
          brand: item.brand ? { id: item.brand.id, name: item.brand.name } : null,
          type: item.type ? { id: item.type.id, name: item.type.name } : null,
          colors: (item.colors ?? []).map((c) => ({ id: c.id, name: c.name, hexCode: c.hexCode })),
          ironingInstruction: item.ironingInstruction
            ? {
                id: item.ironingInstruction.id,
                temperature: item.ironingInstruction.temperature,
                ironType: item.ironingInstruction.ironType,
                ironInsideOut: item.ironingInstruction.ironInsideOut,
              }
            : null,
          primaryAttachment: primaryAttachment
            ? {
                id: primaryAttachment.id,
                fileName: primaryAttachment.fileName,
                previewPath: primaryAttachment.previewPath,
                mimeType: primaryAttachment.mimeType,
              }
            : null,
        };
      }),
    };
  }

  async addToIroning(user: AuthUser, clothesIds: string[]) {
    if (!clothesIds || clothesIds.length === 0) {
      return { added: 0, existing: 0, total: 0 };
    }
    const countById = new Map<string, number>();
    for (const id of clothesIds.filter(Boolean)) {
      countById.set(id, (countById.get(id) ?? 0) + 1);
    }
    const uniqueIds = Array.from(countById.keys());
    const validClothes = await this.dataSource.getRepository(Clothes).find({
      where: { userId: user.id, id: In(uniqueIds) },
      select: { id: true, isCumulative: true, quantity: true },
    });
    if (validClothes.length === 0) {
      return { added: 0, existing: 0, total: 0 };
    }

    const ironingRepo = this.dataSource.getRepository(IroningItem);
    const existingItems = await ironingRepo.find({
      where: { userId: user.id, clothesId: In(validClothes.map((c) => c.id)) },
    });
    const existingMap = new Map(existingItems.map((e) => [e.clothesId, e]));

    let addedCount = 0;
    for (const cloth of validClothes) {
      const requested = countById.get(cloth.id) ?? 1;
      const existing = existingMap.get(cloth.id);
      if (existing) {
        if (cloth.isCumulative) {
          const maxQty = cloth.quantity && cloth.quantity > 0 ? cloth.quantity : 1;
          const newQty = Math.min(maxQty, (existing.quantity || 1) + requested);
          if (newQty > (existing.quantity || 1)) {
            addedCount += newQty - (existing.quantity || 1);
            existing.quantity = newQty;
            await ironingRepo.save(existing);
          }
        }
      } else {
        const initialQty = cloth.isCumulative
          ? Math.min(cloth.quantity && cloth.quantity > 0 ? cloth.quantity : 1, requested)
          : 1;
        await ironingRepo.save(ironingRepo.create({ userId: user.id, clothesId: cloth.id, quantity: initialQty }));
        addedCount += initialQty;
      }
    }

    const counts = await this.getLaundryCounts(user);
    return {
      added: addedCount,
      existing: existingItems.length,
      total: counts.ironingCount,
    };
  }

  async removeFromIroning(user: AuthUser, clothesId: string, quantityToRemove = 1, removeAll = false) {
    const ironingRepo = this.dataSource.getRepository(IroningItem);
    const existing = await ironingRepo.findOne({ where: { userId: user.id, clothesId } });
    if (existing) {
      const cloth = await this.dataSource.getRepository(Clothes).findOne({ where: { id: clothesId, userId: user.id } });
      if (removeAll || !cloth?.isCumulative || (existing.quantity || 1) <= quantityToRemove) {
        await ironingRepo.delete({ id: existing.id });
      } else {
        existing.quantity = (existing.quantity || 1) - quantityToRemove;
        await ironingRepo.save(existing);
      }
    }
    const counts = await this.getLaundryCounts(user);
    return { removed: true, total: counts.ironingCount };
  }

  async clearIroning(user: AuthUser) {
    const ironingRepo = this.dataSource.getRepository(IroningItem);
    await ironingRepo.delete({ userId: user.id });
    return { cleared: true };
  }

  async getLaundryCounts(user: AuthUser) {
    const washingRes = await this.dataSource
      .getRepository(WashingItem)
      .createQueryBuilder('w')
      .where('w.userId = :userId', { userId: user.id })
      .select('COALESCE(SUM(w.quantity), 0)', 'total')
      .getRawOne();
    const ironingRes = await this.dataSource
      .getRepository(IroningItem)
      .createQueryBuilder('i')
      .where('i.userId = :userId', { userId: user.id })
      .select('COALESCE(SUM(i.quantity), 0)', 'total')
      .getRawOne();

    return {
      washingCount: Number(washingRes?.total ?? 0),
      ironingCount: Number(ironingRes?.total ?? 0),
    };
  }
}
