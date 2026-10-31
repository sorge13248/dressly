import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class LaundryService {
  private readonly api = inject(ApiService);

  readonly washingCount = signal(0);
  readonly ironingCount = signal(0);

  async refreshCounts(): Promise<void> {
    try {
      const counts = await firstValueFrom(this.api.getLaundryCounts());
      this.washingCount.set(counts?.washingCount ?? 0);
      this.ironingCount.set(counts?.ironingCount ?? 0);
    } catch {
      // Ignore count fetch errors gracefully
    }
  }

  setCounts(washing: number, ironing: number): void {
    this.washingCount.set(washing);
    this.ironingCount.set(ironing);
  }

  setWashingCount(count: number): void {
    this.washingCount.set(count);
  }

  setIroningCount(count: number): void {
    this.ironingCount.set(count);
  }
}

