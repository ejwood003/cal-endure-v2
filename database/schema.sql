-- Cal-Endure to the End Database Schema

-- Drop tables if they exist (for clean setup)
DROP TABLE IF EXISTS contact_events CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS goals CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users Table
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    mission VARCHAR(100),
    profile_photo VARCHAR(255) DEFAULT 'https://via.placeholder.com/150',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contacts Table
CREATE TABLE contacts (
    contact_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100),
    street_address VARCHAR(100),
    city VARCHAR(50),
    state VARCHAR(2),
    zip_code VARCHAR(10),
    photo VARCHAR(255) DEFAULT 'https://via.placeholder.com/150',
    notes TEXT,
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Events Table
CREATE TABLE events (
    event_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    event_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME,
    event_type VARCHAR(50),
    location VARCHAR(200),
    notes TEXT,
    reminder BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Goals Table
CREATE TABLE goals (
    goal_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL,
    target_count INT DEFAULT 0,
    current_count INT DEFAULT 0,
    description TEXT,
    deadline DATE,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contact_Events Junction Table (Many-to-Many relationship)
CREATE TABLE contact_events (
    contact_event_id SERIAL PRIMARY KEY,
    contact_id INT REFERENCES contacts(contact_id) ON DELETE CASCADE,
    event_id INT REFERENCES events(event_id) ON DELETE CASCADE,
    UNIQUE(contact_id, event_id)
);

-- Create indexes for better query performance
CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_goals_user_id ON goals(user_id);
CREATE INDEX idx_goals_category ON goals(category);
CREATE INDEX idx_contact_events_contact_id ON contact_events(contact_id);
CREATE INDEX idx_contact_events_event_id ON contact_events(event_id);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at
    BEFORE UPDATE ON contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_goals_updated_at
    BEFORE UPDATE ON goals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
