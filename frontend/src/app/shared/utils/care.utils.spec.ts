import { describe, expect, it } from 'vitest';
import {
  CARE_LABELS,
  CARE_TOOLTIPS,
  canIron,
  canWash,
  getIroningLabel,
  getIroningStatus,
  getIroningTooltip,
  getWashingLabel,
  getWashingStatus,
  getWashingTooltip,
} from './care.utils';
import { ClothesItem } from '../../core/models';

describe('care.utils', () => {
  describe('getIroningStatus & canIron', () => {
    it('should return missing_info and canIron=false for null or undefined item', () => {
      expect(getIroningStatus(null)).toBe('missing_info');
      expect(canIron(null)).toBe(false);
      expect(getIroningStatus(undefined)).toBe('missing_info');
      expect(canIron(undefined)).toBe(false);
    });

    it('should return missing_info and canIron=false when ironingInstruction is missing', () => {
      const item = { id: 'c1' } as ClothesItem;
      expect(getIroningStatus(item)).toBe('missing_info');
      expect(canIron(item)).toBe(false);
    });

    it('should return missing_info when ironingInstruction exists but ironType is null or empty', () => {
      const item = {
        id: 'c1',
        ironingInstruction: { ironType: null },
      } as unknown as ClothesItem;
      expect(getIroningStatus(item)).toBe('missing_info');
      expect(canIron(item)).toBe(false);
    });

    it('should return cannot_iron and canIron=false when ironType is "no"', () => {
      const item = {
        id: 'c1',
        ironingInstruction: { ironType: 'no' },
      } as unknown as ClothesItem;
      expect(getIroningStatus(item)).toBe('cannot_iron');
      expect(canIron(item)).toBe(false);
    });

    it('should handle snake_case iron_type="no"', () => {
      const item = {
        id: 'c1',
        ironingInstruction: { iron_type: 'no' },
      } as unknown as ClothesItem;
      expect(getIroningStatus(item)).toBe('cannot_iron');
      expect(canIron(item)).toBe(false);
    });

    it('should return can_iron and canIron=true when ironType is "yes"', () => {
      const item = {
        id: 'c1',
        ironingInstruction: { ironType: 'yes' },
      } as unknown as ClothesItem;
      expect(getIroningStatus(item)).toBe('can_iron');
      expect(canIron(item)).toBe(true);
    });

    it('should return can_iron and canIron=true when ironType is "without_steam"', () => {
      const item = {
        id: 'c1',
        ironingInstruction: { ironType: 'without_steam' },
      } as unknown as ClothesItem;
      expect(getIroningStatus(item)).toBe('can_iron');
      expect(canIron(item)).toBe(true);
    });
  });

  describe('getWashingStatus & canWash', () => {
    it('should return missing_info and canWash=false for null or undefined item', () => {
      expect(getWashingStatus(null)).toBe('missing_info');
      expect(canWash(null)).toBe(false);
      expect(getWashingStatus(undefined)).toBe('missing_info');
      expect(canWash(undefined)).toBe(false);
    });

    it('should return missing_info and canWash=false when washingInstruction is missing', () => {
      const item = { id: 'c1' } as ClothesItem;
      expect(getWashingStatus(item)).toBe('missing_info');
      expect(canWash(item)).toBe(false);
    });

    it('should return cannot_wash and canWash=false when washType is "do_not_wash"', () => {
      const item = {
        id: 'c1',
        washingInstruction: { washType: 'do_not_wash' },
      } as unknown as ClothesItem;
      expect(getWashingStatus(item)).toBe('cannot_wash');
      expect(canWash(item)).toBe(false);
    });

    it('should handle snake_case wash_type="do_not_wash"', () => {
      const item = {
        id: 'c1',
        washingInstruction: { wash_type: 'do_not_wash' },
      } as unknown as ClothesItem;
      expect(getWashingStatus(item)).toBe('cannot_wash');
      expect(canWash(item)).toBe(false);
    });

    it('should return can_wash and canWash=true when washType is "washer_ok"', () => {
      const item = {
        id: 'c1',
        washingInstruction: { washType: 'washer_ok' },
      } as unknown as ClothesItem;
      expect(getWashingStatus(item)).toBe('can_wash');
      expect(canWash(item)).toBe(true);
    });

    it('should return can_wash and canWash=true when washType is "hand_wash_only"', () => {
      const item = {
        id: 'c1',
        washingInstruction: { washType: 'hand_wash_only' },
      } as unknown as ClothesItem;
      expect(getWashingStatus(item)).toBe('can_wash');
      expect(canWash(item)).toBe(true);
    });

    it('should return can_wash when washingInstruction has temperature or washingProgram', () => {
      const itemWithTemp = {
        id: 'c1',
        washingInstruction: { temperature: '30' },
      } as unknown as ClothesItem;
      expect(getWashingStatus(itemWithTemp)).toBe('can_wash');
      expect(canWash(itemWithTemp)).toBe(true);

      const itemWithProg = {
        id: 'c2',
        washingInstruction: { washingProgramId: 'wp-1' },
      } as unknown as ClothesItem;
      expect(getWashingStatus(itemWithProg)).toBe('can_wash');
      expect(canWash(itemWithProg)).toBe(true);
    });
  });

  describe('CARE_LABELS & label getters', () => {
    it('should have initial uppercase for all centralized labels', () => {
      expect(CARE_LABELS.ironing.cannot_iron).toBe('Il capo non va stirato');
      expect(CARE_LABELS.ironing.missing_info).toBe('Informazioni stiraggio mancanti');
      expect(CARE_LABELS.washing.cannot_wash).toBe('Il capo non va lavato');
      expect(CARE_LABELS.washing.missing_info).toBe('Informazioni lavaggio mancanti');
    });

    it('should return correct labels via getIroningLabel', () => {
      expect(getIroningLabel('cannot_iron')).toBe('Il capo non va stirato');
      expect(getIroningLabel('missing_info')).toBe('Informazioni stiraggio mancanti');
      expect(getIroningLabel('can_iron')).toBeNull();

      const itemCannot = { ironingInstruction: { ironType: 'no' } } as unknown as ClothesItem;
      expect(getIroningLabel(itemCannot)).toBe('Il capo non va stirato');

      const itemMissing = {} as ClothesItem;
      expect(getIroningLabel(itemMissing)).toBe('Informazioni stiraggio mancanti');

      const itemCan = { ironingInstruction: { ironType: 'yes' } } as unknown as ClothesItem;
      expect(getIroningLabel(itemCan)).toBeNull();
    });

    it('should return correct labels via getWashingLabel', () => {
      expect(getWashingLabel('cannot_wash')).toBe('Il capo non va lavato');
      expect(getWashingLabel('missing_info')).toBe('Informazioni lavaggio mancanti');
      expect(getWashingLabel('can_wash')).toBeNull();

      const itemCannot = { washingInstruction: { washType: 'do_not_wash' } } as unknown as ClothesItem;
      expect(getWashingLabel(itemCannot)).toBe('Il capo non va lavato');

      const itemMissing = {} as ClothesItem;
      expect(getWashingLabel(itemMissing)).toBe('Informazioni lavaggio mancanti');

      const itemCan = { washingInstruction: { washType: 'washer_ok' } } as unknown as ClothesItem;
      expect(getWashingLabel(itemCan)).toBeNull();
    });

    it('should return correct tooltips via getIroningTooltip and getWashingTooltip', () => {
      expect(getIroningTooltip('cannot_iron')).toBe('Questo capo non va stirato');
      expect(getIroningTooltip('missing_info')).toBe('Informazioni di stiratura non presenti o incomplete');
      expect(getIroningTooltip('can_iron')).toBeNull();

      expect(getWashingTooltip('cannot_wash')).toBe('Questo capo non va lavato');
      expect(getWashingTooltip('missing_info')).toBe('Informazioni di lavaggio non presenti o incomplete');
      expect(getWashingTooltip('can_wash')).toBeNull();
    });
  });
});
