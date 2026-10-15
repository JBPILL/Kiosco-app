-- F6.2D-B bloque 04 — cobertura agregada usuarios ↔ auth.users, sin PII/credenciales.
-- Qué valida: total de perfiles, correspondencia Auth y estado separado de kiosco_id
-- (NULL, kiosco existente o kiosco inexistente), Auth sin perfil y duplicados agregados.
-- Email se usa sólo dentro de GROUP BY para contar grupos duplicados por kiosco; nunca se devuelve.
-- No selecciona nombre, email, pin_hash, hashes, tokens, secretos ni filas de usuario.
-- Columnas: una fila con las métricas agregadas indicadas en los aliases.
WITH profile_links AS (
  SELECT u.id, u.auth_user_id, u.kiosco_id, u.email,
         a.id AS matched_auth_id, k.id AS matched_kiosco_id
  FROM public.usuarios AS u
  LEFT JOIN auth.users AS a ON a.id = u.auth_user_id
  LEFT JOIN public.kioscos AS k ON k.id = u.kiosco_id
), duplicate_auth_links AS (
  SELECT count(*)::bigint AS duplicate_groups
  FROM (
    SELECT auth_user_id
    FROM public.usuarios
    WHERE auth_user_id IS NOT NULL
    GROUP BY auth_user_id
    HAVING count(*) > 1
  ) AS duplicates
), duplicate_logical_profiles AS (
  SELECT count(*)::bigint AS duplicate_groups
  FROM (
    SELECT kiosco_id, lower(btrim(email)) AS normalized_email
    FROM public.usuarios
    WHERE email IS NOT NULL AND btrim(email) <> ''
    GROUP BY kiosco_id, lower(btrim(email))
    HAVING count(*) > 1
  ) AS duplicates
), auth_without_profile AS (
  SELECT count(*)::bigint AS profileless_auth_users
  FROM auth.users AS a
  WHERE NOT EXISTS (
    SELECT 1 FROM public.usuarios AS u WHERE u.auth_user_id = a.id
  )
)
SELECT
  count(*)::bigint AS usuarios_total,
  count(*) FILTER (WHERE auth_user_id IS NULL)::bigint AS auth_user_id_null,
  count(*) FILTER (WHERE auth_user_id IS NOT NULL)::bigint AS auth_user_id_no_null,
  count(*) FILTER (WHERE auth_user_id IS NOT NULL AND matched_auth_id IS NOT NULL)::bigint AS auth_user_id_con_auth,
  count(*) FILTER (WHERE auth_user_id IS NOT NULL AND matched_auth_id IS NULL)::bigint AS auth_user_id_sin_correspondencia,
  (SELECT profileless_auth_users FROM auth_without_profile) AS auth_users_sin_perfil,
  (SELECT duplicate_groups FROM duplicate_auth_links) AS grupos_auth_user_id_duplicados,
  (SELECT duplicate_groups FROM duplicate_logical_profiles) AS grupos_email_logico_duplicados_por_kiosco,
  count(*) FILTER (WHERE kiosco_id IS NULL)::bigint AS perfiles_kiosco_id_null,
  count(*) FILTER (WHERE kiosco_id IS NOT NULL AND matched_kiosco_id IS NOT NULL)::bigint AS perfiles_kiosco_existente,
  count(*) FILTER (WHERE kiosco_id IS NOT NULL AND matched_kiosco_id IS NULL)::bigint AS perfiles_kiosco_inexistente
FROM profile_links;
