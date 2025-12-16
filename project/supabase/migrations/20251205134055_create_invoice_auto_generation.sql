/*
  # Auto-Generate Invoices from Business Transactions

  ## Purpose
  This migration creates a trigger function that automatically generates invoices
  when business transactions are completed.

  ## Changes
  1. Function: create_invoice_from_transaction
     - Automatically creates an invoice when a business transaction is marked as completed
     - Extracts user information from the subscription
     - Generates invoice number automatically
     - Maps transaction data to invoice fields

  2. Trigger: auto_create_invoice_on_transaction
     - Fires when business_transactions status changes to 'completed'
     - Only creates invoice if one doesn't already exist for that transaction

  ## How it Works
  - When a business_transaction status is updated to 'completed'
  - The trigger extracts subscription and user data
  - Creates an invoice with all required information
  - Invoice number is auto-generated in format: INV-YYYY-NNNNN
*/

-- Function to create invoice from completed transaction
CREATE OR REPLACE FUNCTION create_invoice_from_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_user_name text;
  v_plan_name text;
  v_invoice_number text;
BEGIN
  -- Only proceed if status is completed and wasn't completed before
  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed') THEN
    
    -- Check if invoice already exists for this transaction
    IF EXISTS (SELECT 1 FROM invoices WHERE transaction_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    -- Get user information from subscription
    SELECT 
      bs.user_id,
      bs.plan,
      au.email,
      COALESCE(au.raw_user_meta_data->>'full_name', au.email) as user_name
    INTO 
      v_user_id,
      v_plan_name,
      v_user_email,
      v_user_name
    FROM business_subscriptions bs
    LEFT JOIN auth.users au ON bs.user_id = au.id
    WHERE bs.id = NEW.subscription_id;

    -- Generate invoice number
    v_invoice_number := generate_invoice_number();

    -- Create the invoice
    INSERT INTO invoices (
      invoice_number,
      user_id,
      subscription_id,
      transaction_id,
      payer_name,
      payer_email,
      plan_name,
      plan_duration,
      amount,
      currency,
      payment_gateway,
      payment_status,
      payment_date,
      payment_method,
      metadata
    ) VALUES (
      v_invoice_number,
      v_user_id,
      NEW.subscription_id,
      NEW.id,
      v_user_name,
      v_user_email,
      COALESCE(v_plan_name, 'Standard Plan'),
      '1 month',
      NEW.amount,
      'XOF',
      NEW.provider,
      'completed',
      NOW(),
      NEW.provider,
      jsonb_build_object(
        'provider_transaction_id', NEW.provider_transaction_id,
        'auto_generated', true
      )
    );

    RAISE NOTICE 'Invoice % created for transaction %', v_invoice_number, NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on business_transactions
DROP TRIGGER IF EXISTS auto_create_invoice_on_transaction ON business_transactions;

CREATE TRIGGER auto_create_invoice_on_transaction
  AFTER INSERT OR UPDATE OF status ON business_transactions
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION create_invoice_from_transaction();

-- Add comment
COMMENT ON FUNCTION create_invoice_from_transaction() IS 
'Automatically creates an invoice when a business transaction is marked as completed. Extracts user and subscription data to populate invoice fields.';