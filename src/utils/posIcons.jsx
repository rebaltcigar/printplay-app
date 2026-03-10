// src/utils/posIcons.js
// Shared POS icon registry used by:
//   - ServiceCatalog admin (icon picker)
//   - POS tile grid (v0.2.1, resolves key → component)
//
// To add a new icon:
//   1. Import the MUI icon
//   2. Add an entry to POS_ICON_OPTIONS
//   That's it — the picker and tile grid both update automatically.

import PrintIcon from '@mui/icons-material/Print';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import MonitorIcon from '@mui/icons-material/Monitor';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';
import BrushIcon from '@mui/icons-material/Brush';
import FastfoodIcon from '@mui/icons-material/Fastfood';
import DevicesIcon from '@mui/icons-material/Devices';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import InventoryIcon from '@mui/icons-material/Inventory';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';

// Each entry: { value: string, label: string, Icon: MuiIconComponent }
export const POS_ICON_OPTIONS = [
  { value: 'print',    label: 'Print',              Icon: PrintIcon },
  { value: 'photo',    label: 'Photo',              Icon: PhotoCameraIcon },
  { value: 'monitor',  label: 'Monitor / PC',       Icon: MonitorIcon },
  { value: 'copy',     label: 'Photocopy',          Icon: ContentCopyIcon },
  { value: 'scissors', label: 'Laminate / Cut',     Icon: ContentCutIcon },
  { value: 'scan',     label: 'Scan',               Icon: DocumentScannerIcon },
  { value: 'design',   label: 'Design',             Icon: BrushIcon },
  { value: 'food',     label: 'Food',               Icon: FastfoodIcon },
  { value: 'tech',     label: 'Tech / Electronics', Icon: DevicesIcon },
  { value: 'bag',      label: 'Merchandise',        Icon: ShoppingBagIcon },
  { value: 'box',      label: 'Package / Bundle',   Icon: InventoryIcon },
  { value: 'other',    label: 'Other',              Icon: MoreHorizIcon },
];

/**
 * Resolves a posIcon key to a rendered MUI icon element.
 * Returns null if the key is empty or not found.
 *
 * @param {string}  key   - Icon key stored in Supabase (e.g., 'print')
 * @param {object}  props - Props forwarded to the icon (e.g., { fontSize: 'small' })
 */
export function getPosIcon(key, props = {}) {
  const opt = POS_ICON_OPTIONS.find(o => o.value === key);
  if (!opt) return null;
  const { Icon } = opt;
  return <Icon {...props} />;
}
