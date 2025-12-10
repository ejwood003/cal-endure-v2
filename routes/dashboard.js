const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// All dashboard routes require authentication
router.use(requireAuth);

// Dashboard main page (Goals view)
router.get('/', async (req, res) => {
    try {
        const userId = req.session.user.user_id;

        // Get all goals for the user with enhanced data
        const goals = await db('goals')
            .where({ user_id: userId })
            .orderBy('category')
            .orderBy('created_at', 'desc');

        // Enhance calendar goals with event counts
        for (let goal of goals) {
            if (goal.goal_type === 'calendar' && goal.goal_id) {
                const eventCounts = await db('events')
                    .where({ goal_id: goal.goal_id })
                    .select(
                        db.raw("COUNT(*) FILTER (WHERE status = 'completed') as completed"),
                        db.raw("COUNT(*) as total")
                    )
                    .first();

                goal.completed_events = parseInt(eventCounts.completed) || 0;
                goal.total_events = parseInt(eventCounts.total) || 0;
            }
        }

        // Get today's events
        const events = await db('events')
            .where({ user_id: userId })
            .whereRaw('event_date = CURRENT_DATE')
            .orderBy('start_time');

        // Calculate statistics
        const totalGoals = await db('goals').where({ user_id: userId }).count('* as count').first();
        const completedGoals = await db('goals').where({ user_id: userId, is_completed: true }).count('* as count').first();
        const activeGoals = await db('goals').where({ user_id: userId, is_completed: false }).count('* as count').first();
        const todayEvents = await db('events').where({ user_id: userId }).whereRaw('event_date = CURRENT_DATE').count('* as count').first();

        const stats = {
            total: parseInt(totalGoals.count),
            completed: parseInt(completedGoals.count),
            active: parseInt(activeGoals.count),
            eventstoday: parseInt(todayEvents.count)
        };

        // Group goals by category
        const goalsByCategory = {
            'Spiritual': [],
            'Social': [],
            'Intellectual': [],
            'Physical': [],
            'Romantic': []
        };

        goals.forEach(goal => {
            const category = goal.category.charAt(0).toUpperCase() + goal.category.slice(1).toLowerCase();
            if (goalsByCategory[category]) {
                goalsByCategory[category].push(goal);
            }
        });

        // Calculate progress for each category
        const progress = {};
        Object.keys(goalsByCategory).forEach(category => {
            const categoryGoals = goalsByCategory[category];
            if (categoryGoals.length > 0) {
                const completed = categoryGoals.filter(g => g.is_completed).length;
                progress[category.toLowerCase()] = Math.round((completed / categoryGoals.length) * 100);
            } else {
                progress[category.toLowerCase()] = 0;
            }
        });

        res.render('dashboard', {
            pageTitle: 'Goals Dashboard - Cal-Endure to the End',
            currentPage: 'dashboard',
            goals,
            goalsByCategory,
            events,
            stats,
            progress
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        req.session.error = 'Error loading dashboard';
        res.redirect('/');
    }
});

module.exports = router;
