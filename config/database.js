const knex = require('knex');
require('dotenv').config();

const db = knex({
    client: 'pg',
    connection: {
        user: process.env.RDS_USERNAME || 'postgres',
        host: process.env.RDS_HOSTNAME || 'localhost',
        database: process.env.RDS_DB_NAME || 'cal_endure',
        password: process.env.RDS_PASSWORD || 'postgres',
        port: process.env.RDS_PORT || 5432,
        ssl: process.env.DB_SSL ? {rejectUnauthorized: false} : false
    },
    pool: {
        min: 2,
        max: 10
    }
});

// Test connection
db.raw('SELECT 1')
    .then(() => {
        console.log('Connected to PostgreSQL database via Knex');
    })
    .catch((err) => {
        console.error('Database connection error:', err);
        process.exit(-1);
    });

module.exports = db;
