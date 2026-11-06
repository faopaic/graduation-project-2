require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

// Supabase接続
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// イベントデータ取得テスト
async function testSupabase() {
    console.log('Supabaseへの接続を開始します...');

    try {
        const { data, error } = await supabase
            .from('employees')
            .select('*')
            .order('id', { ascending: true });

        if (error) {
            console.error('データ取得エラー:', error.message);
            return;
        }

        console.log('イベントデータの取得に成功しました！');
        console.log(`取得件数：${data.length}件`);
        console.log('------------------------------');

        data.forEach((project) => {
            console.log(`ID：${project.id}`);
            console.log(`イベント名：${project.event_name}`);
            console.log(`種別：${project.event_type}`);
            console.log(`発生率：${project.occurrence_rate}%`);
            console.log(`説明：${project.description}`);
            console.log('------------------------------');
        });

    } catch (err) {
        console.error('予期しないエラー:', err.message);
    }
}

testSupabase();