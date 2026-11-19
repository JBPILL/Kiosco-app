# Modelo de Integridad y Procedencia de la Evidencia Fiscal (Niveles 1 y 2)

> [!WARNING]
> **Principio de Honestidad Epistémica**: Una firma criptográfica de la Autoridad Externa sobre hashes suministrados por el POS **NO demuestra que ARCA originó esos documentos XML**. Únicamente demuestra qué bytes o digests observó y aprobó la autoridad en el momento de firmar.

---

## 1. Brecha Detectada en el Contrato Actual (`v1.0`)

Al auditar [contract.mjs](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/src/contract.mjs#L575-L591) y [authority-service.mjs](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/services/independent-attestation-authority/src/authority-service.mjs#L329-L393):

- El servicio recibe actualmente únicamente nombres y digests SHA-256 (`manifestSha256`, `rawSoapArtifacts[].{name, sha256}`, `normalizedArtifacts[].{name, sha256}`) calculados previamente por el host POS.
- Si un host POS comprometido inventara o alterara un XML antes de calcular los SHA-256 enviados a la autoridad, una validación de Nivel 1 firmaría el hash recibido con total consistencia interna, **pero sin capacidad de validar el contenido XML real ni su correspondencia con los JSON normalizados**.
- Coherente con esto, [plan-pr02-parameters.mjs](file:///c:/Users/jonat/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/commercial-subscription-backend/scripts/fiscal/plan-pr02-parameters.mjs#L2343) mantiene `ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED: false`.

---

## 2. Arquitectura de Dos Niveles de Atestación

```text
+---------------------------------------------------------------------------------------------------+
| Nivel 1 — Atestación de Digest (Implementado en contrato v1.0)                                    |
| Entrada: solo request JSON con manifestSha256 + sha256 de 4 artefactos.                           |
| Verifica: esquema v1.0, política P0/HOMOLOGACION, requestSha256 canónico, anti-replay.            |
| Prueba: integridad del paquete recibido y marca temporal/firma de autoridad.                      |
| NO prueba: contenido SOAP real, normalización correcta ni origen auténtico de ARCA.               |
+---------------------------------------------------------------------------------------------------+
                                               |
                                               v
+---------------------------------------------------------------------------------------------------+
| Nivel 2 — Atestación de Evidencia (Diseño requerido para evidencia verificada de contenido)       |
| Entrada: artefactos crudos SOAP XML + JSON normalizados + manifest + GoAuthorizationGrant.       |
| Verifica:                                                                                         |
|   1. Recalcula SHA-256 de cada XML SOAP y cada JSON normalizado y del manifest completo.          |
|   2. Verifica parseo XML SOAP WSFEv1 (FEParamGetTiposIva / FEParamGetCondicionIvaReceptor).        |
|   3. Recalcula/compara tablas normalizadas contra las etiquetas <IvaTipo> / <CondicionIva> XML.   |
|   4. Verifica metadatos temporales, PV/CUIT/scope permitidos sin aceptar secretos WSAA/CMS.        |
|   5. Registra provenanceClass explícita en la respuesta firmada.                                  |
| Prueba: integridad extremo-a-extremo entre XML crudo, JSON normalizado, manifest y GO Grant.      |
+---------------------------------------------------------------------------------------------------+
```

---

## 3. Comparación Explícita de Capacidades y Declaraciones Permitidas

| Propiedad / Pregunta | Nivel 1 — Atestación de Digest | Nivel 2A — Evidencia Entregada por POS | Nivel 2B — Evidencia Observada por Proxy/Colector Independiente |
|---|---|---|---|
| ¿Demuestra integridad del `AttestationRequestPackage` recibido? | **SÍ** | **SÍ** | **SÍ** |
| ¿Recalcula la autoridad los SHA-256 de cada XML y JSON? | **NO** | **SÍ** | **SÍ** |
| ¿Comprueba que los JSON normalizados derivan exactamente de los XML SOAP? | **NO** | **SÍ** | **SÍ** |
| ¿Protege contra un POS que falsificó los XML antes de enviarlos? | **NO** | **NO** (si el POS entrega los XML) | **Parcial/SÍ** (si la autoridad o un proxy aislado observa la sesión TLS/ARCA o recupera artefactos desde bucket inmutable firmado fuera del alcance de escritura del POS) |
| Valor obligatorio de `ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED` | **`false`** | **`false`** (ARCA SOAP no incluye firma CMS en respuestas WSFEParamGet) | **`false`**, salvo verificación directa por la autoridad de la conexión TLS/certificado servidor ARCA |
| Valor obligatorio en campo `evidenceAttestationLevel` | `DIGEST_ONLY_ATTESTATION` | `CONTENT_RECOMPUTED_FROM_SUBMITTED_ARTIFACTS` | `INDEPENDENTLY_RETRIEVED_EVIDENCE` |

---

## 4. Mecanismos para Demostrar Procedencia Real de la Evidencia

Para evitar que el sistema declare falsa procedencia ARCA:

1. **Verificación determinística de contenido en Nivel 2A (`submitted artifacts`)**:
   - Enviar a `/attestations` (bajo límite ampliado controlado o referencia a almacenamiento inmutable WORM de staging privado por objeto hash-addressed) los bytes de:
     - `FEParamGetTiposIva_response.xml`
     - `FEParamGetCondicionIvaReceptor_response.xml`
     - `FEParamGetTiposIva_normalized.json`
     - `FEParamGetCondicionIvaReceptor_normalized.json`
     - `manifest.json`
   - La autoridad **no acepta hashes precalculados sin verificar**: recalcula los SHA-256, parsea de forma segura (sin entidades externas XML / XXE deshabilitado) los nodos SOAP `ResultGet` / `Errors` / `Events`, reconstruye el catálogo esperado y comprueba equivalencia exacta con los JSON normalizados.
2. **Separación de custodia de artefactos (`Write-Once Read-Many` / Bucket Append-Only)**:
   - Si se adopta Nivel 2B con almacenamiento intermedio, el colector deposita evidencia cruda en almacenamiento versionado inmutable (sin permiso de sobrescritura ni borrado para el colector) inmediatamente tras la respuesta ARCA, incluyendo digest de certificado TLS servidor observado en la sesión HTTPS (`subject`, `issuer`, `sha256Fingerprint`, `tlsVersion`, `timestamp`) sin almacenar tokens `Token`/`Sign` WSAA.
3. **Observación directa (fuera de alcance hasta infraestructura real aprobada)**:
   - La única forma de afirmar `ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED = true` sería que el dominio independiente valide directamente la sesión TLS hacia los endpoints oficiales de ARCA o verifique una firma criptográfica emitida por ARCA sobre la respuesta SOAP (actualmente las respuestas `FEParamGetTiposIva` / `FEParamGetCondicionIvaReceptor` de WSFEv1 no traen firma CMS embebida de ARCA).
4. **Regla inamovible de no tergiversación**:
   - Mientras opere en Nivel 1 o Nivel 2A, la respuesta de la autoridad **siempre** deberá incluir explícitamente:
     - `evidenceIntegrityLevel: "DIGEST_ONLY"` o `"CONTENT_VERIFIED_SUBMITTED"`
     - `arcaOriginVerified: false`
     - Vinculación criptográfica estricta al `authorizationId` y `goAuthorizationDocumentSha256` del `GoAuthorizationGrant`.
