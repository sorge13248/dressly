import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutfitDetailPageComponent } from './outfit-detail-page.component';
import { ApiService } from '../../../../core/api.service';
import { ToastService } from '../../../../core/toast.service';
import { LaundryService } from '../../../../core/laundry.service';
import { ReferenceStoreService } from '../../../../core/reference-store.service';
import { AttachmentItem, OutfitDetailResponse } from '../../../../core/models';
import { ConfirmModalComponent } from '../../../../shared/components/confirm-modal/confirm-modal.component';
import { WardrobePhotoLightboxModalComponent } from '../../../wardrobe/components/photo-lightbox-modal/photo-lightbox-modal.component';

describe('OutfitDetailPageComponent', () => {
  let fixture: ComponentFixture<OutfitDetailPageComponent>;
  let component: OutfitDetailPageComponent;
  let mockApi: Partial<ApiService>;
  let mockToast: Partial<ToastService>;
  let mockDialog: Partial<Dialog>;
  let mockRouter: Partial<Router>;
  let mockLaundry: Partial<LaundryService>;
  let mockRefStore: Partial<ReferenceStoreService>;

  const mockAttachment: AttachmentItem = {
    id: 'att-1',
    userId: 'u1',
    clothesId: '',
    kind: 'worn',
    fileName: 'selfie.jpg',
    originalName: 'selfie.jpg',
    mimeType: 'image/jpeg',
    size: 1024,
    sortOrder: 0,
    path: 'uploads/att-1.jpg',
    previewPath: 'uploads/att-1-preview.jpg',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const mockOutfitDetail: OutfitDetailResponse = {
    id: 'outfit-1',
    name: 'Look Weekend',
    description: 'Abbinamento elegante per il weekend primaverile',
    seasons: [{ id: 's1', name: 'Primavera', icon: '🌸', userId: 'u1', sortOrder: 0, createdAt: '', updatedAt: '' }],
    temperatures: [{ id: 't1', name: 'Mite', icon: '🌤️', userId: 'u1', sortOrder: 0, createdAt: '', updatedAt: '' }],
    useCases: [{ id: 'u1', name: 'Aperitivo', icon: '🍹', userId: 'u1', sortOrder: 0, createdAt: '', updatedAt: '' }],
    attachments: [mockAttachment],
    canvasLayout: {
      c1: { x: 30, y: 40, scale: 1, rotation: 0, zIndex: 1 },
      c2: { x: 70, y: 60, scale: 1, rotation: 0, zIndex: 2 },
    },
    clothesCount: 2,
    clothes: [
      {
        id: 'c1',
        userId: 'u1',
        name: 'Giacca Blu',
        fullTitle: 'Giacca Blu',
        size: 'M',
        notes: 'Comoda',
        brand: { id: 'b1', name: 'Zara', userId: 'u1', sortOrder: 0, logoUrl: null, createdAt: '', updatedAt: '' },
        fit: { id: 'f1', name: 'Regular', userId: 'u1', sortOrder: 0, createdAt: '', updatedAt: '' },
        type: { id: 't1', name: 'Giacca', userId: 'u1', sortOrder: 0, createdAt: '', updatedAt: '' },
        colors: [{ id: 'col1', name: 'Blu', hexCode: '#0000ff', userId: 'u1', sortOrder: 0, createdAt: '', updatedAt: '' }],
        attachments: [],
        isInWashing: false,
        isInIroning: false,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: 'c2',
        userId: 'u1',
        name: 'Jeans Chiari',
        fullTitle: 'Jeans Chiari',
        size: '42',
        notes: null,
        brand: null,
        fit: null,
        type: null,
        colors: [],
        attachments: [],
        isInWashing: true,
        isInIroning: false,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  beforeEach(async () => {
    mockApi = {
      getOutfit: vi.fn().mockReturnValue(of(mockOutfitDetail)),
      removeClothesFromOutfit: vi.fn().mockReturnValue(
        of({
          ...mockOutfitDetail,
          clothesCount: 1,
          clothes: [mockOutfitDetail.clothes[1]],
        }),
      ),
      updateOutfit: vi.fn().mockImplementation((id: string, payload: any) =>
        of({
          ...mockOutfitDetail,
          ...payload,
        }),
      ),
      deleteOutfit: vi.fn().mockReturnValue(of({ deleted: true })),
      uploadOutfitAttachment: vi.fn().mockReturnValue(of(mockAttachment)),
      deleteOutfitAttachment: vi.fn().mockReturnValue(of({ deleted: true })),
      getOutfitAttachmentUrl: vi.fn().mockReturnValue('/api/mock-photo-url'),
    };

    mockToast = {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };

    mockDialog = {
      open: vi.fn(),
    };

    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    mockLaundry = {
      animateFlyToNav: vi.fn(),
      refreshCounts: vi.fn(),
    };

    mockRefStore = {
      seasons: signal(mockOutfitDetail.seasons) as never,
      temperatures: signal(mockOutfitDetail.temperatures) as never,
      useCases: signal(mockOutfitDetail.useCases) as never,
      create: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [OutfitDetailPageComponent],
      providers: [
        { provide: ApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
        { provide: Dialog, useValue: mockDialog },
        { provide: Router, useValue: mockRouter },
        { provide: LaundryService, useValue: mockLaundry },
        { provide: ReferenceStoreService, useValue: mockRefStore },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'id' ? 'outfit-1' : null),
              },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OutfitDetailPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await component.loadOutfit();
    fixture.detectChanges();
  });

  it('should create and load outfit detail', () => {
    expect(component).toBeTruthy();
    expect(mockApi.getOutfit).toHaveBeenCalledWith('outfit-1');
    expect(component.outfit()?.name).toBe('Look Weekend');
  });

  it('should render outfit header with name and count pill', () => {
    const title = fixture.nativeElement.querySelector('.outfit-name');
    expect(title.textContent).toBe('Look Weekend');

    const countPill = fixture.nativeElement.querySelector('.count-pill');
    expect(countPill.textContent).toContain('2 vestiti');
  });

  it('should display description and context tags when present', () => {
    const desc = fixture.nativeElement.querySelector('.outfit-description-text');
    expect(desc).toBeTruthy();
    expect(desc.textContent).toContain('Abbinamento elegante per il weekend');

    const pills = fixture.nativeElement.querySelectorAll('.context-pill');
    expect(pills.length).toBe(3); // Primavera, Mite, Aperitivo
    expect(fixture.nativeElement.textContent).toContain('Primavera');
    expect(fixture.nativeElement.textContent).toContain('Mite');
    expect(fixture.nativeElement.textContent).toContain('Aperitivo');
  });

  it('should open edit details mode, modify fields, and save changes', async () => {
    component.openEditDetails();
    expect(component.isEditingDetails()).toBe(true);
    expect(component.editName()).toBe('Look Weekend');
    expect(component.editDescription()).toBe('Abbinamento elegante per il weekend primaverile');
    expect(component.editSeasonIds()).toEqual(['s1']);

    component.editName.set('Look Weekend Aggiornato');
    component.editDescription.set('Nuova descrizione modificata');
    component.editSeasonIds.set(['s1', 's2']);

    await component.saveEditDetails();

    expect(mockApi.updateOutfit).toHaveBeenCalledWith('outfit-1', {
      name: 'Look Weekend Aggiornato',
      description: 'Nuova descrizione modificata',
      season_ids: ['s1', 's2'],
      temperature_ids: ['t1'],
      use_case_ids: ['u1'],
    });
    expect(component.isEditingDetails()).toBe(false);
    expect(mockToast.success).toHaveBeenCalledWith('Dettagli abbinamento aggiornati con successo');
  });

  it('should render unified form across both cards and submit on enter in name input', async () => {
    component.openEditDetails();
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form.outfit-edit-form');
    expect(form).toBeTruthy();

    const leftCard = form.querySelector('.edit-card-left');
    const rightCard = form.querySelector('.edit-card-right');
    expect(leftCard).toBeTruthy();
    expect(rightCard).toBeTruthy();

    const nameInput = leftCard.querySelector('#edit-outfit-name') as HTMLInputElement;
    const descTextarea = leftCard.querySelector('#edit-outfit-desc') as HTMLTextAreaElement;
    expect(nameInput).toBeTruthy();
    expect(descTextarea).toBeTruthy();

    const contextSelector = rightCard.querySelector('app-context-selector');
    const submitBtn = rightCard.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(contextSelector).toBeTruthy();
    expect(submitBtn).toBeTruthy();

    // Modify name and simulate Enter keydown in name input
    component.editName.set('Look Serale');
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    nameInput.dispatchEvent(enterEvent);
    await fixture.whenStable();

    expect(mockApi.updateOutfit).toHaveBeenCalledWith('outfit-1', expect.objectContaining({
      name: 'Look Serale',
    }));
  });

  it('should show error and not save if name is empty', async () => {
    component.openEditDetails();
    component.editName.set('   ');

    await component.saveEditDetails();

    expect(mockToast.error).toHaveBeenCalledWith("Il nome dell'abbinamento è obbligatorio");
    expect(mockApi.updateOutfit).not.toHaveBeenCalled();
    expect(component.isEditingDetails()).toBe(true);
  });

  it('should cancel edit details mode without saving', () => {
    component.openEditDetails();
    expect(component.isEditingDetails()).toBe(true);

    component.cancelEditDetails();
    expect(component.isEditingDetails()).toBe(false);
    expect(mockApi.updateOutfit).not.toHaveBeenCalled();
  });

  it('should render clothes cards exactly like homepage', () => {
    const cards = fixture.nativeElement.querySelectorAll('.item-card');
    expect(cards.length).toBe(2);

    const firstCardTitle = cards[0].querySelector('.card-top h3');
    expect(firstCardTitle.textContent).toBe('Giacca Blu');

    const removeBtn = cards[0].querySelector('.remove-from-outfit-btn');
    expect(removeBtn).toBeTruthy();
    expect(removeBtn.textContent).toContain('Rimuovi');
  });

  it('should remove a cloth from outfit when clicking remove button and confirmed', async () => {
    mockDialog.open = vi.fn().mockReturnValue({
      closed: of(true),
    } as DialogRef<boolean>);

    await component.removeCloth(mockOutfitDetail.clothes[0], new Event('click'));

    expect(mockDialog.open).toHaveBeenCalledWith(ConfirmModalComponent, expect.anything());
    expect(mockApi.removeClothesFromOutfit).toHaveBeenCalledWith('outfit-1', 'c1');
    expect(mockToast.success).toHaveBeenCalledWith('"Giacca Blu" rimosso dall\'abbinamento');
    expect(component.outfit()?.clothes.length).toBe(1);
  });

  it('should show empty state if outfit has no clothes', async () => {
    mockApi.getOutfit = vi.fn().mockReturnValue(
      of({
        ...mockOutfitDetail,
        clothesCount: 0,
        clothes: [],
      }),
    );

    await component.loadOutfit();
    fixture.detectChanges();

    const emptyBox = fixture.nativeElement.querySelector('.empty-state-box');
    expect(emptyBox).toBeTruthy();
    expect(emptyBox.textContent).toContain('Nessun capo in questo abbinamento');
  });

  it('should handle photo upload when file is selected', async () => {
    const file = new File(['dummy content'], 'worn.jpg', { type: 'image/jpeg' });
    const mockEvent = {
      target: {
        files: [file],
        value: 'worn.jpg',
      },
    } as unknown as Event;

    await component.onPhotoFileSelected(mockEvent);

    expect(mockApi.uploadOutfitAttachment).toHaveBeenCalledWith('outfit-1', file);
    expect(mockToast.success).toHaveBeenCalledWith('Foto caricata con successo');
  });

  it('should delete photo when confirmed in modal', async () => {
    mockDialog.open = vi.fn().mockReturnValue({
      closed: of(true),
    } as DialogRef<boolean>);

    await component.deleteOutfitPhoto(mockAttachment, new Event('click'));

    expect(mockDialog.open).toHaveBeenCalledWith(ConfirmModalComponent, expect.anything());
    expect(mockApi.deleteOutfitAttachment).toHaveBeenCalledWith('outfit-1', 'att-1');
    expect(mockToast.success).toHaveBeenCalledWith('Foto eliminata con successo');
    expect(component.outfit()?.attachments?.length).toBe(0);
  });

  it('should open photo lightbox modal', () => {
    component.openPhotoLightbox(mockAttachment);

    expect(mockDialog.open).toHaveBeenCalledWith(WardrobePhotoLightboxModalComponent, {
      data: {
        src: '/api/mock-photo-url',
        alt: 'selfie.jpg',
        title: 'Look Weekend',
      },
    });
  });

  it('should update outfit canvasLayout when layoutSaved event fires', async () => {
    const newLayout = {
      c1: { x: 50, y: 50, scale: 1.2, rotation: 10, zIndex: 3 },
    };

    await component.onLayoutSaved(newLayout);

    expect(component.outfit()?.canvasLayout).toEqual(newLayout);
  });

  it('should delete outfit when delete button clicked and confirmed', async () => {
    mockDialog.open = vi.fn().mockReturnValue({
      closed: of(true),
    } as DialogRef<boolean>);

    await component.deleteOutfit();

    expect(mockApi.deleteOutfit).toHaveBeenCalledWith('outfit-1');
    expect(mockToast.success).toHaveBeenCalledWith('Abbinamento "Look Weekend" eliminato');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/outfits']);
  });

  it('should toggle all clothes in outfit to washing and animate', async () => {
    const clickEvent = new MouseEvent('click');

    // First call: not all are in washing (c1 is false, c2 is true) -> set all to true
    await component.toggleAllWashing(clickEvent);

    expect(component.allClothesInWashing()).toBe(true);
    expect(component.clothesInWashingCount()).toBe(2);
    expect(component.outfit()?.clothes.every((c) => c.isInWashing)).toBe(true);
    expect(mockToast.success).toHaveBeenCalledWith('Tutti i capi (2) messi a lavare');

    // Second call: all are now in washing -> toggle all off
    await component.toggleAllWashing(clickEvent);

    expect(component.allClothesInWashing()).toBe(false);
    expect(component.clothesInWashingCount()).toBe(0);
    expect(component.outfit()?.clothes.every((c) => !c.isInWashing)).toBe(true);
    expect(mockToast.success).toHaveBeenCalledWith('Tutti i capi rimossi dalla lavatrice');
  });

  it('should toggle all clothes in outfit to ironing and animate', async () => {
    const clickEvent = new MouseEvent('click');

    // First call: none are in ironing -> set all to true
    await component.toggleAllIroning(clickEvent);

    expect(component.allClothesInIroning()).toBe(true);
    expect(component.clothesInIroningCount()).toBe(2);
    expect(component.outfit()?.clothes.every((c) => c.isInIroning)).toBe(true);
    expect(mockToast.success).toHaveBeenCalledWith('Tutti i capi (2) messi a stirare');

    // Second call: all are now in ironing -> toggle all off
    await component.toggleAllIroning(clickEvent);

    expect(component.allClothesInIroning()).toBe(false);
    expect(component.clothesInIroningCount()).toBe(0);
    expect(component.outfit()?.clothes.every((c) => !c.isInIroning)).toBe(true);
    expect(mockToast.success).toHaveBeenCalledWith('Tutti i capi rimossi dalla stiratura');
  });

  it('should render batch washing and ironing buttons in the page', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const washBtns = compiled.querySelectorAll('.wash-batch-btn');
    const ironBtns = compiled.querySelectorAll('.iron-batch-btn');

    expect(washBtns.length).toBeGreaterThan(0);
    expect(ironBtns.length).toBeGreaterThan(0);
    expect(washBtns[0].textContent).toContain('A lavare');
    expect(ironBtns[0].textContent).toContain('A stirare');
  });
});
