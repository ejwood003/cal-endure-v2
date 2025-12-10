// Authentication Middleware

// Require authentication for protected routes
const requireAuth = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    req.session.error = 'Please log in to access this page';
    res.redirect('/login');
};

// Redirect if already authenticated
const requireGuest = (req, res, next) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }
    next();
};

module.exports = {
    requireAuth,
    requireGuest
};
