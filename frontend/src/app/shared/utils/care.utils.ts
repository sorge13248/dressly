import { ClothesItem, WashingClothesItem } from '../../core/models';

export type IroningStatus = 'can_iron' | 'cannot_iron' | 'missing_info';
export type WashingStatus = 'can_wash' | 'cannot_wash' | 'missing_info';

export const CARE_LABELS = {
  ironing: {
    cannot_iron: 'Il capo non va stirato',
    missing_info: 'Informazioni stiraggio mancanti',
  },
  washing: {
    cannot_wash: 'Il capo non va lavato',
    missing_info: 'Informazioni lavaggio mancanti',
  },
} as const;

export const CARE_TOOLTIPS = {
  ironing: {
    cannot_iron: 'Questo capo non va stirato',
    missing_info: 'Informazioni di stiratura non presenti o incomplete',
  },
  washing: {
    cannot_wash: 'Questo capo non va lavato',
    missing_info: 'Informazioni di lavaggio non presenti o incomplete',
  },
} as const;

/**
 * Returns the human-readable warning/error label for the ironing status of a garment,
 * or null if the garment can be ironed.
 */
export function getIroningLabel(
  statusOrItem: IroningStatus | ClothesItem | WashingClothesItem | null | undefined,
): string | null {
  const status = typeof statusOrItem === 'string' ? statusOrItem : getIroningStatus(statusOrItem);
  if (status === 'cannot_iron') return CARE_LABELS.ironing.cannot_iron;
  if (status === 'missing_info') return CARE_LABELS.ironing.missing_info;
  return null;
}

/**
 * Returns the human-readable warning/error label for the washing status of a garment,
 * or null if the garment can be washed.
 */
export function getWashingLabel(
  statusOrItem: WashingStatus | ClothesItem | WashingClothesItem | null | undefined,
): string | null {
  const status = typeof statusOrItem === 'string' ? statusOrItem : getWashingStatus(statusOrItem);
  if (status === 'cannot_wash') return CARE_LABELS.washing.cannot_wash;
  if (status === 'missing_info') return CARE_LABELS.washing.missing_info;
  return null;
}

/**
 * Returns the descriptive tooltip for the ironing status of a garment.
 */
export function getIroningTooltip(
  statusOrItem: IroningStatus | ClothesItem | WashingClothesItem | null | undefined,
): string | null {
  const status = typeof statusOrItem === 'string' ? statusOrItem : getIroningStatus(statusOrItem);
  if (status === 'cannot_iron') return CARE_TOOLTIPS.ironing.cannot_iron;
  if (status === 'missing_info') return CARE_TOOLTIPS.ironing.missing_info;
  return null;
}

/**
 * Returns the descriptive tooltip for the washing status of a garment.
 */
export function getWashingTooltip(
  statusOrItem: WashingStatus | ClothesItem | WashingClothesItem | null | undefined,
): string | null {
  const status = typeof statusOrItem === 'string' ? statusOrItem : getWashingStatus(statusOrItem);
  if (status === 'cannot_wash') return CARE_TOOLTIPS.washing.cannot_wash;
  if (status === 'missing_info') return CARE_TOOLTIPS.washing.missing_info;
  return null;
}

/**
 * Evaluates the ironing status of a garment.
 * - 'cannot_iron': flag is present with ironType === 'no' (or iron_type === 'no').
 * - 'missing_info': no ironingInstruction, or ironType is not specified.
 * - 'can_iron': ironType is 'yes' or 'without_steam'.
 */
export function getIroningStatus(
  item: ClothesItem | WashingClothesItem | null | undefined,
): IroningStatus {
  if (!item) return 'missing_info';
  const instruction = item.ironingInstruction;
  if (!instruction) {
    return 'missing_info';
  }
  const type =
    instruction.ironType ??
    (instruction as { iron_type?: 'yes' | 'without_steam' | 'no' }).iron_type;
  if (type === 'no') {
    return 'cannot_iron';
  }
  if (type === 'yes' || type === 'without_steam') {
    return 'can_iron';
  }
  return 'missing_info';
}

export function canIron(item: ClothesItem | WashingClothesItem | null | undefined): boolean {
  return getIroningStatus(item) === 'can_iron';
}

/**
 * Evaluates the washing status of a garment.
 * - 'cannot_wash': washType is explicitly 'do_not_wash'.
 * - 'missing_info': no washingInstruction.
 * - 'can_wash': washType is 'washer_ok' or 'hand_wash_only' (or has washingProgram / temperature configured).
 */
export function getWashingStatus(
  item: ClothesItem | WashingClothesItem | null | undefined,
): WashingStatus {
  if (!item) return 'missing_info';
  const wash = item.washingInstruction;
  if (!wash) {
    return 'missing_info';
  }
  const washType =
    wash.washType ??
    (wash as { wash_type?: 'washer_ok' | 'hand_wash_only' | 'do_not_wash' }).wash_type;
  if (washType === 'do_not_wash') {
    return 'cannot_wash';
  }
  if (
    washType === 'washer_ok' ||
    washType === 'hand_wash_only' ||
    wash.temperature ||
    wash.washingProgram ||
    wash.washingProgramId
  ) {
    return 'can_wash';
  }
  return 'missing_info';
}

export function canWash(item: ClothesItem | WashingClothesItem | null | undefined): boolean {
  return getWashingStatus(item) === 'can_wash';
}
