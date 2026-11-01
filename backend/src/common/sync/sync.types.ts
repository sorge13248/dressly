export interface FieldUpdate<T = unknown> {
  value: T;
  updatedAt?: string;
}

export interface ClothesSyncInput {
  id: string;
  updatedAt: string;
  deleted?: boolean;
  fields?: Record<string, FieldUpdate | unknown>;
  data?: Record<string, unknown>;
}

export interface ReferenceDataSyncInput {
  kind: string;
  id: string;
  updatedAt: string;
  deleted?: boolean;
  fields?: Record<string, FieldUpdate | unknown>;
  data?: Record<string, unknown>;
}

export interface LaundrySyncInput {
  washing?: {
    added?: string[];
    removed?: string[];
  };
  ironing?: {
    added?: string[];
    removed?: string[];
  };
}

export interface OutfitSyncInput {
  id: string;
  updatedAt: string;
  deleted?: boolean;
  name?: string;
  description?: string | null;
  canvasLayout?: Record<string, any> | null;
  clothesIds?: string[];
  season_ids?: string[];
  temperature_ids?: string[];
  use_case_ids?: string[];
  fields?: Record<string, FieldUpdate | unknown>;
  data?: Record<string, unknown>;
}

export interface SyncPayloadDto {
  lastSyncAt?: string | null;
  clientTime?: string;
  changes?: {
    clothes?: ClothesSyncInput[];
    referenceData?: ReferenceDataSyncInput[];
    laundry?: LaundrySyncInput;
    outfits?: OutfitSyncInput[];
  };
}

export interface SyncConflict {
  entityType: 'clothes' | 'referenceData';
  entityId: string;
  kind?: string;
  field: string;
  clientValue: unknown;
  serverValue: unknown;
  clientTimestamp: string;
  serverTimestamp: string;
  resolution: 'client' | 'server' | 'unresolved';
  message: string;
}

export interface SyncResponseDto {
  serverTime: string;
  status: 'ok' | 'conflict';
  conflicts: SyncConflict[];
  applied: {
    clothes: string[];
    referenceData: string[];
    laundry: boolean;
    outfits?: string[];
  };
  serverChanges: {
    clothes: unknown[];
    deletedClothesIds: string[];
    referenceData: Record<string, unknown[]>;
    deletedReferenceData: Array<{ kind: string; id: string }>;
    laundry: {
      washingClothesIds: string[];
      ironingClothesIds: string[];
    };
    outfits?: unknown[];
    deletedOutfitIds?: string[];
  };
}

