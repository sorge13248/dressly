import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { ApiService } from '../../../../core/api.service';
import { IroningClothesItem } from '../../../../core/models';
import { IroningPageComponent } from './ironing.component';

describe('IroningPageComponent', () => {
  const fakeClothes: IroningClothesItem[] = [
    {
      id: 'cloth-missing',
      name: 'Giacca Vintage',
      brand: { id: 'b1', name: 'Zara' },
      type: { id: 't1', name: 'Giacca' },
      colors: [{ id: 'c1', name: 'Nero', hexCode: '#000000' }],
      ironingInstruction: null,
      primaryAttachment: null,
    },
    {
      id: 'cloth-dot1',
      name: null,
      brand: null,
      type: { id: 't2', name: 'Camicia' },
      colors: [{ id: 'c2', name: 'Seta Blu', hexCode: '#0000ff' }],
      ironingInstruction: {
        id: 'iron-1',
        temperature: '1',
        ironType: 'yes',
        ironInsideOut: false,
      },
      primaryAttachment: {
        id: 'att-1',
        fileName: 'shirt.webp',
        previewPath: 'shirt.preview.webp',
        mimeType: 'image/webp',
      },
    },
    {
      id: 'cloth-dot2',
      name: 'Maglione Misto',
      brand: null,
      type: { id: 't3', name: 'Maglione' },
      colors: [],
      ironingInstruction: {
        id: 'iron-2',
        temperature: '2',
        ironType: 'yes',
        ironInsideOut: true,
      },
      primaryAttachment: null,
    },
    {
      id: 'cloth-dot3',
      name: 'Pantaloni Lino',
      brand: null,
      type: { id: 't4', name: 'Pantaloni' },
      colors: [],
      ironingInstruction: {
        id: 'iron-3',
        temperature: '3',
        ironType: 'yes',
        ironInsideOut: false,
      },
      primaryAttachment: null,
    },
  ];

  let mockApiService: { getClothesForIroning: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockApiService = {
      getClothesForIroning: vi.fn().mockReturnValue(of({ items: fakeClothes })),
    };

    await TestBed.configureTestingModule({
      imports: [IroningPageComponent, RouterTestingModule],
      providers: [{ provide: ApiService, useValue: mockApiService }],
    }).compileComponents();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(IroningPageComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should correctly parse dots for various temperature values', () => {
    const fixture = TestBed.createComponent(IroningPageComponent);
    const comp = fixture.componentInstance;

    expect(comp.parseDots(fakeClothes[0])).toBeNull();
    expect(comp.parseDots(fakeClothes[1])).toBe(1);
    expect(comp.parseDots(fakeClothes[2])).toBe(2);
    expect(comp.parseDots(fakeClothes[3])).toBe(3);

    // Temperature in °C
    const cloth110: IroningClothesItem = {
      ...fakeClothes[1],
      ironingInstruction: { id: '1', temperature: '110', ironType: 'yes', ironInsideOut: false },
    };
    expect(comp.parseDots(cloth110)).toBe(1);

    const cloth150: IroningClothesItem = {
      ...fakeClothes[1],
      ironingInstruction: { id: '1', temperature: '150', ironType: 'yes', ironInsideOut: false },
    };
    expect(comp.parseDots(cloth150)).toBe(2);

    const cloth200: IroningClothesItem = {
      ...fakeClothes[1],
      ironingInstruction: { id: '1', temperature: '200', ironType: 'yes', ironInsideOut: false },
    };
    expect(comp.parseDots(cloth200)).toBe(3);

    // Do not iron
    const clothNoIron: IroningClothesItem = {
      ...fakeClothes[1],
      ironingInstruction: { id: '1', temperature: '2', ironType: 'no', ironInsideOut: false },
    };
    expect(comp.parseDots(clothNoIron)).toBeNull();
  });

  it('should generate preferred label with fallback to type and color', () => {
    const fixture = TestBed.createComponent(IroningPageComponent);
    const comp = fixture.componentInstance;

    expect(comp.getPreferredLabel(fakeClothes[0])).toBe('Giacca Vintage');
    expect(comp.getPreferredLabel(fakeClothes[1])).toBe('Camicia Seta Blu');
    expect(comp.getPreferredLabel(fakeClothes[2])).toBe('Maglione Misto');
  });

  it('should classify items into 4 groups correctly', () => {
    const fixture = TestBed.createComponent(IroningPageComponent);
    const comp = fixture.componentInstance;

    comp.items.set(fakeClothes);
    comp.loading.set(false);

    expect(comp.missingInfoItems().length).toBe(1);
    expect(comp.missingInfoItems()[0].id).toBe('cloth-missing');

    expect(comp.oneDotItems().length).toBe(1);
    expect(comp.oneDotItems()[0].id).toBe('cloth-dot1');

    expect(comp.twoDotsItems().length).toBe(1);
    expect(comp.twoDotsItems()[0].id).toBe('cloth-dot2');

    expect(comp.threeDotsItems().length).toBe(1);
    expect(comp.threeDotsItems()[0].id).toBe('cloth-dot3');
  });

  it('should render warning card for missing info and 3 dot cards', () => {
    const fixture = TestBed.createComponent(IroningPageComponent);
    const comp = fixture.componentInstance;
    vi.spyOn(comp, 'load').mockImplementation(async () => {});

    comp.items.set(fakeClothes);
    comp.loading.set(false);
    comp.error.set(null);
    fixture.detectChanges();

    const warningCard = fixture.nativeElement.querySelector('.card-warning');
    expect(warningCard).not.toBeNull();
    expect(warningCard.textContent).toContain('Manca informazione');

    // Link in warning card should point to edit with step 4
    const editLink = warningCard.querySelector('a.cloth-card--link') as HTMLAnchorElement;
    expect(editLink).not.toBeNull();
    expect(editLink.getAttribute('href')).toContain('/wardrobe/cloth-missing/edit');

    const dotCards = fixture.nativeElement.querySelectorAll('.card-dot');
    expect(dotCards.length).toBe(3);

    // Cards layout should have grid-2x2 class for 4 cards
    const layout = fixture.nativeElement.querySelector('.cards-layout');
    expect(layout.classList.contains('grid-2x2')).toBe(true);

    // Clothes in dot card should link directly to detail page
    const detailLink = dotCards[0].querySelector('a.cloth-card--interactive') as HTMLAnchorElement;
    expect(detailLink).not.toBeNull();
    expect(detailLink.getAttribute('href')).toContain('/wardrobe/cloth-dot1');
  });

  it('should not render warning card when all clothes have temperature info', () => {
    const fixture = TestBed.createComponent(IroningPageComponent);
    const comp = fixture.componentInstance;
    vi.spyOn(comp, 'load').mockImplementation(async () => {});

    // Only clothes with dots
    comp.items.set([fakeClothes[1], fakeClothes[2], fakeClothes[3]]);
    comp.loading.set(false);
    comp.error.set(null);
    fixture.detectChanges();

    const warningCard = fixture.nativeElement.querySelector('.card-warning');
    expect(warningCard).toBeNull();

    const dotCards = fixture.nativeElement.querySelectorAll('.card-dot');
    expect(dotCards.length).toBe(3);

    // Cards layout should NOT have grid-2x2 class for 3 cards
    const layout = fixture.nativeElement.querySelector('.cards-layout');
    expect(layout.classList.contains('grid-2x2')).toBe(false);
  });

  it('should show empty state message inside dot card when that temperature has 0 clothes', () => {
    const fixture = TestBed.createComponent(IroningPageComponent);
    const comp = fixture.componentInstance;
    vi.spyOn(comp, 'load').mockImplementation(async () => {});

    // Only 1 dot item
    comp.items.set([fakeClothes[1]]);
    comp.loading.set(false);
    comp.error.set(null);
    fixture.detectChanges();

    const dotCards = fixture.nativeElement.querySelectorAll('.card-dot');
    expect(dotCards.length).toBe(3);

    // Card 1 has items
    expect(dotCards[0].querySelectorAll('.cloth-card').length).toBe(1);

    // Card 2 has empty state
    expect(dotCards[1].querySelector('.empty-state')?.textContent).toContain(
      'Nessun vestito selezionato per questa temperatura',
    );

    // Card 3 has empty state
    expect(dotCards[2].querySelector('.empty-state')?.textContent).toContain(
      'Nessun vestito selezionato per questa temperatura',
    );
  });

  it('should show empty page state when no items exist', () => {
    const fixture = TestBed.createComponent(IroningPageComponent);
    const comp = fixture.componentInstance;
    vi.spyOn(comp, 'load').mockImplementation(async () => {});

    comp.items.set([]);
    comp.loading.set(false);
    fixture.detectChanges();

    const emptyCard = fixture.nativeElement.querySelector('.empty-card');
    expect(emptyCard).not.toBeNull();
    expect(emptyCard.textContent).toContain('Nessun capo da stirare');
  });

  it('should navigate to /wardrobe when returnToWardrobe is called', () => {
    const fixture = TestBed.createComponent(IroningPageComponent);
    const comp = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));

    comp.returnToWardrobe();
    expect(navigateSpy).toHaveBeenCalledWith(['/wardrobe']);
  });
});
