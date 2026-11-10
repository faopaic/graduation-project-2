
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// テーブルの読み取り処理
async function readTable(tableName, displayName) {
    console.log(`\n========== ${displayName} ==========`);

    const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        console.error(`${displayName}の取得に失敗しました`);
        console.error('エラー内容:', error.message);
        return false;
    }

    console.log(`${displayName}の取得に成功しました！`);
    console.log(`取得件数：${data.length}件`);
    console.log('----------------------------------');

    data.forEach((record) => {
        console.log(JSON.stringify(record, null, 2));
        console.log('----------------------------------');
    });

    return true;
}

// 全テーブルの読み取りテスト
async function testSupabase() {
    console.log('Supabaseへの接続を開始します...\n');

    const results = [];

    // 社員テーブル
    results.push({
        name: 'employees',
        success: await readTable('employees', '社員データ')
    });

    // 案件テーブル
    results.push({
        name: 'projects',
        success: await readTable('projects', '案件データ')
    });

    // イベントテーブル
    results.push({
        name: 'events',
        success: await readTable('events', 'イベントデータ')
    });

    // ミッションデータ
    results.push({
    name: 'missions',
    success: await readTable('missions', 'ミッションデータ')
    });

    // 最終結果
    console.log('\n========== 読み取りテスト結果 ==========');

    results.forEach((result) => {
        console.log(
            `${result.name}：${result.success ? '成功' : '失敗'}`
        );
    });

    const successCount = results.filter(
        result => result.success
    ).length;

    console.log('----------------------------------');
    console.log(`成功：${successCount} / ${results.length} テーブル`);

    if (successCount === results.length) {
        console.log('すべてのテーブルの読み取りに成功しました！');
    } else {
        console.log('読み取りに失敗したテーブルがあります。');
    }
}

testSupabase();
