import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ClothesCardComponent } from './clothes-card.component';
import { ClothesItem } from '../../../../core/models';

describe('ClothesCardComponent', () => {
  const fakeItem: ClothesItem = {
    id: 'item-card-1',
    name: 'Giacca Elegante',
    userId: 'user-1',
    brand: { id: 'brand-1', name: 'Armani', userId: 'user-1', logoUrl: null, sortOrder: 0, createdAt: '', updatedAt: '' },
    size: 'L',
    notes: 'In pura lana',
    isInWashing: false,
    isInIroning: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClothesCardComponent, RouterTestingModule],
    }).compileComponents();
  });

  it('should create and render basic item information', () => {
    const fixture = TestBed.createComponent(ClothesCardComponent);
    fixture.componentRef.setInput('item', fakeItem);
    fixture.detectChanges();

    const titleEl = fixture.nativeElement.querySelector('h3');
    expect(titleEl?.textContent).toContain('Giacca Elegante');

    const brandEl = fixture.nativeElement.querySelector('.brand');
    expect(brandEl?.textContent).toContain('Armani');

    const sizeEl = fixture.nativeElement.querySelector('.size-pill');
    expect(sizeEl?.textContent).toContain('L');
  });

  it('should render quick action buttons with outfit button in first position', () => {
    const fixture = TestBed.createComponent(ClothesCardComponent);
    fixture.componentRef.setInput('item', fakeItem);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('.quick-action-btn');
    expect(buttons.length).toBe(3);

    const outfitBtn = buttons[0] as HTMLButtonElement;
    expect(outfitBtn.getAttribute('title')).toBe('Aggiungi ad un abbinamento');
    expect(outfitBtn.querySelector('app-outfit-icon')).toBeTruthy();

    const washBtn = buttons[1] as HTMLButtonElement;
    expect(washBtn.getAttribute('title')).toBe('Metti a lavare');
    expect(washBtn.querySelector('app-washing-icon')).toBeTruthy();

    const ironBtn = buttons[2] as HTMLButtonElement;
    expect(ironBtn.getAttribute('title')).toBe('Metti a stirare');
    expect(ironBtn.querySelector('app-ironing-icon')).toBeTruthy();
  });

  it('should emit outfitClick when clicking outfit button', () => {
    const fixture = TestBed.createComponent(ClothesCardComponent);
    fixture.componentRef.setInput('item', fakeItem);
    fixture.detectChanges();

    const outfitSpy = vi.fn();
    fixture.componentInstance.outfitClick.subscribe(outfitSpy);

    const outfitBtn = fixture.nativeElement.querySelectorAll('.quick-action-btn')[0] as HTMLButtonElement;
    outfitBtn.click();

    expect(outfitSpy).toHaveBeenCalledTimes(1);
    expect(outfitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        item: fakeItem,
      }),
    );
  });

  it('should hide outfit button when showOutfit is false', () => {
    const fixture = TestBed.createComponent(ClothesCardComponent);
    fixture.componentRef.setInput('item', fakeItem);
    fixture.componentRef.setInput('showOutfit', false);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('.quick-action-btn');
    expect(buttons.length).toBe(2);

    expect(buttons[0].getAttribute('title')).toBe('Metti a lavare');
    expect(buttons[1].getAttribute('title')).toBe('Metti a stirare');
  });

  it('should disable quick action buttons when actionPending is true', () => {
    const fixture = TestBed.createComponent(ClothesCardComponent);
    fixture.componentRef.setInput('item', fakeItem);
    fixture.componentRef.setInput('actionPending', true);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('.quick-action-btn');
    buttons.forEach((btn: HTMLButtonElement) => {
      expect(btn.disabled).toBe(true);
    });
  });

  it('should render quantity badge for cumulative item in washing or ironing', () => {
    const fixture = TestBed.createComponent(ClothesCardComponent);
    const cumulativeItem: ClothesItem = {
      ...fakeItem,
      isCumulative: true,
      quantity: 5,
      isInWashing: true,
      washingQuantity: 3,
    };
    fixture.componentRef.setInput('item', cumulativeItem);
    fixture.detectChanges();

    const washingBadge = fixture.nativeElement.querySelector('.status-badge--washing');
    expect(washingBadge).toBeTruthy();
    const countBadge = washingBadge.querySelector('.status-badge-count');
    expect(countBadge).toBeTruthy();
    expect(countBadge.textContent.trim()).toBe('3');

    // Test ironing
    const ironingCumulativeItem: ClothesItem = {
      ...fakeItem,
      isCumulative: true,
      quantity: 5,
      isInIroning: true,
      ironingQuantity: 2,
    };
    fixture.componentRef.setInput('item', ironingCumulativeItem);
    fixture.detectChanges();

    const ironingBadge = fixture.nativeElement.querySelector('.status-badge--ironing');
    expect(ironingBadge).toBeTruthy();
    const ironCountBadge = ironingBadge.querySelector('.status-badge-count');
    expect(ironCountBadge).toBeTruthy();
    expect(ironCountBadge.textContent.trim()).toBe('2');
  });
});
