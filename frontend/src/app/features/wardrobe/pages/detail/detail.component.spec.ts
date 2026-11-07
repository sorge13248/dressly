import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { ApiService } from '../../../../core/api.service';
import { SyncService } from '../../../../core/sync.service';
import { OfflineStorageService } from '../../../../core/offline-storage.service';
import { WardrobeDetailPageComponent } from './detail.component';

describe('WardrobeDetailPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WardrobeDetailPageComponent, RouterTestingModule],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(WardrobeDetailPageComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should produce condensed care sections with specs and active tags', () => {
    const fixture = TestBed.createComponent(WardrobeDetailPageComponent);
    const comp = fixture.componentInstance;

    comp.item.set({
      id: 'test-1',
      userId: 'user-1',
      name: 'Maglietta',
      size: 'M',
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      washingInstruction: {
        washType: 'washer_ok',
        bleachType: 'no_bleach',
        temperature: '30',
        stretch: false,
        reverseWashing: true,
        closedZips: true,
        similarColors: true,
        washSeparately: false,
        useColorCatcher: false,
        colorLossRisk: false,
      },
      ironingInstruction: {
        ironType: 'yes',
        temperature: '2',
        ironInsideOut: false,
      },
    });

    const sections = comp.careSections();
    expect(sections.length).toBe(2);

    const washSection = sections.find((s) => s.title === 'Lavaggio');
    expect(washSection).toBeDefined();
    expect(washSection?.specs).toEqual([
      { label: 'Tipo', value: 'Lavatrice ok' },
      { label: 'Temperatura', value: '30°C' },
      { label: 'Sbianca', value: 'Nessuna' },
    ]);
    expect(washSection?.tags).toEqual([
      { label: 'Lava al rovescio' },
      { label: 'Cerniere chiuse' },
      { label: 'Colori simili' },
    ]);

    const ironSection = sections.find((s) => s.title === 'Stiratura');
    expect(ironSection).toBeDefined();
    expect(ironSection?.specs).toEqual([
      { label: 'Tipo', value: 'Si' },
      { label: 'Temperatura', value: '2', dotsArray: [1, 2] },
    ]);
    expect(ironSection?.tags).toEqual([]);
  });

  it('should use ✅ and ❌ emojis for Asciugatrice spec', () => {
    const fixture = TestBed.createComponent(WardrobeDetailPageComponent);
    const comp = fixture.componentInstance;

    comp.item.set({
      id: 'test-2',
      userId: 'user-1',
      name: 'Pantaloni',
      size: 'L',
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dryingInstruction: {
        tumbleDry: false,
        method: 'air_dry',
      },
    });

    let sections = comp.careSections();
    let drySection = sections.find((s) => s.title === 'Asciugatura');
    expect(drySection?.specs).toEqual([
      { label: 'Asciugatrice', value: '❌' },
      { label: 'Metodo', value: "Asciugatura all'aria" },
    ]);

    comp.item.set({
      id: 'test-2',
      userId: 'user-1',
      name: 'Pantaloni',
      size: 'L',
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dryingInstruction: {
        tumbleDry: true,
        tumbleDryTemperature: 'low',
        method: 'tumble_dry:low',
      },
    });

    sections = comp.careSections();
    drySection = sections.find((s) => s.title === 'Asciugatura');
    expect(drySection?.specs).toEqual([
      { label: 'Asciugatrice', value: '✅ (Bassa)' },
    ]);
  });

  it('should map ironing power to dots array correctly', () => {
    const fixture = TestBed.createComponent(WardrobeDetailPageComponent);
    const comp = fixture.componentInstance;

    // Power 1 -> 1 dot
    comp.item.set({
      id: 'test-3',
      userId: 'user-1',
      name: 'Camicia',
      size: 'S',
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ironingInstruction: {
        ironType: 'yes',
        temperature: '1',
      },
    });
    let ironSection = comp.careSections().find((s) => s.title === 'Stiratura');
    let tempSpec = ironSection?.specs.find((s) => s.label === 'Temperatura');
    expect(tempSpec?.dotsArray).toEqual([1]);

    // Power 3 -> 3 dots
    comp.item.set({
      id: 'test-3',
      userId: 'user-1',
      name: 'Camicia',
      size: 'S',
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ironingInstruction: {
        ironType: 'yes',
        temperature: '3',
      },
    });
    ironSection = comp.careSections().find((s) => s.title === 'Stiratura');
    tempSpec = ironSection?.specs.find((s) => s.label === 'Temperatura');
    expect(tempSpec?.dotsArray).toEqual([1, 2, 3]);
  });

  it('should toggle washing status when toggleWashing is called', async () => {
    const fixture = TestBed.createComponent(WardrobeDetailPageComponent);
    const comp = fixture.componentInstance;
    const syncService = TestBed.inject(SyncService);
    const queueSpy = vi.spyOn(syncService, 'queueLaundryChange');

    comp.item.set({
      id: 'cloth-1',
      userId: 'user-1',
      name: 'Vestito',
      size: null,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isInWashing: false,
    });

    // When not in washing: adds to washing
    await comp.toggleWashing();
    expect(queueSpy).toHaveBeenCalledWith('washing', 'cloth-1', 'create');
    expect(comp.isInWashing()).toBe(true);

    // When already in washing: removes from washing
    await comp.toggleWashing();
    expect(queueSpy).toHaveBeenCalledWith('washing', 'cloth-1', 'delete');
    expect(comp.isInWashing()).toBe(false);
  });

  it('should toggle ironing status when toggleIroning is called', async () => {
    const fixture = TestBed.createComponent(WardrobeDetailPageComponent);
    const comp = fixture.componentInstance;
    const syncService = TestBed.inject(SyncService);
    const queueSpy = vi.spyOn(syncService, 'queueLaundryChange');

    comp.item.set({
      id: 'cloth-2',
      userId: 'user-1',
      name: 'Pantaloni',
      size: null,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isInIroning: false,
    });

    // When not in ironing: adds to ironing
    await comp.toggleIroning();
    expect(queueSpy).toHaveBeenCalledWith('ironing', 'cloth-2', 'create');
    expect(comp.isInIroning()).toBe(true);

    // When already in ironing: removes from ironing
    await comp.toggleIroning();
    expect(queueSpy).toHaveBeenCalledWith('ironing', 'cloth-2', 'delete');
    expect(comp.isInIroning()).toBe(false);
  });

  it('should display Quantità field for cumulative clothes', () => {
    vi.spyOn(WardrobeDetailPageComponent.prototype, 'ngOnInit').mockImplementation(function (this: any) {
      this.loading.set(false);
      this.error.set(null);
    });
    const fixture = TestBed.createComponent(WardrobeDetailPageComponent);
    const comp = fixture.componentInstance;

    comp.loading.set(false);
    comp.error.set(null);
    comp.item.set({
      id: 'cloth-cumul-1',
      userId: 'user-1',
      name: 'Calzini Neri',
      size: null,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isCumulative: true,
      quantity: 5,
    });
    fixture.detectChanges();

    const rows = Array.from(fixture.nativeElement.querySelectorAll('.hero-detail-row')) as HTMLElement[];
    const qtyRow = rows.find((row) => row.querySelector('.hero-label')?.textContent?.includes('Quantità'));

    expect(qtyRow).toBeTruthy();
    expect(qtyRow?.querySelector('.hero-quantity-val')?.textContent?.trim()).toBe('5');
  });

  it('should correctly increment washing and ironing counters for cumulative clothes on button', async () => {
    vi.spyOn(WardrobeDetailPageComponent.prototype, 'ngOnInit').mockImplementation(function (this: any) {
      this.loading.set(false);
      this.error.set(null);
    });
    const fixture = TestBed.createComponent(WardrobeDetailPageComponent);
    const comp = fixture.componentInstance;
    const syncService = TestBed.inject(SyncService);
    vi.spyOn(syncService, 'queueLaundryChange').mockResolvedValue(undefined);

    comp.loading.set(false);
    comp.error.set(null);
    comp.item.set({
      id: 'cloth-cumul-2',
      userId: 'user-1',
      name: 'Magliette Bianche',
      size: 'L',
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isCumulative: true,
      quantity: 5,
      washingQuantity: 0,
      ironingQuantity: 0,
      isInWashing: false,
      isInIroning: false,
    });
    fixture.detectChanges();

    const washBtn = fixture.nativeElement.querySelector('.hero-action-btn:nth-child(1)');
    expect(washBtn.textContent).toContain('Metti a lavare (0/5)');

    await comp.toggleWashing();
    fixture.detectChanges();

    expect(washBtn.textContent).toContain('Metti a lavare (1/5)');
    expect(comp.washingQuantity()).toBe(1);

    await comp.toggleWashing();
    fixture.detectChanges();

    expect(washBtn.textContent).toContain('Metti a lavare (2/5)');
    expect(comp.washingQuantity()).toBe(2);

    const ironBtn = fixture.nativeElement.querySelector('.hero-action-btn:nth-child(2)');
    expect(ironBtn.textContent).toContain('Metti a stirare (0/5)');

    await comp.toggleIroning();
    fixture.detectChanges();

    expect(ironBtn.textContent).toContain('Metti a stirare (1/5)');
    expect(comp.ironingQuantity()).toBe(1);
  });

  it('should compute washingQuantity and ironingQuantity when load is called with storage data', async () => {
    const fixture = TestBed.createComponent(WardrobeDetailPageComponent);
    const comp = fixture.componentInstance;
    const storage = TestBed.inject(OfflineStorageService);

    vi.spyOn(storage, 'getClothes').mockResolvedValue({
      id: 'cloth-cumul-3',
      userId: 'user-1',
      name: 'Polo',
      isCumulative: true,
      quantity: 5,
    } as any);

    vi.spyOn(storage, 'getLaundry').mockResolvedValue({
      washing: ['cloth-cumul-3', 'cloth-cumul-3', 'other-item'],
      ironing: ['cloth-cumul-3'],
    });

    await comp.load('cloth-cumul-3');

    expect(comp.item()?.washingQuantity).toBe(2);
    expect(comp.item()?.ironingQuantity).toBe(1);
    expect(comp.washingQuantity()).toBe(2);
    expect(comp.ironingQuantity()).toBe(1);
    expect(comp.isInWashing()).toBe(true);
    expect(comp.isInIroning()).toBe(true);
  });
});