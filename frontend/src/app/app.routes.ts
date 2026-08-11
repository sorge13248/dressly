import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { AppShellComponent } from './layout/shell/shell.component';
import { CallbackPageComponent } from './features/auth/pages/callback/callback.component';
import { DomainManagementPageComponent } from './features/reference-data/pages/domain-management/domain-management.component';
import { LoginPageComponent } from './features/auth/pages/login/login.component';
import { NotFoundPageComponent } from './features/errors/pages/not-found/not-found.component';
import { WardrobeDetailPageComponent } from './features/wardrobe/pages/detail/detail.component';
import { WardrobePageComponent } from './features/wardrobe/pages/main/main.component';
import { WardrobeWizardPageComponent } from './features/wardrobe/pages/editor/editor.component';

export const routes: Routes = [
	{ path: '', pathMatch: 'full', redirectTo: 'login' },
	{ path: 'login', component: LoginPageComponent },
	{ path: 'auth/callback', component: CallbackPageComponent },
	{
		path: '',
		component: AppShellComponent,
		canActivate: [authGuard],
		children: [
			{ path: 'wardrobe', component: WardrobePageComponent },
			{ path: 'wardrobe/new', component: WardrobeWizardPageComponent },
			{ path: 'wardrobe/:id', component: WardrobeDetailPageComponent },
			{ path: 'wardrobe/:id/edit', component: WardrobeWizardPageComponent },
			{ path: 'categories', component: DomainManagementPageComponent },
		],
	},
	{ path: '**', component: NotFoundPageComponent },
];
