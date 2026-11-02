import { TestBed } from '@angular/core/testing';
import { WashingIconComponent } from './washing-icon.component';
import { DryingIconComponent } from './drying-icon.component';
import { IroningIconComponent } from './ironing-icon.component';
import { OutfitIconComponent } from './outfit-icon.component';

describe('Icons', () => {
  describe('WashingIconComponent', () => {
    it('should create and render washing SVG with custom size', () => {
      const fixture = TestBed.createComponent(WashingIconComponent);
      fixture.componentRef.setInput('size', 24);
      fixture.detectChanges();

      const svg = fixture.nativeElement.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg.style.width).toBe('24px');
      expect(svg.style.height).toBe('24px');
    });
  });

  describe('DryingIconComponent', () => {
    it('should create and render drying SVG with custom size', () => {
      const fixture = TestBed.createComponent(DryingIconComponent);
      fixture.componentRef.setInput('size', 28);
      fixture.detectChanges();

      const svg = fixture.nativeElement.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg.style.width).toBe('28px');
      expect(svg.style.height).toBe('28px');
    });
  });

  describe('IroningIconComponent', () => {
    it('should create and render ironing SVG with custom size', () => {
      const fixture = TestBed.createComponent(IroningIconComponent);
      fixture.componentRef.setInput('size', 22);
      fixture.detectChanges();

      const svg = fixture.nativeElement.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg.style.width).toBe('22px');
      expect(svg.style.height).toBe('22px');
    });
  });

  describe('OutfitIconComponent', () => {
    it('should create and render outfit SVG with custom size', () => {
      const fixture = TestBed.createComponent(OutfitIconComponent);
      fixture.componentRef.setInput('size', 18);
      fixture.detectChanges();

      const svg = fixture.nativeElement.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg.style.width).toBe('18px');
      expect(svg.style.height).toBe('18px');
    });
  });
});
