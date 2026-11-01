import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AttachmentItem,
  BaseReferenceItem,
  BrandItem,
  ClothesFilters,
  ClothesItem,
  ClothesPageResponse,
  ColorItem,
  DryingInstructionItem,
  FitItem,
  IroningInstructionItem,
  MaterialItem,
  OidcConfig,
  ReferenceKind,
  SeasonItem,
  TagItem,
  TemperatureItem,
  TypeItem,
  UseCaseItem,
  WashingInstructionItem,
  BuyDetailItem,
  IroningClothesResponse,
  WashingClothesResponse,
  LaundryCountsResponse,
} from './models';

type OidcMetadata = {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  userinfo_endpoint?: string;
};

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  getOidcConfig(): Observable<OidcConfig> {
    return this.http.get<OidcConfig>('/api/oidc/config');
  }

  getOidcMetadata(): Observable<OidcMetadata> {
    return this.http.get<OidcMetadata>('/api/oidc/metadata');
  }

  getMe() {
    return this.http.get<{ id: string; subject: string; email: string | null; displayName: string }>('/api/me');
  }

  listClothes(filters: Partial<ClothesFilters>) {
    return this.http.get<ClothesPageResponse>('/api/clothes', { params: this.toParams(filters) });
  }

  getLaundryCounts(): Observable<LaundryCountsResponse> {
    return this.http.get<LaundryCountsResponse>('/api/clothes/laundry-counts');
  }

  getClothesForWashing(): Observable<WashingClothesResponse> {
    return this.http.get<WashingClothesResponse>('/api/clothes/washing');
  }

  addToWashing(clothesIds: string[]) {
    return this.http.post<{ added: number; existing: number; total: number }>('/api/clothes/washing', {
      clothesIds,
    });
  }

  removeFromWashing(clothesId: string) {
    return this.http.delete<{ removed: boolean }>(`/api/clothes/washing/${clothesId}`);
  }

  clearWashing() {
    return this.http.delete<{ cleared: boolean }>('/api/clothes/washing');
  }

  moveWashingToIroning(clothesId: string) {
    return this.http.post<{ moved: boolean; washingCount: number; ironingCount: number }>(
      `/api/clothes/washing/${clothesId}/move-to-ironing`,
      {},
    );
  }

  getClothesForIroning(ids?: string[]): Observable<IroningClothesResponse> {
    if (ids && ids.length > 0) {
      return this.http.get<IroningClothesResponse>('/api/clothes/ironing', {
        params: { ids: ids.join(',') },
      });
    }
    return this.http.get<IroningClothesResponse>('/api/clothes/ironing');
  }

  addToIroning(clothesIds: string[]) {
    return this.http.post<{ added: number; existing: number; total: number }>('/api/clothes/ironing', {
      clothesIds,
    });
  }

  removeFromIroning(clothesId: string) {
    return this.http.delete<{ removed: boolean }>(`/api/clothes/ironing/${clothesId}`);
  }

  clearIroning() {
    return this.http.delete<{ cleared: boolean }>('/api/clothes/ironing');
  }

  getClothes(id: string) {
    return this.http.get<ClothesItem>(`/api/clothes/${id}`);
  }

  createClothes(payload: Record<string, unknown>) {
    return this.http.post<ClothesItem>('/api/clothes', payload);
  }

  updateClothes(id: string, payload: Record<string, unknown>) {
    return this.http.patch<ClothesItem>(`/api/clothes/${id}`, payload);
  }

  deleteClothes(id: string) {
    return this.http.delete<{ deleted: boolean }>(`/api/clothes/${id}`);
  }

  uploadAttachment(clothesId: string, file: File, kind = 'photo', originalName?: string | null) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('kind', kind);
    if (originalName !== undefined) {
      formData.append('originalName', originalName ?? '');
    }
    return this.http.post<AttachmentItem>(`/api/clothes/${clothesId}/attachments`, formData);
  }

  deleteAttachment(clothesId: string, attachmentId: string) {
    return this.http.delete<{ deleted: boolean }>(`/api/clothes/${clothesId}/attachments/${attachmentId}`);
  }

  reorderAttachments(clothesId: string, attachmentIds: string[]) {
    return this.http.patch<AttachmentItem[]>(`/api/clothes/${clothesId}/attachments/order`, {
      attachment_ids: attachmentIds,
    });
  }

  listReference(kind: ReferenceKind) {
    return this.http.get<Array<ColorItem | BrandItem | SeasonItem | TemperatureItem | UseCaseItem | FitItem | MaterialItem | TypeItem | TagItem>>(`/api/${kind}`);
  }

  createReference(kind: ReferenceKind, payload: Record<string, unknown>) {
    return this.http.post<BaseReferenceItem>(`/api/${kind}`, payload);
  }

  updateReference(kind: ReferenceKind, id: string, payload: Record<string, unknown>) {
    return this.http.put<BaseReferenceItem>(`/api/${kind}/${id}`, payload);
  }

  deleteReference(kind: ReferenceKind, id: string) {
    return this.http.delete<{ deleted: boolean }>(`/api/${kind}/${id}`);
  }

  private toParams(filters: Partial<ClothesFilters>) {
    const params: Record<string, string> = {};

    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      if (Array.isArray(value)) {
        if (value.length > 0) {
          params[key] = value.join(',');
        }
        continue;
      }

      params[key] = String(value);
    }

    return params;
  }
}