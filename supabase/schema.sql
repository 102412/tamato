-- ═══════════════════════════════════════════════════════════════════
-- TAMATO — SUPABASE SCHEMA
-- Run this once in the Supabase SQL editor on a fresh project.
-- Safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE where possible).
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Tables ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  tier TEXT DEFAULT 'free',
  credits INT DEFAULT 0,
  ai_credits INT DEFAULT 0,
  studio_credits INT DEFAULT 0,
  credits_reset TIMESTAMP,
  build_gen_count INT DEFAULT 0,
  build_gen_lifetime INT DEFAULT 0,
  build_daily_gen INT DEFAULT 0,
  build_daily_reset TIMESTAMP,
  build_sites_created INT DEFAULT 0,
  build_edit_lifetime INT DEFAULT 0,
  studio_creations_count INT DEFAULT 0,
  studio_creations_lifetime INT DEFAULT 0,
  dev_mode BOOLEAN DEFAULT false,
  theme TEXT DEFAULT 'dark',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  connector_tokens JSONB DEFAULT '{}',
  agency_seat_owner UUID,
  agency_plan TEXT,
  melio_approved BOOLEAN DEFAULT false,
  melio_expiry TIMESTAMP,
  account_suspended BOOLEAN DEFAULT false,
  strike_count INT DEFAULT 0,
  parental_consent_email TEXT,
  parental_consent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT DEFAULT 'Untitled Site',
  prompt TEXT,
  desktop_html TEXT,
  mobile_html TEXT,
  model_used TEXT,
  primary_color TEXT,
  version_history JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'New Conversation',
  messages JSONB DEFAULT '[]',
  model_used TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS design_systems (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT DEFAULT 'Untitled Design System',
  tokens JSONB DEFAULT '{}',
  source_images TEXT[],
  export_prompt TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  active BOOLEAN DEFAULT true,
  token_input_used BIGINT DEFAULT 0,
  token_output_used BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS melio_applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  what_building TEXT NOT NULL,
  current_situation TEXT NOT NULL,
  why_website_matters TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agency_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_email TEXT NOT NULL,
  agency_plan TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  accepted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  type TEXT NOT NULL,
  product TEXT NOT NULL,
  model_used TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- ── Auto-create profile on auth signup ─────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email) VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Auto-update updated_at on mutation ─────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sites_updated_at ON sites;
CREATE TRIGGER sites_updated_at BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS ai_conversations_updated_at ON ai_conversations;
CREATE TRIGGER ai_conversations_updated_at BEFORE UPDATE ON ai_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS design_systems_updated_at ON design_systems;
CREATE TRIGGER design_systems_updated_at BEFORE UPDATE ON design_systems
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Caps: keep last 30 conversations / 10 design systems per user ──
CREATE OR REPLACE FUNCTION limit_ai_conversations() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM ai_conversations WHERE user_id = NEW.user_id AND id NOT IN (
    SELECT id FROM ai_conversations WHERE user_id = NEW.user_id
    ORDER BY updated_at DESC LIMIT 30);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS limit_conversations_trigger ON ai_conversations;
CREATE TRIGGER limit_conversations_trigger AFTER INSERT ON ai_conversations
  FOR EACH ROW EXECUTE FUNCTION limit_ai_conversations();

CREATE OR REPLACE FUNCTION limit_design_systems() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM design_systems WHERE user_id = NEW.user_id AND id NOT IN (
    SELECT id FROM design_systems WHERE user_id = NEW.user_id
    ORDER BY updated_at DESC LIMIT 10);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS limit_design_systems_trigger ON design_systems;
CREATE TRIGGER limit_design_systems_trigger AFTER INSERT ON design_systems
  FOR EACH ROW EXECUTE FUNCTION limit_design_systems();

-- ── Cap site version history to last 10 ────────────────────────────
CREATE OR REPLACE FUNCTION limit_site_versions() RETURNS TRIGGER AS $$
DECLARE history JSONB;
BEGIN
  history := NEW.version_history;
  IF jsonb_array_length(history) > 10 THEN
    NEW.version_history := (
      SELECT jsonb_agg(elem) FROM (
        SELECT elem FROM jsonb_array_elements(history) elem
        ORDER BY (elem->>'saved_at') DESC LIMIT 10
      ) sub
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS limit_versions_trigger ON sites;
CREATE TRIGGER limit_versions_trigger BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION limit_site_versions();

-- ── API usage RPC (called by Cloudflare Worker) ────────────────────
CREATE OR REPLACE FUNCTION increment_api_usage(p_id UUID, p_in BIGINT, p_out BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE api_keys
    SET token_input_used = COALESCE(token_input_used, 0) + p_in,
        token_output_used = COALESCE(token_output_used, 0) + p_out
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Row Level Security ─────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE melio_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_profile ON profiles;
CREATE POLICY own_profile ON profiles FOR ALL USING (auth.uid() = id);

DROP POLICY IF EXISTS own_sites ON sites;
CREATE POLICY own_sites ON sites FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS own_conversations ON ai_conversations;
CREATE POLICY own_conversations ON ai_conversations FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS own_design_systems ON design_systems;
CREATE POLICY own_design_systems ON design_systems FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS own_api_keys ON api_keys;
CREATE POLICY own_api_keys ON api_keys FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS own_transactions ON credit_transactions;
CREATE POLICY own_transactions ON credit_transactions FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS own_invites ON agency_invites;
CREATE POLICY own_invites ON agency_invites FOR ALL USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS melio_insert ON melio_applications;
CREATE POLICY melio_insert ON melio_applications FOR INSERT WITH CHECK (true);

/* ── Terms of Service consent record ─────────────────────────────
   Run this once in the Supabase SQL editor to add consent tracking. */
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_version TEXT;
ALTER TABLE melio_applications ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP;

/* ── Krator (Fable 5) integration ────────────────────────────────
   Run this once in the Supabase SQL editor. */
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS krator_edit_count INT DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pro_krator_addon BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS single_site_megisto_krator_addon BOOLEAN DEFAULT false;
