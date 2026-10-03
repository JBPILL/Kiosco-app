-- ==============================================================================
-- REPARACIÓN INMEDIATA DE LOGIN PARA DEMOS
-- ==============================================================================
-- Este script soluciona el error "Database error querying schema" en 1 segundo
-- SIN necesidad de borrar ni volver a cargar los productos ni las categorías.
--
-- CAUSA DEL ERROR:
-- El motor GoTrue de Supabase Auth falla cuando las columnas de tokens de texto
-- (confirmation_token, recovery_token, email_change, email_change_token_new)
-- tienen valor NULL en vez de string vacío ''.
-- ==============================================================================

DO $$
DECLARE
  v_pedro_id UUID;
  v_sol_id UUID;
BEGIN

  -- 1. CORREGIR USUARIO DON PEDRO
  SELECT id INTO v_pedro_id FROM auth.users WHERE email = 'kiosco.don.pedro@gmail.com' LIMIT 1;
  
  IF v_pedro_id IS NOT NULL THEN
    UPDATE auth.users
    SET 
      encrypted_password = crypt('DonPedro2026!', gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      confirmation_token = COALESCE(confirmation_token, ''),
      recovery_token = COALESCE(recovery_token, ''),
      email_change = COALESCE(email_change, ''),
      email_change_token_new = COALESCE(email_change_token_new, ''),
      aud = 'authenticated',
      role = 'authenticated'
    WHERE id = v_pedro_id;

    -- Reparar o insertar identidad
    DELETE FROM auth.identities WHERE user_id = v_pedro_id;
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_pedro_id,
      v_pedro_id,
      jsonb_build_object('sub', v_pedro_id::text, 'email', 'kiosco.don.pedro@gmail.com'),
      'email',
      v_pedro_id::text,
      now(), now(), now()
    );

    RAISE NOTICE 'Usuario Don Pedro reparado exitosamente.';
  ELSE
    RAISE NOTICE 'Usuario Don Pedro no existe aún en auth.users.';
  END IF;

  -- 2. CORREGIR USUARIO LIBRERÍA SOL
  SELECT id INTO v_sol_id FROM auth.users WHERE email = 'libreria.sol.demo@gmail.com' LIMIT 1;
  
  IF v_sol_id IS NOT NULL THEN
    UPDATE auth.users
    SET 
      encrypted_password = crypt('LibreriaSol2026!', gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      confirmation_token = COALESCE(confirmation_token, ''),
      recovery_token = COALESCE(recovery_token, ''),
      email_change = COALESCE(email_change, ''),
      email_change_token_new = COALESCE(email_change_token_new, ''),
      aud = 'authenticated',
      role = 'authenticated'
    WHERE id = v_sol_id;

    -- Reparar o insertar identidad
    DELETE FROM auth.identities WHERE user_id = v_sol_id;
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_sol_id,
      v_sol_id,
      jsonb_build_object('sub', v_sol_id::text, 'email', 'libreria.sol.demo@gmail.com'),
      'email',
      v_sol_id::text,
      now(), now(), now()
    );

    RAISE NOTICE 'Usuario Librería Sol reparado exitosamente.';
  ELSE
    RAISE NOTICE 'Usuario Librería Sol no existe aún en auth.users.';
  END IF;

END;
$$;

-- Reparación general por si hay cualquier otro usuario con columnas NULL en auth.users
UPDATE auth.users
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, '')
WHERE confirmation_token IS NULL 
   OR recovery_token IS NULL 
   OR email_change IS NULL 
   OR email_change_token_new IS NULL;
