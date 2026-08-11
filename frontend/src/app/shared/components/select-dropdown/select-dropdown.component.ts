import { CommonModule } from '@angular/common';
import { OverlayModule } from '@angular/cdk/overlay';
import { Component, ElementRef, EventEmitter, Output, QueryList, ViewChild, ViewChildren, computed, effect, input, signal } from '@angular/core';

export interface SelectDropdownOption {
  id: string;
  label: string;
  emoji?: string | null;
  swatch?: string | null;
}

@Component({
  selector: 'app-select-dropdown',
  standalone: true,
  imports: [CommonModule, OverlayModule],
  templateUrl: './select-dropdown.component.html',
  styleUrl: './select-dropdown.component.scss',
})
export class SelectDropdownComponent {
  readonly label = input('');
  readonly placeholder = input('Seleziona');
  readonly options = input<SelectDropdownOption[]>([]);
  readonly selectedId = input('');
  readonly invalid = input(false);
  readonly searchable = input(false);

  @Output() selectedIdChange = new EventEmitter<string>();

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  @ViewChildren('optionButton') optionButtons?: QueryList<ElementRef<HTMLButtonElement>>;

  readonly open = signal(false);
  readonly searchTerm = signal('');
  readonly activeIndex = signal(-1);

  readonly selectedLabel = computed(() => {
    const selectedId = this.selectedId();
    if (!selectedId) {
      return this.placeholder();
    }

    const selected = this.options().find((option) => option.id === selectedId);
    return selected?.label ?? this.placeholder();
  });

  readonly filteredOptions = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const options = this.options();
    if (!term) {
      return options;
    }

    return options.filter((option) => option.label.toLowerCase().includes(term));
  });

  constructor() {
    effect(() => {
      const options = this.filteredOptions();
      const current = this.activeIndex();
      if (options.length === 0) {
        if (current !== -1) {
          this.activeIndex.set(-1);
        }
        return;
      }

      if (current < 0 || current >= options.length) {
        this.activeIndex.set(0);
      }
    });
  }

  togglePanel() {
    if (this.open()) {
      this.closePanel();
      return;
    }

    this.openPanel();
  }

  openPanel() {
    this.open.set(true);
    if (this.searchable()) {
      this.searchTerm.set('');
    }
    this.syncActiveToSelected();
    setTimeout(() => {
      if (!this.open()) {
        return;
      }

      if (this.searchable()) {
        this.searchInput?.nativeElement.focus();
        return;
      }

      this.focusActiveOption();
    });
  }

  closePanel() {
    this.open.set(false);
    this.activeIndex.set(-1);
    this.searchTerm.set('');
  }

  selectOption(id: string) {
    this.selectedIdChange.emit(id);
    this.closePanel();
  }

  onTriggerKeydown(event: KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();

    if (!this.open()) {
      this.openPanel();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      this.selectActive();
    }
  }

  onSearchInput(value: string) {
    this.searchTerm.set(value);
    this.activeIndex.set(0);
  }

  onPanelKeydown(event: KeyboardEvent) {
    if (!this.open()) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveActive(-1);
        break;
      case 'Enter':
        event.preventDefault();
        this.selectActive();
        break;
      case 'Escape':
        event.preventDefault();
        this.closePanel();
        break;
      default:
        break;
    }
  }

  private moveActive(delta: number) {
    const options = this.filteredOptions();
    if (options.length === 0) {
      return;
    }

    const current = this.activeIndex();
    const next = current < 0 ? 0 : (current + delta + options.length) % options.length;
    this.activeIndex.set(next);
    this.focusActiveOption();
  }

  private selectActive() {
    const options = this.filteredOptions();
    const index = this.activeIndex();
    if (index < 0 || index >= options.length) {
      return;
    }

    this.selectOption(options[index].id);
  }

  private syncActiveToSelected() {
    const options = this.filteredOptions();
    const selectedIndex = options.findIndex((option) => option.id === this.selectedId());
    this.activeIndex.set(selectedIndex >= 0 ? selectedIndex : options.length > 0 ? 0 : -1);
  }

  private focusActiveOption() {
    setTimeout(() => {
      const button = this.optionButtons?.get(this.activeIndex())?.nativeElement;
      button?.focus();
      button?.scrollIntoView({ block: 'nearest' });
    });
  }
}
