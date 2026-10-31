import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Leaderboard({ selectedDate }: { selectedDate: string }) {
    const [leaders, setLeaders] = useState<any[]>([]);

    const fetchLeaders = async () => {
        if (!supabase) return;
        
        const { data, error } = await supabase
            .from('sunrise_scores')
            .select(`
                score,
                words_found,
                profiles ( handle )
            `)
            .eq('game_date', selectedDate)
            .order('score', { ascending: false })
            .limit(10);
            
        if (data && !error) {
            setLeaders(data);
        }
    };

    useEffect(() => {
        fetchLeaders();
        if (!supabase) return;
        
        const channel = supabase.channel('sunrise_changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'sunrise_scores', filter: `game_date=eq.${selectedDate}` },
                () => fetchLeaders()
            )
            .subscribe();
            
        return () => {
            if (supabase) supabase.removeChannel(channel);
        };
    }, [selectedDate]);

    return (
        <div className="border-2 border-[#1A2E35] p-6 bg-white shadow-[6px_6px_0_0_#1A2E35]">
            <h2 className="text-white mb-4 font-black tracking-wider uppercase bg-[#006b5b] inline-block px-3 py-1 border-2 border-[#1A2E35]">
                DAILY LEADERBOARD
            </h2>
            <div className="flex flex-col gap-3 mt-2">
                {leaders.length === 0 && <div className="text-[#1A2E35]/60 font-bold uppercase tracking-wider text-xs">No scores yet today.</div>}
                
                {leaders.map((l, i) => (
                    <div key={i} className="flex justify-between items-center text-sm font-bold border-b-2 border-[#1A2E35] border-dashed pb-2">
                        <span className="text-[#1A2E35]">{i + 1}. @{l.profiles?.handle || 'Unknown'}</span>
                        <div className="text-right">
                            <div className="text-[#006b5b] font-black">{l.score} pts</div>
                            <div className="text-xs text-[#1A2E35]/70">{l.words_found || 0} words</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}