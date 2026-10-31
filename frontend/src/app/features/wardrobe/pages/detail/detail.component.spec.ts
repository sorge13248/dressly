import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { ApiService } from '../../../../core/api.service';
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
    const api = TestBed.inject(ApiService);
    const addSpy = vi.spyOn(api, 'addToWashing').mockReturnValue(of({ added: 1, existing: 0, total: 1 }));
    const removeSpy = vi.spyOn(api, 'removeFromWashing').mockReturnValue(of({ removed: true }));

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
    expect(addSpy).toHaveBeenCalledWith(['cloth-1']);
    expect(comp.isInWashing()).toBe(true);

    // When already in washing: removes from washing
    await comp.toggleWashing();
    expect(removeSpy).toHaveBeenCalledWith('cloth-1');
    expect(comp.isInWashing()).toBe(false);
  });

  it('should toggle ironing status when toggleIroning is called', async () => {
    const fixture = TestBed.createComponent(WardrobeDetailPageComponent);
    const comp = fixture.componentInstance;
    const api = TestBed.inject(ApiService);
    const addSpy = vi.spyOn(api, 'addToIroning').mockReturnValue(of({ added: 1, existing: 0, total: 1 }));
    const removeSpy = vi.spyOn(api, 'removeFromIroning').mockReturnValue(of({ removed: true }));

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
    expect(addSpy).toHaveBeenCalledWith(['cloth-2']);
    expect(comp.isInIroning()).toBe(true);

    // When already in ironing: removes from ironing
    await comp.toggleIroning();
    expect(removeSpy).toHaveBeenCalledWith('cloth-2');
    expect(comp.isInIroning()).toBe(false);
  });
});