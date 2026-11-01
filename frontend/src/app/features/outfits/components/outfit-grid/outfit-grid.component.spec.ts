import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { OutfitGridComponent } from './outfit-grid.component';
import { ApiService } from '../../../../core/api.service';
import { ToastService } from '../../../../core/toast.service';
import { OutfitDetailResponse, OutfitItem } from '../../../../core/models';
import { CreateNameModalComponent } from '../../../../shared/components/create-name-modal/create-name-modal.component';

describe('OutfitGridComponent', () => {
  let fixture: ComponentFixture<OutfitGridComponent>;
  let component: OutfitGridComponent;
  let mockApi: Partial<ApiService>;
  let mockToast: Partial<ToastService>;
  let mockDialog: Partial<Dialog>;
  let mockRouter: Partial<Router>;

  const mockOutfits: OutfitItem[] = [
    {
      id: 'outfit-1',
      name: 'Completo Lavoro',
      clothesCount: 2,
      clothes: [
        {
          id: 'c1',
          name: 'Camicia Bianca',
          fullTitle: 'Camicia Bianca',
          primaryAttachment: {
            id: 'att-1',
            userId: 'u1',
            clothesId: 'c1',
            kind: 'photo',
            fileName: 'camicia.jpg',
            originalName: 'camicia.jpg',
            mimeType: 'image/jpeg',
            size: 1024,
            sortOrder: 0,
            path: 'uploads/camicia.jpg',
            previewPath: 'uploads/camicia_preview.webp',
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
          },
        },
        {
          id: 'c2',
          name: 'Pantaloni Neri',
          fullTitle: 'Pantaloni Neri',
          primaryAttachment: null,
        },
      ],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ];

  beforeEach(async () => {
    mockApi = {
      listOutfits: vi.fn().mockReturnValue(of(mockOutfits)),
      createOutfit: vi.fn().mockReturnValue(
        of({
          id: 'outfit-new',
          name: 'Nuovo Test',
          clothesCount: 0,
          clothes: [],
          createdAt: '2026-01-02',
          updatedAt: '2026-01-02',
        } as OutfitDetailResponse),
      ),
      addClothesToOutfit: vi.fn().mockReturnValue(
        of({
          id: 'outfit-1',
          name: 'Completo Lavoro',
          clothesCount: 3,
          clothes: [],
          createdAt: '2026-01-01',
          updatedAt: '2026-01-02',
        } as OutfitDetailResponse),
      ),
      deleteOutfit: vi.fn().mockReturnValue(of({ deleted: true })),
    };

    mockToast = {
      success: vi.fn(),
      error: vi.fn(),
    };

    mockDialog = {
      open: vi.fn(),
    };

    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [OutfitGridComponent],
      providers: [
        { provide: ApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
        { provide: Dialog, useValue: mockDialog },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OutfitGridComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await component.loadOutfits();
    fixture.detectChanges();
  });

  it('should create and load outfits', () => {
    expect(component).toBeTruthy();
    expect(mockApi.listOutfits).toHaveBeenCalled();
    expect(component.outfits().length).toBe(1);
  });

  it('should render placeholder card as first card in grid in modal mode', () => {
    fixture.componentRef.setInput('mode', 'modal');
    fixture.detectChanges();
    const placeholder = fixture.nativeElement.querySelector('.placeholder-card');
    expect(placeholder).toBeTruthy();
    expect(placeholder.textContent).toContain('Nuovo abbinamento');
  });

  it('should NOT render placeholder card in page mode', () => {
    fixture.componentRef.setInput('mode', 'page');
    fixture.detectChanges();
    const placeholder = fixture.nativeElement.querySelector('.placeholder-card');
    expect(placeholder).toBeNull();
  });

  it('should render existing outfit card with title, clothes count, and mini preview in modal mode', () => {
    fixture.componentRef.setInput('mode', 'modal');
    fixture.detectChanges();
    const existingCards = fixture.nativeElement.querySelectorAll('.existing-card');
    expect(existingCards.length).toBe(1);

    const title = existingCards[0].querySelector('.outfit-title');
    expect(title.textContent).toBe('Completo Lavoro');

    const countBadge = existingCards[0].querySelector('.clothes-count-badge');
    expect(countBadge.textContent).toContain('2 capi');

    const miniThumbs = existingCards[0].querySelectorAll('.mini-thumb');
    expect(miniThumbs.length).toBe(2);
  });

  it('should render compact Windows-icon card in page mode', () => {
    fixture.componentRef.setInput('mode', 'page');
    fixture.detectChanges();
    const iconCards = fixture.nativeElement.querySelectorAll('.page-icon-card');
    expect(iconCards.length).toBe(1);

    const title = iconCards[0].querySelector('.outfit-title');
    expect(title.textContent).toBe('Completo Lavoro');

    const countBadge = iconCards[0].querySelector('.clothes-count-badge');
    expect(countBadge.textContent).toContain('2 capi');

    const thumbs = iconCards[0].querySelectorAll('.mini-thumb');
    expect(thumbs.length).toBe(2);
  });

  it('should open create name modal when clicking placeholder card', async () => {
    mockDialog.open = vi.fn().mockReturnValue({
      closed: of('Serata Elegante'),
    } as DialogRef<string | null>);

    await component.openCreateOutfitModal();

    expect(mockDialog.open).toHaveBeenCalledWith(CreateNameModalComponent, expect.anything());
    expect(mockApi.createOutfit).toHaveBeenCalledWith({ name: 'Serata Elegante', clothesIds: [] });
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/outfits', 'outfit-new']);
  });

  it('should navigate to outfit detail when clicking an outfit in page mode', async () => {
    fixture.componentRef.setInput('mode', 'page');
    fixture.detectChanges();
    const existingCard = fixture.nativeElement.querySelector('.page-icon-card') as HTMLElement;
    existingCard.click();
    await fixture.whenStable();

    expect(mockRouter.navigate).toHaveBeenCalledWith(['/outfits', 'outfit-1']);
  });

  it('should add clothes and emit in modal mode when clicking an outfit card', async () => {
    fixture.componentRef.setInput('mode', 'modal');
    fixture.componentRef.setInput('selectedClothesIds', ['c3', 'c4']);
    fixture.detectChanges();

    const selectSpy = vi.fn();
    component.outfitSelected.subscribe(selectSpy);

    const existingCard = fixture.nativeElement.querySelector('.existing-card') as HTMLElement;
    existingCard.click();
    await fixture.whenStable();

    expect(mockApi.addClothesToOutfit).toHaveBeenCalledWith('outfit-1', ['c3', 'c4']);
    expect(selectSpy).toHaveBeenCalled();
  });
});
