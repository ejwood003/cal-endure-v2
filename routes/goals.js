const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// All goal routes require authentication
router.use(requireAuth);

// Create new goal - supports three types: numeric, recurring, calendar
router.post('/create', async (req, res) => {
    const { title, category, goalType, description } = req.body;
    const userId = req.session.user.user_id;

    try {
        // Normalize category - capitalize first letter
        const normalizedCategory = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();

        const goalData = {
            user_id: userId,
            title,
            category: normalizedCategory,
            goal_type: goalType,
            description: description || null
        };

        // Add type-specific fields
        if (goalType === 'numeric') {
            goalData.numeric_target_value = parseInt(req.body.numericTarget) || 0;
            goalData.numeric_unit = req.body.numericUnit || 'times';
            goalData.numeric_current_value = 0;
        } else if (goalType === 'recurring') {
            goalData.recurrence_pattern = req.body.recurrencePattern || 'daily';
            goalData.recurrence_interval = parseInt(req.body.recurrenceInterval) || 1;
            goalData.recurrence_days = req.body.recurrenceDays || null; // For weekly patterns
            goalData.completion_count = 0;
        } else if (goalType === 'calendar') {
            goalData.target_date = req.body.targetDate || null;
            goalData.linked_events_required = parseInt(req.body.eventsRequired) || 0;
        }

        await db('goals').insert(goalData);

        req.session.success = 'Goal created successfully!';
        res.redirect('/dashboard');

    } catch (error) {
        console.error('Create goal error:', error);
        req.session.error = 'Error creating goal';
        res.redirect('/dashboard');
    }
});

// Log progress for NUMERIC goals
router.post('/numeric/:id/log', async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user.user_id;
    const { amount } = req.body;

    try {
        const goal = await db('goals')
            .where({ goal_id: id, user_id: userId, goal_type: 'numeric' })
            .first();

        if (!goal) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }

        const incrementAmount = amount ? parseInt(amount) : 1;
        const newValue = (goal.numeric_current_value || 0) + incrementAmount;

        await db('goals')
            .where({ goal_id: id, user_id: userId })
            .update({
                numeric_current_value: newValue,
                is_completed: newValue >= goal.numeric_target_value
            });

        res.json({
            success: true,
            current: newValue,
            target: goal.numeric_target_value,
            completed: newValue >= goal.numeric_target_value
        });

    } catch (error) {
        console.error('Log numeric goal error:', error);
        res.status(500).json({ success: false, error: 'Error updating progress' });
    }
});

// Complete instance for RECURRING goals
router.post('/recurring/:id/complete', async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user.user_id;

    try {
        const goal = await db('goals')
            .where({ goal_id: id, user_id: userId, goal_type: 'recurring' })
            .first();

        if (!goal) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }

        // Check if already completed today/this period
        const now = new Date();
        const lastCompleted = goal.last_completed_at ? new Date(goal.last_completed_at) : null;

        let canComplete = true;
        if (lastCompleted) {
            const pattern = goal.recurrence_pattern;
            if (pattern === 'daily') {
                // Check if already completed today
                canComplete = lastCompleted.toDateString() !== now.toDateString();
            } else if (pattern === 'weekly') {
                // Check if completed in the last 7 days
                const daysDiff = Math.floor((now - lastCompleted) / (1000 * 60 * 60 * 24));
                canComplete = daysDiff >= 7;
            } else if (pattern === 'monthly') {
                // Check if completed this month
                canComplete = lastCompleted.getMonth() !== now.getMonth() ||
                            lastCompleted.getFullYear() !== now.getFullYear();
            }
        }

        if (!canComplete) {
            return res.status(400).json({
                success: false,
                error: 'Already completed for this period',
                canRetry: false
            });
        }

        await db('goals')
            .where({ goal_id: id, user_id: userId })
            .update({
                last_completed_at: now,
                completion_count: (goal.completion_count || 0) + 1
            });

        res.json({
            success: true,
            completionCount: (goal.completion_count || 0) + 1,
            lastCompleted: now
        });

    } catch (error) {
        console.error('Complete recurring goal error:', error);
        res.status(500).json({ success: false, error: 'Error completing goal' });
    }
});

// Get goal details (used for viewing/editing)
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user.user_id;

    try {
        const goal = await db('goals')
            .where({ goal_id: id, user_id: userId })
            .first();

        if (!goal) {
            return res.status(404).json({ error: 'Goal not found' });
        }

        // For calendar goals, get linked events
        if (goal.goal_type === 'calendar') {
            const events = await db('events')
                .where({ goal_id: id, user_id: userId })
                .orderBy('event_date', 'asc');

            goal.linked_events = events;
            goal.completed_events = events.filter(e => e.status === 'completed').length;
        }

        res.json({ goal });

    } catch (error) {
        console.error('Get goal error:', error);
        res.status(500).json({ error: 'Error loading goal' });
    }
});

// Update goal
router.post('/update/:id', async (req, res) => {
    const { id } = req.params;
    const { title, category, description, isCompleted } = req.body;
    const userId = req.session.user.user_id;

    try {
        const goal = await db('goals')
            .where({ goal_id: id, user_id: userId })
            .first();

        if (!goal) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }

        // If only updating completion status
        if (isCompleted !== undefined && !title) {
            await db('goals')
                .where({ goal_id: id, user_id: userId })
                .update({ is_completed: isCompleted === 'true' || isCompleted === true });
            return res.status(200).json({ success: true });
        }

        // Full update
        const updateData = {
            title,
            category,
            description: description || null
        };

        // Add type-specific updates
        if (goal.goal_type === 'numeric') {
            if (req.body.numericTarget) updateData.numeric_target_value = parseInt(req.body.numericTarget);
            if (req.body.numericUnit) updateData.numeric_unit = req.body.numericUnit;
            if (req.body.numericCurrent) updateData.numeric_current_value = parseInt(req.body.numericCurrent);
        } else if (goal.goal_type === 'recurring') {
            if (req.body.recurrencePattern) updateData.recurrence_pattern = req.body.recurrencePattern;
            if (req.body.recurrenceInterval) updateData.recurrence_interval = parseInt(req.body.recurrenceInterval);
            if (req.body.recurrenceDays) updateData.recurrence_days = req.body.recurrenceDays;
        } else if (goal.goal_type === 'calendar') {
            if (req.body.targetDate) updateData.target_date = req.body.targetDate;
            if (req.body.eventsRequired) updateData.linked_events_required = parseInt(req.body.eventsRequired);
        }

        if (isCompleted !== undefined) {
            updateData.is_completed = isCompleted === 'true' || isCompleted === true;
        }

        await db('goals')
            .where({ goal_id: id, user_id: userId })
            .update(updateData);

        req.session.success = 'Goal updated successfully';
        res.redirect('/dashboard');

    } catch (error) {
        console.error('Update goal error:', error);
        req.session.error = 'Error updating goal';
        res.redirect('/dashboard');
    }
});

// Delete goal
router.post('/delete/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user.user_id;

    try {
        await db('goals')
            .where({ goal_id: id, user_id: userId })
            .del();

        req.session.success = 'Goal deleted successfully';
        res.redirect('/dashboard');

    } catch (error) {
        console.error('Delete goal error:', error);
        req.session.error = 'Error deleting goal';
        res.redirect('/dashboard');
    }
});

// Legacy endpoint for backward compatibility
router.post('/increment/:id', async (req, res) => {
    // Call the numeric log endpoint directly
    const { id } = req.params;
    const userId = req.session.user.user_id;

    try {
        const goal = await db('goals')
            .where({ goal_id: id, user_id: userId, goal_type: 'numeric' })
            .first();

        if (!goal) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }

        const newValue = (goal.numeric_current_value || 0) + 1;

        await db('goals')
            .where({ goal_id: id, user_id: userId })
            .update({
                numeric_current_value: newValue,
                is_completed: newValue >= goal.numeric_target_value
            });

        res.json({
            success: true,
            current: newValue,
            target: goal.numeric_target_value,
            completed: newValue >= goal.numeric_target_value
        });

    } catch (error) {
        console.error('Increment goal error:', error);
        res.status(500).json({ success: false, error: 'Error updating progress' });
    }
});

module.exports = router;
