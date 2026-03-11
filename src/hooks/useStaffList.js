// src/hooks/useStaffList.js
import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let _cache = null; // { staffOptions, emailToName, idToName, setAt }
let _channel = null;
let _channelRefCount = 0;
const _listeners = new Set();

function notifyListeners(data) {
    _listeners.forEach(fn => fn(data));
}

function buildMaps(data) {
    const byEmail = {};
    const byId = {};
    const opts = [];

    data.forEach((v) => {
        if (!v.email) return;
        const fullName = v.full_name || v.name || v.email;
        byEmail[v.email] = fullName;
        byId[v.id] = fullName;
        opts.push({
            id: v.id,
            uid: v.id,
            email: v.email,
            fullName,
            role: v.role || 'staff',
        });
    });

    opts.sort((a, b) =>
        (a.fullName || '').localeCompare(b.fullName || '', 'en', { sensitivity: 'base' })
    );

    return { staffOptions: opts, emailToName: byEmail, idToName: byId };
}

async function fetchAndCache() {
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) { console.error("Error fetching staff profiles:", error); return; }
    if (!data) return;

    const maps = buildMaps(data);
    _cache = { ...maps, setAt: Date.now() };
    notifyListeners(_cache);
}

function ensureChannel() {
    if (_channel) return;
    _channel = supabase.channel('public:profiles:useStaffList')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchAndCache())
        .subscribe();
}

function releaseChannel() {
    if (_channelRefCount > 0) return;
    if (_channel) {
        supabase.removeChannel(_channel);
        _channel = null;
    }
}

export function useStaffList() {
    const [staffOptions, setStaffOptions] = useState(_cache?.staffOptions ?? []);
    const [emailToName, setEmailToName] = useState(_cache?.emailToName ?? {});
    const [idToName, setIdToName] = useState(_cache?.idToName ?? {});
    const [loading, setLoading] = useState(!_cache);

    useEffect(() => {
        const applyCache = (c) => {
            setStaffOptions(c.staffOptions);
            setEmailToName(c.emailToName);
            setIdToName(c.idToName);
            setLoading(false);
        };

        // Subscribe to future updates
        _listeners.add(applyCache);
        _channelRefCount++;
        ensureChannel();

        // Use cache if fresh, otherwise fetch
        if (_cache && (Date.now() - _cache.setAt) < CACHE_TTL) {
            applyCache(_cache);
        } else {
            fetchAndCache();
        }

        return () => {
            _listeners.delete(applyCache);
            _channelRefCount--;
            releaseChannel();
        };
    }, []);

    // userMap kept as alias for back-compat
    return { staffOptions, userMap: emailToName, emailToName, idToName, loading };
}
