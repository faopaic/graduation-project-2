require('dotenv').config();

const express = require('express');
const supabase = require('./supabaseClient');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.static(path.join(__dirname, 'layout')));
app.use('/api', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

const skillKey = (jobType) => ({
    設計: 'design',
    開発: 'dev',
    プログラマ: 'dev',
    SE: 'design',
    テスト: 'test',
    インフラ: 'infra',
    運用保守: 'infra',
    セキュリティ: 'security',
    営業: 'dev'
}[jobType] || jobType);

// 社員データ取得API
app.get('/api/employees', async (req, res) => {
    const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        console.error(error);
        return res.status(500).json({
            message: '社員データの取得に失敗しました'
        });
    }

    res.json(data.map((employee) => ({
        id: String(employee.id),
        name: employee.name,
        skill: skillKey(employee.job_type),
        salary: employee.salary,
        salesSkill: employee.sales_skill,
        stats: {
            development: employee.development_skill,
            security: employee.security_skill,
            operations: employee.test_maintenance_skill
        }
    })));
});

app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'layout', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running: http://localhost:${PORT}`);
});