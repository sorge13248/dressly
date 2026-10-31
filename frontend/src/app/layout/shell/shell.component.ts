import { NgOptimizedImage } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { LaundryService } from '../../core/laundry.service';
import { ReferenceStoreService } from '../../core/reference-store.service';
import { ToastStackComponent } from '../../shared/components/toast-stack/toast-stack.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [NgOptimizedImage, RouterLink, RouterLinkActive, RouterOutlet, ToastStackComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class AppShellComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly referenceStore = inject(ReferenceStoreService);
  readonly laundryService = inject(LaundryService);

  readonly navItems = computed(() => {
    const washingState = this.laundryService.washingState ? this.laundryService.washingState() : { count: this.laundryService.washingCount(), displayedCount: this.laundryService.washingCount(), animating: 'idle' as const };
    const ironingState = this.laundryService.ironingState ? this.laundryService.ironingState() : { count: this.laundryService.ironingCount(), displayedCount: this.laundryService.ironingCount(), animating: 'idle' as const };

    return [
      { label: 'Il mio guardaroba', path: 'wardrobe', exact: true, badge: null, badgeState: null },
      { label: 'Lavatrice', path: 'wardrobe/washing', exact: true, badge: washingState.count, badgeState: washingState },
      { label: 'Stiratura', path: 'wardrobe/ironing', exact: true, badge: ironingState.count, badgeState: ironingState },
      { label: 'Domini', path: 'categories', exact: false, badge: null, badgeState: null },
    ];
  });

  readonly displayName = computed(() => this.authService.displayName());
  readonly email = computed(() => this.authService.email());
  readonly pictureUrl = computed(() => this.authService.pictureUrl());
  readonly initials = computed(() => this.authService.initials());
  readonly firstName = computed(() => {
    const fullName = this.displayName().trim();
    if (!fullName) {
      return 'Utente';
    }
    const [first] = fullName.split(/\s+/);
    return first || 'Utente';
  });
  readonly lastName = computed(() => {
    const fullName = this.displayName().trim();
    if (!fullName) {
      return '';
    }
    const parts = fullName.split(/\s+/);
    return parts.length > 1 ? parts.slice(1).join(' ') : '';
  });
  readonly loginMode = computed(() => this.authService.loginMode());
  readonly referenceLoading = computed(() => this.referenceStore.loading());
  readonly mobileNavOpen = signal(false);

  ngOnInit() {
    void this.referenceStore.loadAll();
    void this.laundryService.refreshCounts();
  }

  logout() {
    this.authService.logout();
  }

  toggleNavMenu() {
    this.mobileNavOpen.update((open) => !open);
  }

  closeNavMenu() {
    this.mobileNavOpen.set(false);
  }
}