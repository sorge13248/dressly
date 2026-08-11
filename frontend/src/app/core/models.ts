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
  createdAt: string;
  updatedAt: string;
}

export interface ClothesPageResponse {
  items: ClothesItem[];
  total: number;
  page: number;
  perPage: number;
}

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
  size: string;
  fit_id: string;
  brand_id: string;
  type_id: string;
  notes: string;
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
