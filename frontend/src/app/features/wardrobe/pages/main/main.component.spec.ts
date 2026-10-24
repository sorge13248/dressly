import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { WardrobePageComponent } from './main.component';
import { ClothesItem } from '../../../../core/models';

describe('WardrobePageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WardrobePageComponent, RouterTestingModule],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should default per_page to 50', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;
    expect(component.filters().per_page).toBe(50);
  });

  it('should update per_page and reset page to 1 when setPerPage is called', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;

    component.setPage(3);
    expect(component.filters().page).toBe(3);

    component.setPerPage(25);
    expect(component.filters().per_page).toBe(25);
    expect(component.filters().page).toBe(1);
  });

  it('should handle onPerPageChange event', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;

    const select = document.createElement('select');
    const option = document.createElement('option');
    option.value = '100';
    select.appendChild(option);
    select.value = '100';

    const event = { target: select } as unknown as Event;
    component.onPerPageChange(event);

    expect(component.filters().per_page).toBe(100);
  });

  it('should include custom per_page in pageSizeOptions if set to non-default', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;

    expect(component.pageSizeOptions()).toEqual([12, 25, 50, 100]);

    component.setPerPage(30);
    expect(component.pageSizeOptions()).toEqual([12, 25, 30, 50, 100]);
  });

  it('should render page size select in footer when items exist', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;

    const fakeItem = {
      id: 'item-1',
      name: 'Maglietta',
      userId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ClothesItem;

    component.items.set([fakeItem]);
    component.total.set(1);
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('.pager-size-select') as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    expect(select?.value).toBe('50');

    const options = fixture.nativeElement.querySelectorAll('.pager-size-select option');
    expect(options.length).toBe(4);
  });

  it('should update per_page when user selects a different option from the dropdown', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;

    const fakeItem = {
      id: 'item-1',
      name: 'Maglietta',
      userId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ClothesItem;

    component.items.set([fakeItem]);
    component.total.set(1);
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('.pager-size-select') as HTMLSelectElement;
    select.value = '25';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.filters().per_page).toBe(25);
    expect(component.filters().page).toBe(1);
  });

  it('should render a vertical separator in search-banner next to "Nuovo vestito"', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    fixture.detectChanges();

    const separator = fixture.nativeElement.querySelector('.search-banner .banner-separator');
    expect(separator).not.toBeNull();

    const newDressBtn = fixture.nativeElement.querySelector('.search-banner a.primary');
    expect(newDressBtn).not.toBeNull();
    expect(newDressBtn?.textContent).toContain('Nuovo vestito');
  });

  it('should render aero checkbox on each item card and toggle selection', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;
    vi.spyOn(component, 'load').mockImplementation(async () => {});
    component.selectionService.clear();

    const fakeItem = {
      id: 'item-10',
      name: 'Pantaloni',
      userId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ClothesItem;

    component.items.set([fakeItem]);
    component.total.set(1);
    component.loading.set(false);
    component.error.set(null);
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.item-card');
    expect(card).not.toBeNull();
    expect(card.classList.contains('selected')).toBe(false);

    const checkbox = fixture.nativeElement.querySelector('.aero-checkbox-input') as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(false);

    // Toggle selection
    component.toggleSelection('item-10');
    fixture.detectChanges();

    expect(component.selectionService.isSelected('item-10')).toBe(true);
    expect(card.classList.contains('selected')).toBe(true);
    expect(checkbox.checked).toBe(true);
  });

  it('should show selection toolbar with "Stira" button only when items are selected', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;
    component.selectionService.clear();
    fixture.detectChanges();

    let toolbar = fixture.nativeElement.querySelector('.selection-toolbar');
    expect(toolbar).toBeNull();

    component.selectionService.select('item-10');
    fixture.detectChanges();

    toolbar = fixture.nativeElement.querySelector('.selection-toolbar');
    expect(toolbar).not.toBeNull();
    expect(toolbar.textContent).toContain('1 vestito selezionato');

    const ironBtn = toolbar.querySelector('.toolbar-action-btn') as HTMLButtonElement;
    expect(ironBtn).not.toBeNull();
    expect(ironBtn.textContent).toContain('Stira');

    // Clicking deseleziona clears selection and hides toolbar
    const deselectBtn = toolbar.querySelector('.toolbar-btn') as HTMLButtonElement;
    deselectBtn.click();
    fixture.detectChanges();

    expect(component.selectionService.hasSelection()).toBe(false);
    toolbar = fixture.nativeElement.querySelector('.selection-toolbar');
    expect(toolbar).toBeNull();
  });

  it('should maintain selected item IDs across page changes', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;
    component.selectionService.clear();

    component.selectionService.select('item-page-1');
    expect(component.selectionService.isSelected('item-page-1')).toBe(true);

    // Change page
    component.setPage(2);
    expect(component.filters().page).toBe(2);
    expect(component.selectionService.isSelected('item-page-1')).toBe(true);

    component.setPage(3);
    expect(component.filters().page).toBe(3);
    expect(component.selectionService.isSelected('item-page-1')).toBe(true);
  });

  it('should navigate to /wardrobe/ironing when "Stira" button is clicked', () => {
    const fixture = TestBed.createComponent(WardrobePageComponent);
    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));

    component.selectionService.clear();
    component.selectionService.selectMany(['item-1', 'item-2']);
    fixture.detectChanges();

    const ironBtn = fixture.nativeElement.querySelector('.toolbar-action-btn') as HTMLButtonElement;
    ironBtn.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/wardrobe/ironing'], {
      queryParams: { ids: 'item-1,item-2' },
    });
  });
});