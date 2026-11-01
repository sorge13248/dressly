import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextSelectorComponent } from './context-selector.component';
import { ReferenceStoreService } from '../../../core/reference-store.service';
import { SeasonItem, TemperatureItem, UseCaseItem } from '../../../core/models';

describe('ContextSelectorComponent', () => {
  let fixture: ComponentFixture<ContextSelectorComponent>;
  let component: ContextSelectorComponent;
  let mockRefStore: Partial<ReferenceStoreService>;
  let mockDialog: Partial<Dialog>;

  const mockSeasons: SeasonItem[] = [
    { id: 's1', name: 'Estate', icon: '☀️', userId: 'u1', sortOrder: 0, createdAt: '', updatedAt: '' },
    { id: 's2', name: 'Inverno', icon: '❄️', userId: 'u1', sortOrder: 1, createdAt: '', updatedAt: '' },
  ];
  const mockTemperatures: TemperatureItem[] = [
    { id: 't1', name: 'Caldo', icon: '🔥', userId: 'u1', sortOrder: 0, createdAt: '', updatedAt: '' },
  ];
  const mockUseCases: UseCaseItem[] = [
    { id: 'u1', name: 'Lavoro', icon: '💼', userId: 'u1', sortOrder: 0, createdAt: '', updatedAt: '' },
  ];

  beforeEach(() => {
    mockRefStore = {
      seasons: signal(mockSeasons) as never,
      temperatures: signal(mockTemperatures) as never,
      useCases: signal(mockUseCases) as never,
      create: vi.fn().mockResolvedValue({ id: 's-new', name: 'Nuova' }),
    };

    mockDialog = {
      open: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [ContextSelectorComponent],
      providers: [
        { provide: ReferenceStoreService, useValue: mockRefStore },
        { provide: Dialog, useValue: mockDialog },
      ],
    });

    fixture = TestBed.createComponent(ContextSelectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should render chips for seasons, temperatures, and useCases', () => {
    const chips = fixture.nativeElement.querySelectorAll('.chip');
    expect(chips.length).toBe(4); // 2 seasons + 1 temp + 1 usecase
    expect(fixture.nativeElement.textContent).toContain('Estate');
    expect(fixture.nativeElement.textContent).toContain('Inverno');
    expect(fixture.nativeElement.textContent).toContain('Caldo');
    expect(fixture.nativeElement.textContent).toContain('Lavoro');
  });

  it('should toggle season selection on chip click', () => {
    const seasonChips = fixture.nativeElement.querySelectorAll('.chip');
    seasonChips[0].click();
    fixture.detectChanges();

    expect(component.seasonIds()).toEqual(['s1']);
    expect(seasonChips[0].classList.contains('active')).toBe(true);

    seasonChips[0].click();
    fixture.detectChanges();
    expect(component.seasonIds()).toEqual([]);
  });

  it('should toggle temperature and useCase selection', () => {
    component.toggleTemperature('t1');
    expect(component.temperatureIds()).toEqual(['t1']);

    component.toggleUseCase('u1');
    expect(component.useCaseIds()).toEqual(['u1']);
  });

  it('should open modal and create new season', async () => {
    mockDialog.open = vi.fn().mockReturnValue({
      closed: of('Autunno'),
    } as DialogRef<string | null>);

    await component.openCreateSeasonModal();

    expect(mockRefStore.create).toHaveBeenCalledWith('seasons', { name: 'Autunno' });
    expect(component.seasonIds()).toContain('s-new');
  });
});
