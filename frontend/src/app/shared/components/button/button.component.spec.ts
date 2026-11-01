import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ButtonComponent } from './button.component';

@Component({
  standalone: true,
  imports: [ButtonComponent],
  template: `
    <button appButton [variant]="variant()" [size]="size()" [disabled]="disabled()" (click)="onClick()">
      <span>Test Button</span>
    </button>
    <app-button [variant]="'danger'" [size]="'sm'" (click)="onAppButtonClick()">
      Custom Button
    </app-button>
  `,
})
class TestHostComponent {
  variant = signal<'primary' | 'secondary' | 'danger' | 'ghost' | 'success'>('primary');
  size = signal<'sm' | 'md' | 'lg' | 'icon'>('md');
  disabled = signal(false);
  clicked = false;
  appButtonClicked = false;

  onClick() {
    this.clicked = true;
  }

  onAppButtonClick() {
    this.appButtonClicked = true;
  }
}

describe('ButtonComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should render button with primary variant and md size by default', () => {
    const btn = fixture.nativeElement.querySelector('button[appButton]');
    expect(btn.classList.contains('app-btn')).toBe(true);
    expect(btn.classList.contains('btn-primary')).toBe(true);
    expect(btn.classList.contains('btn-md')).toBe(true);
    expect(btn.textContent).toContain('Test Button');
  });

  it('should update classes when variant and size change', () => {
    host.variant.set('secondary');
    host.size.set('sm');
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('button[appButton]');
    expect(btn.classList.contains('btn-secondary')).toBe(true);
    expect(btn.classList.contains('btn-sm')).toBe(true);
  });

  it('should trigger click when not disabled', () => {
    const btn = fixture.nativeElement.querySelector('button[appButton]');
    btn.click();
    expect(host.clicked).toBe(true);
  });

  it('should not trigger click when disabled', () => {
    host.disabled.set(true);
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('button[appButton]');
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('should support custom app-button element selector', () => {
    const customBtn = fixture.nativeElement.querySelector('app-button');
    expect(customBtn.classList.contains('btn-danger')).toBe(true);
    expect(customBtn.classList.contains('btn-sm')).toBe(true);

    customBtn.click();
    expect(host.appButtonClicked).toBe(true);
  });
});
