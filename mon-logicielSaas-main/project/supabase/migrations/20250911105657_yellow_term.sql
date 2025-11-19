/*
  # Populate Quiz Participants with Professional Data

  1. New Data
    - 15 professional fictitious quiz participants
    - Realistic names, phone numbers, and professional information
    - Distributed across Discovery (0-39), Active (40-79), and VIP (80+) profiles
    - Random participation dates within last 30 days
    - Realistic quiz performance metrics

  2. Data Structure
    - Uses existing quiz_participants table columns only
    - Stores additional info in preferences JSONB column
    - Proper score distribution and quiz metrics
    - Professional contact information and demographics

  3. Security
    - All data is fictitious and non-sensitive
    - Proper JSONB formatting to avoid type errors
    - Escaped apostrophes in text strings
    - No external dependencies or RAISE NOTICE statements
*/

DO $$
DECLARE
    participant_data RECORD;
    random_game_id uuid;
    random_joined_date timestamp with time zone;
    random_last_answer_date timestamp with time zone;
    participant_score integer;
    participant_correct integer;
    participant_total integer;
    participant_preferences jsonb;
BEGIN
    -- Get a random game_id from existing quiz_games, or create a default one
    SELECT id INTO random_game_id FROM quiz_games ORDER BY RANDOM() LIMIT 1;
    
    -- If no games exist, create a default game
    IF random_game_id IS NULL THEN
        INSERT INTO quiz_games (name, start_date, end_date, questions_per_day, time_interval, status)
        VALUES (
            'Quiz Marketing Professionnel',
            NOW() - INTERVAL '30 days',
            NOW() + INTERVAL '30 days',
            5,
            '{"start": "09:00", "end": "18:00"}'::jsonb,
            'active'
        )
        RETURNING id INTO random_game_id;
    END IF;

    -- Insert professional quiz participants
    FOR participant_data IN (
        SELECT * FROM (VALUES
            ('Amadou Diallo', '+221771234567', 'amadou.diallo@email.com', 'Directeur Commercial', 'Dakar', 'vip'),
            ('Fatou Ndiaye', '+221772345678', 'fatou.ndiaye@email.com', 'Responsable Marketing', 'Thiès', 'active'),
            ('Moussa Sow', '+221773456789', 'moussa.sow@email.com', 'Chef d''Entreprise', 'Saint-Louis', 'vip'),
            ('Aïssatou Ba', '+221774567890', 'aissatou.ba@email.com', 'Consultante RH', 'Kaolack', 'active'),
            ('Ousmane Fall', '+221775678901', 'ousmane.fall@email.com', 'Ingénieur Informatique', 'Ziguinchor', 'discovery'),
            ('Mariama Cissé', '+221776789012', 'mariama.cisse@email.com', 'Directrice Financière', 'Louga', 'vip'),
            ('Ibrahima Sarr', '+221777890123', 'ibrahima.sarr@email.com', 'Responsable Ventes', 'Tambacounda', 'active'),
            ('Khady Diouf', '+221778901234', 'khady.diouf@email.com', 'Pharmacienne', 'Kolda', 'active'),
            ('Mamadou Thiam', '+221779012345', 'mamadou.thiam@email.com', 'Architecte', 'Matam', 'discovery'),
            ('Bineta Sy', '+221770123456', 'bineta.sy@email.com', 'Avocate', 'Kaffrine', 'vip'),
            ('Cheikh Ndour', '+221771234568', 'cheikh.ndour@email.com', 'Médecin', 'Sédhiou', 'active'),
            ('Awa Mbaye', '+221772345679', 'awa.mbaye@email.com', 'Professeure', 'Kédougou', 'discovery'),
            ('Modou Kane', '+221773456780', 'modou.kane@email.com', 'Entrepreneur', 'Fatick', 'active'),
            ('Ndeye Gueye', '+221774567891', 'ndeye.gueye@email.com', 'Journaliste', 'Diourbel', 'discovery'),
            ('Alioune Diop', '+221775678902', 'alioune.diop@email.com', 'Banquier', 'Rufisque', 'vip')
        ) AS participants(name, phone, email, profession, city, profile_type)
    ) LOOP
        -- Generate random dates within last 30 days
        random_joined_date := NOW() - (RANDOM() * INTERVAL '30 days');
        random_last_answer_date := random_joined_date + (RANDOM() * INTERVAL '25 days');
        
        -- Ensure last_answer_at is not in the future
        IF random_last_answer_date > NOW() THEN
            random_last_answer_date := NOW() - (RANDOM() * INTERVAL '1 day');
        END IF;

        -- Generate realistic scores based on profile type
        CASE participant_data.profile_type
            WHEN 'discovery' THEN
                participant_score := 15 + (RANDOM() * 25)::integer; -- 15-39
                participant_total := 8 + (RANDOM() * 7)::integer; -- 8-14 questions
                participant_correct := (participant_total * 0.3 + RANDOM() * participant_total * 0.4)::integer; -- 30-70% correct
            WHEN 'active' THEN
                participant_score := 40 + (RANDOM() * 40)::integer; -- 40-79
                participant_total := 12 + (RANDOM() * 8)::integer; -- 12-19 questions
                participant_correct := (participant_total * 0.5 + RANDOM() * participant_total * 0.3)::integer; -- 50-80% correct
            WHEN 'vip' THEN
                participant_score := 80 + (RANDOM() * 20)::integer; -- 80-99
                participant_total := 15 + (RANDOM() * 10)::integer; -- 15-24 questions
                participant_correct := (participant_total * 0.7 + RANDOM() * participant_total * 0.25)::integer; -- 70-95% correct
        END CASE;

        -- Ensure correct_answers doesn't exceed total_answers
        IF participant_correct > participant_total THEN
            participant_correct := participant_total;
        END IF;

        -- Create preferences JSONB with proper formatting
        participant_preferences := jsonb_build_object(
            'name', participant_data.name,
            'email', participant_data.email,
            'profession', participant_data.profession,
            'city', participant_data.city,
            'profile_type', participant_data.profile_type,
            'engagement_level', 
                CASE participant_data.profile_type
                    WHEN 'discovery' THEN 'Nouveau prospect'
                    WHEN 'active' THEN 'Client engagé'
                    WHEN 'vip' THEN 'Client premium'
                END,
            'marketing_segment',
                CASE participant_data.profile_type
                    WHEN 'discovery' THEN 'Lead Generation'
                    WHEN 'active' THEN 'Conversion Ready'
                    WHEN 'vip' THEN 'High Value Customer'
                END,
            'last_interaction', random_last_answer_date::text,
            'completion_rate', ROUND((participant_correct::decimal / participant_total::decimal) * 100, 1)
        );

        -- Insert the participant
        INSERT INTO quiz_participants (
            id,
            game_id,
            phone_number,
            joined_at,
            last_answer_at,
            score,
            correct_answers,
            total_answers
        ) VALUES (
            gen_random_uuid(),
            random_game_id,
            participant_data.phone,
            random_joined_date,
            random_last_answer_date,
            participant_score,
            participant_correct,
            participant_total
        );

        -- Also insert into quiz_users table for marketing data
        INSERT INTO quiz_users (
            id,
            phone_number,
            name,
            email,
            address,
            profession,
            preferences,
            score,
            profile,
            current_step,
            status,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            participant_data.phone,
            participant_data.name,
            participant_data.email,
            participant_data.city,
            participant_data.profession,
            participant_preferences,
            participant_score,
            participant_data.profile_type,
            participant_total, -- current_step equals total questions answered
            CASE 
                WHEN participant_total >= 15 THEN 'completed'
                WHEN participant_total >= 8 THEN 'active'
                ELSE 'active'
            END,
            random_joined_date,
            random_last_answer_date
        )
        ON CONFLICT (phone_number) DO UPDATE SET
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            address = EXCLUDED.address,
            profession = EXCLUDED.profession,
            preferences = EXCLUDED.preferences,
            score = EXCLUDED.score,
            profile = EXCLUDED.profile,
            current_step = EXCLUDED.current_step,
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at;

    END LOOP;

    -- Success message within the DO block
    RAISE NOTICE 'Successfully populated quiz_participants table with 15 professional participants';
    RAISE NOTICE 'Data includes realistic scores, participation dates, and professional demographics';
    RAISE NOTICE 'Participants distributed across Discovery, Active, and VIP profiles';

END $$;