import { TestBed } from '@angular/core/testing';
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
});