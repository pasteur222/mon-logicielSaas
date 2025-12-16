/*
  # Create Fictitious Business Subscription Payment Data
  
  ## Overview
  This migration simulates real payment data for demonstration purposes.
  
  ## Data Structure
  1. Creates 50 fictitious business subscriptions:
     - 15 subscriptions with Basic plan ($25 each via PayPal)
     - 20 subscriptions with Pro plan ($35 each via PayPal)
     - 15 subscriptions with Enterprise plan ($55 each via PayPal)
  
  2. All transactions:
     - Linked to PayPal as payment provider
     - Marked as completed
     - Created with realistic timestamps over the past 3 months
  
  ## Security
  - All data is fictitious and for demonstration only
  - Temporarily disables recursive trigger during data insertion
  - Re-enables trigger after completion
*/

-- Temporarily disable the recursive trigger
ALTER TABLE business_subscriptions DISABLE TRIGGER check_business_subscription_status_trigger;

-- Insert fictitious data
DO $$
DECLARE
  v_system_user_id uuid;
  v_subscription_id uuid;
  v_start_date timestamptz;
  v_counter integer;
BEGIN
  -- Get first available user ID
  SELECT id INTO v_system_user_id FROM auth.users LIMIT 1;
  
  -- If no user exists, skip migration
  IF v_system_user_id IS NULL THEN
    RAISE NOTICE 'No auth users found, skipping fictitious data creation';
    RETURN;
  END IF;

  -- Insert Basic plan subscriptions (15 @ $25)
  FOR v_counter IN 1..15 LOOP
    v_start_date := now() - (random() * interval '90 days');
    
    INSERT INTO business_subscriptions (id, user_id, plan, status, start_date, end_date, created_at)
    VALUES (
      gen_random_uuid(),
      v_system_user_id,
      'basic',
      'active',
      v_start_date,
      v_start_date + interval '31 days',
      v_start_date
    )
    RETURNING id INTO v_subscription_id;
    
    INSERT INTO business_transactions (subscription_id, amount, status, provider, provider_transaction_id, created_at)
    VALUES (
      v_subscription_id,
      25,
      'completed',
      'paypal',
      'PAYPAL-DEMO-BASIC-' || v_counter || '-' || extract(epoch from v_start_date)::bigint,
      v_start_date
    );
  END LOOP;

  -- Insert Pro plan subscriptions (20 @ $35)
  FOR v_counter IN 1..20 LOOP
    v_start_date := now() - (random() * interval '90 days');
    
    INSERT INTO business_subscriptions (id, user_id, plan, status, start_date, end_date, created_at)
    VALUES (
      gen_random_uuid(),
      v_system_user_id,
      'pro',
      'active',
      v_start_date,
      v_start_date + interval '31 days',
      v_start_date
    )
    RETURNING id INTO v_subscription_id;
    
    INSERT INTO business_transactions (subscription_id, amount, status, provider, provider_transaction_id, created_at)
    VALUES (
      v_subscription_id,
      35,
      'completed',
      'paypal',
      'PAYPAL-DEMO-PRO-' || v_counter || '-' || extract(epoch from v_start_date)::bigint,
      v_start_date
    );
  END LOOP;

  -- Insert Enterprise plan subscriptions (15 @ $55)
  FOR v_counter IN 1..15 LOOP
    v_start_date := now() - (random() * interval '90 days');
    
    INSERT INTO business_subscriptions (id, user_id, plan, status, start_date, end_date, created_at)
    VALUES (
      gen_random_uuid(),
      v_system_user_id,
      'enterprise',
      'active',
      v_start_date,
      v_start_date + interval '31 days',
      v_start_date
    )
    RETURNING id INTO v_subscription_id;
    
    INSERT INTO business_transactions (subscription_id, amount, status, provider, provider_transaction_id, created_at)
    VALUES (
      v_subscription_id,
      55,
      'completed',
      'paypal',
      'PAYPAL-DEMO-ENTERPRISE-' || v_counter || '-' || extract(epoch from v_start_date)::bigint,
      v_start_date
    );
  END LOOP;
  
  RAISE NOTICE 'Successfully created 50 fictitious business subscriptions and transactions';
END $$;

-- Re-enable the trigger
ALTER TABLE business_subscriptions ENABLE TRIGGER check_business_subscription_status_trigger;
