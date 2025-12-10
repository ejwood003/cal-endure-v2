-- Migration script to upgrade existing goals table to support new goal types
-- Run this AFTER backing up your database

BEGIN;

-- Add new columns to existing goals table
ALTER TABLE goals ADD COLUMN IF NOT EXISTS goal_type VARCHAR(20) DEFAULT 'numeric' CHECK (goal_type IN ('numeric', 'recurring', 'calendar'));

-- Rename existing columns for clarity
ALTER TABLE goals RENAME COLUMN target_count TO numeric_target_value;
ALTER TABLE goals RENAME COLUMN current_count TO numeric_current_value;
ALTER TABLE goals RENAME COLUMN deadline TO target_date;

-- Add new columns for numeric goals
ALTER TABLE goals ADD COLUMN IF NOT EXISTS numeric_unit VARCHAR(50) DEFAULT 'times';

-- Add new columns for recurring goals
ALTER TABLE goals ADD COLUMN IF NOT EXISTS recurrence_pattern VARCHAR(50);
ALTER TABLE goals ADD COLUMN IF NOT EXISTS recurrence_interval INT DEFAULT 1;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS recurrence_days VARCHAR(50);
ALTER TABLE goals ADD COLUMN IF NOT EXISTS last_completed_at TIMESTAMP;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS completion_count INT DEFAULT 0;

-- Add new column for calendar goals
ALTER TABLE goals ADD COLUMN IF NOT EXISTS linked_events_required INT DEFAULT 0;

-- Update existing goals to have goal_type = 'numeric' if not set
UPDATE goals SET goal_type = 'numeric' WHERE goal_type IS NULL;

-- Add goal_id column to events table if it doesn't exist
ALTER TABLE events ADD COLUMN IF NOT EXISTS goal_id INT REFERENCES goals(goal_id) ON DELETE SET NULL;

-- Add status column to events table if it doesn't exist
ALTER TABLE events ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'missed', 'cancelled'));

-- Create new indexes
CREATE INDEX IF NOT EXISTS idx_events_goal_id ON events(goal_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_goals_type ON goals(goal_type);

COMMIT;
