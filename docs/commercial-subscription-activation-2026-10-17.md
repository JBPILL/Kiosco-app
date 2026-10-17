# Activación comercial autorizada — 17/10/2026

## Alcance y autorización

La implementación inicial quedó en el PR #2, rama independiente de master.
Después el usuario autorizó completar integración y activación por etapas,
primero Staging y luego Production. Autorizó por separado el uso de claves
API sólo en memoria para pruebas JWT, las identidades/datos de ensayo aislados
de Staging y los importes/vigencias de cada entorno. No se imprimieron ni
persistieron claves, JWT ni contraseñas. PR #1 sigue fuera de esta integración.

## Backup y ensayo previo

Se exportaron esquema y datos de public/auth/storage a una carpeta privada fuera
del repositorio, con ACL limitada al usuario local. Cada backup se restauró en
PostgreSQL 17 local aislado, sin puertos publicados. Los planes exactos de
instalación se ensayaron sobre esas restauraciones antes de escribir remotamente.
El backup cubre base y metadatos de Storage; no constituye exportación de blobs.
No se reaplicó el baseline one-shot sobre ninguna base con datos.

## Staging

Destino: acoyfwwmhaeruciyedri. El esquema anterior tenía 30 tablas y 15 triggers
operativos. El generador offline de upgrade aplicó en una sola transacción los
módulos faltantes, la frontera de seguridad y el módulo comercial. Conservó los
triggers y los dos perfiles operativos; agregó un SuperAdmin global separado
vinculado a la identidad Auth creada por el usuario. Se adaptó el NOT NULL
heredado mediante la restricción actual: SuperAdmin sin comercio, personal con
comercio obligatorio. Plan del comercio existente: prueba $0, 365 días.

Se desplegó únicamente provision-commerce con verify_jwt=true. Checkout y
supervisor-pin conservaron sus versiones. Pasaron JWT reales de SuperAdmin,
Dueño, Cajero, Visor y otro tenant; lecturas mínimas, denegaciones comerciales,
aislamiento, alta por Edge, replay del mismo ACK, rechazo de cuerpo cambiado,
renovación concurrente con un solo pago $0 y auditoría, los tres estados,
escrituras de catálogo y disponibilidad de backups bajo bloqueo.

El comercio y los usuarios de ensayo quedaron conservados en el comercio
aislado suspendido. El comercio original no se modificó por esos ensayos.
Alias Staging: https://kiosco-app-staging.vercel.app. Despliegue READY
dpl_4n5EBuDzLgqzRiftXi62haePvmf8. HTTP y bundle comercial: PASS.
Flags remotos: comercial=true, strict pilot=true, checkout manual=true;
host Supabase Staging verificado. La etiqueta Production del proyecto Vercel
kiosco-app-staging corresponde a su alias estable, no al proyecto del cliente.

## Production

Destino: lllkjnqpltnwvxzphncr, baseline de 43 tablas con SuperAdmin y Dueño
existentes. El plan offline comprobó esas condiciones y la identidad confirmada
antes de instalar el módulo y la cobertura en una sola transacción. No recreó
cuentas ni datos. Resultado: 50 tablas, 24 gates operativos, un SuperAdmin y el
perfil del Dueño conservados. Escritura directa comercial y renovación anon
denegadas. Una operación de inicialización auditada.

Oferta autorizada: Plan mensual $30.000, cobertura inicial de un mes calendario
para el comercio existente (17/10–17/11/2026); Prueba inicial gratuita $0 por
30 días para nuevos clientes. Al finalizar la prueba se debe seleccionar el
plan mensual y renovar por el backend. No hay cobros automáticos. No se inventó
un pago recibido al asignar la cobertura inicial.

Se desplegó sólo provision-commerce v1, ACTIVE, verify_jwt=true. Las versiones
v3 y hashes previos de checkout-manual, supervisor-pin y provision-user quedaron
intactos. Pasaron JWT reales de SuperAdmin/Dueño, plan y cobertura reales,
denegación de snapshot privilegiado/renovación al Dueño, acceso anon denegado,
autorización de Edge y CORS. No se crearon comercios ni pagos de ensayo aquí.

El frontend de Production se publica desde el código validado f81d1b3; los
commits posteriores de cierre sólo documentan evidencia. Flags: comercial=true,
strict pilot=true. Alias del cliente: https://kiosco-app-five.vercel.app.
Despliegue READY dpl_HfyoAXA1LroFoSztwL85dmvVSCXV, URL inmutable
https://kiosco-8hxsj16n4-jbp2.vercel.app. Alias estable: HTTP 200, entry asset
200 y bundle comercial presente. Supabase Production y strict pilot verificados
en memoria, sin descargar variables a archivos locales.

## Validación final y límites

- Suite final: 1834 PASS, 1 skipped, 193 archivos; maxWorkers=2, 359,43 s.
- Tests SQL/planes de instalación dirigidos: 38 PASS en 3 archivos; bloque
  dirigido inicial de interfaz, stores, permisos y provisioning: 87 PASS en 8.
- TypeScript/build: PASS, 608 módulos; warning conocido de chunks grandes.
- Manifest: PASS; los 43 SQL base no cambiaron de fuente.
- Diff e índice: PASS. Secret scan sobre 1061 textos versionados: 44 candidatos
  de fixtures/ejemplos, sin credenciales reales detectadas; excluye 14 binarios
  y el historial. Los marcadores PEM de tests son incompletos.
- Audit diagnóstico: una dependencia HIGH, xlsx, dos avisos y sin fix automático;
  no audit fix ni cambios de dependencias.
- No se activaron AFIP/WSFE, Point, devoluciones ni envases. No se desplegó
  provision-user. Cámara/impresora físicas permanecen pendientes de ensayo.
- El .env.local original se preservó. Vercel link creó uno en el checkout nuevo;
  se eliminó sin leerlo y se evitó descargar entornos locales después.
- Los PR siguen sujetos a la instrucción inicial de no merge automático. Un
  despliegue de rama no equivale a integrar master; futuros despliegues deben
  conservar el código activado hasta que se autorice esa integración.
