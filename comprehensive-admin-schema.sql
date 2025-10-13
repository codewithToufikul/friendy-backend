-- ==================== COMPREHENSIVE ADMIN PANEL DATABASE SCHEMA ====================
-- This schema supports all admin panel requirements for the Friendy dating app

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================== CORE USER MANAGEMENT ====================

-- Users table (unified for customers and hosts)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firebase_uid VARCHAR(255) UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    phone VARCHAR(20),
    age INTEGER,
    gender VARCHAR(20) CHECK (gender IN ('male', 'female', 'other')),
    location VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India',
    profile_image_url TEXT,
    profile_images TEXT[], -- Array of image URLs
    bio TEXT,
    interests TEXT[], -- Array of interests
    languages TEXT[], -- Array of languages
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('customer', 'host', 'agent', 'agency')),
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    is_blocked BOOLEAN DEFAULT false,
    blocked_until TIMESTAMP,
    block_reason TEXT,
    coins_balance INTEGER DEFAULT 50,
    is_premium BOOLEAN DEFAULT false,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer profiles (extended customer data)
CREATE TABLE IF NOT EXISTS customer_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    looking_for VARCHAR(20),
    relationship_type VARCHAR(50),
    occupation VARCHAR(255),
    education VARCHAR(255),
    height INTEGER, -- Height in cm
    total_spent DECIMAL(10,2) DEFAULT 0.00,
    total_calls INTEGER DEFAULT 0,
    total_messages INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Host profiles (extended host data)
CREATE TABLE IF NOT EXISTS host_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES users(id),
    agency_id UUID REFERENCES agencies(id),
    is_online BOOLEAN DEFAULT false,
    is_live BOOLEAN DEFAULT false,
    is_featured BOOLEAN DEFAULT false,
    is_vip BOOLEAN DEFAULT false,
    approval_status VARCHAR(20) DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    commission_percentage DECIMAL(5,2) DEFAULT 70.00, -- Host gets 70% by default
    total_earnings DECIMAL(10,2) DEFAULT 0.00,
    total_calls INTEGER DEFAULT 0,
    total_minutes INTEGER DEFAULT 0,
    rating DECIMAL(3,2) DEFAULT 0.00,
    rating_count INTEGER DEFAULT 0,
    specialties TEXT[], -- Array of specialties
    availability_hours JSONB, -- JSON object for availability schedule
    bank_account_number VARCHAR(50),
    bank_ifsc VARCHAR(20),
    bank_name VARCHAR(100),
    account_holder_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== AGENCY & AGENT MANAGEMENT ====================

-- Agencies table
CREATE TABLE IF NOT EXISTS agencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    contact_person VARCHAR(255),
    address TEXT,
    commission_percentage DECIMAL(5,2) DEFAULT 10.00, -- Agency gets 10% by default
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'blocked')),
    total_hosts INTEGER DEFAULT 0,
    total_earnings DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agent profiles (agents work under agencies)
CREATE TABLE IF NOT EXISTS agent_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    agency_id UUID REFERENCES agencies(id),
    commission_percentage DECIMAL(5,2) DEFAULT 5.00, -- Agent gets 5% by default
    total_hosts_added INTEGER DEFAULT 0,
    total_customers_added INTEGER DEFAULT 0,
    total_earnings DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== PRICING & PACKAGES ====================

-- Host pricing (individual host rates)
CREATE TABLE IF NOT EXISTS host_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    host_id UUID REFERENCES users(id) ON DELETE CASCADE,
    video_call_rate DECIMAL(8,2) DEFAULT 0.00, -- Per minute rate
    voice_call_rate DECIMAL(8,2) DEFAULT 0.00, -- Per minute rate
    message_rate DECIMAL(8,2) DEFAULT 0.00, -- Per message rate
    streaming_rate DECIMAL(8,2) DEFAULT 0.00, -- Per minute rate
    currency VARCHAR(10) DEFAULT 'INR',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Coin packages (recharge plans)
CREATE TABLE IF NOT EXISTS coin_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    coins INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    bonus_coins INTEGER DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'INR',
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== GIFTS MANAGEMENT ====================

-- Gifts catalog
CREATE TABLE IF NOT EXISTS gifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    image_url TEXT NOT NULL,
    coin_value INTEGER NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('romantic', 'funny', 'festival', 'premium')),
    is_active BOOLEAN DEFAULT true,
    is_seasonal BOOLEAN DEFAULT false,
    season_start DATE,
    season_end DATE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Gift transactions
CREATE TABLE IF NOT EXISTS gift_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gift_id UUID REFERENCES gifts(id),
    sender_id UUID REFERENCES users(id),
    receiver_id UUID REFERENCES users(id),
    coin_value INTEGER NOT NULL,
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== TRANSACTIONS & PAYMENTS ====================

-- Main transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    customer_id UUID REFERENCES users(id),
    host_id UUID REFERENCES users(id),
    agent_id UUID REFERENCES users(id),
    agency_id UUID REFERENCES agencies(id),
    transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN (
        'recharge', 'call_payment', 'message_payment', 'gift_payment', 
        'host_earning', 'agent_commission', 'agency_commission',
        'refund', 'admin_credit', 'admin_debit'
    )),
    amount DECIMAL(10,2) NOT NULL,
    coins INTEGER,
    currency VARCHAR(10) DEFAULT 'INR',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    payment_method VARCHAR(50),
    payment_gateway VARCHAR(50),
    gateway_transaction_id VARCHAR(255),
    gateway_response JSONB,
    reference_id UUID, -- Reference to call, message, gift, etc.
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Host withdrawals
CREATE TABLE IF NOT EXISTS withdrawals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    host_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    bank_account_number VARCHAR(50),
    bank_ifsc VARCHAR(20),
    bank_name VARCHAR(100),
    account_holder_name VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'approved', 'paid', 'rejected')),
    admin_notes TEXT,
    processed_by UUID REFERENCES users(id),
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== COMMUNICATION & CALLS ====================

-- Call sessions
CREATE TABLE IF NOT EXISTS call_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    host_id UUID REFERENCES users(id),
    customer_id UUID REFERENCES users(id),
    call_type VARCHAR(20) NOT NULL CHECK (call_type IN ('voice', 'video')),
    channel_name VARCHAR(255),
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    duration_minutes INTEGER DEFAULT 0,
    rate_per_minute DECIMAL(8,2),
    total_amount DECIMAL(10,2) DEFAULT 0.00,
    total_coins INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL,
    sender_id UUID REFERENCES users(id),
    receiver_id UUID REFERENCES users(id),
    message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'audio', 'gift')),
    content TEXT,
    file_url TEXT,
    gift_id UUID REFERENCES gifts(id),
    coin_cost INTEGER DEFAULT 0,
    is_read BOOLEAN DEFAULT false,
    is_reported BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Streaming sessions
CREATE TABLE IF NOT EXISTS streaming_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    host_id UUID REFERENCES users(id),
    channel_name VARCHAR(255),
    title VARCHAR(255),
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    duration_minutes INTEGER DEFAULT 0,
    max_viewers INTEGER DEFAULT 0,
    total_viewers INTEGER DEFAULT 0,
    earnings DECIMAL(10,2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'live' CHECK (status IN ('live', 'ended', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== CONTENT MODERATION ====================

-- Reported content
CREATE TABLE IF NOT EXISTS content_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID REFERENCES users(id),
    reported_user_id UUID REFERENCES users(id),
    content_type VARCHAR(20) CHECK (content_type IN ('profile', 'message', 'image', 'video', 'behavior')),
    content_id UUID, -- Reference to message, image, etc.
    reason VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
    admin_notes TEXT,
    action_taken VARCHAR(100),
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User warnings and penalties
CREATE TABLE IF NOT EXISTS user_penalties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    penalty_type VARCHAR(20) CHECK (penalty_type IN ('warning', 'suspension', 'ban')),
    reason TEXT NOT NULL,
    duration_days INTEGER, -- For suspensions
    issued_by UUID REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- Blacklisted words
CREATE TABLE IF NOT EXISTS blacklisted_words (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    word VARCHAR(255) NOT NULL,
    severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
    action VARCHAR(20) DEFAULT 'filter' CHECK (action IN ('filter', 'warn', 'block')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== SUPPORT SYSTEM ====================

-- Support tickets
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number VARCHAR(20) UNIQUE NOT NULL,
    customer_id UUID REFERENCES users(id),
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50) CHECK (category IN ('technical', 'payment', 'account', 'abuse', 'general')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    assigned_to UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- Ticket replies
CREATE TABLE IF NOT EXISTS ticket_replies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id),
    sender_type VARCHAR(20) CHECK (sender_type IN ('customer', 'admin')),
    message TEXT NOT NULL,
    attachments TEXT[], -- Array of file URLs
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== SYSTEM SETTINGS ====================

-- App settings
CREATE TABLE IF NOT EXISTS app_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(20) DEFAULT 'string' CHECK (setting_type IN ('string', 'number', 'boolean', 'json')),
    description TEXT,
    is_public BOOLEAN DEFAULT false, -- Whether setting is visible to users
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Commission settings
CREATE TABLE IF NOT EXISTS commission_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(20) CHECK (entity_type IN ('platform', 'host', 'agent', 'agency')),
    entity_id UUID, -- NULL for platform default
    commission_percentage DECIMAL(5,2) NOT NULL,
    min_withdrawal_amount DECIMAL(10,2) DEFAULT 100.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== ANALYTICS & TRACKING ====================

-- Customer activities (for analytics)
CREATE TABLE IF NOT EXISTS customer_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES users(id),
    activity_type VARCHAR(30) CHECK (activity_type IN (
        'login', 'logout', 'profile_update', 'call', 'video_call', 
        'message', 'gift_sent', 'recharge', 'search'
    )),
    description TEXT,
    host_id UUID REFERENCES users(id), -- For host-related activities
    host_name VARCHAR(255),
    duration_minutes INTEGER DEFAULT 0,
    coins_spent INTEGER DEFAULT 0,
    metadata JSONB, -- Additional activity data
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== INDEXES FOR PERFORMANCE ====================

-- User indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Transaction indexes
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_host_id ON transactions(host_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

-- Call session indexes
CREATE INDEX IF NOT EXISTS idx_call_sessions_host_id ON call_sessions(host_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_customer_id ON call_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_status ON call_sessions(status);

-- Message indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages(receiver_id);

-- Support ticket indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer_id ON support_tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets(priority);

-- Activity indexes
CREATE INDEX IF NOT EXISTS idx_customer_activities_customer_id ON customer_activities(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_activities_type ON customer_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_customer_activities_created_at ON customer_activities(created_at);
