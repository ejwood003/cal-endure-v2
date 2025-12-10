const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/database');
const { requireGuest, requireAuth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for profile photo uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/profiles');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Landing page
router.get('/', (req, res) => {
    res.render('landing', {
        pageTitle: 'Cal-Endure to the End - PMG Calendar for Returned Missionaries'
    });
});

// Login page
router.get('/login', requireGuest, (req, res) => {
    res.render('login', {
        pageTitle: 'Login - Cal-Endure to the End'
    });
});

// Handle login
router.post('/login', requireGuest, async (req, res) => {
    const { email, password, remember } = req.body;

    try {
        // Find user by email
        const user = await db('users')
            .where({ email })
            .first();

        if (!user) {
            req.session.error = 'Invalid email or password';
            return res.redirect('/login');
        }

        // Compare password
        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            req.session.error = 'Invalid email or password';
            return res.redirect('/login');
        }

        // Set session
        req.session.user = {
            user_id: user.user_id,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            username: user.username,
            mission: user.mission,
            profile_photo: user.profile_photo
        };

        // Extend session if "remember me" is checked
        if (remember === 'on') {
            req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30; // 30 days
        }

        req.session.success = 'Welcome back!';
        res.redirect('/dashboard');

    } catch (error) {
        console.error('Login error:', error);
        req.session.error = 'An error occurred during login';
        res.redirect('/login');
    }
});

// Handle signup
router.post('/signup', requireGuest, async (req, res) => {
    const { firstName, lastName, email, username, password, confirmPassword, mission } = req.body;

    try {
        // Validation
        if (!firstName || !lastName || !email || !username || !password) {
            req.session.error = 'All required fields must be filled';
            return res.redirect('/login#signup');
        }

        if (password !== confirmPassword) {
            req.session.error = 'Passwords do not match';
            return res.redirect('/login#signup');
        }

        if (password.length < 6) {
            req.session.error = 'Password must be at least 6 characters';
            return res.redirect('/login#signup');
        }

        // Check if email or username already exists
        const existingUser = await db('users')
            .where({ email })
            .orWhere({ username })
            .first();

        if (existingUser) {
            req.session.error = 'Email or username already exists';
            return res.redirect('/login#signup');
        }

        // Hash password
        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);

        // Insert new user
        const [newUser] = await db('users')
            .insert({
                first_name: firstName,
                last_name: lastName,
                email,
                username,
                password_hash,
                mission: mission || null
            })
            .returning(['user_id', 'first_name', 'last_name', 'email', 'username', 'mission', 'profile_photo']);

        // Set session
        req.session.user = {
            user_id: newUser.user_id,
            first_name: newUser.first_name,
            last_name: newUser.last_name,
            email: newUser.email,
            username: newUser.username,
            mission: newUser.mission,
            profile_photo: newUser.profile_photo
        };

        req.session.success = 'Account created successfully! Welcome!';
        res.redirect('/dashboard');

    } catch (error) {
        console.error('Signup error:', error);
        req.session.error = 'An error occurred during signup';
        res.redirect('/login#signup');
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/');
    });
});

// Profile page
router.get('/profile', requireAuth, (req, res) => {
    res.render('profile', {
        pageTitle: 'Profile - Cal-Endure to the End'
    });
});

// Update user profile photo
router.post('/profile/photo', requireAuth, upload.single('profilePhoto'), async (req, res) => {
    const userId = req.session.user.user_id;

    try {
        if (!req.file) {
            req.session.error = 'No photo uploaded';
            return res.redirect('/dashboard');
        }

        // Get current user to find old photo
        const currentUser = await db('users')
            .select('profile_photo')
            .where({ user_id: userId })
            .first();

        const newPhoto = `/uploads/profiles/${req.file.filename}`;

        // Update user profile photo
        await db('users')
            .where({ user_id: userId })
            .update({ profile_photo: newPhoto });

        // Delete old photo if it exists and is not a placeholder
        if (currentUser && currentUser.profile_photo &&
            !currentUser.profile_photo.includes('placeholder') &&
            !currentUser.profile_photo.includes('via.placeholder')) {
            const oldPhotoPath = path.join(__dirname, '..', currentUser.profile_photo);
            if (fs.existsSync(oldPhotoPath)) {
                fs.unlinkSync(oldPhotoPath);
            }
        }

        // Update session
        req.session.user.profile_photo = newPhoto;

        req.session.success = 'Profile photo updated successfully';
        res.redirect('/profile');

    } catch (error) {
        console.error('Update profile photo error:', error);
        req.session.error = 'Error updating profile photo';
        res.redirect('/profile');
    }
});

// Update user profile
router.post('/profile/update', requireAuth, async (req, res) => {
    const userId = req.session.user.user_id;
    const { firstName, lastName, email, username, mission } = req.body;

    try {
        // Check if email already exists for another user
        const existingEmail = await db('users')
            .where({ email })
            .whereNot({ user_id: userId })
            .first();

        if (existingEmail) {
            req.session.error = 'Email already in use by another account';
            return res.redirect('/profile');
        }

        // Check if username already exists for another user
        const existingUsername = await db('users')
            .where({ username })
            .whereNot({ user_id: userId })
            .first();

        if (existingUsername) {
            req.session.error = 'Username already in use by another account';
            return res.redirect('/profile');
        }

        // Update user
        await db('users')
            .where({ user_id: userId })
            .update({
                first_name: firstName,
                last_name: lastName,
                email,
                username,
                mission: mission || null
            });

        // Update session
        req.session.user.first_name = firstName;
        req.session.user.last_name = lastName;
        req.session.user.email = email;
        req.session.user.username = username;
        req.session.user.mission = mission;

        req.session.success = 'Profile updated successfully';
        res.redirect('/profile');

    } catch (error) {
        console.error('Update profile error:', error);
        req.session.error = 'Error updating profile';
        res.redirect('/profile');
    }
});

// Change password
router.post('/profile/password', requireAuth, async (req, res) => {
    const userId = req.session.user.user_id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    try {
        // Validate passwords match
        if (newPassword !== confirmPassword) {
            req.session.error = 'New passwords do not match';
            return res.redirect('/profile');
        }

        if (newPassword.length < 6) {
            req.session.error = 'Password must be at least 6 characters';
            return res.redirect('/profile');
        }

        // Get current user
        const user = await db('users')
            .where({ user_id: userId })
            .first();

        if (!user) {
            req.session.error = 'User not found';
            return res.redirect('/profile');
        }

        // Verify current password
        const match = await bcrypt.compare(currentPassword, user.password_hash);

        if (!match) {
            req.session.error = 'Current password is incorrect';
            return res.redirect('/profile');
        }

        // Hash new password
        const saltRounds = 10;
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        await db('users')
            .where({ user_id: userId })
            .update({ password_hash: newPasswordHash });

        req.session.success = 'Password changed successfully';
        res.redirect('/profile');

    } catch (error) {
        console.error('Change password error:', error);
        req.session.error = 'Error changing password';
        res.redirect('/profile');
    }
});

// Delete account
router.post('/profile/delete', requireAuth, async (req, res) => {
    const userId = req.session.user.user_id;

    try {
        // Delete user (cascade will delete all related data)
        await db('users')
            .where({ user_id: userId })
            .del();

        // Destroy session
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destroy error:', err);
            }
            res.redirect('/?deleted=true');
        });

    } catch (error) {
        console.error('Delete account error:', error);
        req.session.error = 'Error deleting account';
        res.redirect('/profile');
    }
});

module.exports = router;
