import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Component } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmptyStateComponent } from './empty-state.component';

@Component({
  standalone: true,
  imports: [EmptyStateComponent],
  template: `
    <app-empty-state
      [title]="title"
      [description]="description"
      [icon]="icon"
      [actionText]="actionText"
      [actionRoute]="actionRoute"
      (action)="onAction()"
    >
      <div slot="icon" class="projected-icon">Custom Icon</div>
      <div slot="action" class="projected-action">Custom Action</div>
    </app-empty-state>
  `,
})
class TestHostComponent {
  title = 'Test Title';
  description = 'Test Description with <strong>bold</strong> text';
  icon: string | null = 'outfit';
  actionText: string | null = 'Vai al guardaroba';
  actionRoute: string | null = '/wardrobe';
  actionCalled = false;

  onAction() {
    this.actionCalled = true;
  }
}

describe('EmptyStateComponent', () => {
  let fixture: ComponentFixture<EmptyStateComponent>;
  let component: EmptyStateComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmptyStateComponent, TestHostComponent],
      providers: [provideRouter([{ path: '**', component: TestHostComponent }])],
    }).compileComponents();

    fixture = TestBed.createComponent(EmptyStateComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render title and description', () => {
    fixture.componentRef.setInput('title', 'Nessun capo da lavare');
    fixture.componentRef.setInput('description', 'Aggiungi capi alla lavatrice.');
    fixture.detectChanges();

    const titleEl = fixture.nativeElement.querySelector('h2');
    const descEl = fixture.nativeElement.querySelector('p');

    expect(titleEl?.textContent).toBe('Nessun capo da lavare');
    expect(descEl?.textContent).toBe('Aggiungi capi alla lavatrice.');
  });

  it('should render html content in description safely', () => {
    fixture.componentRef.setInput('title', 'Nessun abbinamento');
    fixture.componentRef.setInput(
      'description',
      'Clicca su <strong>Abbina...</strong> per iniziare.',
    );
    fixture.detectChanges();

    const strongEl = fixture.nativeElement.querySelector('p strong');
    expect(strongEl).toBeTruthy();
    expect(strongEl?.textContent).toBe('Abbina...');
  });

  it('should render washing icon when icon="washing"', () => {
    fixture.componentRef.setInput('icon', 'washing');
    fixture.detectChanges();

    const washingIcon = fixture.nativeElement.querySelector('app-washing-icon');
    expect(washingIcon).toBeTruthy();
  });

  it('should render ironing icon when icon="ironing"', () => {
    fixture.componentRef.setInput('icon', 'ironing');
    fixture.detectChanges();

    const ironingIcon = fixture.nativeElement.querySelector('app-ironing-icon');
    expect(ironingIcon).toBeTruthy();
  });

  it('should render drying icon when icon="drying"', () => {
    fixture.componentRef.setInput('icon', 'drying');
    fixture.detectChanges();

    const dryingIcon = fixture.nativeElement.querySelector('app-drying-icon');
    expect(dryingIcon).toBeTruthy();
  });

  it('should render outfit icon when icon="outfit" or "clothes"', () => {
    fixture.componentRef.setInput('icon', 'outfit');
    fixture.detectChanges();

    const svg = fixture.nativeElement.querySelector('.empty-icon-wrap svg');
    expect(svg).toBeTruthy();
  });

  it('should not render icon wrap when icon="none" or null', () => {
    fixture.componentRef.setInput('icon', 'none');
    fixture.detectChanges();

    const iconWrap = fixture.nativeElement.querySelector('.empty-icon-wrap');
    expect(iconWrap).toBeNull();
  });

  it('should render link when actionRoute is provided', () => {
    fixture.componentRef.setInput('actionText', 'Vai al guardaroba');
    fixture.componentRef.setInput('actionRoute', '/wardrobe');
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a.empty-action-btn');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/wardrobe');
    expect(link?.textContent.trim()).toBe('Vai al guardaroba');
  });

  it('should render button when actionRoute is null and emit action on click', () => {
    fixture.componentRef.setInput('actionText', 'Fai qualcosa');
    fixture.componentRef.setInput('actionRoute', null);
    fixture.detectChanges();

    const spy = vi.fn();
    component.action.subscribe(spy);

    const button = fixture.nativeElement.querySelector('button.empty-action-btn');
    expect(button).toBeTruthy();
    expect(button?.textContent.trim()).toBe('Fai qualcosa');

    button?.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should emit action on clicking link when actionRoute is provided', async () => {
    fixture.componentRef.setInput('actionText', 'Vai al guardaroba');
    fixture.componentRef.setInput('actionRoute', '/wardrobe');
    fixture.detectChanges();

    const spy = vi.fn();
    component.action.subscribe(spy);

    const link = fixture.nativeElement.querySelector('a.empty-action-btn');
    link?.click();
    await fixture.whenStable();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should support projected slots when input props are omitted', async () => {
    const hostFixture = TestBed.createComponent(TestHostComponent);
    const hostComp = hostFixture.componentInstance;
    hostComp.icon = 'custom';
    hostComp.actionText = null;
    hostComp.actionRoute = null;
    hostFixture.detectChanges();

    const projectedIcon = hostFixture.nativeElement.querySelector('.projected-icon');
    const projectedAction = hostFixture.nativeElement.querySelector('.projected-action');

    expect(projectedIcon).toBeTruthy();
    expect(projectedIcon?.textContent).toBe('Custom Icon');
    expect(projectedAction).toBeTruthy();
    expect(projectedAction?.textContent).toBe('Custom Action');
  });
});
