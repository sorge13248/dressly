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
  SyncPayloadDto,
  SyncResponseDto,
  OutfitItem,
  OutfitDetailResponse,
  CanvasItemLayout,
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

  sync(payload: SyncPayloadDto): Observable<SyncResponseDto> {
    return this.http.post<SyncResponseDto>('/api/sync', payload);
  }

  getSyncState(since?: string | null): Observable<SyncResponseDto> {
    const params: Record<string, string> = {};
    if (since) {
      params['since'] = since;
    }
    return this.http.get<SyncResponseDto>('/api/sync', { params });
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

  bulkUpdateStatus(
    clothesIds: string[],
    status: 'in_wardrobe' | 'in_storage' | 'dismissed',
    locationId?: string | null,
  ) {
    return this.http.patch<{ updated: number }>('/api/clothes/bulk-status', {
      clothesIds,
      status,
      locationId,
    });
  }

  deleteClothes(id: string) {
    return this.http.delete<{ deleted: boolean }>(`/api/clothes/${id}`);
  }

  duplicateClothes(id: string) {
    return this.http.post<ClothesItem>(`/api/clothes/${id}/duplicate`, {});
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

  uploadAttachmentWithProgress(clothesId: string, file: File, kind = 'photo', originalName?: string | null) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('kind', kind);
    if (originalName !== undefined) {
      formData.append('originalName', originalName ?? '');
    }
    return this.http.post<AttachmentItem>(`/api/clothes/${clothesId}/attachments`, formData, {
      reportProgress: true,
      observe: 'events',
    });
  }

  deleteAttachment(clothesId: string, attachmentId: string) {
    return this.http.delete<{ deleted: boolean }>(`/api/clothes/${clothesId}/attachments/${attachmentId}`);
  }

  reorderAttachments(clothesId: string, attachmentIds: string[]) {
    return this.http.patch<AttachmentItem[]>(`/api/clothes/${clothesId}/attachments/order`, {
      attachment_ids: attachmentIds,
    });
  }

  getAllReferenceData() {
    return this.http.get<{
      colors: ColorItem[];
      brands: BrandItem[];
      seasons: SeasonItem[];
      temperatures: TemperatureItem[];
      'use-cases': UseCaseItem[];
      fits: FitItem[];
      materials: MaterialItem[];
      types: TypeItem[];
      tags: TagItem[];
    }>('/api/reference-data');
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

  listOutfits(): Observable<OutfitItem[]> {
    return this.http.get<OutfitItem[]>('/api/outfits');
  }

  getOutfit(id: string): Observable<OutfitDetailResponse> {
    return this.http.get<OutfitDetailResponse>(`/api/outfits/${id}`);
  }

  createOutfit(payload: {
    name: string;
    description?: string | null;
    clothesIds?: string[];
    season_ids?: string[];
    temperature_ids?: string[];
    use_case_ids?: string[];
    canvasLayout?: Record<string, CanvasItemLayout> | null;
  }): Observable<OutfitDetailResponse> {
    return this.http.post<OutfitDetailResponse>('/api/outfits', payload);
  }

  updateOutfit(
    id: string,
    payload: {
      name?: string;
      description?: string | null;
      clothesIds?: string[];
      season_ids?: string[];
      temperature_ids?: string[];
      use_case_ids?: string[];
      canvasLayout?: Record<string, CanvasItemLayout> | null;
    },
  ): Observable<OutfitDetailResponse> {
    return this.http.patch<OutfitDetailResponse>(`/api/outfits/${id}`, payload);
  }

  addClothesToOutfit(id: string, clothesIds: string[]): Observable<OutfitDetailResponse> {
    return this.http.post<OutfitDetailResponse>(`/api/outfits/${id}/clothes`, { clothesIds });
  }

  removeClothesFromOutfit(id: string, clothesId: string): Observable<OutfitDetailResponse> {
    return this.http.delete<OutfitDetailResponse>(`/api/outfits/${id}/clothes/${clothesId}`);
  }

  deleteOutfit(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`/api/outfits/${id}`);
  }

  uploadOutfitAttachment(
    outfitId: string,
    file: File,
    options?: { kind?: string; originalName?: string; sortOrder?: number },
  ): Observable<AttachmentItem> {
    const formData = new FormData();
    formData.append('file', file, options?.originalName || file.name);
    if (options?.kind) formData.append('kind', options.kind);
    if (options?.sortOrder !== undefined) formData.append('sortOrder', String(options.sortOrder));
    return this.http.post<AttachmentItem>(`/api/outfits/${outfitId}/attachments`, formData);
  }

  deleteOutfitAttachment(outfitId: string, attachmentId: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`/api/outfits/${outfitId}/attachments/${attachmentId}`);
  }

  getOutfitAttachmentUrl(outfitId: string, attachment: AttachmentItem, variant?: 'preview' | 'original'): string {
    const base = `/api/outfits/${outfitId}/attachments/${attachment.id}/file`;
    return variant ? `${base}?variant=${variant}` : base;
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