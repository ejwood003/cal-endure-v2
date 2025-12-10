const express = require('express');
const session = require('express-session');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
    }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make user available to all views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.error = req.session.error || null;
    res.locals.success = req.session.success || null;
    // Clear flash messages after setting them
    delete req.session.error;
    delete req.session.success;
    next();
});

// Import routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const contactRoutes = require('./routes/contacts');
const eventRoutes = require('./routes/events');
const goalRoutes = require('./routes/goals');

// Use routes
app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/contacts', contactRoutes);
app.use('/calendar', eventRoutes);
app.use('/goals', goalRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', {
        pageTitle: '404 - Page Not Found',
        error: '404',
        message: 'Page not found'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', {
        pageTitle: 'Error',
        error: '500',
        message: 'Something went wrong!'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
