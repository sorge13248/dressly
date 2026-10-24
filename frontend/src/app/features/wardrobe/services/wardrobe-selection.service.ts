import { Injectable, OnDestroy, computed, signal } from '@angular/core';

export const WARDROBE_SELECTION_STORAGE_KEY = 'dressly_wardrobe_selected_ids';

@Injectable({ providedIn: 'root' })
export class WardrobeSelectionService implements OnDestroy {
  private readonly selectedIdsSignal = signal<Set<string>>(new Set<string>());

  /** Array of currently selected clothes IDs (persisted in browser localStorage) */
  readonly selectedIds = computed(() => Array.from(this.selectedIdsSignal()));

  /** Total number of selected items */
  readonly count = computed(() => this.selectedIdsSignal().size);

  /** True if at least one clothing item is selected */
  readonly hasSelection = computed(() => this.selectedIdsSignal().size > 0);

  constructor() {
    this.selectedIdsSignal.set(this.loadFromStorage());

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', this.onStorageChange);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', this.onStorageChange);
    }
  }

  private readonly onStorageChange = (event: StorageEvent): void => {
    if (event.key === WARDROBE_SELECTION_STORAGE_KEY) {
      this.selectedIdsSignal.set(this.loadFromStorage());
    }
  };

  private loadFromStorage(): Set<string> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(WARDROBE_SELECTION_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return new Set(parsed.filter((id) => typeof id === 'string'));
          }
        }
      }
    } catch {
      // Ignored: handle restricted access or malformed JSON
    }
    return new Set<string>();
  }

  private saveToStorage(set: Set<string>): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        if (set.size === 0) {
          window.localStorage.removeItem(WARDROBE_SELECTION_STORAGE_KEY);
        } else {
          window.localStorage.setItem(WARDROBE_SELECTION_STORAGE_KEY, JSON.stringify(Array.from(set)));
        }
      }
    } catch {
      // Ignored: storage quota exceeded or restricted
    }
  }

  private setSelection(next: Set<string>): void {
    this.selectedIdsSignal.set(next);
    this.saveToStorage(next);
  }

  /** Returns whether a given clothing item ID is selected */
  isSelected(id: string): boolean {
    return this.selectedIdsSignal().has(id);
  }

  /** Toggles selection of a given clothing item ID */
  toggle(id: string): void {
    const next = new Set(this.selectedIdsSignal());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.setSelection(next);
  }

  /** Selects a specific clothing item ID */
  select(id: string): void {
    if (this.selectedIdsSignal().has(id)) {
      return;
    }
    const next = new Set(this.selectedIdsSignal());
    next.add(id);
    this.setSelection(next);
  }

  /** Deselects a specific clothing item ID */
  deselect(id: string): void {
    if (!this.selectedIdsSignal().has(id)) {
      return;
    }
    const next = new Set(this.selectedIdsSignal());
    next.delete(id);
    this.setSelection(next);
  }

  /** Selects multiple clothing item IDs at once */
  selectMany(ids: string[]): void {
    const next = new Set(this.selectedIdsSignal());
    let modified = false;
    for (const id of ids) {
      if (!next.has(id)) {
        next.add(id);
        modified = true;
      }
    }
    if (modified) {
      this.setSelection(next);
    }
  }

  /** Deselects multiple clothing item IDs at once */
  deselectMany(ids: string[]): void {
    const next = new Set(this.selectedIdsSignal());
    let modified = false;
    for (const id of ids) {
      if (next.delete(id)) {
        modified = true;
      }
    }
    if (modified) {
      this.setSelection(next);
    }
  }

  /** Clears all selected clothing item IDs */
  clear(): void {
    if (this.selectedIdsSignal().size === 0) {
      this.saveToStorage(new Set<string>());
      return;
    }
    this.setSelection(new Set<string>());
  }
}
