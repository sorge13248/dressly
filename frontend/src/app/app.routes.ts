import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { AppShellComponent } from './layout/shell/shell.component';
import { CallbackPageComponent } from './features/auth/pages/callback/callback.component';
import { DomainManagementPageComponent } from './features/reference-data/pages/domain-management/domain-management.component';
import { LoginPageComponent } from './features/auth/pages/login/login.component';
import { NotFoundPageComponent } from './features/errors/pages/not-found/not-found.component';
import { WardrobeDetailPageComponent } from './features/wardrobe/pages/detail/detail.component';
import { WardrobePageComponent } from './features/wardrobe/pages/main/main.component';
import { WardrobeWizardPageComponent, canDeactivateWardrobeWizard } from './features/wardrobe/pages/editor/editor.component';
import { SeasonalChangePageComponent, canDeactivateSeasonalChange } from './features/wardrobe/pages/seasonal-change/seasonal-change.component';
import { IroningPageComponent } from './features/wardrobe/pages/ironing/ironing.component';
import { WashingPageComponent } from './features/wardrobe/pages/washing/washing.component';
import { OutfitsPageComponent } from './features/outfits/pages/list/outfits-page.component';
import { OutfitDetailPageComponent } from './features/outfits/pages/detail/outfit-detail-page.component';

export const routes: Routes = [
	{ path: '', pathMatch: 'full', redirectTo: 'wardrobe' },
	{ path: 'login', title: 'Accedi', component: LoginPageComponent },
	{ path: 'auth/callback', title: 'Autenticazione', component: CallbackPageComponent },
	{
		path: '',
		component: AppShellComponent,
		canActivate: [authGuard],
		children: [
			{ path: 'wardrobe', title: 'Guardaroba', component: WardrobePageComponent },
			{ path: 'wardrobe/new', title: 'Nuovo capo', component: WardrobeWizardPageComponent, canDeactivate: [canDeactivateWardrobeWizard] },
			{ path: 'wardrobe/seasonal-change', title: 'Cambio di stagione', component: SeasonalChangePageComponent, canDeactivate: [canDeactivateSeasonalChange] },
			{ path: 'wardrobe/washing', title: 'Lavaggio', component: WashingPageComponent },
			{ path: 'wardrobe/ironing', title: 'Stiratura', component: IroningPageComponent },
			{ path: 'wardrobe/:id', title: 'Dettaglio capo', component: WardrobeDetailPageComponent },
			{ path: 'wardrobe/:id/edit', title: 'Modifica capo', component: WardrobeWizardPageComponent, canDeactivate: [canDeactivateWardrobeWizard] },
			{ path: 'outfits', title: 'Outfit', component: OutfitsPageComponent },
			{ path: 'outfits/:id', title: 'Dettaglio outfit', component: OutfitDetailPageComponent },
			{ path: 'abbinamenti', redirectTo: 'outfits' },
			{ path: 'abbinamenti/:id', redirectTo: 'outfits/:id' },
			{ path: 'categories', title: 'Gestione domini', component: DomainManagementPageComponent },
		],
	},
	{ path: '**', title: 'Pagina non trovata', component: NotFoundPageComponent },
];
