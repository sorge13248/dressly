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

export interface SyncPayloadDto {
  lastSyncAt?: string | null;
  clientTime?: string;
  changes?: {
    clothes?: ClothesSyncInput[];
    referenceData?: ReferenceDataSyncInput[];
    laundry?: LaundrySyncInput;
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
  };
}

