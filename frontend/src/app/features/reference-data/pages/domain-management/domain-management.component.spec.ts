import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { DomainManagementPageComponent } from './domain-management.component';
import { BackupRestoreModalComponent } from '../../../../shared/components/backup-restore-modal/backup-restore-modal.component';
import { ReferenceStoreService } from '../../../../core/reference-store.service';

describe('DomainManagementPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DomainManagementPageComponent, RouterTestingModule],
    }).compileComponents();
  });

  it('should create and render window titlebar', () => {
    const fixture = TestBed.createComponent(DomainManagementPageComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();

    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1?.textContent?.trim()).toBe('Gestione domini');
  });

  it('should open BackupRestoreModalComponent when openBackupRestoreModal is called', async () => {
    const fixture = TestBed.createComponent(DomainManagementPageComponent);
    const comp = fixture.componentInstance;
    const dialog = TestBed.inject(Dialog);

    const dialogSpy = vi.spyOn(dialog, 'open').mockReturnValue({
      closed: of(true),
    } as any);

    await comp.openBackupRestoreModal();

    expect(dialogSpy).toHaveBeenCalledWith(BackupRestoreModalComponent, expect.objectContaining({
      width: 'min(640px, 94vw)',
    }));
  });

  it('should navigate to /wardrobe when cancelOrClose is called', () => {
    const fixture = TestBed.createComponent(DomainManagementPageComponent);
    const comp = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    comp.cancelOrClose();

    expect(navigateSpy).toHaveBeenCalledWith(['/wardrobe']);
  });

  it('should auto sort rows alphabetically and update order', async () => {
    const fixture = TestBed.createComponent(DomainManagementPageComponent);
    const comp = fixture.componentInstance;
    const store = TestBed.inject(ReferenceStoreService);

    comp.select('fits'); // sortable kind
    vi.spyOn(store, 'fits').mockReturnValue([
      { id: '1', name: 'Slim', sortOrder: 0, userId: 'u1' } as any,
      { id: '2', name: 'Classic', sortOrder: 1, userId: 'u1' } as any,
    ]);
    const updateSpy = vi.spyOn(store, 'update').mockResolvedValue({} as any);

    await comp.autoSort();

    expect(updateSpy).toHaveBeenCalledWith('fits', '2', { sortOrder: 0 });
    expect(updateSpy).toHaveBeenCalledWith('fits', '1', { sortOrder: 1 });
  });
});
