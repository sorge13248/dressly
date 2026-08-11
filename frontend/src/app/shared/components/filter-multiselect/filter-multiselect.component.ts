import { CommonModule } from '@angular/common';
import { OverlayModule } from '@angular/cdk/overlay';
import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';

export interface FilterDropdownOption {
  id: string;
  label: string;
  emoji?: string | null;
  swatch?: string | null;
}

@Component({
  selector: 'app-filter-multiselect-dropdown',
  standalone: true,
  imports: [CommonModule, OverlayModule],
  templateUrl: './filter-multiselect.component.html',
  styleUrl: './filter-multiselect.component.scss',
})
export class FilterMultiselectDropdownComponent {
  @Input({ required: true }) label!: string;
  @Input() placeholder = 'Tutti';
  @Input() options: FilterDropdownOption[] = [];
  @Input() selectedIds: string[] = [];

  @Output() selectedIdsChange = new EventEmitter<string[]>();

  readonly open = signal(false);

  readonly triggerLabel = computed(() => {
    if (this.selectedIds.length === 0) {
      return this.placeholder;
    }

    const selectedSet = new Set(this.selectedIds);
    const selected = this.options.filter((option) => selectedSet.has(option.id));
    if (selected.length === 0) {
      return this.placeholder;
    }

    if (selected.length <= 2) {
      return selected.map((option) => option.label).join(', ');
    }

    return `${selected.length} selezionati`;
  });

  togglePanel() {
    this.open.update((value) => !value);
  }

  closePanel() {
    this.open.set(false);
  }

  onOptionToggle(id: string, checked: boolean) {
    const current = new Set(this.selectedIds);
    if (checked) {
      current.add(id);
    } else {
      current.delete(id);
    }

    this.selectedIdsChange.emit(Array.from(current));
  }

  clear() {
    if (this.selectedIds.length === 0) {
      return;
    }

    this.selectedIdsChange.emit([]);
  }
}
