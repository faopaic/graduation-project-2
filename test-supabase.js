
// 環境変数を読み込む
require('dotenv').config();

// Supabaseライブラリを読み込む
const { createClient } = require('@supabase/supabase-js');

// Supabaseに接続
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// 社員データを取得する
async function testSupabase() {
    console.log('Supabaseへの接続を開始します...');

    try {
        const { data, error } = await supabase
            .from('employees')
            .select('*')
            .order('id', { ascending: true });

        // エラーが発生した場合
        if (error) {
            console.error('データ取得エラー:', error.message);
            return;
        }

        // 取得したデータを表示
        console.log('社員データの取得に成功しました！');
        console.log(`取得件数：${data.length}件`);
        console.log('------------------------------');

        data.forEach((employee) => {
            console.log(`ID：${employee.id}`);
            console.log(`名前：${employee.name}`);
            console.log(`職種：${employee.job_type}`);
            console.log(`給与：${employee.salary}`);
            console.log(`開発力：${employee.development_skill}`);
            console.log(`セキュリティ力：${employee.security_skill}`);
            console.log(`テスト保守力：${employee.test_maintenance_skill}`);
            console.log(`営業力：${employee.sales_skill}`);
            console.log('------------------------------');
        });

    } catch (err) {
        console.error('予期しないエラー:', err.message);
    }
}

// 実行
testSupabase();
