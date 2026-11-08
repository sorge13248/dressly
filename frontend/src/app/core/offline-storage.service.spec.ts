import { TestBed } from '@angular/core/testing';
import { OfflineStorageService } from './offline-storage.service';
import { ClothesItem } from './models';

describe('OfflineStorageService', () => {
  let service: OfflineStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [OfflineStorageService],
    });
    service = TestBed.inject(OfflineStorageService);
  });

  describe('isTagCodeAvailable', () => {
    it('should return false for invalid formats', async () => {
      expect(await service.isTagCodeAvailable('')).toBe(false);
      expect(await service.isTagCodeAvailable('A')).toBe(false);
      expect(await service.isTagCodeAvailable('AB')).toBe(false);
      expect(await service.isTagCodeAvailable('ABCD')).toBe(false);
      expect(await service.isTagCodeAvailable('A-1')).toBe(false);
      expect(await service.isTagCodeAvailable('   ')).toBe(false);
    });

    it('should return true when store is empty and format is valid', async () => {
      expect(await service.isTagCodeAvailable('7KX')).toBe(true);
      expect(await service.isTagCodeAvailable('abc')).toBe(true);
    });

    it('should return false if another cloth has the same code (case-insensitive)', async () => {
      const existingCloth: ClothesItem = {
        id: 'cloth-1',
        userId: 'user-1',
        code: '7KX',
        name: 'Camicia',
        size: 'M',
        notes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await service.saveClothes([existingCloth]);

      expect(await service.isTagCodeAvailable('7KX')).toBe(false);
      expect(await service.isTagCodeAvailable('7kx')).toBe(false);
      expect(await service.isTagCodeAvailable(' 7KX ')).toBe(false);
    });

    it('should return true if colliding cloth matches excludeId', async () => {
      const existingCloth: ClothesItem = {
        id: 'cloth-1',
        userId: 'user-1',
        code: '7KX',
        name: 'Camicia',
        size: 'M',
        notes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await service.saveClothes([existingCloth]);

      expect(await service.isTagCodeAvailable('7KX', 'cloth-1')).toBe(true);
      expect(await service.isTagCodeAvailable('7kx', 'cloth-1')).toBe(true);
      expect(await service.isTagCodeAvailable('7KX', 'cloth-different')).toBe(false);
    });

    it('should return true for an unused 3-character code', async () => {
      const existingCloth: ClothesItem = {
        id: 'cloth-1',
        userId: 'user-1',
        code: '7KX',
        name: 'Camicia',
        size: 'M',
        notes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await service.saveClothes([existingCloth]);

      expect(await service.isTagCodeAvailable('9AB')).toBe(true);
    });
  });

  describe('queryClothes sorting', () => {
    const baseDate = new Date('2026-01-01T10:00:00.000Z');
    const clothA = {
      id: 'cloth-a',
      userId: 'user-1',
      code: 'ZZZ',
      name: 'Zebra Giacca',
      type: { id: 't-3', name: 'Giacca' },
      seasons: [{ id: 's-1', name: 'Inverno' }],
      createdAt: new Date(baseDate.getTime() + 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as ClothesItem;
    const clothB = {
      id: 'cloth-b',
      userId: 'user-1',
      code: 'AAA',
      name: 'Apple T-shirt',
      type: { id: 't-1', name: 'T-shirt' },
      seasons: [{ id: 's-2', name: 'Autunno' }],
      createdAt: new Date(baseDate.getTime() + 2000).toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as ClothesItem;
    const clothC = {
      id: 'cloth-c',
      userId: 'user-1',
      code: 'MMM',
      name: 'Banana Pantalone',
      type: { id: 't-2', name: 'Pantaloni' },
      seasons: [{ id: 's-3', name: 'Primavera' }],
      createdAt: new Date(baseDate.getTime() + 3000).toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as ClothesItem;

    beforeEach(async () => {
      await service.saveClothes([clothA, clothB, clothC]);
    });

    it('should sort by name ascending and descending', async () => {
      const asc = await service.queryClothes({ search: '', brand_id: '', fit_id: '', size: '', color_ids: [], material_ids: [], season_ids: [], temperature_ids: [], use_case_ids: [], type_ids: [], tag_ids: [], sort: 'name_asc', page: 1, per_page: 10 });
      expect(asc.items.map((i) => i.name)).toEqual(['Apple T-shirt', 'Banana Pantalone', 'Zebra Giacca']);

      const desc = await service.queryClothes({ search: '', brand_id: '', fit_id: '', size: '', color_ids: [], material_ids: [], season_ids: [], temperature_ids: [], use_case_ids: [], type_ids: [], tag_ids: [], sort: 'name_desc', page: 1, per_page: 10 });
      expect(desc.items.map((i) => i.name)).toEqual(['Zebra Giacca', 'Banana Pantalone', 'Apple T-shirt']);
    });

    it('should sort by code ascending', async () => {
      const res = await service.queryClothes({ search: '', brand_id: '', fit_id: '', size: '', color_ids: [], material_ids: [], season_ids: [], temperature_ids: [], use_case_ids: [], type_ids: [], tag_ids: [], sort: 'code_asc', page: 1, per_page: 10 });
      expect(res.items.map((i) => i.code)).toEqual(['AAA', 'MMM', 'ZZZ']);
    });

    it('should sort by type order (wardrobe hierarchy) and type alphabetical', async () => {
      const resOrder = await service.queryClothes({ search: '', brand_id: '', fit_id: '', size: '', color_ids: [], material_ids: [], season_ids: [], temperature_ids: [], use_case_ids: [], type_ids: [], tag_ids: [], sort: 'type_order', page: 1, per_page: 10 });
      // T-shirt (tops rank 10), Giacca (outerwear rank 30), Pantaloni (bottoms rank 40)
      expect(resOrder.items.map((i) => i.type?.name)).toEqual(['T-shirt', 'Giacca', 'Pantaloni']);

      const resAsc = await service.queryClothes({ search: '', brand_id: '', fit_id: '', size: '', color_ids: [], material_ids: [], season_ids: [], temperature_ids: [], use_case_ids: [], type_ids: [], tag_ids: [], sort: 'type_asc', page: 1, per_page: 10 });
      expect(resAsc.items.map((i) => i.type?.name)).toEqual(['Giacca', 'Pantaloni', 'T-shirt']);
    });

    it('should sort by availability', async () => {
      // Put clothB in washing, clothC in ironing, clothA clean
      await service.saveLaundry({ washing: [clothB.id], ironing: [clothC.id] });
      const res = await service.queryClothes({ search: '', brand_id: '', fit_id: '', size: '', color_ids: [], material_ids: [], season_ids: [], temperature_ids: [], use_case_ids: [], type_ids: [], tag_ids: [], sort: 'availability', page: 1, per_page: 10 });
      expect(res.items[0].id).toBe(clothA.id);
      expect(res.items[1].id).toBe(clothC.id);
      expect(res.items[2].id).toBe(clothB.id);
    });

    it('should sort by created date ascending and descending', async () => {
      const asc = await service.queryClothes({ search: '', brand_id: '', fit_id: '', size: '', color_ids: [], material_ids: [], season_ids: [], temperature_ids: [], use_case_ids: [], type_ids: [], tag_ids: [], sort: 'created_asc', page: 1, per_page: 10 });
      expect(asc.items.map((i) => i.id)).toEqual(['cloth-a', 'cloth-b', 'cloth-c']);

      const desc = await service.queryClothes({ search: '', brand_id: '', fit_id: '', size: '', color_ids: [], material_ids: [], season_ids: [], temperature_ids: [], use_case_ids: [], type_ids: [], tag_ids: [], sort: 'created_desc', page: 1, per_page: 10 });
      expect(desc.items.map((i) => i.id)).toEqual(['cloth-c', 'cloth-b', 'cloth-a']);
    });
  });
});
