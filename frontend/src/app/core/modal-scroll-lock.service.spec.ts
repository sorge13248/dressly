import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { ModalScrollLockService } from './modal-scroll-lock.service';

describe('ModalScrollLockService', () => {
  let service: ModalScrollLockService;
  let doc: Document;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ModalScrollLockService],
    });
    service = TestBed.inject(ModalScrollLockService);
    doc = TestBed.inject(DOCUMENT);
    service.init();
  });

  afterEach(() => {
    service.destroy();
    document.querySelectorAll('.cdk-overlay-dark-backdrop').forEach((el) => el.remove());
  });

  it('should not prevent wheel scroll when no modal is open', () => {
    const wheelEvent = new WheelEvent('wheel', { cancelable: true, deltaY: 100 });
    const preventDefaultSpy = vi.spyOn(wheelEvent, 'preventDefault');

    window.dispatchEvent(wheelEvent);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it('should prevent wheel scroll on background when a modal is open', () => {
    const backdrop = doc.createElement('div');
    backdrop.className = 'cdk-overlay-dark-backdrop';
    doc.body.appendChild(backdrop);

    const wheelEvent = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
    const preventDefaultSpy = vi.spyOn(wheelEvent, 'preventDefault');

    backdrop.dispatchEvent(wheelEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('should allow wheel scroll inside a scrollable element in the modal', () => {
    const backdrop = doc.createElement('div');
    backdrop.className = 'cdk-overlay-dark-backdrop';
    doc.body.appendChild(backdrop);

    const pane = doc.createElement('div');
    pane.className = 'cdk-overlay-pane';

    const scrollable = doc.createElement('div');
    scrollable.style.overflowY = 'auto';
    Object.defineProperty(scrollable, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(scrollable, 'clientHeight', { value: 200, configurable: true });
    Object.defineProperty(scrollable, 'scrollTop', { value: 50, configurable: true });

    pane.appendChild(scrollable);
    doc.body.appendChild(pane);

    const wheelEvent = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 20 });
    const preventDefaultSpy = vi.spyOn(wheelEvent, 'preventDefault');

    scrollable.dispatchEvent(wheelEvent);

    expect(preventDefaultSpy).not.toHaveBeenCalled();

    pane.remove();
  });

  it('should prevent touchmove on non-scrollable area when modal is open', () => {
    const backdrop = doc.createElement('div');
    backdrop.className = 'cdk-overlay-dark-backdrop';
    doc.body.appendChild(backdrop);

    const touchEvent = new TouchEvent('touchmove', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(touchEvent, 'preventDefault');

    backdrop.dispatchEvent(touchEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('should prevent scroll keys when focus is outside the modal pane', () => {
    const backdrop = doc.createElement('div');
    backdrop.className = 'cdk-overlay-dark-backdrop';
    doc.body.appendChild(backdrop);

    const keyEvent = new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown', cancelable: true });
    const preventDefaultSpy = vi.spyOn(keyEvent, 'preventDefault');

    window.dispatchEvent(keyEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });
});
