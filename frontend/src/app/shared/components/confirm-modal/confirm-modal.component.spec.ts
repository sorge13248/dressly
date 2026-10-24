import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ConfirmModalComponent, ConfirmModalData } from './confirm-modal.component';

describe('ConfirmModalComponent', () => {
  it('should render default confirmation modal with cancel and danger button', () => {
    const dialogRefSpy = { close: vi.fn() };
    const modalData: ConfirmModalData = {
      title: 'Elimina capo',
      message: 'Sei sicuro di voler eliminare questo capo?',
      confirmLabel: 'Elimina',
    };

    TestBed.configureTestingModule({
      imports: [ConfirmModalComponent],
      providers: [
        { provide: DialogRef, useValue: dialogRefSpy },
        { provide: DIALOG_DATA, useValue: modalData },
      ],
    });

    const fixture = TestBed.createComponent(ConfirmModalComponent);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h2')?.textContent).toContain('Elimina capo');
    expect(element.querySelector('p')?.textContent).toContain('Sei sicuro di voler eliminare questo capo?');

    const ghostBtn = element.querySelector('button.ghost') as HTMLButtonElement | null;
    expect(ghostBtn).toBeTruthy();
    expect(ghostBtn?.textContent?.trim()).toBe('Annulla');

    const dangerBtn = element.querySelector('button.danger') as HTMLButtonElement | null;
    expect(dangerBtn).toBeTruthy();
    expect(dangerBtn?.textContent?.trim()).toBe('Elimina');

    ghostBtn?.click();
    expect(dialogRefSpy.close).toHaveBeenCalledWith(false);

    dangerBtn?.click();
    expect(dialogRefSpy.close).toHaveBeenCalledWith(true);
  });

  it('should render alert style without cancel button and with primary confirm button', () => {
    const dialogRefSpy = { close: vi.fn() };
    const modalData: ConfirmModalData = {
      title: 'Sessione scaduta',
      message: 'La sessione è scaduta. Ricarica la pagina.',
      confirmLabel: 'Ricarica pagina',
      showCancel: false,
      confirmVariant: 'primary',
    };

    TestBed.configureTestingModule({
      imports: [ConfirmModalComponent],
      providers: [
        { provide: DialogRef, useValue: dialogRefSpy },
        { provide: DIALOG_DATA, useValue: modalData },
      ],
    });

    const fixture = TestBed.createComponent(ConfirmModalComponent);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('button.ghost')).toBeNull();

    const primaryBtn = element.querySelector('button.primary') as HTMLButtonElement | null;
    expect(primaryBtn).toBeTruthy();
    expect(primaryBtn?.textContent?.trim()).toBe('Ricarica pagina');

    primaryBtn?.click();
    expect(dialogRefSpy.close).toHaveBeenCalledWith(true);
  });
});

