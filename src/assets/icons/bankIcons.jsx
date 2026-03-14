import React from 'react';
import { SvgIcon } from '@mui/material';

/**
 * Minimalist SVG Icon Components for PH Banks and Fintechs.
 * These are tailored for a premium, single-color POS aesthetic.
 */

export const GCashIcon = (props) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2V7zm0 8h2v2h-2v-2z" />
    </SvgIcon>
);

export const MayaIcon = (props) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" />
    </SvgIcon>
);

export const BDOIcon = (props) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        <path d="M4 4h16v16H4V4zm2 2v12h12V6H6zm3 3h6v2H9V9zm0 4h6v2H9v-2z" />
    </SvgIcon>
);

export const BPIIcon = (props) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5v-3l-10 5-10-5v3zM2 12l10 5 10-5V9l-10 5-10-5v3z" />
    </SvgIcon>
);

export const MetrobankIcon = (props) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        <path d="M12 3L2 12h3v9h14v-9h3L12 3zm0 13c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z" />
    </SvgIcon>
);

export const UnionBankIcon = (props) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v10h4v-2h-2.5V7z" />
    </SvgIcon>
);

/**
 * Registry of bank display names to their respective icons.
 */
export const BANK_ICON_MAP = {
    'GCash': GCashIcon,
    'Maya': MayaIcon,
    'BDO Unibank': BDOIcon,
    'BPI': BPIIcon,
    'Metrobank': MetrobankIcon,
    'UnionBank': UnionBankIcon,
};

export function getBankIcon(name, props = {}) {
    const Icon = BANK_ICON_MAP[name];
    if (!Icon) return null;
    return <Icon {...props} />;
}
