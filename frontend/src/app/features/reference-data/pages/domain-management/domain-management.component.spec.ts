import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { DomainManagementPageComponent } from './domain-management.component';

describe('DomainManagementPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DomainManagementPageComponent, RouterTestingModule],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(DomainManagementPageComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});