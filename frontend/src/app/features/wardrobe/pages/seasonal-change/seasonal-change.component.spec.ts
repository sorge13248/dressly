import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { SeasonalChangePageComponent, canDeactivateSeasonalChange } from './seasonal-change.component';
import { ClothesItem, SeasonItem } from '../../../../core/models';
import { ReferenceStoreService } from '../../../../core/reference-store.service';
import { OfflineStorageService } from '../../../../core/offline-storage.service';

describe('SeasonalChangePageComponent', () => {
  const fakeSeasons: SeasonItem[] = [
    { id: 'season-inverno', name: 'Inverno', icon: '❄️', userId: 'user-1', sortOrder: 0, createdAt: '', updatedAt: '' },
    { id: 'season-estate', name: 'Estate', icon: '☀️', userId: 'user-1', sortOrder: 1, createdAt: '', updatedAt: '' },
    { id: 'season-autunno', name: 'Autunno', icon: '🍂', userId: 'user-1', sortOrder: 2, createdAt: '', updatedAt: '' },
    { id: 'season-primavera', name: 'Primavera', icon: '🌸', userId: 'user-1', sortOrder: 3, createdAt: '', updatedAt: '' },
  ];

  const fakeClothes: ClothesItem[] = [
    {
      id: 'cloth-1',
      name: 'Maglione Pesante',
      status: 'in_wardrobe',
      userId: 'user-1',
      size: 'M',
      notes: null,
      seasons: [fakeSeasons[0]], // Inverno
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'cloth-2',
      name: 'Giacca Autunnale',
      status: 'in_wardrobe',
      userId: 'user-1',
      size: 'L',
      notes: null,
      seasons: [fakeSeasons[2]], // Autunno
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'cloth-3',
      name: 'T-shirt Estiva',
      status: 'in_storage',
      userId: 'user-1',
      size: 'S',
      notes: null,
      seasons: [fakeSeasons[1]], // Estate
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'cloth-4',
      name: 'Vestito Primaverile',
      status: 'in_storage',
      userId: 'user-1',
      size: 'M',
      notes: null,
      seasons: [fakeSeasons[3]], // Primavera
      createdAt: '',
      updatedAt: '',
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SeasonalChangePageComponent, RouterTestingModule],
      providers: [
        {
          provide: OfflineStorageService,
          useValue: {
            getAllClothes: vi.fn().mockResolvedValue(fakeClothes),
            saveClothes: vi.fn().mockResolvedValue(undefined),
            addToWashing: vi.fn().mockResolvedValue(undefined),
            addToIroning: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compileComponents();
  });

  it('should create and have 5 steps', () => {
    const fixture = TestBed.createComponent(SeasonalChangePageComponent);
    const comp = fixture.componentInstance;
    expect(comp).toBeTruthy();
    expect(comp.steps.length).toBe(5);
  });

  it('should allow selecting multiple outgoing and incoming seasons', () => {
    const fixture = TestBed.createComponent(SeasonalChangePageComponent);
    const comp = fixture.componentInstance;
    comp.allClothes.set(fakeClothes);

    // Toggle Inverno and Autunno as outgoing
    comp.toggleOutgoingSeason(fakeSeasons[0]); // Inverno
    comp.toggleOutgoingSeason(fakeSeasons[2]); // Autunno

    expect(comp.selectedOutgoingSeasonIds().has('season-inverno')).toBe(true);
    expect(comp.selectedOutgoingSeasonIds().has('season-autunno')).toBe(true);
    expect(comp.selectedOutgoingSeasonIds().size).toBe(2);

    // Both matching clothes should be in outgoingCandidates
    expect(comp.outgoingCandidates().length).toBe(2);
    expect(comp.selectedOutgoingIds().has('cloth-1')).toBe(true);
    expect(comp.selectedOutgoingIds().has('cloth-2')).toBe(true);

    // Toggle Estate and Primavera as incoming
    comp.toggleIncomingSeason(fakeSeasons[1]); // Estate
    comp.toggleIncomingSeason(fakeSeasons[3]); // Primavera

    expect(comp.selectedIncomingSeasonIds().has('season-estate')).toBe(true);
    expect(comp.selectedIncomingSeasonIds().has('season-primavera')).toBe(true);
    expect(comp.selectedIncomingSeasonIds().size).toBe(2);

    expect(comp.incomingCandidates().length).toBe(2);
    expect(comp.selectedIncomingIds().has('cloth-3')).toBe(true);
    expect(comp.selectedIncomingIds().has('cloth-4')).toBe(true);

    // Toggle Inverno off: only Autunno should remain
    comp.toggleOutgoingSeason(fakeSeasons[0]);
    expect(comp.selectedOutgoingSeasonIds().has('season-inverno')).toBe(false);
    expect(comp.selectedOutgoingSeasonIds().size).toBe(1);
    expect(comp.outgoingCandidates().length).toBe(1);
    expect(comp.selectedOutgoingIds().has('cloth-1')).toBe(false);
    expect(comp.selectedOutgoingIds().has('cloth-2')).toBe(true);
  });

  it('should NOT propose putting away clothes that belong to incoming seasons even if they match outgoing seasons', () => {
    const fixture = TestBed.createComponent(SeasonalChangePageComponent);
    const comp = fixture.componentInstance;

    const clothesWithMultiSeason: ClothesItem[] = [
      {
        id: 'cloth-summer-only',
        name: 'Costume da bagno',
        status: 'in_wardrobe',
        userId: 'user-1',
        size: 'M',
        notes: null,
        seasons: [fakeSeasons[1]], // Estate
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'cloth-multi-summer-autumn',
        name: 'T-shirt mezze maniche',
        status: 'in_wardrobe',
        userId: 'user-1',
        size: 'M',
        notes: null,
        seasons: [fakeSeasons[1], fakeSeasons[2]], // Estate e Autunno
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'cloth-autumn-in-storage',
        name: 'Maglione Autunnale',
        status: 'in_storage',
        userId: 'user-1',
        size: 'L',
        notes: null,
        seasons: [fakeSeasons[2]], // Autunno
        createdAt: '',
        updatedAt: '',
      },
    ];

    comp.allClothes.set(clothesWithMultiSeason);

    // 1. Select outgoing: Estate
    comp.toggleOutgoingSeason(fakeSeasons[1]); // Estate
    // With no incoming season selected yet, both summer clothes are candidates
    expect(comp.outgoingCandidates().map((c) => c.id)).toEqual(['cloth-summer-only', 'cloth-multi-summer-autumn']);
    expect(comp.selectedOutgoingIds().has('cloth-multi-summer-autumn')).toBe(true);

    // 2. Select incoming: Autunno
    comp.toggleIncomingSeason(fakeSeasons[2]); // Autunno
    // Multi-season garment is suitable for Autunno (incoming), so it must NOT be proposed to be put away!
    expect(comp.outgoingCandidates().map((c) => c.id)).toEqual(['cloth-summer-only']);
    expect(comp.selectedOutgoingIds().has('cloth-summer-only')).toBe(true);
    expect(comp.selectedOutgoingIds().has('cloth-multi-summer-autumn')).toBe(false);

    // 3. If Autunno incoming is deselected, it becomes an outgoing candidate again
    comp.toggleIncomingSeason(fakeSeasons[2]); // Deselect Autunno
    expect(comp.outgoingCandidates().map((c) => c.id)).toContain('cloth-multi-summer-autumn');
    expect(comp.selectedOutgoingIds().has('cloth-multi-summer-autumn')).toBe(true);
  });

  it('should require at least one season to proceed from step 1', () => {
    const fixture = TestBed.createComponent(SeasonalChangePageComponent);
    const comp = fixture.componentInstance;

    expect(comp.canProceed()).toBe(false);

    comp.toggleOutgoingSeason(fakeSeasons[0]);
    expect(comp.canProceed()).toBe(true);

    comp.toggleOutgoingSeason(fakeSeasons[0]); // deselect
    expect(comp.canProceed()).toBe(false);

    comp.toggleIncomingSeason(fakeSeasons[1]);
    expect(comp.canProceed()).toBe(true);
  });

  it('should prompt via Dialog on canDeactivate when unsaved changes exist and block if canceled', async () => {
    const fixture = TestBed.createComponent(SeasonalChangePageComponent);
    const comp = fixture.componentInstance;
    const dialog = TestBed.inject(Dialog);

    // Initially clean
    expect(comp.hasUnsavedChanges()).toBe(false);
    expect(await comp.canDeactivate()).toBe(true);

    // Select a season
    comp.toggleOutgoingSeason(fakeSeasons[0]);
    expect(comp.hasUnsavedChanges()).toBe(true);

    // User cancels in dialog
    const openSpy = vi.spyOn(dialog, 'open').mockReturnValue({
      closed: of(false),
    } as any);

    const canLeaveCancel = await comp.canDeactivate();
    expect(openSpy).toHaveBeenCalled();
    expect(canLeaveCancel).toBe(false);

    // User confirms in dialog
    openSpy.mockReturnValue({
      closed: of(true),
    } as any);

    const canLeaveConfirm = await comp.canDeactivate();
    expect(canLeaveConfirm).toBe(true);
  });

  it('should delegate canDeactivateSeasonalChange to component canDeactivate', async () => {
    const fixture = TestBed.createComponent(SeasonalChangePageComponent);
    const comp = fixture.componentInstance;
    vi.spyOn(comp, 'canDeactivate').mockResolvedValue(true);

    const result = await canDeactivateSeasonalChange(comp, null as any, null as any, null as any);
    expect(result).toBe(true);
    expect(comp.canDeactivate).toHaveBeenCalled();
  });
});
