import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { OutfitSelectModalComponent, OutfitSelectModalData } from './outfit-select-modal.component';
import { ApiService } from '../../../../core/api.service';
import { ToastService } from '../../../../core/toast.service';
import { OutfitDetailResponse } from '../../../../core/models';

describe('OutfitSelectModalComponent', () => {
  const modalData: OutfitSelectModalData = {
    clothesIds: ['c1', 'c2'],
  };

  const mockApi = {
    listOutfits: vi.fn().mockReturnValue(of([])),
    createOutfit: vi.fn().mockReturnValue(of({} as OutfitDetailResponse)),
    addClothesToOutfit: vi.fn().mockReturnValue(of({} as OutfitDetailResponse)),
    deleteOutfit: vi.fn().mockReturnValue(of({ deleted: true })),
  };

  const mockToast = {
    success: vi.fn(),
    error: vi.fn(),
  };

  const mockDialog = {
    open: vi.fn(),
  };

  const mockRouter = {
    navigate: vi.fn().mockResolvedValue(true),
  };

  it('should render modal with header and clothes count', () => {
    const dialogRefSpy = { close: vi.fn() };

    TestBed.configureTestingModule({
      imports: [OutfitSelectModalComponent],
      providers: [
        { provide: DialogRef, useValue: dialogRefSpy },
        { provide: DIALOG_DATA, useValue: modalData },
        { provide: ApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
        { provide: Dialog, useValue: mockDialog },
        { provide: Router, useValue: mockRouter },
      ],
    });

    const fixture = TestBed.createComponent(OutfitSelectModalComponent);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h2')?.textContent).toContain('Scegli abbinamento');
    expect(element.querySelector('.header-titles p')?.textContent).toContain('2 vestiti selezionati');
  });

  it('should close with null when close button is clicked', () => {
    const dialogRefSpy = { close: vi.fn() };

    TestBed.configureTestingModule({
      imports: [OutfitSelectModalComponent],
      providers: [
        { provide: DialogRef, useValue: dialogRefSpy },
        { provide: DIALOG_DATA, useValue: modalData },
        { provide: ApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
        { provide: Dialog, useValue: mockDialog },
        { provide: Router, useValue: mockRouter },
      ],
    });

    const fixture = TestBed.createComponent(OutfitSelectModalComponent);
    fixture.detectChanges();

    const closeBtn = fixture.nativeElement.querySelector('.close-btn') as HTMLButtonElement;
    closeBtn.click();

    expect(dialogRefSpy.close).toHaveBeenCalledWith(null);
  });

  it('should close with outfit when an outfit is selected or created', () => {
    const dialogRefSpy = { close: vi.fn() };

    TestBed.configureTestingModule({
      imports: [OutfitSelectModalComponent],
      providers: [
        { provide: DialogRef, useValue: dialogRefSpy },
        { provide: DIALOG_DATA, useValue: modalData },
        { provide: ApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
        { provide: Dialog, useValue: mockDialog },
        { provide: Router, useValue: mockRouter },
      ],
    });

    const fixture = TestBed.createComponent(OutfitSelectModalComponent);
    fixture.detectChanges();

    const mockOutfit = { id: 'out-1', name: 'Test' } as OutfitDetailResponse;
    fixture.componentInstance.onOutfitSelected(mockOutfit);
    expect(dialogRefSpy.close).toHaveBeenCalledWith(mockOutfit);

    fixture.componentInstance.onOutfitCreated(mockOutfit);
    expect(dialogRefSpy.close).toHaveBeenCalledWith(mockOutfit);
  });
});

