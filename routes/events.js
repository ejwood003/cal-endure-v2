const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// All event routes require authentication
router.use(requireAuth);

// Helper to update calendar goal completion status
const updateCalendarGoalProgress = async (goalId) => {
    if (!goalId) return;

    const goal = await db('goals')
        .where({ goal_id: goalId, goal_type: 'calendar' })
        .first();

    if (!goal) return;

    const completedEvents = await db('events')
        .where({ goal_id: goalId, status: 'completed' })
        .count('* as count')
        .first();

    const completed = parseInt(completedEvents.count, 10) || 0;
    const required = goal.linked_events_required || 0;

    await db('goals')
        .where({ goal_id: goalId })
        .update({
            is_completed: required > 0 && completed >= required
        });
};

// Calendar main page
router.get('/', async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const { year, month } = req.query;

        // Get current date or use provided year/month
        const today = new Date();
        const currentYear = year ? parseInt(year) : today.getFullYear();
        const currentMonth = month ? parseInt(month) : today.getMonth() + 1;

        // Get all events for the current month with contacts
        const events = await db.raw(`
            SELECT e.*,
                   ARRAY_AGG(
                       CASE
                           WHEN c.contact_id IS NOT NULL
                           THEN json_build_object(
                               'contact_id', c.contact_id,
                               'first_name', c.first_name,
                               'last_name', c.last_name
                           )
                       END
                   ) FILTER (WHERE c.contact_id IS NOT NULL) as contacts,
                   ARRAY_AGG(ce.contact_id) FILTER (WHERE ce.contact_id IS NOT NULL) as contact_ids
            FROM events e
            LEFT JOIN contact_events ce ON e.event_id = ce.event_id
            LEFT JOIN contacts c ON ce.contact_id = c.contact_id
            WHERE e.user_id = ?
              AND EXTRACT(YEAR FROM e.event_date) = ?
              AND EXTRACT(MONTH FROM e.event_date) = ?
            GROUP BY e.event_id
            ORDER BY e.event_date, e.start_time
        `, [userId, currentYear, currentMonth]);

        // Get today's events
        const todayEvents = await db.raw(`
            SELECT e.*,
                   ARRAY_AGG(
                       CASE
                           WHEN c.contact_id IS NOT NULL
                           THEN json_build_object(
                               'contact_id', c.contact_id,
                               'first_name', c.first_name,
                               'last_name', c.last_name
                           )
                       END
                   ) FILTER (WHERE c.contact_id IS NOT NULL) as contacts,
                   ARRAY_AGG(ce.contact_id) FILTER (WHERE ce.contact_id IS NOT NULL) as contact_ids
            FROM events e
            LEFT JOIN contact_events ce ON e.event_id = ce.event_id
            LEFT JOIN contacts c ON ce.contact_id = c.contact_id
            WHERE e.user_id = ? AND e.event_date = CURRENT_DATE
            GROUP BY e.event_id
            ORDER BY e.start_time
        `, [userId]);

        // Get all contacts for the contact selector
        const contacts = await db('contacts')
            .select('contact_id', 'first_name', 'last_name')
            .where({ user_id: userId })
            .orderBy('last_name')
            .orderBy('first_name');

        // Get calendar-type goals for linking
        const goals = await db('goals')
            .where({ user_id: userId, goal_type: 'calendar' })
            .select('goal_id', 'title', 'goal_type');

        res.render('calendar', {
            pageTitle: 'Calendar - Cal-Endure to the End',
            currentPage: 'calendar',
            events: events.rows,
            todayEvents: todayEvents.rows,
            contacts,
            goals,
            currentYear,
            currentMonth,
            today: {
                year: today.getFullYear(),
                month: today.getMonth() + 1,
                day: today.getDate()
            }
        });

    } catch (error) {
        console.error('Calendar error:', error);
        req.session.error = 'Error loading calendar';
        res.redirect('/dashboard');
    }
});

// Create new event
router.post('/create', async (req, res) => {
    const {
        title, eventDate, startTime, endTime, eventType,
        location, notes, contacts, goalId
    } = req.body;
    const userId = req.session.user.user_id;

    try {
        const status = req.body.status || 'pending';

        // Insert event
        const [event] = await db('events')
            .insert({
                user_id: userId,
                goal_id: goalId || null,
                title,
                event_date: eventDate,
                start_time: startTime,
                end_time: endTime || null,
                event_type: eventType,
                location,
                notes,
                color: req.body.color || '#0d3b66',
                status
            })
            .returning('event_id');

        const eventId = event.event_id;

        // Associate contacts with event
        if (contacts) {
            const contactIds = Array.isArray(contacts) ? contacts : [contacts];
            for (const contactId of contactIds) {
                if (contactId) {
                    await db('contact_events').insert({
                        contact_id: contactId,
                        event_id: eventId
                    });
                }
            }
        }

        if (goalId && status === 'completed') {
            await updateCalendarGoalProgress(goalId);
        }

        req.session.success = 'Event created successfully';
        res.redirect('/calendar');

    } catch (error) {
        console.error('Create event error:', error);
        req.session.error = 'Error creating event: ' + error.message;
        res.redirect('/calendar');
    }
});

// Get single event (for editing)
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user.user_id;

    try {
        const result = await db.raw(`
            SELECT e.*,
                   ARRAY_AGG(ce.contact_id) FILTER (WHERE ce.contact_id IS NOT NULL) as contact_ids
            FROM events e
            LEFT JOIN contact_events ce ON e.event_id = ce.event_id
            WHERE e.event_id = ? AND e.user_id = ?
            GROUP BY e.event_id
        `, [id, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        res.json({ event: result.rows[0] });

    } catch (error) {
        console.error('Get event error:', error);
        res.status(500).json({ error: 'Error loading event' });
    }
});

// Update event status (for calendar goals)
router.post('/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.session.user.user_id;

    try {
        const event = await db('events')
            .where({ event_id: id, user_id: userId })
            .first();

        if (!event) {
            return res.status(404).json({ success: false, error: 'Event not found' });
        }

        await db('events')
            .where({ event_id: id, user_id: userId })
            .update({ status });

        if (event.goal_id) {
            await updateCalendarGoalProgress(event.goal_id);
        }

        res.json({ success: true, status });

    } catch (error) {
        console.error('Update event status error:', error);
        res.status(500).json({ success: false, error: 'Error updating status' });
    }
});

// Update event
router.post('/update/:id', async (req, res) => {
    const { id } = req.params;
    const {
        title, eventDate, startTime, endTime, eventType,
        location, notes, contacts, goalId
    } = req.body;
    const userId = req.session.user.user_id;

    try {
        const existingEvent = await db('events')
            .where({ event_id: id, user_id: userId })
            .first();

        if (!existingEvent) {
            req.session.error = 'Event not found';
            return res.redirect('/calendar');
        }

        const newStatus = req.body.status || 'pending';

        // Update event
        await db('events')
            .where({ event_id: id, user_id: userId })
            .update({
                goal_id: goalId || null,
                title,
                event_date: eventDate,
                start_time: startTime,
                end_time: endTime || null,
                event_type: eventType,
                location,
                notes,
                color: req.body.color || '#0d3b66',
                status: newStatus
            });

        // Delete existing contact associations
        await db('contact_events').where({ event_id: id }).del();

        // Add new contact associations
        if (contacts) {
            const contactIds = Array.isArray(contacts) ? contacts : [contacts];
            for (const contactId of contactIds) {
                if (contactId) {
                    await db('contact_events').insert({
                        contact_id: contactId,
                        event_id: id
                    });
                }
            }
        }

        const goalsToUpdate = new Set();
        if (existingEvent.goal_id) goalsToUpdate.add(existingEvent.goal_id);
        if (goalId) goalsToUpdate.add(goalId);
        await Promise.all(Array.from(goalsToUpdate).map(updateCalendarGoalProgress));

        req.session.success = 'Event updated successfully';
        res.redirect('/calendar');

    } catch (error) {
        console.error('Update event error:', error);
        req.session.error = 'Error updating event';
        res.redirect('/calendar');
    }
});

// Delete event
router.post('/delete/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user.user_id;

    try {
        await db('events')
            .where({ event_id: id, user_id: userId })
            .del();

        req.session.success = 'Event deleted successfully';
        res.redirect('/calendar');

    } catch (error) {
        console.error('Delete event error:', error);
        req.session.error = 'Error deleting event';
        res.redirect('/calendar');
    }
});

// Update event date (for drag-and-drop)
router.post('/move/:id', async (req, res) => {
    const { id } = req.params;
    const { newDate } = req.body;
    const userId = req.session.user.user_id;

    try {
        await db('events')
            .where({ event_id: id, user_id: userId })
            .update({ event_date: newDate });

        res.json({ success: true });

    } catch (error) {
        console.error('Move event error:', error);
        res.status(500).json({ success: false, error: 'Error moving event' });
    }
});

module.exports = router;
