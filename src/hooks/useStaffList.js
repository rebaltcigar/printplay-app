// src/hooks/useStaffList.js
import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

export function useStaffList() {
    const [staffOptions, setStaffOptions] = useState([]);
    const [emailToName, setEmailToName] = useState({});
    const [idToName, setIdToName] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStaff = async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('*');

            if (data) {
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

                setEmailToName(byEmail);
                setIdToName(byId);
                setStaffOptions(opts);
            }
            if (error) console.error("Error fetching staff profiles:", error);
            setLoading(false);
        };

        fetchStaff();

        const channel = supabase.channel('public:profiles:useStaffList')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchStaff)
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, []);

    // userMap kept as alias for back-compat
    return { staffOptions, userMap: emailToName, emailToName, idToName, loading };
}
