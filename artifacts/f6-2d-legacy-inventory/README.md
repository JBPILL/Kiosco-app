# F6.2D-B — paquete SQL manual de inventario legacy

## Guard y alcance

Antes de cada ejecución, el usuario verifica visualmente en el Dashboard que el proyecto sea `wlqujnwxrmksheubfrha`. Este paquete no verifica el project ref. `acoyfwwmhaeruciyedri` está prohibido.

Cada archivo es independiente y contiene una única sentencia de lectura. Ejecutar un bloque por vez y guardar cada resultado separado. No hay que ejecutar desde Codex: el usuario ejecuta manualmente en el SQL Editor legacy. No ejecutar RPC/Edge ni usar consultas que no sean `SELECT`/`WITH ... SELECT`.

## Orden canónico

1. `00_guard_read_only.sql` — contexto de sesión y schemas visibles; copiar una fila.
2. `01a_tables_views.sql` — tablas/vistas por schema; columnas `table_schema`, `table_name`, `table_type`.
3. `01b_column_names.sql` — columnas y orden; `table_schema`, `table_name`, `ordinal_position`, `column_name`.
4. `01c_column_types.sql` — tipos; `table_schema`, `table_name`, `ordinal_position`, `column_name`, `data_type`, `udt_name`.
5. `01d_nullable_defaults.sql` — nullability/defaults; `table_schema`, `table_name`, `ordinal_position`, `column_name`, `is_nullable`, `column_default`.
6. `01e_enum_types_YA_EJECUTADO.sql` — enums; YA EJECUTADO, no repetir.
7. `02a_primary_keys.sql` — PK; `table_schema`, `table_name`, `constraint_name`, `constraint_type`, `column_name`, `ordinal_position`, `referenced_schema`, `referenced_table`, `referenced_column`.
8. `02b_foreign_keys.sql` — FK/referencias; mismas columnas que 02a.
9. `02c_unique_constraints.sql` — UNIQUE; mismas columnas que 02a.
10. `02d_check_constraints.sql` — CHECK; mismas columnas que 02a.
11. `02e_indexes.sql` — índices; `schema_name`, `table_name`, `index_name`, `index_definition`.
12. `02f_triggers.sql` — triggers; `schema_name`, `table_name`, `trigger_name`, `event_manipulation`, `action_timing`, `action_orientation`, `action_statement`.
13. `02g_functions_YA_EJECUTADO.sql` — functions/RPC; YA EJECUTADO, no repetir. Columnas `schema_name`, `function_name`, `identity_arguments`, `result_type`, `security_definer`, `volatility`, `function_settings`.
14. `02h_other_constraints.sql` — constraints adicionales; mismas columnas que 02a.
15. `02i_rls_status.sql` — `schema_name`, `table_name`, `rls_enabled`, `rls_forced`.
16. `02j_policies.sql` — `schema_name`, `table_name`, `policy_name`, `permissive`, `roles`, `cmd`, `qual`, `with_check`.
17. `02k_grants.sql` — `table_schema`, `table_name`, `grantee`, `privilege_type`, `is_grantable`.
18. `03_data_counts.sql` — `COUNT(*)` exacto por cada entidad del contrato; fixture/synthetic siguen incluidos en este baseline bruto. Las tablas `operaciones_escritura`, `movimientos_proveedor` e `historial_precios_producto` figuran con cero porque no aparecen en el inventario observado; no se consulta una relación inexistente. `operaciones_stock` es sólo diagnóstico OUT_OF_SCOPE.
19. `04_identity_auth_coverage.sql` — agregados de `usuarios` ↔ `auth.users`: perfil/Auth match, nulls, huérfanos, duplicados. No devuelve emails ni filas individuales.
20. `05_catalog_inventory.sql` — conteos/sumas de catálogo y costo, nulls relevantes, duplicados lógicos, huérfanos y kioscos cruzados para categorías, proveedores, productos, combos, promociones, costos y lotes.
21. `06_stock_inventory.sql` — stock snapshot, cantidades iniciales/actuales de lotes, movimientos agregados por `tipo`, costo asociado, huérfanos y cruces. No interpreta `cantidad` como delta firmado. `operaciones_stock` sólo se cuenta como OUT_OF_SCOPE.
22. `07_clients_accounts.sql` — clientes y cuenta corriente por kiosco: saldos, montos, último saldo ledger, diferencias diagnósticas y huérfanos.
23. `08_suppliers_purchases.sql` — proveedores, compras, subtotales, pagos, relación a caja, sesión abierta y huérfanos. El origen no tiene `movimientos_proveedor` ni `operaciones_escritura`; el saldo/ledger requiere decisión en F6.2D-C.
24. `09_sales_history.sql` — ventas por estado, detalle, pagos, anulaciones agregadas, diferencias diagnósticas, huérfanos y cruce kiosco. Excluye columnas AFIP/CAE.
25. `10_cash_inventory.sql` — sesiones por estado, montos de cierres no abiertos, movimientos por tipo, operaciones asociadas a sesión abierta y huérfanos/cruces. Cualquier sesión `ABIERTA` bloquea el cutover y no se migra abierta.
26. `11_reconciliation_baseline.sql` — baseline agregado exacto por entidad/kiosco y sumas `NUMERIC`; reporte estable que se repetirá en destino después de aprobar el mapping de columnas.

## Hallazgos de esquema que condicionan el uso

- `public.usuarios.auth_user_id` es UNIQUE, nullable y no tiene FK a `auth.users`; el mapping se mide por datos y no por constraint.
- La FK observada confirma que `ventas`/`compras_proveedor` dependen de kiosco, usuario y sesión; los detalles/pagos dependen de sus cabeceras; `movimientos_stock.lote_producto_id` depende de `lotes_producto`.
- FK fuente observadas para dominio, enum/defaults y tipos se usaron al preparar 03–11. Faltan los resultados de datos: estas consultas aún no se ejecutaron.
- El resultado 01d no contiene columnas para `operaciones_escritura`, `movimientos_proveedor` ni `historial_precios_producto`. Se registran como ausentes del esquema observado, no como una inferencia de cero filas consultadas.
- Se reportaron triggers legacy con efectos laterales en compras, ventas, stock, productos, usuarios y sesiones de caja. No cargar históricos con INSERT ingenuo y triggers activos; resolver el método en F6.2D-C. No copiar al destino sus funciones, policies, grants, RLS ni triggers.

## Privacidad y stop conditions

Las consultas devuelven metadatos o agregados. No exponen email, teléfono, dirección, documento, hash PIN, password hash, tokens, secretos, filas de negocio, notas o referencias de pago. Si un bloque falla o devuelve una columna/relación inesperada, no corregir ni ejecutar otro bloque: copiar sólo el mensaje de error sanitizado y detenerse. No exportar datos completos todavía.

## Estado

Los resultados 00–02 se recuperaron del otro chat y se usaron para refinar 03–11. Los archivos 03–11 están preparados pero NO ejecutados. El gate de inventario de datos sigue pendiente de los resultados que el usuario ejecute manualmente.
