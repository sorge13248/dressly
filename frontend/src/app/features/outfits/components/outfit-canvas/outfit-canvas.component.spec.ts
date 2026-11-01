import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutfitCanvasComponent } from './outfit-canvas.component';
import { ApiService } from '../../../../core/api.service';
import { ToastService } from '../../../../core/toast.service';
import { ClothesItem } from '../../../../core/models';

describe('OutfitCanvasComponent', () => {
  let fixture: ComponentFixture<OutfitCanvasComponent>;
  let component: OutfitCanvasComponent;
  let mockApi: Partial<ApiService>;
  let mockToast: Partial<ToastService>;

  const mockClothes: ClothesItem[] = [
    {
      id: 'c1',
      userId: 'u1',
      name: 'Maglietta Bianca',
      fullTitle: 'Maglietta Bianca',
      size: null,
      notes: null,
      attachments: [],
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'c2',
      userId: 'u1',
      name: 'Jeans Blu',
      fullTitle: 'Jeans Blu',
      size: null,
      notes: null,
      attachments: [],
      createdAt: '',
      updatedAt: '',
    },
  ];

  beforeEach(() => {
    mockApi = {
      updateOutfit: vi.fn().mockReturnValue(of({ id: 'out-1' })),
    };
    mockToast = {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [OutfitCanvasComponent],
      providers: [
        { provide: ApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
      ],
    });

    fixture = TestBed.createComponent(OutfitCanvasComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('outfitId', 'out-1');
    fixture.componentRef.setInput('clothes', mockClothes);
    fixture.detectChanges();
  });

  it('should render items for all clothes in outfit', () => {
    const items = fixture.nativeElement.querySelectorAll('.canvas-item');
    expect(items.length).toBe(2);
    expect(items[0].getAttribute('aria-label')).toContain('Maglietta Bianca');
    expect(items[1].getAttribute('aria-label')).toContain('Jeans Blu');
  });

  it('should automatically center bounding box of items upon saving', async () => {
    // Set off-center positions: minX: 10, maxX: 30 -> center is 20 (shift = +30)
    // minY: 10, maxY: 30 -> center is 20 (shift = +30)
    component.itemsLayout.set({
      c1: { x: 10, y: 10, scale: 1, zIndex: 1 },
      c2: { x: 30, y: 30, scale: 1, zIndex: 2 },
    });

    await component.saveLayout();

    const savedCall = (mockApi.updateOutfit as any).mock.calls[0];
    expect(savedCall[0]).toBe('out-1');
    const savedLayout = savedCall[1].canvasLayout;

    // Shift should be 50 - 20 = 30
    expect(savedLayout.c1.x).toBe(40);
    expect(savedLayout.c1.y).toBe(40);
    expect(savedLayout.c2.x).toBe(60);
    expect(savedLayout.c2.y).toBe(60);

    // Bounding box center is now (40+60)/2 = 50
    expect((savedLayout.c1.x + savedLayout.c2.x) / 2).toBe(50);
    expect((savedLayout.c1.y + savedLayout.c2.y) / 2).toBe(50);

    expect(mockToast.success).toHaveBeenCalledWith('Disposizione centrata e salvata con successo!');
  });

  it('should reset layout when clicking reset', () => {
    component.resetLayout();
    expect(mockToast.info).toHaveBeenCalled();
  });

  it('should scale selected item and not display rotate button', () => {
    component.selectedClothId.set('c1');
    fixture.detectChanges();

    component.scaleItem('c1', 0.1);
    expect(component.getClothLayout('c1').scale).toBe(1.2);

    const rotateBtn = fixture.nativeElement.querySelector('.rotate-btn');
    expect(rotateBtn).toBeFalsy();
  });

  it('should select multiple items with marquee box and move them together', () => {
    // Set initial known positions
    component.itemsLayout.set({
      c1: { x: 20, y: 30, scale: 1, zIndex: 1 },
      c2: { x: 25, y: 35, scale: 1, zIndex: 2 },
    });

    const boardEl = fixture.nativeElement.querySelector('.canvas-board') as HTMLElement;
    vi.spyOn(boardEl, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 1000,
      right: 1000,
      bottom: 1000,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // 1. Simulate marquee pointer down & move over the region containing c1 and c2 (x: 10% to 40%, y: 10% to 50%)
    const downEvt = new PointerEvent('pointerdown', { button: 0, clientX: 100, clientY: 100 });
    component.onBoardPointerDown(downEvt);

    const moveEvt = new PointerEvent('pointermove', { button: 0, clientX: 400, clientY: 500 });
    component.onBoardPointerMove(moveEvt);

    expect(component.selectedClothIds()).toContain('c1');
    expect(component.selectedClothIds()).toContain('c2');

    const upEvt = new PointerEvent('pointerup', { button: 0, clientX: 400, clientY: 500 });
    component.onBoardPointerUp(upEvt);

    // Both remain selected
    expect(component.selectedClothIds().length).toBe(2);

    // 2. Drag c1 by +100px in X (+10%) and +50px in Y (+5%)
    const itemTarget = document.createElement('div');
    const itemDownEvt = new PointerEvent('pointerdown', { button: 0, clientX: 200, clientY: 300 });
    Object.defineProperty(itemDownEvt, 'currentTarget', { value: itemTarget });
    itemTarget.setPointerCapture = vi.fn();
    itemTarget.releasePointerCapture = vi.fn();

    component.onItemPointerDown(itemDownEvt, 'c1');

    const itemMoveEvt = new PointerEvent('pointermove', { button: 0, clientX: 300, clientY: 350 });
    component.onItemPointerMove(itemMoveEvt, 'c1');

    // Both c1 and c2 should have moved by +10% in X and +5% in Y
    expect(component.getClothLayout('c1').x).toBe(30);
    expect(component.getClothLayout('c1').y).toBe(35);
    expect(component.getClothLayout('c2').x).toBe(35);
    expect(component.getClothLayout('c2').y).toBe(40);

    const itemUpEvt = new PointerEvent('pointerup', { button: 0, clientX: 300, clientY: 350 });
    Object.defineProperty(itemUpEvt, 'currentTarget', { value: itemTarget });
    component.onItemPointerUp(itemUpEvt, 'c1');
    expect(component.isDragging()).toBe(false);
  });
});
