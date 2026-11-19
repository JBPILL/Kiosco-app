# Runbook de Despliegue Controlado en Infraestructura Externa (Etapas 1–16)

> [!CAUTION]
> **DOCUMENTO DE PLANIFICACIÓN — NO EJECUTAR EN EXT-REAL-03**.
> Ninguna etapa siguiente debe iniciarse sin decisión explícita humana, aprobación formal de presupuesto/plataforma e implementación previa de los adaptadores KMS/DB/Auth pendientes.

---

## Matriz por Etapas (1–16)

### Etapa 1 — Selección y aprobación del proveedor cloud
- **Objetivo**: Seleccionar oficialmente GCP (Cloud Run + Cloud KMS) o AWS (ECS Fargate / Lambda + AWS KMS + DynamoDB) conforme a [CLOUD_PROVIDER_COMPARISON.md](./CLOUD_PROVIDER_COMPARISON.md).
- **Responsable**: Liderazgo técnico / Propietario del sistema + Responsable de Seguridad.
- **Precondiciones**: Revisión de matriz comparativa, presupuesto mensual aprobado y verificación de política Ed25519 HSM vs Software KMS.
- **Evidencia requerida**: Registro de decisión arquitectónica (ADR) firmado con proveedor, región y nivel HSM/Software aceptado.
- **Resultado esperado**: Proveedor y región definidos por escrito.
- **Criterio de rechazo**: Intento de seleccionar Azure Key Vault con exportación de clave privada Ed25519 en secreto o despliegue en la misma cuenta/proyecto del POS.
- **Rollback**: Trivial (aún sin recursos creados).

### Etapa 2 — Creación del entorno aislado (Proyecto GCP / Cuenta AWS)
- **Objetivo**: Provisionar cuenta/proyecto cloud dedicado exclusivamente a la Autoridad de Atestación, separado de Supabase, POS y credenciales ARCA.
- **Responsable**: Administrador Cloud / DevSecOps.
- **Precondiciones**: Etapa 1 aprobada.
- **Evidencia requerida**: ID de proyecto/cuenta dedicada, SCP / Organization Policies verificando aislamiento de red y cero permisos hacia `kioskopos-prod`.
- **Resultado esperado**: Aislamiento administrativo y de facturación/IAM comprobado.
- **Criterio de rechazo**: Reutilizar el proyecto donde corre Supabase, backups fiscales o secrets ARCA.
- **Rollback**: Eliminación limpia del proyecto/cuenta vacía antes de crear recursos.

### Etapa 3 — Configuración de identidades IAM (Mínimo Privilegio)
- **Objetivo**: Crear identidad de ejecución del contenedor, identidad invocadora autorizada para el colector P0 e identidades administrativas humanas separadas.
- **Responsable**: Seguridad / DevSecOps.
- **Precondiciones**: Etapa 2 completada.
- **Evidencia requerida**: Políticas IAM exportadas mostrando: runtime tiene solo `sign` + lectura DB anti-replay; runtime **NO** tiene `admin` de claves ni acceso POS/ARCA; POS **NO** tiene `kms:Sign`.
- **Resultado esperado**: Principio de mínimo privilegio y separación de poderes verificables por inspección IAM.
- **Criterio de rechazo**: Roles `Owner`, `Editor`, `AdministratorAccess` o permisos `kms:*` asignados al runtime.
- **Rollback**: Revocación/borrado de service accounts y roles IAM.

### Etapa 4 — Creación del KMS / HSM en la cuenta aislada
- **Objetivo**: Crear KeyRing/KMS Policy aislada con auditoría criptográfica activada (`Cloud Audit Logs` Data Access o `CloudTrail`).
- **Responsable**: Custodio de Seguridad (separado del operador POS).
- **Precondiciones**: Etapa 3 completada.
- **Evidencia requerida**: Configuración del recurso KMS/Key Policy + verificación de logging inmutable de eventos `Sign`/`AsymmetricSign`.
- **Resultado esperado**: Contenedor criptográfico auditable listo sin clave de producción aún generada (o con policy validada).
- **Criterio de rechazo**: Ausencia de logs de auditoría KMS o política permitiendo exportación/lectura desde la cuenta POS.
- **Rollback**: Desactivación de KeyRing/política antes de emisión de claves.

### Etapa 5 — Generación de clave asimétrica Ed25519 de producción
- **Objetivo**: Generar la clave asimétrica Ed25519 no exportable (`EC_SIGN_ED25519` en GCP o `ECC_NIST_EDWARDS25519` en AWS) distinta de la clave GO Authority.
- **Responsable**: Custodio de Seguridad independiente.
- **Precondiciones**: Etapa 4 completada.
- **Evidencia requerida**: ARN/Resource Name de la clave (`keyVersionName`), metadato real `ProtectionLevel` (`HSM` con attestation si aplica, o `SOFTWARE` explícitamente declarado).
- **Resultado esperado**: Par Ed25519 residente exclusivamente dentro de KMS/HSM.
- **Criterio de rechazo**: Clave exportable, algoritmo distinto de Ed25519 no aprobado o colisión con la clave de GO Authority.
- **Rollback**: Programación de destrucción / deshabilitación de versión `v1` antes de ser pineada en clientes.

### Etapa 6 — Verificación de clave pública y Public Key Pinning
- **Objetivo**: Extraer exclusivamente la clave pública PEM SPKI, calcular `keyId = ed25519-spki-<16-hex>` y pinearla de forma segura en la configuración de verificación POS sin incluir secretos.
- **Responsable**: Custodio de Seguridad + Responsable Técnico POS.
- **Precondiciones**: Etapa 5 completada.
- **Evidencia requerida**: Archivo SPKI PEM público, SHA-256 de SPKI DER, prueba offline `verifyAttestationResponse` rechazando clave ajena y aceptando huella oficial.
- **Resultado esperado**: Identidad criptográfica de la autoridad anclada en código/configuración aprobada.
- **Criterio de rechazo**: Discrepancia de huella `keyId` o intento de transmitir claves privadas.
- **Rollback**: Retiro de clave pública del catálogo pineado antes del despliegue de servicio.

### Etapa 7 — Configuración de persistencia anti-replay distribuida
- **Objetivo**: Provisionar base transaccional dedicada (`DynamoDB` / `Cloud SQL PostgreSQL` / `Firestore`) con el esquema de [DISTRIBUTED_ANTI_REPLAY_DESIGN.md](./DISTRIBUTED_ANTI_REPLAY_DESIGN.md).
- **Responsable**: Infraestructura / Plataforma.
- **Precondiciones**: Etapa 3 completada; adaptador `distributedStore` implementado y testeado localmente.
- **Evidencia requerida**: Tabla/índices únicos (`request_id`, `request_sha256`, `go_authorization_id`, `attestation_id`), backups PITR habilitados, cifrado en tránsito y en reposo.
- **Resultado esperado**: Almacén multi-AZ transaccional operativo y aislado de Supabase POS.
- **Criterio de rechazo**: Uso de almacenamiento en memoria (`memory`), filesystem local efímero o reutilización de la base Supabase del POS.
- **Rollback**: Eliminación de instancia DB dedicada vacía.

### Etapa 8 — Configuración de HTTPS (TLS 1.3), Red y Autenticación del Cliente
- **Objetivo**: Configurar balanceador/gateway HTTPS TLS 1.3 mínimo, WAF/rate-limiting, deshabilitación de acceso anónimo público y verificación OIDC/mTLS del cliente + clave pública GO pineada (`GoAuthorizationGrant`).
- **Responsable**: Seguridad / Redes.
- **Precondiciones**: Etapas 3 y 6 completadas; `clientAuthVerifier` y verificador de `GoAuthorizationGrant` implementados.
- **Evidencia requerida**: Scan TLS confirmando TLS 1.3 / rechazo TLS <= 1.1 y HTTP plano, política de ingreso bloqueando IPs/identidades no autorizadas.
- **Resultado esperado**: Perímetro seguro con autenticación mutua o OIDC verificada antes del servicio.
- **Criterio de rechazo**: Endpoint público sin autenticación, uso de `Bearer` estático o reutilización de certificados AFIP/ARCA para mTLS.
- **Rollback**: Desactivación de ruta/ingress o bloqueo total en WAF.

### Etapa 9 — Construcción, firma y despliegue del contenedor
- **Objetivo**: Construir imagen desde `./services/independent-attestation-authority` (`Dockerfile`), escanear vulnerabilidades, firmar imagen (Cosign/Sigstore) y desplegar revisión inicial sin tráfico público abierto.
- **Responsable**: CI/CD + Plataforma.
- **Precondiciones**: Etapas 5–8 completadas; variables `.env` seguras inyectadas sin claves privadas.
- **Evidencia requerida**: Digest SHA-256 de imagen desplegada, reporte SBOM/vulnerabilidades críticas = 0, confirmación de ejecución `UID 10001` no-root y FS read-only.
- **Resultado esperado**: Servicio en ejecución con revisión inmutable.
- **Criterio de rechazo**: Fallo en firma de imagen, inclusión de `src/` POS en contexto Docker o arranque como `root`.
- **Rollback**: Revertir revisión en Cloud Run / ECS a 0 instancias activas.

### Etapa 10 — Verificación de `/health` y `/readiness`
- **Objetivo**: Confirmar desde identidad autorizada que `GET /health` retorna `200 HEALTHY` y `GET /readiness` retorna `200 { ready: true, providerReady: true, antiReplayHealthy: true }`.
- **Responsable**: Plataforma / SRE.
- **Precondiciones**: Etapa 9 completada.
- **Evidencia requerida**: Respuestas JSON sanitizadas de `/health` y `/readiness`, verificación de ausencia de secretos y códigos `404`/`405` en rutas prohibidas (`/sign`, `/admin`, etc.).
- **Resultado esperado**: Servicio vivo y listo para aceptar solicitudes autorizadas.
- **Criterio de rechazo**: `503 ready: false`, exposición de stack traces/endpoints internos o uso de `TEST_SIGNER`.
- **Rollback**: Bajar revisión o suspender ingress inmediatamente.

### Etapa 11 — Pruebas de autorización (S2S + GoAuthorizationGrant)
- **Objetivo**: Validar con solicitudes sintéticas rechazables que sin auth S2S y sin `GoAuthorizationGrant` firmado válido/vigente toda solicitud es rechazada (`401`/`403`).
- **Responsable**: QA Seguridad.
- **Precondiciones**: Etapa 10 en verde.
- **Evidencia requerida**: Registros de rechazo para: sin auth, Bearer estático, GO expirado, GO de otro commit/proyecto, `GO_APPROVED=true` sin firma, scope P1/P2/PROD.
- **Resultado esperado**: Cero falsos positivos de autorización.
- **Criterio de rechazo**: Cualquier solicitud no autorizada aceptada o firmada por KMS.
- **Rollback**: Deshabilitar servicio hasta corregir `clientAuthVerifier` o verificador GO.

### Etapa 12 — Pruebas criptográficas extremo a extremo
- **Objetivo**: Ejecutar 1 solicitud sintética de ensayo autorizada contra `POST /attestations`, verificar la firma Ed25519 en cliente POS con clave pública pineada y validar rechazo de alteración de 1 bit / keyId sustituido.
- **Responsable**: Seguridad + Responsable Técnico POS.
- **Precondiciones**: Etapa 11 en verde.
- **Evidencia requerida**: Log de `KMS Sign` auditable en CloudTrail/Cloud Audit Logs + resultado `node:crypto.verify === true` con clave pineada + prueba negativa de sustitución.
- **Resultado esperado**: Confianza criptográfica verificada entre instancia cloud real y verificador cliente POS.
- **Criterio de rechazo**: Firma inválida, `keyId` no coincidente o evidencia de firma local.
- **Rollback**: Deshabilitar `CryptoKeyVersion` y detener servicio.

### Etapa 13 — Pruebas de anti-replay distribuido y concurrencia
- **Objetivo**: Enviar dos requests simultáneos idénticos contra múltiples réplicas del servicio y verificar replay tras reinicio completo del servicio.
- **Responsable**: QA / SRE.
- **Precondiciones**: Etapa 12 en verde, mínimo 2 instancias activas.
- **Evidencia requerida**: Exactamente 1 respuesta `200 OK` y 1 respuesta `409 ATTESTATION_REPLAY_DETECTED`; 1 único registro en tabla distribuida y en auditoría KMS; replay posterior bloqueado.
- **Resultado esperado**: Garantía `DISTRIBUTED_MULTI_NODE_ONE_TIME_USE` demostrada empíricamente.
- **Criterio de rechazo**: 2 respuestas `200`, 2 llamadas `kms:Sign` para el mismo request o pérdida de estado tras reinicio.
- **Rollback**: Escalar servicio a 0 instancias; bloquear tráfico; auditar KMS.

### Etapa 14 — Pruebas de recuperación ante fallos y shutdown
- **Objetivo**: Simular caída de conectividad con DB anti-replay y simular falla/permiso denegado temporal en KMS; además enviar `SIGTERM` con request en curso.
- **Responsable**: SRE.
- **Precondiciones**: Etapa 13 en verde.
- **Evidencia requerida**: Ante falla DB o falla KMS -> `500/503`, **0 firmas emitidas** y `/readiness` en `503`. Ante `SIGTERM` -> cierre limpio sin corrupción de ledger ni pérdida de respuesta confirmada.
- **Resultado esperado**: Fail-closed demostrado ante fallas reales de dependencias.
- **Criterio de rechazo**: Cualquier fallback a firma en memoria/archivo local cuando falla DB/KMS.
- **Rollback**: Mantener servicio apagado (`min-instances=0` / ingress cerrado) hasta remediación.

### Etapa 15 — Auditoría independiente de seguridad final
- **Objetivo**: Revisar logs (verificando 0 secretos), políticas IAM reales desplegadas, configuración de red/TLS, separación de cuentas y cumplimiento completo de [ACCEPTANCE_TEST_PLAN.md](./ACCEPTANCE_TEST_PLAN.md).
- **Responsable**: Revisor de Seguridad independiente (no autor del despliegue).
- **Precondiciones**: Etapas 1–14 completas con evidencia archivada.
- **Evidencia requerida**: Dictamen escrito de auditoría firmada (`PASS` sin hallazgos críticos o bloqueantes).
- **Resultado esperado**: Certificación pre-operativa completa.
- **Criterio de rechazo**: Cualquier hallazgo crítico/alto abierto o falta de separación real frente al POS.
- **Rollback**: Suspender habilitación hasta cierre de hallazgos.

### Etapa 16 — Aprobación humana independiente para uso en P0
- **Objetivo**: Emitir decisión explícita humana separada aprobando habilitar la URL y clave pública pineada para una ejecución P0 controlada en Homologación.
- **Responsable**: Propietario del Negocio / Governance (`GO Authority`).
- **Precondiciones**: Etapa 15 aprobada; `HISTORICAL_042` evaluado según política vigente.
- **Evidencia requerida**: Acta humana de aprobación vinculada al digest de configuración y clave pública exacta.
- **Resultado esperado**: Autorización formal de uso en P0 remoto (aún **sin** habilitar P1, P2, PV2 ni emisión comercial automática).
- **Criterio de rechazo**: Cualquier intento de auto-aprobación por script o de omitir auditoría previa.
- **Rollback**: Revocación inmediata de `ATTESTATION_ENDPOINT` en el colector POS (vuelve al bloqueo fail-closed seguro).
