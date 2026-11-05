const { createClient } = require('@supabase/supabase-js');

const requiredEnvironmentVariables = ['SUPABASE_URL', 'SUPABASE_KEY'];
const missingEnvironmentVariables = requiredEnvironmentVariables.filter(
    (name) => !process.env[name]
);

if (missingEnvironmentVariables.length > 0) {
    throw new Error(
        `Missing required environment variables: ${missingEnvironmentVariables.join(', ')}`
    );
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

module.exports = supabase;
