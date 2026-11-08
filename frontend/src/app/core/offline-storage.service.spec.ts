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
});
