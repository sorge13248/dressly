import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WindowFrameComponent } from './window-frame.component';

@Component({
  standalone: true,
  imports: [WindowFrameComponent],
  template: `
    <app-window-frame
      [title]="title()"
      [subtitle]="subtitle()"
      [icon]="icon()"
      [showClose]="showClose()"
      [showIcon]="showIcon()"
      (close)="onCloseClicked()"
    >
      <button window-actions type="button" class="custom-action-btn">Action</button>
      <div window-toolbar class="custom-toolbar">TOOLBAR</div>
      <div class="test-body-content">BODY_CONTENT</div>
      <div window-dock class="custom-dock">DOCK</div>
    </app-window-frame>
  `,
})
class StandardHostComponent {
  readonly title = signal('Finestra Test');
  readonly subtitle = signal('Passo 1');
  readonly icon = signal('🏷️');
  readonly showClose = signal(true);
  readonly showIcon = signal(true);
  closed = false;

  onCloseClicked(): void {
    this.closed = true;
  }
}

@Component({
  standalone: true,
  imports: [WindowFrameComponent],
  template: `
    <app-window-frame (close)="closed = true">
      <span window-icon class="custom-icon">CUSTOM_ICON</span>
      <span window-title class="custom-title">CUSTOM_TITLE</span>
      <span window-subtitle class="custom-subtitle">CUSTOM_SUBTITLE</span>
    </app-window-frame>
  `,
})
class ProjectedHostComponent {
  closed = false;
}

describe('WindowFrameComponent', () => {
  describe('StandardHostComponent', () => {
    let fixture: ComponentFixture<StandardHostComponent>;
    let host: StandardHostComponent;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [StandardHostComponent],
      }).compileComponents();

      fixture = TestBed.createComponent(StandardHostComponent);
      host = fixture.componentInstance;
      fixture.detectChanges();
    });

    it('should create and render title and subtitle', () => {
      const el: HTMLElement = fixture.nativeElement;
      const h1 = el.querySelector('h1');
      expect(h1?.textContent?.trim()).toBe('Finestra Test');

      const badge = el.querySelector('.step-pill-badge');
      expect(badge?.textContent?.trim()).toBe('Passo 1');
    });

    it('should render icon input as fallback inside icon badge', () => {
      const el: HTMLElement = fixture.nativeElement;
      const iconBadge = el.querySelector('.title-icon-badge');
      expect(iconBadge).toBeTruthy();
      expect(iconBadge?.textContent).toContain('🏷️');
    });

    it('should render projected actions, toolbar, default content, and dock', () => {
      const el: HTMLElement = fixture.nativeElement;

      expect(el.querySelector('.custom-action-btn')?.textContent).toBe('Action');
      expect(el.querySelector('.custom-toolbar')?.textContent).toBe('TOOLBAR');
      expect(el.querySelector('.test-body-content')?.textContent).toBe('BODY_CONTENT');
      expect(el.querySelector('.custom-dock')?.textContent).toBe('DOCK');
    });

    it('should emit close output when close button is clicked', () => {
      const el: HTMLElement = fixture.nativeElement;
      const closeBtn = el.querySelector('.window-close-btn') as HTMLButtonElement;
      expect(closeBtn).toBeTruthy();

      closeBtn.click();
      expect(host.closed).toBe(true);
    });

    it('should toggle close button when showClose is changed', () => {
      host.showClose.set(false);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.window-close-btn')).toBeNull();
    });

    it('should toggle icon badge when showIcon is changed', () => {
      host.showIcon.set(false);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.title-icon-badge')).toBeNull();
    });
  });

  describe('ProjectedHostComponent', () => {
    let fixture: ComponentFixture<ProjectedHostComponent>;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [ProjectedHostComponent],
      }).compileComponents();

      fixture = TestBed.createComponent(ProjectedHostComponent);
      fixture.detectChanges();
    });

    it('should project icon, title, and subtitle into their respective slots', () => {
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.custom-icon')?.textContent).toBe('CUSTOM_ICON');
      expect(el.querySelector('.custom-title')?.textContent).toBe('CUSTOM_TITLE');
      expect(el.querySelector('.custom-subtitle')?.textContent).toBe('CUSTOM_SUBTITLE');
    });
  });

  describe('direct component instance', () => {
    it('should apply custom maxWidth and shellPadding', () => {
      const fixture = TestBed.createComponent(WindowFrameComponent);
      fixture.componentRef.setInput('maxWidth', '800px');
      fixture.componentRef.setInput('shellPadding', '10px');
      fixture.detectChanges();

      const shell = fixture.nativeElement.querySelector('.window-shell') as HTMLElement;
      const frame = fixture.nativeElement.querySelector('.window-frame') as HTMLElement;

      expect(shell.style.padding).toBe('10px');
      expect(frame.style.maxWidth).toBe('800px');
    });
  });
});
