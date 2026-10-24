import { TestBed } from '@angular/core/testing';
import { WARDROBE_SELECTION_STORAGE_KEY, WardrobeSelectionService } from './wardrobe-selection.service';

describe('WardrobeSelectionService', () => {
  let service: WardrobeSelectionService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    service = TestBed.inject(WardrobeSelectionService);
  });

  afterEach(() => {
    service.ngOnDestroy();
    localStorage.clear();
  });

  it('should be initialized with empty selection when localStorage is empty', () => {
    expect(service.count()).toBe(0);
    expect(service.hasSelection()).toBe(false);
    expect(service.selectedIds()).toEqual([]);
  });

  it('should load initial selection from localStorage if present', () => {
    localStorage.setItem(WARDROBE_SELECTION_STORAGE_KEY, JSON.stringify(['stored-1', 'stored-2']));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const newService = TestBed.inject(WardrobeSelectionService);

    expect(newService.count()).toBe(2);
    expect(newService.isSelected('stored-1')).toBe(true);
    expect(newService.isSelected('stored-2')).toBe(true);
    newService.ngOnDestroy();
  });

  it('should handle corrupted JSON in localStorage gracefully', () => {
    localStorage.setItem(WARDROBE_SELECTION_STORAGE_KEY, 'invalid-json{');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const newService = TestBed.inject(WardrobeSelectionService);

    expect(newService.count()).toBe(0);
    expect(newService.hasSelection()).toBe(false);
    newService.ngOnDestroy();
  });

  it('should toggle selection and persist to localStorage', () => {
    service.toggle('item-1');
    expect(service.isSelected('item-1')).toBe(true);
    expect(service.count()).toBe(1);
    expect(service.hasSelection()).toBe(true);
    expect(JSON.parse(localStorage.getItem(WARDROBE_SELECTION_STORAGE_KEY)!)).toEqual(['item-1']);

    service.toggle('item-1');
    expect(service.isSelected('item-1')).toBe(false);
    expect(service.count()).toBe(0);
    expect(service.hasSelection()).toBe(false);
    expect(localStorage.getItem(WARDROBE_SELECTION_STORAGE_KEY)).toBeNull();
  });

  it('should support select and deselect and sync to localStorage', () => {
    service.select('item-1');
    service.select('item-2');
    expect(service.count()).toBe(2);
    expect(service.isSelected('item-1')).toBe(true);
    expect(service.isSelected('item-2')).toBe(true);
    expect(JSON.parse(localStorage.getItem(WARDROBE_SELECTION_STORAGE_KEY)!)).toEqual(['item-1', 'item-2']);

    service.deselect('item-1');
    expect(service.count()).toBe(1);
    expect(service.isSelected('item-1')).toBe(false);
    expect(service.isSelected('item-2')).toBe(true);
    expect(JSON.parse(localStorage.getItem(WARDROBE_SELECTION_STORAGE_KEY)!)).toEqual(['item-2']);
  });

  it('should support selectMany and deselectMany and sync to localStorage', () => {
    service.selectMany(['item-1', 'item-2', 'item-3']);
    expect(service.count()).toBe(3);
    expect(JSON.parse(localStorage.getItem(WARDROBE_SELECTION_STORAGE_KEY)!)).toEqual(['item-1', 'item-2', 'item-3']);

    service.deselectMany(['item-2', 'item-3']);
    expect(service.count()).toBe(1);
    expect(service.selectedIds()).toEqual(['item-1']);
    expect(JSON.parse(localStorage.getItem(WARDROBE_SELECTION_STORAGE_KEY)!)).toEqual(['item-1']);
  });

  it('should clear selection and remove key from localStorage', () => {
    service.selectMany(['item-1', 'item-2']);
    expect(service.count()).toBe(2);
    expect(localStorage.getItem(WARDROBE_SELECTION_STORAGE_KEY)).not.toBeNull();

    service.clear();
    expect(service.count()).toBe(0);
    expect(service.hasSelection()).toBe(false);
    expect(service.selectedIds()).toEqual([]);
    expect(localStorage.getItem(WARDROBE_SELECTION_STORAGE_KEY)).toBeNull();
  });

  it('should synchronize when storage event occurs on window', () => {
    localStorage.setItem(WARDROBE_SELECTION_STORAGE_KEY, JSON.stringify(['remote-1']));
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: WARDROBE_SELECTION_STORAGE_KEY,
        newValue: JSON.stringify(['remote-1'])
      })
    );

    expect(service.isSelected('remote-1')).toBe(true);
    expect(service.count()).toBe(1);
  });
});
