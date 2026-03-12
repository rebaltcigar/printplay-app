// src/hooks/useShiftFilters.js
import { useState, useMemo } from 'react';
import { getThisMonthDefaults, calculateOnHand } from '../services/shiftService';

export function useShiftFilters(shifts, txAggByShift, serviceMeta) {
    const { startStr: defaultStart, endStr: defaultEnd } = getThisMonthDefaults();

    const [startDate, setStartDate] = useState(defaultStart);
    const [endDate, setEndDate] = useState(defaultEnd);

    const [filterStaff, setFilterStaff] = useState([]);
    const [filterShiftPeriod, setFilterShiftPeriod] = useState([]);
    const [filterShowShort, setFilterShowShort] = useState(true);
    const [filterShowOverage, setFilterShowOverage] = useState(true);

    const filteredShifts = useMemo(() => {
        return shifts.filter((s) => {
            // Staff Filter
            if (filterStaff.length > 0 && !filterStaff.includes(s.staffEmail)) return false;

            // Period Filter
            if (filterShiftPeriod.length > 0 && !filterShiftPeriod.includes(s.shiftPeriod)) return false;

            // Short/Overage Filters — use DB cash_difference (null = not consolidated)
            if (s.cash_difference == null) {
                if (!filterShowShort || !filterShowOverage) return false;
            } else {
                const isShort = s.cash_difference < 0;
                const isOverage = s.cash_difference > 0;
                if (!filterShowShort && isShort) return false;
                if (!filterShowOverage && isOverage) return false;
            }

            return true;
        });
    }, [shifts, filterStaff, filterShiftPeriod, filterShowShort, filterShowOverage, txAggByShift]);

    const grand = useMemo(() => {
        let pcRental = 0, sales = 0, expenses = 0, system = 0, onHand = 0;
        let shiftsWithDenominations = 0;
        let difference = 0;

        for (const s of filteredShifts) {
            const agg = txAggByShift[s.id];
            const pc = Number(s?.pcRentalTotal || 0);
            pcRental += pc;

            const onHandVal = calculateOnHand(s.denominations);
            if (onHandVal !== null) {
                onHand += onHandVal;
                shiftsWithDenominations++;
            }

            // Sum DB-stored differences (only consolidated shifts contribute)
            if (s.cash_difference != null) {
                difference += Number(s.cash_difference);
            }

            if (agg) {
                const _expenses = Number(agg.expenses || 0);
                sales += Number(agg.sales || 0) + pc;
                expenses += _expenses;
                system += Number(agg.sales || 0) + pc - _expenses;
            }
        }

        return { pcRental, sales, expenses, system, onHand, difference, shiftsWithDenominations };
    }, [filteredShifts, txAggByShift]);

    const serviceNames = useMemo(() =>
        serviceMeta.map(s => s.name), [serviceMeta]
    );

    const perServiceTotals = useMemo(() => {
        const totals = {};
        serviceNames.forEach((n) => (totals[n] = 0));
        for (const s of filteredShifts) {
            const agg = txAggByShift[s.id];
            if (!agg) continue;
            for (const [svc, amt] of Object.entries(agg.serviceTotals || {})) {
                totals[svc] = (totals[svc] || 0) + Number(amt || 0);
            }
        }
        return totals;
    }, [filteredShifts, serviceNames, txAggByShift]);

    return {
        startDate, setStartDate,
        endDate, setEndDate,
        filterStaff, setFilterStaff,
        filterShiftPeriod, setFilterShiftPeriod,
        filterShowShort, setFilterShowShort,
        filterShowOverage, setFilterShowOverage,
        filteredShifts,
        grand,
        perServiceTotals,
        serviceNames
    };
}
