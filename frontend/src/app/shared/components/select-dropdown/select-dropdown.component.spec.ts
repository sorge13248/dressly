import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SelectDropdownComponent, SelectDropdownOption } from './select-dropdown.component';

@Component({
  standalone: true,
  imports: [SelectDropdownComponent],
  template: `
    <app-select-dropdown
      [label]="label()"
      [placeholder]="placeholder()"
      [options]="options()"
      [selectedId]="selectedId()"
      [clearable]="clearable()"
      [searchable]="searchable()"
      (selectedIdChange)="onSelectedIdChange($event)"
    />
  `,
})
class TestDropdownHostComponent {
  label = signal('');
  placeholder = signal('Seleziona');
  options = signal<SelectDropdownOption[]>([
    { id: 'opt-1', label: 'Opzione 1' },
    { id: 'opt-2', label: 'Opzione 2' },
    { id: 'opt-3', label: 'Opzione 3' },
  ]);
  selectedId = signal('');
  clearable = signal(true);
  searchable = signal(false);

  emittedValue: string | null = null;

  onSelectedIdChange(val: string) {
    this.emittedValue = val;
    this.selectedId.set(val);
  }
}

describe('SelectDropdownComponent', () => {
  let fixture: ComponentFixture<TestDropdownHostComponent>;
  let host: TestDropdownHostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestDropdownHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestDropdownHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should render trigger with placeholder when no value is selected', () => {
    const triggerValue = fixture.nativeElement.querySelector('.trigger-value');
    expect(triggerValue?.textContent?.trim()).toBe('Seleziona');
    expect(fixture.nativeElement.querySelector('.trigger-clear')).toBeNull();
  });

  it('should render selected label and clear button when a value is selected', () => {
    host.selectedId.set('opt-1');
    fixture.detectChanges();

    const triggerValue = fixture.nativeElement.querySelector('.trigger-value');
    expect(triggerValue?.textContent?.trim()).toBe('Opzione 1');

    const clearBtn = fixture.nativeElement.querySelector('.trigger-clear');
    expect(clearBtn).not.toBeNull();
    expect(clearBtn?.getAttribute('aria-label')).toBe('Annulla selezione');
  });

  it('should not show clear button when clearable is false', () => {
    host.selectedId.set('opt-1');
    host.clearable.set(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.trigger-clear')).toBeNull();
  });

  it('should clear selection when clicking trigger-clear button without opening panel', () => {
    host.selectedId.set('opt-1');
    fixture.detectChanges();

    const clearBtn = fixture.nativeElement.querySelector('.trigger-clear') as HTMLButtonElement;
    expect(clearBtn).not.toBeNull();

    clearBtn.click();
    fixture.detectChanges();

    expect(host.emittedValue).toBe('');
    expect(host.selectedId()).toBe('');
    expect(fixture.nativeElement.querySelector('.trigger-clear')).toBeNull();
  });

  it('should open panel and select an option', () => {
    const trigger = fixture.nativeElement.querySelector('.trigger') as HTMLElement;
    trigger.click();
    fixture.detectChanges();

    const options = document.querySelectorAll('.option-row');
    expect(options.length).toBe(3);

    (options[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(host.emittedValue).toBe('opt-2');
  });

  it('should clear selection when clicking the already selected option in the panel if clearable', () => {
    host.selectedId.set('opt-2');
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.trigger') as HTMLElement;
    trigger.click();
    fixture.detectChanges();

    // Option 2 is selected. In the panel there is also a clear-option at the top.
    const activeOption = document.querySelector('.option-row.active') as HTMLButtonElement;
    expect(activeOption).not.toBeNull();

    activeOption.click();
    fixture.detectChanges();

    expect(host.emittedValue).toBe('');
    expect(host.selectedId()).toBe('');
  });

  it('should render and handle clear-option row in panel when value is selected and no empty option', () => {
    host.selectedId.set('opt-1');
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.trigger') as HTMLElement;
    trigger.click();
    fixture.detectChanges();

    const clearOption = document.querySelector('.clear-option') as HTMLButtonElement;
    expect(clearOption).not.toBeNull();
    expect(clearOption.textContent).toContain('Annulla selezione');

    clearOption.click();
    fixture.detectChanges();

    expect(host.emittedValue).toBe('');
    expect(host.selectedId()).toBe('');
  });

  it('should clear selection on Backspace or Delete keydown on trigger', () => {
    host.selectedId.set('opt-1');
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.trigger') as HTMLElement;
    const event = new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true });
    trigger.dispatchEvent(event);
    fixture.detectChanges();

    expect(host.emittedValue).toBe('');
    expect(host.selectedId()).toBe('');
  });

  it('should open panel on trigger click without clearing value when wrapped inside a label', () => {
    // Simulate embedding in a parent <label> like in forms
    const labelWrapper = document.createElement('label');
    const compEl = fixture.nativeElement.querySelector('app-select-dropdown');
    compEl.parentNode.insertBefore(labelWrapper, compEl);
    labelWrapper.appendChild(compEl);

    host.selectedId.set('opt-1');
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.trigger') as HTMLButtonElement;
    const clearBtn = fixture.nativeElement.querySelector('.trigger-clear') as HTMLButtonElement;
    expect(clearBtn).not.toBeNull();

    // Clicking the trigger button must open the panel, NOT clear the value
    trigger.click();
    fixture.detectChanges();

    expect(host.selectedId()).toBe('opt-1');
    const panel = document.querySelector('.panel');
    expect(panel).not.toBeNull();
  });
});
