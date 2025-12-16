/*
  # Create Invoices Table

  ## Purpose
  This migration creates a comprehensive invoices table to track payment history for all subscription plans.

  ## Tables Created
  1. `invoices` - Stores detailed invoice information
    - `id` (uuid, primary key) - Unique invoice identifier
    - `invoice_number` (text, unique) - Human-readable invoice number (e.g., INV-2025-00001)
    - `user_id` (uuid) - Reference to auth.users
    - `subscription_id` (uuid, nullable) - Reference to business_subscriptions
    - `transaction_id` (uuid, nullable) - Reference to business_transactions
    - `payer_name` (text) - Name of the person who made the payment
    - `payer_email` (text, nullable) - Email of the payer
    - `payer_phone` (text, nullable) - Phone number of the payer
    - `plan_name` (text) - Subscription plan name (Basic, Pro, Enterprise, etc.)
    - `plan_duration` (text) - Duration of the plan (default: '1 month')
    - `amount` (integer) - Amount paid in cents
    - `currency` (text) - Currency code (default: 'XOF')
    - `payment_gateway` (text) - Payment provider (Stripe, PayPal, Airtel Money)
    - `payment_status` (text) - Status of payment (pending, completed, failed, refunded)
    - `payment_date` (timestamptz) - Date and time of payment
    - `payment_method` (text, nullable) - Specific payment method used
    - `invoice_url` (text, nullable) - URL to hosted invoice PDF
    - `metadata` (jsonb) - Additional metadata as JSON
    - `created_at` (timestamptz) - Record creation timestamp
    - `updated_at` (timestamptz) - Record update timestamp

  ## Security
  - Enable RLS on invoices table
  - Users can only view their own invoices
  - Only authenticated users can access invoices
  - Service role can manage all invoices

  ## Indexes
  - Index on user_id for fast user lookups
  - Index on invoice_number for quick searches
  - Index on payment_date for date-based queries
  - Index on payment_status for filtering
*/

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES business_subscriptions(id) ON DELETE SET NULL,
  transaction_id uuid REFERENCES business_transactions(id) ON DELETE SET NULL,
  payer_name text NOT NULL,
  payer_email text,
  payer_phone text,
  plan_name text NOT NULL,
  plan_duration text NOT NULL DEFAULT '1 month',
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'XOF',
  payment_gateway text NOT NULL CHECK (payment_gateway IN ('Stripe', 'PayPal', 'Airtel Money')),
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
  payment_date timestamptz NOT NULL DEFAULT now(),
  payment_method text,
  invoice_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_date ON invoices(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status);

-- Enable Row Level Security
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own invoices
CREATE POLICY "Users can view own invoices"
  ON invoices
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own invoices (for self-service scenarios)
CREATE POLICY "Users can create own invoices"
  ON invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own invoices (limited fields)
CREATE POLICY "Users can update own invoices"
  ON invoices
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Function to automatically generate invoice numbers
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS text AS $$
DECLARE
  year_part text;
  sequence_num integer;
  invoice_num text;
BEGIN
  year_part := TO_CHAR(CURRENT_DATE, 'YYYY');
  
  -- Get the next sequence number for this year
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(invoice_number FROM 'INV-' || year_part || '-(\d+)') AS integer)
  ), 0) + 1
  INTO sequence_num
  FROM invoices
  WHERE invoice_number LIKE 'INV-' || year_part || '-%';
  
  invoice_num := 'INV-' || year_part || '-' || LPAD(sequence_num::text, 5, '0');
  
  RETURN invoice_num;
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();