import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CreateNameModalComponent, CreateNameModalData } from './create-name-modal.component';

describe('CreateNameModalComponent', () => {
  const modalData: CreateNameModalData = {
    title: 'Nuovo brand',
    description: 'Inserisci il nome del brand da creare.',
    label: 'Nome brand',
    placeholder: 'Es. Uniqlo',
    requiredMessage: 'Inserisci il nome del brand',
    confirmLabel: 'Crea',
    cancelLabel: 'Annulla',
  };

  it('should render create name modal with title, description, label and buttons', () => {
    const dialogRefSpy = { close: vi.fn() };

    TestBed.configureTestingModule({
      imports: [CreateNameModalComponent],
      providers: [
        { provide: DialogRef, useValue: dialogRefSpy },
        { provide: DIALOG_DATA, useValue: modalData },
      ],
    });

    const fixture = TestBed.createComponent(CreateNameModalComponent);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h2')?.textContent).toContain('Nuovo brand');
    expect(element.querySelector('p')?.textContent).toContain('Inserisci il nome del brand da creare.');
    expect(element.querySelector('label span')?.textContent).toContain('Nome brand');

    const input = element.querySelector('input') as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(input?.placeholder).toBe('Es. Uniqlo');

    const cancelBtn = element.querySelector('button.ghost') as HTMLButtonElement | null;
    expect(cancelBtn).toBeTruthy();
    expect(cancelBtn?.textContent?.trim()).toBe('Annulla');

    const submitBtn = element.querySelector('button.primary') as HTMLButtonElement | null;
    expect(submitBtn).toBeTruthy();
    expect(submitBtn?.type).toBe('submit');
    expect(submitBtn?.textContent?.trim()).toBe('Crea');

    const form = element.querySelector('form.modal-shell') as HTMLFormElement | null;
    expect(form).toBeTruthy();
  });

  it('should close with null when cancel button is clicked', () => {
    const dialogRefSpy = { close: vi.fn() };

    TestBed.configureTestingModule({
      imports: [CreateNameModalComponent],
      providers: [
        { provide: DialogRef, useValue: dialogRefSpy },
        { provide: DIALOG_DATA, useValue: modalData },
      ],
    });

    const fixture = TestBed.createComponent(CreateNameModalComponent);
    fixture.detectChanges();

    const cancelBtn = fixture.nativeElement.querySelector('button.ghost') as HTMLButtonElement;
    cancelBtn.click();

    expect(dialogRefSpy.close).toHaveBeenCalledWith(null);
  });

  it('should show error and not close when submitting with empty input', () => {
    const dialogRefSpy = { close: vi.fn() };

    TestBed.configureTestingModule({
      imports: [CreateNameModalComponent],
      providers: [
        { provide: DialogRef, useValue: dialogRefSpy },
        { provide: DIALOG_DATA, useValue: modalData },
      ],
    });

    const fixture = TestBed.createComponent(CreateNameModalComponent);
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(dialogRefSpy.close).not.toHaveBeenCalled();
    const errorText = fixture.nativeElement.querySelector('.field-error-text');
    expect(errorText?.textContent).toContain('Inserisci il nome del brand');
  });

  it('should close with trimmed name when valid and submitted via submit button or form submit', () => {
    const dialogRefSpy = { close: vi.fn() };

    TestBed.configureTestingModule({
      imports: [CreateNameModalComponent],
      providers: [
        { provide: DialogRef, useValue: dialogRefSpy },
        { provide: DIALOG_DATA, useValue: modalData },
      ],
    });

    const fixture = TestBed.createComponent(CreateNameModalComponent);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.modalForm.name().value.set('  Uniqlo  ');
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(dialogRefSpy.close).toHaveBeenCalledWith('Uniqlo');
  });
});

