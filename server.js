require('dotenv').config();

const express = require('express');
const supabase = require('./supabaseClient');

const app = express();
const PORT = 3000;

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

    res.json(data);
});

app.listen(PORT, () => {
    console.log(`Server running: http://localhost:${PORT}`);
});