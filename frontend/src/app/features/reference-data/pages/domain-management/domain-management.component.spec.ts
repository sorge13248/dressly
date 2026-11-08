import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { DomainManagementPageComponent } from './domain-management.component';
import { BackupRestoreModalComponent } from '../../../../shared/components/backup-restore-modal/backup-restore-modal.component';

describe('DomainManagementPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DomainManagementPageComponent, RouterTestingModule],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(DomainManagementPageComponent);
    expect(fixture.componentInstance).toBeTruthy();
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
});