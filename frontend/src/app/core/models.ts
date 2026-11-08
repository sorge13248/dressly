export type ReferenceKind = 'colors' | 'brands' | 'seasons' | 'temperatures' | 'use-cases' | 'fits' | 'materials' | 'types' | 'tags';

export interface OidcConfig {
  issuerUrl: string;
  clientId: string;
  redirectUri: string;
}

export interface AuthUser {
  id: string;
  subject: string;
  email: string | null;
  displayName: string;
  pictureUrl: string | null;
}

export interface BaseReferenceItem {
  id: string;
  userId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ColorItem extends BaseReferenceItem {
  hexCode: string | null;
}

export interface BrandItem extends BaseReferenceItem {
  logoUrl: string | null;
}

export interface SeasonItem extends BaseReferenceItem {
  icon: string | null;
}

export interface TemperatureItem extends BaseReferenceItem {
  icon: string | null;
}

export interface UseCaseItem extends BaseReferenceItem {
  icon: string | null;
}

export interface FitItem extends BaseReferenceItem {}

export interface MaterialItem extends BaseReferenceItem {}

export interface TypeItem extends BaseReferenceItem {}

export interface TagItem extends BaseReferenceItem {}

export interface AttachmentItem {
  id: string;
  userId: string;
  clothesId: string;
  kind: string;
  fileName: string;
  originalName: string | null;
  mimeType: string;
  size: number;
  sortOrder: number;
  path: string;
  previewPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WashingInstructionItem {
  id?: string;
  userId?: string;
  temperature?: string | null;
  washType?: 'do_not_wash' | 'hand_wash_only' | 'washer_ok' | null;
  bleachType?: 'no_bleach' | 'non_chlorine_bleach' | 'any_bleach' | null;
  stretch?: boolean;
  reverseWashing?: boolean;
  closedZips?: boolean;
  similarColors?: boolean;
  washSeparately?: boolean;
  colorLossTestTemperature?: number | null;
  useColorCatcher?: boolean;
  colorLossRisk?: boolean;
  wash_type?: 'do_not_wash' | 'hand_wash_only' | 'washer_ok';
  bleach_type?: 'no_bleach' | 'non_chlorine_bleach' | 'any_bleach';
  washing_temperature?: number | null;
  reverse_washing?: boolean;
  closed_zips?: boolean;
  similar_colors?: boolean;
  wash_separately?: boolean;
  use_color_catcher?: boolean;
  color_loss?: boolean;
  color_loss_test_temperature?: number | null;
}

export interface DryingInstructionItem {
  id?: string;
  userId?: string;
  method?: string | null;
  tumbleDry?: boolean;
  tumbleDryTemperature?: 'low' | 'medium' | 'high' | null;
  tumble_dry?: boolean;
  tumble_dry_temperature?: 'low' | 'medium' | 'high' | null;
}

export interface IroningInstructionItem {
  id?: string;
  userId?: string;
  ironInsideOut?: boolean;
  ironType?: 'yes' | 'without_steam' | 'no' | null;
  temperature?: string | null;
  iron_type?: 'yes' | 'without_steam' | 'no';
  ironing_temperature?: number | null;
  inside_out?: boolean;
}

export interface BuyDetailItem {
  id?: string;
  userId?: string;
  store?: string | null;
  purchaseDate?: string | null;
  priceCents?: number | null;
  shopUrl?: string | null;
  receiptAttachmentId?: string | null;
  shop_name?: string | null;
  shop_url?: string | null;
  purchase_date?: string | null;
}

export interface ClothesItem {
  id: string;
  userId: string;
  code?: string | null;
  fullTitle?: string | null;
  name: string | null;
  size: string | null;
  notes: string | null;
  brand?: BrandItem | null;
  fit?: FitItem | null;
  type?: TypeItem | null;
  colors?: ColorItem[];
  materials?: MaterialItem[];
  seasons?: SeasonItem[];
  temperatures?: TemperatureItem[];
  useCases?: UseCaseItem[];
  tags?: TagItem[];
  attachments?: AttachmentItem[];
  washingInstruction?: WashingInstructionItem | null;
  dryingInstruction?: DryingInstructionItem | null;
  ironingInstruction?: IroningInstructionItem | null;
  buyDetail?: BuyDetailItem | null;
  isInWashing?: boolean;
  isInIroning?: boolean;
  isCumulative?: boolean;
  quantity?: number;
  washingQuantity?: number;
  ironingQuantity?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClothesPageResponse {
  items: ClothesItem[];
  total: number;
  page: number;
  perPage: number;
}

export type ClothesSortKey =
  | 'created_desc'
  | 'created_asc'
  | 'name_asc'
  | 'name_desc'
  | 'type_order'
  | 'type_asc'
  | 'season_current'
  | 'season_cycle'
  | 'code_asc'
  | 'availability';

export interface ClothesSortOption {
  key: ClothesSortKey;
  label: string;
}

export const CLOTHES_SORT_OPTIONS: ClothesSortOption[] = [
  { key: 'created_desc', label: 'Più recenti' },
  { key: 'created_asc', label: 'Meno recenti' },
  { key: 'name_asc', label: 'Nome (A → Z)' },
  { key: 'name_desc', label: 'Nome (Z → A)' },
  { key: 'type_order', label: 'Tipologia (ordine armadio)' },
  { key: 'type_asc', label: 'Tipologia (A → Z)' },
  { key: 'season_current', label: 'Stagione corrente prima' },
  { key: 'season_cycle', label: 'Stagione (ciclo annuale)' },
  { key: 'code_asc', label: 'Codice etichetta (A → Z)' },
  { key: 'availability', label: 'Disponibili prima (puliti)' },
];

export interface ClothesFilters {
  search: string;
  brand_id: string;
  fit_id: string;
  size: string;
  color_ids: string[];
  material_ids: string[];
  season_ids: string[];
  temperature_ids: string[];
  use_case_ids: string[];
  type_ids: string[];
  tag_ids: string[];
  sort?: ClothesSortKey;
  page: number;
  per_page: number;
}

export interface WizardAttachmentDraft {
  id: string;
  file: File;
  previewUrl: string;
  displayName?: string | null;
  originalNameOverride?: string | null;
}

export interface ClothesWizardFormValue {
  name: string;
  code: string;
  size: string;
  fit_id: string;
  brand_id: string;
  type_id: string;
  notes: string;
  is_cumulative: boolean;
  quantity: number;
  color_ids: string[];
  material_ids: string[];
  season_ids: string[];
  temperature_ids: string[];
  use_case_ids: string[];
    tag_ids: string[];
  washing_enabled: boolean;
  washing: WashingInstructionItem;
  drying_enabled: boolean;
  drying: DryingInstructionItem;
  ironing_enabled: boolean;
  ironing: IroningInstructionItem;
  buy_enabled: boolean;
  buy: BuyDetailItem;
}

export interface IroningClothesItem {
  id: string;
  code?: string | null;
  name: string | null;
  fullTitle?: string | null;
  brand: { id: string; name: string } | null;
  type: { id: string; name: string } | null;
  colors: Array<{ id: string; name: string; hexCode: string | null }>;
  ironingInstruction: {
    id?: string;
    temperature: string | null;
    ironType: 'yes' | 'without_steam' | 'no' | null;
    ironInsideOut: boolean;
  } | null;
  primaryAttachment: {
    id: string;
    fileName: string;
    previewPath: string | null;
    mimeType: string;
  } | null;
  isInWashing?: boolean;
  isInIroning?: boolean;
  isCumulative?: boolean;
  quantity?: number;
  ironingQuantity?: number;
}

export interface IroningClothesResponse {
  items: IroningClothesItem[];
}

export interface WashingClothesItem {
  id: string;
  code?: string | null;
  name: string | null;
  fullTitle?: string | null;
  brand: { id: string; name: string } | null;
  type: { id: string; name: string } | null;
  colors: Array<{ id: string; name: string; hexCode: string | null }>;
  washingInstruction: {
    id?: string;
    temperature: string | null;
    washType: 'do_not_wash' | 'hand_wash_only' | 'washer_ok' | null;
    bleachType: 'no_bleach' | 'non_chlorine_bleach' | 'any_bleach' | null;
    stretch: boolean;
    reverseWashing: boolean;
    closedZips: boolean;
    similarColors: boolean;
    washSeparately: boolean;
    useColorCatcher: boolean;
    colorLossRisk: boolean;
    colorLossTestTemperature: number | null;
  } | null;
  primaryAttachment: {
    id: string;
    fileName: string;
    previewPath: string | null;
    mimeType: string;
  } | null;
  isInWashing?: boolean;
  isInIroning?: boolean;
  isCumulative?: boolean;
  quantity?: number;
  washingQuantity?: number;
}

export interface WashingClothesResponse {
  items: WashingClothesItem[];
}

export interface LaundryCountsResponse {
  washingCount: number;
  ironingCount: number;
}

export type SyncStatus = 'syncing' | 'online-ok' | 'offline' | 'conflict';

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
  canvasLayout?: Record<string, CanvasItemLayout> | null;
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
    clothes: ClothesItem[];
    deletedClothesIds: string[];
    referenceData: Record<string, BaseReferenceItem[]>;
    deletedReferenceData: Array<{ kind: string; id: string }>;
    laundry: {
      washingClothesIds: string[];
      ironingClothesIds: string[];
    };
    outfits?: OutfitItem[];
    deletedOutfitIds?: string[];
  };
}

export interface SyncQueueItem {
  id: string;
  entityType: 'clothes' | 'referenceData' | 'laundry' | 'outfits';
  action: 'create' | 'update' | 'delete';
  entityId: string;
  kind?: string;
  updatedAt: string;
  fields?: Record<string, FieldUpdate>;
  data?: Record<string, unknown>;
  deleted?: boolean;
}

export interface CanvasItemLayout {
  x: number; // percentage 0 - 100 or relative px
  y: number; // percentage 0 - 100 or relative px
  scale?: number;
  rotation?: number;
  zIndex?: number;
}

export interface OutfitClothesSummary {
  id: string;
  code?: string | null;
  name: string | null;
  fullTitle?: string | null;
  brand?: BrandItem | null;
  type?: TypeItem | null;
  colors?: ColorItem[];
  attachments?: AttachmentItem[];
  primaryAttachment?: AttachmentItem | null;
}

export interface OutfitItem {
  id: string;
  name: string;
  description?: string | null;
  canvasLayout?: Record<string, CanvasItemLayout> | null;
  seasons?: SeasonItem[];
  temperatures?: TemperatureItem[];
  useCases?: UseCaseItem[];
  attachments?: AttachmentItem[];
  clothesCount: number;
  clothes: OutfitClothesSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface OutfitDetailResponse {
  id: string;
  name: string;
  description?: string | null;
  canvasLayout?: Record<string, CanvasItemLayout> | null;
  seasons?: SeasonItem[];
  temperatures?: TemperatureItem[];
  useCases?: UseCaseItem[];
  attachments?: AttachmentItem[];
  clothesCount: number;
  clothes: ClothesItem[];
  createdAt: string;
  updatedAt: string;
}


