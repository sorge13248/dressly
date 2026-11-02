import { TestBed } from '@angular/core/testing';
import { DialogRef } from '@angular/cdk/dialog';
import { UpdateModalComponent } from './update-modal.component';

describe('UpdateModalComponent', () => {
  it('should render update modal with title, message and action buttons', () => {
    const dialogRefSpy = { close: vi.fn() };

    TestBed.configureTestingModule({
      imports: [UpdateModalComponent],
      providers: [{ provide: DialogRef, useValue: dialogRefSpy }],
    });

    const fixture = TestBed.createComponent(UpdateModalComponent);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h2')?.textContent).toContain('Aggiornamento disponibile');
    expect(element.querySelector('p')?.textContent).toContain('nuova versione di Dressly');

    const ghostBtn = element.querySelector('button.ghost') as HTMLButtonElement | null;
    expect(ghostBtn).toBeTruthy();
    expect(ghostBtn?.textContent?.trim()).toBe('Più tardi');

    const primaryBtn = element.querySelector('button.primary') as HTMLButtonElement | null;
    expect(primaryBtn).toBeTruthy();
    expect(primaryBtn?.textContent?.trim()).toBe('Ricarica ora');

    ghostBtn?.click();
    expect(dialogRefSpy.close).toHaveBeenCalledWith(false);

    primaryBtn?.click();
    expect(dialogRefSpy.close).toHaveBeenCalledWith(true);
  });
});

