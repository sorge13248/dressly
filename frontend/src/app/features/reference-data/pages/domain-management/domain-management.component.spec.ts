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

  it('should format washing program specs correctly including cold wash 0°', () => {
    const fixture = TestBed.createComponent(DomainManagementPageComponent);
    const comp = fixture.componentInstance;

    comp.select('washing-programs');

    const regular = comp.getWashingProgramSpecs({
      id: 'wp1',
      name: 'Cotone',
      temperature: 40,
      spinSpeed: 1200,
    } as any);
    expect(regular).toBe('40° · 1200 giri');

    const cold = comp.getWashingProgramSpecs({
      id: 'wp2',
      name: 'Lana Freddo',
      temperature: 0,
      spinSpeed: 600,
    } as any);
    expect(cold).toBe('0° · 600 giri');

    const noSpin = comp.getWashingProgramSpecs({
      id: 'wp3',
      name: 'Seta',
      temperature: 30,
      spinSpeed: null,
    } as any);
    expect(noSpin).toBe('30°');
  });

  it('should return detergent description correctly', () => {
    const fixture = TestBed.createComponent(DomainManagementPageComponent);
    const comp = fixture.componentInstance;

    comp.select('detergents');

    const desc = comp.getDetergentDescription({
      id: 'd1',
      name: 'Perlana',
      description: 'Per capi delicati e lana',
    } as any);
    expect(desc).toBe('Per capi delicati e lana');

    comp.select('colors');
    expect(comp.getDetergentDescription({ id: 'd1', name: 'Perlana', description: 'abc' } as any)).toBeNull();
  });

  it('should build payload with numeric temperature and spinSpeed for washing-programs and description for detergents', () => {
    const fixture = TestBed.createComponent(DomainManagementPageComponent);
    const comp = fixture.componentInstance;

    comp.select('washing-programs');
    const wpPayload = (comp as any).buildPayload({
      name: 'Eco 40',
      sortOrder: '1',
      extra: '',
      temperature: '40',
      spinSpeed: '1000',
    });
    expect(wpPayload.name).toBe('Eco 40');
    expect(wpPayload.sortOrder).toBe(1);
    expect(wpPayload.temperature).toBe(40);
    expect(wpPayload.spinSpeed).toBe(1000);

    // Cold wash with 0
    const coldPayload = (comp as any).buildPayload({
      name: 'Cold',
      sortOrder: '2',
      extra: '',
      temperature: '0',
      spinSpeed: '0',
    });
    expect(coldPayload.temperature).toBe(0);
    expect(coldPayload.spinSpeed).toBe(0);

    comp.select('detergents');
    const detPayload = (comp as any).buildPayload({
      name: 'Sapone Marsiglia',
      sortOrder: '1',
      extra: '',
      description: '   Ipoallergenico per neonati   ',
    });
    expect(detPayload.name).toBe('Sapone Marsiglia');
    expect(detPayload.description).toBe('Ipoallergenico per neonati');
  });
});
