import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ApiService } from './api.service';
import { LaundryService } from './laundry.service';

describe('LaundryService', () => {
  let service: LaundryService;
  let apiSpy: { getLaundryCounts: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    apiSpy = {
      getLaundryCounts: vi.fn().mockReturnValue(of({ washingCount: 3, ironingCount: 5 })),
    };

    TestBed.configureTestingModule({
      providers: [LaundryService, { provide: ApiService, useValue: apiSpy }],
    });

    service = TestBed.inject(LaundryService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should be created with initial 0 counts', () => {
    expect(service.washingCount()).toBe(0);
    expect(service.ironingCount()).toBe(0);
    expect(service.washingState().animating).toBe('idle');
    expect(service.ironingState().animating).toBe('idle');
  });

  it('should refresh counts from API and trigger pop-up animation on initial count load', async () => {
    await service.refreshCounts();

    expect(service.washingCount()).toBe(3);
    expect(service.ironingCount()).toBe(5);
    expect(service.washingState().animating).toBe('pop-up');
    expect(service.ironingState().animating).toBe('pop-up');
  });

  it('should handle decrement with slide-down animation and reset to idle after timer', () => {
    service.setWashingCount(5);
    vi.advanceTimersByTime(500);
    expect(service.washingState().animating).toBe('idle');

    // Decrement from 5 to 4
    service.updateWashingCount(4);
    expect(service.washingState().count).toBe(4);
    expect(service.washingState().animating).toBe('slide-down');
    expect(service.washingState().displayedCount).toBe(5);

    vi.advanceTimersByTime(500);
    expect(service.washingState().displayedCount).toBe(4);
    expect(service.washingState().animating).toBe('idle');
  });

  it('should handle decrement to 0 with slide-out-zero animation', () => {
    service.setWashingCount(1);
    vi.advanceTimersByTime(500);

    service.updateWashingCount(0);
    expect(service.washingState().count).toBe(0);
    expect(service.washingState().animating).toBe('slide-out-zero');

    vi.advanceTimersByTime(500);
    expect(service.washingState().displayedCount).toBe(0);
    expect(service.washingState().animating).toBe('idle');
  });

  it('should handle increment with pop-up animation', () => {
    service.setIroningCount(2);
    vi.advanceTimersByTime(500);

    service.updateIroningCount(3);
    expect(service.ironingState().count).toBe(3);
    expect(service.ironingState().animating).toBe('pop-up');

    vi.advanceTimersByTime(500);
    expect(service.ironingState().animating).toBe('idle');
  });

  it('should handle error in refreshCounts gracefully', async () => {
    apiSpy.getLaundryCounts.mockReturnValue(throwError(() => new Error('Network error')));
    service.setWashingCount(2);

    await service.refreshCounts();
    expect(service.washingCount()).toBe(2);
  });

  it('should run animateFlyToNav without throwing when DOM elements are not found', async () => {
    await expect(service.animateFlyToNav(null, 'washing', 'add')).resolves.toBeUndefined();
  });
});
