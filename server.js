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
    インフラ運用保守: 'test',
    'インフラ・運用保守': 'test',
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
            design: employee.design_skill,
            development: employee.development_skill,
            security: employee.security_skill,
            operations: employee.test_maintenance_skill
        }
    })));
});

// イベントデータ取得API
app.get('/api/events', async (req, res) => {
    const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        console.error(error);
        return res.status(500).json({
            message: 'イベントデータの取得に失敗しました'
        });
    }

    res.json(data.map((event) => ({
        id: String(event.id),
        name: event.event_name,
        type: event.event_type,
        description: event.description,
        triggerCondition: event.trigger_condition,
        occurrenceRate: Number(event.occurrence_rate) || 0,
        choices: [
            { label: event.choice_a, effects: event.choice_a_effects },
            { label: event.choice_b, effects: event.choice_b_effects },
            { label: event.choice_c, effects: event.choice_c_effects }
        ].filter((choice) => choice.label)
    })));
});

// 案件データ取得API
app.get('/api/projects', async (req, res) => {
    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        console.error(error);
        return res.status(500).json({
            message: '案件データの取得に失敗しました'
        });
    }

    res.json(data.map((project) => {
        const requirements = {
            design: Number(project.required_design) || 0,
            dev: Number(project.required_development) || 0,
            security: Number(project.required_security) || 0,
            infra: Number(project.required_test_maintenance) || 0
        };
        return {
            id: String(project.id),
            name: project.name,
            diff: Number(project.difficulty),
            reward: Number(project.reward),
            days: Number(project.deadline_days),
            work: Math.round(Number(project.deadline_days) * (1 + Number(project.difficulty) * 0.5)),
            skills: Object.keys(requirements).filter((skill) => requirements[skill] > 0),
            requirements,
            minRep: 0,
            risk: ''
        };
    }));
});

// ミッションデータ取得API
app.get('/api/missions', async (req, res) => {
    const { data, error } = await supabase
        .from('missions')
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        console.error(error);
        return res.status(500).json({
            message: 'ミッションデータの取得に失敗しました'
        });
    }

    res.json(data.map((mission) => ({
        id: String(mission.id),
        tier: mission.tier,
        label: mission.label,
        conditionType: mission.condition_type,
        target: Number(mission.condition_target),
        rewardType: mission.reward_type,
        rewardAmount: Number(mission.reward_amount)
    })));
});

app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'layout', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running: http://localhost:${PORT}`);
});