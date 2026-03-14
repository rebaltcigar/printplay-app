import { useState, useMemo, useEffect, useRef } from 'react';
import {
    Box, Typography, Tabs, Tab, Paper, Chip, Badge, Stack,
    InputAdornment, TextField, CircularProgress,
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import { getPosIcon } from '../../assets/icons/posIcons';
import { fmtCurrency } from '../../utils/formatters';
import POSPCRentalTab from './POSPCRentalTab';

const currency = fmtCurrency;

// ─── Icon accent colours ──────────────────────────────────────────────────────
const ICON_ACCENT = {
    print: '#C62828',  // dark red
    photo: '#7B1FA2',  // purple
    monitor: '#00897B',  // teal
    copy: '#388E3C',  // green
    scissors: '#E65100',  // deep orange
    scan: '#5E35B1',  // deep purple (was blue)
    design: '#C2185B',  // pink
    food: '#F57F17',  // amber
    tech: '#5D4037',  // brown
    bag: '#512DA8',  // deep purple
    box: '#558B2F',  // lime dark
    other: '#546E7A',  // blue-grey
};
const DEFAULT_ACCENT = '#546E7A';

function accentFor(item) {
    return ICON_ACCENT[item.posIcon] || DEFAULT_ACCENT;
}

// ─── Dynamic tile minimum width ────────────────────────────────────────────────
function tileMin(n) {
    if (n > 18) return 110;
    if (n > 12) return 130;
    return 160;
}

// ─── Group variant children by variantGroup ────────────────────────────────────
function groupVariants(variants) {
    const groups = new Map();
    for (const v of variants) {
        const key = v.variantGroup || 'Other';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(v);
    }
    return groups;
}

// ─── Service / Retail tile ─────────────────────────────────────────────────────
function ItemTile({ item, effectiveStock, onClick, onShiftClick, accentOverride }) {
    const accent = accentOverride || accentFor(item);
    const isVariable = item.priceType === 'variable';
    const hasVariants = item.hasVariants;

    // Effective stock is either pre-calculated or follows item.stockCount
    const stock = effectiveStock !== undefined ? effectiveStock : (item.trackStock ? item.stockCount : Infinity);
    const outOfStock = stock <= 0;
    const lowStock = !outOfStock && stock <= (item.lowStockThreshold || 3);

    const displayPrice = hasVariants
        ? 'Choose variant'
        : isVariable
            ? (item.pricingNote || 'Variable')
            : currency(item.price || 0);

    const iconEl = getPosIcon(item.posIcon, {
        sx: { fontSize: 22, color: outOfStock ? 'text.disabled' : accent }
    });

    const handleClick = (e) => {
        if (outOfStock) return;
        if (e.shiftKey && onShiftClick) {
            onShiftClick();
        } else {
            onClick?.();
        }
    };

    return (
        <Paper
            variant="outlined"
            onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}
            onClick={handleClick}
            sx={{
                borderColor: alpha(accent, outOfStock ? 0.15 : 0.35),
                bgcolor: 'background.paper',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 145,
                height: '100%',
                opacity: outOfStock ? 0.55 : 1,
                cursor: outOfStock ? 'not-allowed' : 'pointer',
                transition: 'transform 0.15s, box-shadow 0.15s',
                '&:hover': outOfStock ? {} : {
                    transform: 'translateY(-2px)',
                    boxShadow: `0 4px 12px ${alpha(accent, 0.25)}`,
                    borderColor: accent,
                },
            }}
        >
            {/* Accent top bar */}
            <Box sx={{ height: 3, bgcolor: outOfStock ? 'action.disabled' : accent, flexShrink: 0 }} />

            {/* Card body */}
            <Box
                sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    p: 1.25,
                    gap: 0.5,
                    position: 'relative',
                }}
            >
                {/* Icon in soft circle */}
                <Box
                    sx={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        bgcolor: alpha(accent, outOfStock ? 0.04 : 0.12),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        mb: 0.25,
                    }}
                >
                    {item.trackStock || (effectiveStock !== undefined && effectiveStock !== Infinity) ? (
                        <Badge
                            badgeContent={stock === Infinity ? 0 : Math.floor(stock)}
                            color={lowStock ? 'error' : 'default'}
                            max={999}
                        >
                            {iconEl || <Box sx={{ width: 22, height: 22 }} />}
                        </Badge>
                    ) : (iconEl || <Box sx={{ width: 22, height: 22 }} />)}
                </Box>

                {/* Name */}
                <Typography
                    variant="body2"
                    fontWeight="bold"
                    align="center"
                    sx={{
                        lineHeight: 1.2,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        color: outOfStock ? 'text.disabled' : 'text.primary',
                    }}
                >
                    {item.posLabel || item.serviceName}
                </Typography>

                {/* Price */}
                <Typography
                    variant="caption"
                    sx={{
                        color: outOfStock
                            ? 'error.main'
                            : isVariable && !hasVariants
                                ? accent
                                : 'text.secondary',
                        fontWeight: isVariable && !hasVariants ? 'bold' : 'normal',
                    }}
                >
                    {outOfStock ? 'Out of stock' : displayPrice}
                </Typography>

                {/* Variants badge */}
                {hasVariants && (
                    <Chip
                        label="Variants"
                        size="small"
                        sx={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            height: 16,
                            fontSize: '0.6rem',
                            bgcolor: alpha(accent, 0.15),
                            color: accent,
                            border: `1px solid ${alpha(accent, 0.4)}`,
                            pointerEvents: 'none',
                        }}
                    />
                )}
            </Box>
        </Paper>
    );
}

// ─── Auto-fill tile grid ───────────────────────────────────────────────────────
function TileGrid({ items, effectiveStockMap, onItemClick, onQtyClick, sections = null, overrideAccent }) {
    if (!sections && items.length === 0) {
        return (
            <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="text.secondary">No items available.</Typography>
            </Box>
        );
    }

    const count = sections
        ? [...sections.values()].reduce((s, v) => s + v.length, 0)
        : items.length;

    const min = tileMin(count);

    const baseGridSx = {
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
        gap: 1.5,
        alignContent: 'start',
    };

    if (sections) {
        return (
            <Box sx={{ ...baseGridSx }}>
                {[...sections.entries()].map(([group, variants]) => (
                    <Box key={group} sx={{ display: 'contents' }}>
                        {/* Full-width section header */}
                        <Box sx={{ gridColumn: '1 / -1', pt: 0.5, pb: 0.25 }}>
                            <Typography
                                variant="caption"
                                fontWeight="bold"
                                color="text.secondary"
                                sx={{ textTransform: 'uppercase', letterSpacing: 1 }}
                            >
                                {group}
                            </Typography>
                        </Box>
                        {variants.map(v => (
                            <ItemTile
                                key={v.id}
                                item={v}
                                effectiveStock={effectiveStockMap?.[v.id]}
                                onClick={() => onItemClick(v)}
                                onShiftClick={onQtyClick ? () => onQtyClick(v) : undefined}
                                accentOverride={overrideAccent}
                            />
                        ))}
                    </Box>
                ))}
            </Box>
        );
    }

    return (
        <Box sx={{ ...baseGridSx, gridAutoRows: '145px' }}>
            {items.map(item => (
                <ItemTile
                    key={item.id}
                    item={item}
                    effectiveStock={effectiveStockMap?.[item.id]}
                    onClick={() => onItemClick(item)}
                    onShiftClick={onQtyClick ? () => onQtyClick(item) : undefined}
                />
            ))}
        </Box>
    );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function POSItemGrid({ posItems, allServices = [], variantMap, onItemClick, onPCSession, onTabChange, pcRentalEnabled = true }) {
    const [activeTab, setActiveTab] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [posFilter, setPosFilter] = useState('all'); // 'all' | 'service' | 'retail'
    const [retailSearch, setRetailSearch] = useState('');
    const [drilldown, setDrilldown] = useState(null); // { parent, sections }
    const [qtyItem, setQtyItem] = useState(null);
    const [qtyValue, setQtyValue] = useState('1');
    const qtyInputRef = useRef(null);

    const handleTabChange = (_, v) => {
        setActiveTab(v);
        setDrilldown(null);
        setRetailSearch('');
        onTabChange?.(v);
        setIsTransitioning(true);
    };

    useEffect(() => {
        if (!isTransitioning) return;
        const t = setTimeout(() => setIsTransitioning(false), 280);
        return () => clearTimeout(t);
    }, [isTransitioning]);

    const handleFilterChange = (f) => {
        setPosFilter(f);
        setDrilldown(null);
        setRetailSearch('');
    };

    // Calculate effective stock for all items
    const effectiveStockMap = useMemo(() => {
        const map = {};
        const serviceLookup = new Map(allServices.map(s => [s.id, s]));

        allServices.forEach(item => {
            let stock = item.trackStock ? (item.stockCount || 0) : Infinity;

            // Check Consumables
            if (item.consumables && item.consumables.length > 0) {
                item.consumables.forEach(c => {
                    const cItem = serviceLookup.get(c.itemId);
                    if (cItem && cItem.trackStock) {
                        const availableFromConsumable = (cItem.stockCount || 0) / (c.qty || 1);
                        stock = Math.min(stock, availableFromConsumable);
                    }
                });
            }
            map[item.id] = stock;
        });

        return map;
    }, [allServices]);

    // Filtered sale items
    const saleItems = useMemo(() => {
        let items;
        if (posFilter === 'service') items = posItems.filter(i => i.category !== 'retail');
        else if (posFilter === 'retail') items = posItems.filter(i => i.category === 'retail');
        else items = posItems;

        if (posFilter === 'retail' && retailSearch.trim()) {
            const q = retailSearch.toLowerCase();
            items = items.filter(i => (i.posLabel || i.serviceName).toLowerCase().includes(q));
        }
        return items;
    }, [posItems, posFilter, retailSearch]);

    const handleTileClick = (item) => {
        if (item.hasVariants) {
            const variants = variantMap?.get(item.id) || [];
            setDrilldown({
                parent: item,
                accent: accentFor(item),
                sections: groupVariants(variants),
                count: variants.length,
            });
        } else {
            onItemClick(item);
        }
    };

    // Shift+click only applies to leaf items — variant parents always open drilldown
    const handleShiftClick = (item) => {
        if (item.hasVariants) {
            handleTileClick(item);
        } else {
            handleQtyOpen(item);
        }
    };

    const handleQtyOpen = (item) => {
        setQtyItem(item);
        setQtyValue('1');
        setTimeout(() => qtyInputRef.current?.focus(), 80);
    };

    const handleQtySubmit = (e) => {
        e.preventDefault();
        const q = parseInt(qtyValue, 10);
        if (q > 0) {
            onItemClick(qtyItem, q);
            setQtyItem(null);
        }
    };

    const handleVariantClick = (variant, qty = 1) => {
        setDrilldown(null);
        onItemClick(variant, qty);
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Tab bar */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default', flexShrink: 0 }}>
                <Tabs value={activeTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto">
                    <Tab label="Sale" sx={{ fontWeight: 'bold' }} />
                    {pcRentalEnabled && <Tab label="PC Rental" sx={{ fontWeight: 'bold' }} />}
                </Tabs>
            </Box>

            {/* Transition loader overlay */}
            {isTransitioning && (
                <Box sx={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: 'background.default',
                }}>
                    <CircularProgress size={32} thickness={3} />
                </Box>
            )}

            {/* PC Rental — full delegation, no cart */}
            {!isTransitioning && activeTab === 1 && <POSPCRentalTab onBillSession={onPCSession} />}

            {/* Sale tab */}
            {!isTransitioning && activeTab === 0 && (
                <>
                    {/* Filter chips + optional retail search */}
                    <Box
                        sx={{
                            px: 1.5, py: 0.75, flexShrink: 0,
                            borderBottom: 1, borderColor: 'divider',
                            bgcolor: 'background.default',
                            display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
                        }}
                    >
                        <Stack direction="row" spacing={0.75}>
                            {[
                                { key: 'all', label: 'All' },
                                { key: 'service', label: 'Services' },
                                { key: 'retail', label: 'Retail' },
                            ].map(({ key, label }) => (
                                <Chip
                                    key={key}
                                    label={label}
                                    size="small"
                                    variant={posFilter === key ? 'filled' : 'outlined'}
                                    color={posFilter === key ? 'primary' : 'default'}
                                    onClick={() => handleFilterChange(key)}
                                    sx={{ fontWeight: posFilter === key ? 'bold' : 'normal' }}
                                />
                            ))}
                        </Stack>

                        {posFilter === 'retail' && (
                            <TextField
                                size="small"
                                placeholder="Search retail…"
                                value={retailSearch}
                                onChange={e => setRetailSearch(e.target.value)}
                                sx={{ flex: 1, minWidth: 140, maxWidth: 260 }}
                                slotProps={{
                                    input: {
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <SearchIcon sx={{ fontSize: 16 }} />
                                            </InputAdornment>
                                        )
                                    }
                                }}
                            />
                        )}
                    </Box>

                    {/* Drill-down nav bar */}
                    {drilldown && (
                        <Box
                            sx={{
                                display: 'flex', alignItems: 'center', gap: 1,
                                px: 1, py: 0.75, flexShrink: 0,
                                borderBottom: 1, borderColor: 'divider',
                                bgcolor: alpha(drilldown.accent, 0.06),
                            }}
                        >
                            <Box
                                component="button"
                                onClick={() => setDrilldown(null)}
                                sx={{
                                    display: 'flex', alignItems: 'center', gap: 0.5,
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: drilldown.accent, p: 0.5, borderRadius: 1, flexShrink: 0,
                                    '&:hover': { bgcolor: alpha(drilldown.accent, 0.1) },
                                }}
                            >
                                <ArrowBackIcon sx={{ fontSize: 16 }} />
                                <Typography variant="body2" fontWeight="bold" sx={{ color: drilldown.accent }}>
                                    Back
                                </Typography>
                            </Box>
                            <Box sx={{ width: 1, height: 18, bgcolor: 'divider', flexShrink: 0 }} />
                            {/* Centered parent name + count */}
                            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                                <Typography variant="body2" color="text.secondary" noWrap>
                                    {drilldown.parent.posLabel || drilldown.parent.serviceName}
                                </Typography>
                                <Typography variant="caption" color="text.disabled">·</Typography>
                                <Typography variant="caption" color="text.disabled" noWrap>
                                    {drilldown.count} variants
                                </Typography>
                            </Box>
                        </Box>
                    )}

                    {/* Tile area */}
                    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1.5 }}>
                        {drilldown ? (
                            <TileGrid
                                items={[]}
                                sections={drilldown.sections}
                                effectiveStockMap={effectiveStockMap}
                                onItemClick={handleVariantClick}
                                onQtyClick={(v) => handleQtyOpen(v)}
                                overrideAccent={drilldown.accent}
                            />
                        ) : (
                            <TileGrid
                                items={saleItems}
                                effectiveStockMap={effectiveStockMap}
                                onItemClick={handleTileClick}
                                onQtyClick={handleShiftClick}
                            />
                        )}
                    </Box>
                </>
            )}

            {/* Quantity dialog (Shift+click) */}
            <Dialog
                open={Boolean(qtyItem)}
                onClose={() => setQtyItem(null)}
                maxWidth="xs"
                fullWidth
            >
                <form onSubmit={handleQtySubmit}>
                    <DialogTitle sx={{ pb: 1 }}>
                        Set Quantity
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                            {qtyItem?.posLabel || qtyItem?.serviceName}
                        </Typography>
                    </DialogTitle>
                    <DialogContent sx={{ pt: 1 }}>
                        <TextField
                            inputRef={qtyInputRef}
                            autoFocus
                            fullWidth
                            label="Quantity"
                            type="number"
                            value={qtyValue}
                            onChange={e => setQtyValue(e.target.value)}
                            slotProps={{ htmlInput: { min: 1, max: 99, step: 1 } }}
                        />
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setQtyItem(null)}>Cancel</Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={!qtyValue || parseInt(qtyValue, 10) < 1}
                        >
                            Add {qtyValue && parseInt(qtyValue, 10) > 1 ? `×${qtyValue}` : ''} to Cart
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </Box>
    );
}
