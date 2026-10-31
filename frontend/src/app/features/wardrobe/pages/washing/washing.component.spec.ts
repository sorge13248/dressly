import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { Dialog } from '@angular/cdk/dialog';
import { ApiService } from '../../../../core/api.service';
import { LaundryService } from '../../../../core/laundry.service';
import { WashingClothesItem } from '../../../../core/models';
import { WashingPageComponent } from './washing.component';

describe('WashingPageComponent', () => {
  const fakeClothes: WashingClothesItem[] = [
    {
      id: 'cloth-missing',
      name: 'Sciarpa Lana',
      brand: { id: 'b1', name: 'Zara' },
      type: { id: 't1', name: 'Sciarpa' },
      colors: [],
      washingInstruction: null,
      primaryAttachment: null,
    },
    {
      id: 'cloth-handwash',
      name: 'Maglione Cashmere',
      brand: null,
      type: { id: 't2', name: 'Maglione' },
      colors: [],
      washingInstruction: {
        washType: 'hand_wash_only',
        temperature: null,
        bleachType: 'no_bleach',
        stretch: false,
        reverseWashing: true,
        closedZips: false,
        similarColors: true,
        washSeparately: false,
        useColorCatcher: false,
        colorLossRisk: false,
        colorLossTestTemperature: null,
      },
      primaryAttachment: null,
    },
    {
      id: 'cloth-donotwash',
      name: 'Giacca Pelle',
      brand: null,
      type: { id: 't3', name: 'Giacca' },
      colors: [],
      washingInstruction: {
        washType: 'do_not_wash',
        temperature: null,
        bleachType: 'no_bleach',
        stretch: false,
        reverseWashing: false,
        closedZips: false,
        similarColors: false,
        washSeparately: false,
        useColorCatcher: false,
        colorLossRisk: false,
        colorLossTestTemperature: null,
      },
      primaryAttachment: null,
    },
    {
      id: 'cloth-temp30',
      name: 'T-Shirt Seta',
      brand: null,
      type: { id: 't4', name: 'T-Shirt' },
      colors: [],
      washingInstruction: {
        washType: 'washer_ok',
        temperature: '30',
        bleachType: 'no_bleach',
        stretch: false,
        reverseWashing: false,
        closedZips: false,
        similarColors: false,
        washSeparately: false,
        useColorCatcher: true,
        colorLossRisk: false,
        colorLossTestTemperature: null,
      },
      primaryAttachment: null,
    },
    {
      id: 'cloth-temp60',
      name: 'Asciugamani Cotone',
      brand: null,
      type: { id: 't5', name: 'Asciugamano' },
      colors: [],
      washingInstruction: {
        washType: 'washer_ok',
        temperature: '60',
        bleachType: 'any_bleach',
        stretch: false,
        reverseWashing: false,
        closedZips: false,
        similarColors: false,
        washSeparately: false,
        useColorCatcher: false,
        colorLossRisk: false,
        colorLossTestTemperature: null,
      },
      primaryAttachment: null,
    },
  ];

  let mockApiService: {
    getClothesForWashing: ReturnType<typeof vi.fn>;
    removeFromWashing: ReturnType<typeof vi.fn>;
    moveWashingToIroning: ReturnType<typeof vi.fn>;
    clearWashing: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockApiService = {
      getClothesForWashing: vi.fn().mockReturnValue(of({ items: fakeClothes })),
      removeFromWashing: vi.fn().mockReturnValue(of({ removed: true })),
      moveWashingToIroning: vi.fn().mockReturnValue(of({ moved: true, washingCount: 4, ironingCount: 1 })),
      clearWashing: vi.fn().mockReturnValue(of({ cleared: true })),
    };

    await TestBed.configureTestingModule({
      imports: [WashingPageComponent, RouterTestingModule],
      providers: [
        { provide: ApiService, useValue: mockApiService },
        {
          provide: LaundryService,
          useValue: {
            refreshCounts: vi.fn().mockResolvedValue(undefined),
            setWashingCount: vi.fn(),
            setIroningCount: vi.fn(),
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(WashingPageComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should classify items into dynamic temperature groups and special groups', () => {
    const fixture = TestBed.createComponent(WashingPageComponent);
    const comp = fixture.componentInstance;

    comp.items.set(fakeClothes);
    comp.loading.set(false);

    expect(comp.missingInfoItems().length).toBe(1);
    expect(comp.missingInfoItems()[0].id).toBe('cloth-missing');

    expect(comp.handWashOnlyItems().length).toBe(1);
    expect(comp.handWashOnlyItems()[0].id).toBe('cloth-handwash');

    expect(comp.doNotWashItems().length).toBe(1);
    expect(comp.doNotWashItems()[0].id).toBe('cloth-donotwash');

    const tempGroups = comp.temperatureGroups();
    expect(tempGroups.length).toBe(2);
    expect(tempGroups[0].temperature).toBe(30);
    expect(tempGroups[0].items.length).toBe(1);
    expect(tempGroups[0].items[0].id).toBe('cloth-temp30');

    expect(tempGroups[1].temperature).toBe(60);
    expect(tempGroups[1].items.length).toBe(1);
    expect(tempGroups[1].items[0].id).toBe('cloth-temp60');
  });

  it('should handle onWashed and remove item from list', async () => {
    const fixture = TestBed.createComponent(WashingPageComponent);
    const comp = fixture.componentInstance;

    comp.items.set(fakeClothes);
    await comp.onWashed(fakeClothes[3]);

    expect(mockApiService.removeFromWashing).toHaveBeenCalledWith('cloth-temp30');
    expect(comp.items().some((i) => i.id === 'cloth-temp30')).toBe(false);
  });

  it('should handle onWashedAndIron and remove item from list', async () => {
    const fixture = TestBed.createComponent(WashingPageComponent);
    const comp = fixture.componentInstance;

    comp.items.set(fakeClothes);
    await comp.onWashedAndIron(fakeClothes[3]);

    expect(mockApiService.moveWashingToIroning).toHaveBeenCalledWith('cloth-temp30');
    expect(comp.items().some((i) => i.id === 'cloth-temp30')).toBe(false);
  });

  it('should navigate to /wardrobe when returnToWardrobe is called', () => {
    const fixture = TestBed.createComponent(WashingPageComponent);
    const comp = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));

    comp.returnToWardrobe();
    expect(navigateSpy).toHaveBeenCalledWith(['/wardrobe']);
  });

  it('should show empty page state when no items exist', () => {
    const fixture = TestBed.createComponent(WashingPageComponent);
    const comp = fixture.componentInstance;
    vi.spyOn(comp, 'load').mockImplementation(async () => {});

    comp.items.set([]);
    comp.loading.set(false);
    fixture.detectChanges();

    const emptyCard = fixture.nativeElement.querySelector('.empty-card');
    expect(emptyCard).not.toBeNull();
    expect(emptyCard.textContent).toContain('Nessun capo da lavare');
  });
});
