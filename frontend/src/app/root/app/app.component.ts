import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { PwaUpdateService } from '../../core/pwa-update.service';
import { AeroSpinnerComponent } from '../../shared/components/spinner/spinner.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, AeroSpinnerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class App implements OnInit {
  readonly authService = inject(AuthService);
  private readonly pwaUpdateService = inject(PwaUpdateService);

  ngOnInit(): void {
    this.pwaUpdateService.init();
  }
}
