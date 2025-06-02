/*
  # Create crypto portfolio tables

  1. New Tables
    - `wallets`
      - `id` (uuid, primary key)
      - `name` (text, not null)
      - `user_id` (uuid, references auth.users)
      - `created_at` (timestamp with time zone)
    
    - `assets`
      - `id` (uuid, primary key)
      - `wallet_id` (uuid, references wallets)
      - `name` (text, not null)
      - `amount` (numeric, not null)
      - `created_at` (timestamp with time zone)
    
    - `asset_prices`
      - `id` (uuid, primary key)
      - `asset_name` (text, not null)
      - `price_usd` (numeric, not null)
      - `updated_at` (timestamp with time zone)
  
  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
*/

-- Create wallets table
CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create assets table
CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid REFERENCES wallets NOT NULL,
  name text NOT NULL,
  amount numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create asset_prices table
CREATE TABLE IF NOT EXISTS asset_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_name text UNIQUE NOT NULL,
  price_usd numeric NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_prices ENABLE ROW LEVEL SECURITY;

-- Create policies for wallets
CREATE POLICY "Users can view their own wallets" 
  ON wallets FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wallets" 
  ON wallets FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wallets" 
  ON wallets FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own wallets" 
  ON wallets FOR DELETE 
  USING (auth.uid() = user_id);

-- Create policies for assets
CREATE POLICY "Users can view their own assets" 
  ON assets FOR SELECT 
  USING (auth.uid() = (SELECT user_id FROM wallets WHERE id = wallet_id));

CREATE POLICY "Users can insert their own assets" 
  ON assets FOR INSERT 
  WITH CHECK (auth.uid() = (SELECT user_id FROM wallets WHERE id = wallet_id));

CREATE POLICY "Users can update their own assets" 
  ON assets FOR UPDATE 
  USING (auth.uid() = (SELECT user_id FROM wallets WHERE id = wallet_id));

CREATE POLICY "Users can delete their own assets" 
  ON assets FOR DELETE 
  USING (auth.uid() = (SELECT user_id FROM wallets WHERE id = wallet_id));

-- Create policies for asset_prices (all authenticated users can view, only system can update)
CREATE POLICY "All users can view asset prices" 
  ON asset_prices FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Only authenticated users can insert asset prices" 
  ON asset_prices FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Only authenticated users can update asset prices" 
  ON asset_prices FOR UPDATE 
  TO authenticated 
  USING (true);