import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { LocationSelectModalComponent, LocationSelectModalData } from './location-select-modal.component';
import { ReferenceStoreService } from '../../../../core/reference-store.service';
import { signal } from '@angular/core';

describe('LocationSelectModalComponent', () => {
  const mockDialogRef = {
    close: vi.fn(),
  };

  const mockReferenceStore = {
    locationsSortedByRoomAndName: signal([
      { id: 'loc-1', name: 'Scatola A', roomId: 'room-1' },
      { id: 'loc-2', name: 'Armadio B', roomId: null },
    ]),
    rooms: signal([{ id: 'room-1', name: 'Camera' }]),
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create and render fallback count 1 when DIALOG_DATA is null', () => {
    TestBed.configureTestingModule({
      imports: [LocationSelectModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: null },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: ReferenceStoreService, useValue: mockReferenceStore },
      ],
    });

    const fixture = TestBed.createComponent(LocationSelectModalComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.componentInstance.count()).toBe(1);
    const desc = fixture.nativeElement.querySelector('.modal-desc');
    expect(desc.textContent).toContain('1 capo');
  });

  it('should render plural count when DIALOG_DATA has count > 1', () => {
    const modalData: LocationSelectModalData = { count: 4 };

    TestBed.configureTestingModule({
      imports: [LocationSelectModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: modalData },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: ReferenceStoreService, useValue: mockReferenceStore },
      ],
    });

    const fixture = TestBed.createComponent(LocationSelectModalComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.count()).toBe(4);
    const desc = fixture.nativeElement.querySelector('.modal-desc');
    expect(desc.textContent).toContain('4 capi');
  });

  it('should close with null on cancel', () => {
    TestBed.configureTestingModule({
      imports: [LocationSelectModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: { count: 2 } },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: ReferenceStoreService, useValue: mockReferenceStore },
      ],
    });

    const fixture = TestBed.createComponent(LocationSelectModalComponent);
    fixture.componentInstance.close();

    expect(mockDialogRef.close).toHaveBeenCalledWith(null);
  });

  it('should close with selected locationId on confirm', () => {
    TestBed.configureTestingModule({
      imports: [LocationSelectModalComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: { count: 2 } },
        { provide: DialogRef, useValue: mockDialogRef },
        { provide: ReferenceStoreService, useValue: mockReferenceStore },
      ],
    });

    const fixture = TestBed.createComponent(LocationSelectModalComponent);
    fixture.componentInstance.selectedLocationId.set('loc-1');
    fixture.componentInstance.confirm();

    expect(mockDialogRef.close).toHaveBeenCalledWith({ locationId: 'loc-1' });
  });
});
