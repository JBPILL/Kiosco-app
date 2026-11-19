// @ts-check
import http from 'node:http'
import https from 'node:https'
import { IndependentAttestationAuthorityService } from './authority-service.mjs'
import { SERVICE_ENVIRONMENTS } from './attestation-policy.mjs'

const DEFAULT_MAX_BODY_SIZE_BYTES = 1048576 // 1 MB
const DEFAULT_REQUEST_TIMEOUT_MS = 10000
const DEFAULT_HEADERS_TIMEOUT_MS = 5000
const DEFAULT_KEEP_ALIVE_TIMEOUT_MS = 5000

const FORBIDDEN_PATHS = new Set([
  '/sign',
  '/sign-arbitrary',
  '/private-key',
  '/export-key',
  '/debug-sign',
  '/force-attest',
  '/metrics',
  '/admin',
])

function hasControlChars(str) {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

const KNOWN_ROUTES = new Map([
  ['/health', new Set(['GET'])],
  ['/readiness', new Set(['GET'])],
  ['/attestations', new Set(['POST'])],
])

/**
 * Servidor HTTP/HTTPS dedicado para la Autoridad de Atestación Independiente.
 * Expone exclusivamente GET /health, GET /readiness y POST /attestations.
 * Rechaza terminantemente cualquier endpoint administrativo, de métricas o de depuración.
 */
export class IndependentAttestationHttpServer {
  /**
   * @param {object} options
   * @param {IndependentAttestationAuthorityService} options.service
   * @param {boolean} [options.requireHttps=false]
   * @param {boolean} [options.trustProxyHttps=false]
   * @param {string} [options.host='127.0.0.1']
   * @param {number} [options.maxBodySizeBytes=1048576]
   * @param {number} [options.requestTimeoutMs=10000]
   * @param {number} [options.headersTimeoutMs=5000]
   * @param {number} [options.keepAliveTimeoutMs=5000]
   * @param {object} [options.tlsOptions]
   * @param {object} [options.logger]
   */
  constructor(options = {}) {
    if (
      !options.service ||
      !(options.service instanceof IndependentAttestationAuthorityService)
    ) {
      throw new Error(
        'HTTP_SERVER_CONFIG_INVALID: Se requiere instancia de IndependentAttestationAuthorityService'
      )
    }

    this._service = options.service
    this._requireHttps = Boolean(options.requireHttps)
    this._trustProxyHttps = Boolean(options.trustProxyHttps)
    this._host =
      typeof options.host === 'string' && options.host.trim().length > 0
        ? options.host.trim()
        : '127.0.0.1'
    this._maxBodySizeBytes =
      typeof options.maxBodySizeBytes === 'number' &&
      options.maxBodySizeBytes > 0
        ? options.maxBodySizeBytes
        : DEFAULT_MAX_BODY_SIZE_BYTES
    this._requestTimeoutMs =
      typeof options.requestTimeoutMs === 'number' &&
      options.requestTimeoutMs > 0
        ? options.requestTimeoutMs
        : DEFAULT_REQUEST_TIMEOUT_MS
    this._headersTimeoutMs =
      typeof options.headersTimeoutMs === 'number' &&
      options.headersTimeoutMs > 0
        ? options.headersTimeoutMs
        : DEFAULT_HEADERS_TIMEOUT_MS
    this._keepAliveTimeoutMs =
      typeof options.keepAliveTimeoutMs === 'number' &&
      options.keepAliveTimeoutMs > 0
        ? options.keepAliveTimeoutMs
        : DEFAULT_KEEP_ALIVE_TIMEOUT_MS
    this._tlsOptions = options.tlsOptions || null
    this._allowedHosts = Array.isArray(options.allowedHosts)
      ? options.allowedHosts
          .map((h) => String(h).trim().toLowerCase())
          .filter(Boolean)
      : null
    this._logger = options.logger || null
    this._server = null
    this._isShuttingDown = false
    this._inFlightResponses = new Set()

    const env = this._service.serviceEnvironment
    if (
      (env === SERVICE_ENVIRONMENTS.PRODUCTION ||
        env === SERVICE_ENVIRONMENTS.STAGING) &&
      !this._requireHttps &&
      !this._trustProxyHttps
    ) {
      throw new Error(
        `INSECURE_HTTP_FORBIDDEN_IN_${env}: En '${env}' se requiere requireHttps: true o trustProxyHttps: true`
      )
    }
  }

  get isRunning() {
    return Boolean(this._server && this._server.listening)
  }

  get isShuttingDown() {
    return this._isShuttingDown
  }

  get inFlightCount() {
    return this._inFlightResponses.size
  }

  get address() {
    if (!this._server || !this._server.listening) return null
    return this._server.address()
  }

  /**
   * Inicia el servidor en el puerto especificado.
   * @param {number} [port=0]
   * @returns {Promise<{ port: number, url: string }>}
   */
  async start(port = 0) {
    if (this.isRunning) {
      throw new Error('HTTP_SERVER_ALREADY_RUNNING')
    }
    this._isShuttingDown = false

    const requestHandler = (req, res) => {
      this._inFlightResponses.add(res)
      const cleanup = () => {
        this._inFlightResponses.delete(res)
      }
      res.once('finish', cleanup)
      res.once('close', cleanup)
      this._handleHttpRequest(req, res)
    }

    if (this._requireHttps) {
      if (!this._tlsOptions || !this._tlsOptions.key || !this._tlsOptions.cert) {
        throw new Error(
          'HTTPS_TLS_CONFIG_REQUIRED: requireHttps requiere certificados TLS válidos (key y cert)'
        )
      }
      this._server = https.createServer(
        {
          minVersion: 'TLSv1.3',
          ...this._tlsOptions,
        },
        requestHandler
      )
    } else {
      this._server = http.createServer(requestHandler)
    }

    this._server.requestTimeout = this._requestTimeoutMs
    this._server.headersTimeout = this._headersTimeoutMs
    this._server.keepAliveTimeout = this._keepAliveTimeoutMs

    return new Promise((resolve, reject) => {
      this._server.on('error', reject)
      this._server.listen(port, this._host, () => {
        const addr = this._server.address()
        const resolvedPort =
          typeof addr === 'object' && addr !== null ? addr.port : port
        const proto = this._requireHttps ? 'https' : 'http'
        const displayHost =
          this._host === '0.0.0.0' ? '127.0.0.1' : this._host
        const url = `${proto}://${displayHost}:${resolvedPort}`
        resolve({ port: resolvedPort, url })
      })
    })
  }

  /**
   * Detiene el servidor de forma segura rechazando nuevas solicitudes, aguardando
   * solicitudes en curso y sincronizando el estado anti-replay.
   * @returns {Promise<void>}
   */
  async close() {
    this._isShuttingDown = true
    if (!this._server) return
    return new Promise((resolve, reject) => {
      if (typeof this._server.closeIdleConnections === 'function') {
        this._server.closeIdleConnections()
      }
      this._server.close((err) => {
        try {
          if (typeof this._service.antiReplayGuard?.flush === 'function') {
            this._service.antiReplayGuard.flush()
          }
        } catch (flushErr) {
          if (!err) {
            reject(flushErr)
            return
          }
        }
        this._server = null
        if (err) reject(err)
        else resolve()
      })
    })
  }

  _buildSecurityHeaders() {
    const base = {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    }
    if (this._requireHttps || this._trustProxyHttps) {
      return {
        ...base,
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      }
    }
    return base
  }

  /**
   * Despachador principal de solicitudes HTTP.
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  async _handleHttpRequest(req, res) {
    if (this._isShuttingDown) {
      res.writeHead(503, {
        ...this._buildSecurityHeaders(),
        Connection: 'close',
      })
      res.end(
        JSON.stringify({
          error: {
            code: 'SERVER_SHUTTING_DOWN',
            message: 'Servicio en proceso de apagado controlado',
            timestamp: new Date().toISOString(),
          },
        })
      )
      return
    }

    const SINGLETON_SECURITY_HEADERS = new Set([
      'host',
      'authorization',
      'x-api-key',
      'x-forwarded-proto',
      'content-type',
      'content-length',
    ])
    const seenHeaders = new Set()
    const rawHeaders = Array.isArray(req.rawHeaders) ? req.rawHeaders : []
    for (let i = 0; i < rawHeaders.length; i += 2) {
      const hName = String(rawHeaders[i] || '').toLowerCase()
      if (SINGLETON_SECURITY_HEADERS.has(hName)) {
        if (seenHeaders.has(hName)) {
          this._sendError(
            res,
            400,
            'DUPLICATE_HEADER_REJECTED',
            `Header HTTP duplicado no permitido: '${hName}'`
          )
          return
        }
        seenHeaders.add(hName)
      }
    }

    const rawHostHeader =
      typeof req.headers.host === 'string' ? req.headers.host.trim() : ''
    if (
      !rawHostHeader ||
      /[\s@/\\]/.test(rawHostHeader) ||
      hasControlChars(rawHostHeader)
    ) {
      this._sendError(res, 400, 'INVALID_HOST_HEADER', 'Header Host inválido o ausente')
      return
    }
    const hostnameOnly = rawHostHeader.startsWith('[')
      ? rawHostHeader.slice(0, rawHostHeader.indexOf(']') + 1).toLowerCase()
      : rawHostHeader.split(':')[0].toLowerCase()
    if (
      this._allowedHosts &&
      this._allowedHosts.length > 0 &&
      !this._allowedHosts.includes(rawHostHeader.toLowerCase()) &&
      !this._allowedHosts.includes(hostnameOnly)
    ) {
      this._sendError(res, 400, 'INVALID_HOST_HEADER', 'Header Host no permitido')
      return
    }

    const rawUrl = typeof req.url === 'string' ? req.url : '/'
    if (
      !rawUrl.startsWith('/') ||
      rawUrl.startsWith('//') ||
      rawUrl.includes('\\') ||
      hasControlChars(rawUrl)
    ) {
      this._sendError(res, 400, 'INVALID_URL', 'URL de solicitud inválida')
      return
    }

    let pathname = '/'
    try {
      const url = new URL(rawUrl, `http://${rawHostHeader}`)
      pathname = url.pathname
    } catch {
      this._sendError(res, 400, 'INVALID_URL', 'URL de solicitud inválida')
      return
    }

    const method = (req.method || 'GET').toUpperCase()

    // 1. Endpoints administrativos / debug estrictamente prohibidos (404 inmediato)
    if (FORBIDDEN_PATHS.has(pathname)) {
      this._sendError(res, 404, 'NOT_FOUND', 'Ruta inexistente o prohibida')
      return
    }

    // 2. Verificar si ruta existe en el contrato
    const allowedMethods = KNOWN_ROUTES.get(pathname)
    if (!allowedMethods) {
      this._sendError(
        res,
        404,
        'NOT_FOUND',
        `Ruta '${method} ${pathname}' no soportada`
      )
      return
    }

    // 3. Verificar método HTTP permitido
    if (!allowedMethods.has(method)) {
      res.writeHead(405, {
        ...this._buildSecurityHeaders(),
        Allow: Array.from(allowedMethods).join(', '),
      })
      res.end(
        JSON.stringify({
          error: {
            code: 'METHOD_NOT_ALLOWED',
            message: `Método '${method}' no permitido para '${pathname}'`,
            timestamp: new Date().toISOString(),
          },
        })
      )
      return
    }

    // 4. GET /health
    if (method === 'GET' && pathname === '/health') {
      try {
        const health = this._service.handleHealth()
        res.writeHead(200, this._buildSecurityHeaders())
        res.end(JSON.stringify(health))
      } catch {
        this._sendError(
          res,
          500,
          'HEALTH_CHECK_FAILED',
          'Fallo interno en verificación de salud'
        )
      }
      return
    }

    // 5. GET /readiness
    if (method === 'GET' && pathname === '/readiness') {
      try {
        const readiness = await this._service.handleReadiness()
        const statusCode = readiness.ready ? 200 : 503
        res.writeHead(statusCode, this._buildSecurityHeaders())
        res.end(JSON.stringify(readiness))
      } catch {
        this._sendError(
          res,
          503,
          'READINESS_CHECK_FAILED',
          'Servicio no listo para procesar atestaciones'
        )
      }
      return
    }

    // 6. POST /attestations — Verificar transporte seguro en STAGING/PRODUCTION
    if (this._trustProxyHttps && !this._requireHttps) {
      const forwardedProto = String(
        req.headers['x-forwarded-proto'] || ''
      ).toLowerCase()
      if (forwardedProto !== 'https') {
        this._sendError(
          res,
          403,
          'INSECURE_TRANSPORT_REJECTED',
          'Se exige conexión HTTPS (x-forwarded-proto=https)'
        )
        return
      }
    }

    const contentType = String(req.headers['content-type'] || '')
    if (!contentType.toLowerCase().includes('application/json')) {
      this._sendError(
        res,
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type debe ser application/json'
      )
      return
    }

    const declaredLength = Number(req.headers['content-length'])
    if (Number.isFinite(declaredLength) && declaredLength > this._maxBodySizeBytes) {
      req.pause()
      this._sendPayloadTooLarge(res, req)
      return
    }

    /** @type {Buffer[]} */
    const chunks = []
    let bytesRead = 0
    let aborted = false
    const bodyTimer = setTimeout(() => {
      if (aborted || res.writableEnded) return
      aborted = true
      req.pause()
      this._sendError(res, 408, 'REQUEST_TIMEOUT', 'Tiempo de espera de solicitud excedido')
      req.destroy()
    }, this._requestTimeoutMs)
    if (typeof bodyTimer.unref === 'function') bodyTimer.unref()

    const clearBodyTimer = () => clearTimeout(bodyTimer)

    req.on('aborted', () => {
      aborted = true
      clearBodyTimer()
    })
    res.once('close', clearBodyTimer)

    req.on('data', (chunk) => {
      if (aborted) return
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytesRead += buf.length
      if (bytesRead > this._maxBodySizeBytes) {
        aborted = true
        clearBodyTimer()
        req.pause()
        this._sendPayloadTooLarge(res, req)
        return
      }
      chunks.push(buf)
    })

    req.on('end', async () => {
      clearBodyTimer()
      if (aborted || res.writableEnded) return

      const rawBody = Buffer.concat(chunks).toString('utf8')
      const transportSecurity = this._extractTransportSecurity(req)
      try {
        const response = await this._service.handleRequest(
          rawBody,
          req.headers,
          { transportSecurity }
        )
        res.writeHead(200, {
          ...this._buildSecurityHeaders(),
          'X-Attestation-Evidence-Level': this._service.evidenceIntegrityLevel,
          'X-Attestation-Arca-Origin-Verified': 'false',
        })
        res.end(JSON.stringify(response))
      } catch (err) {
        const msg = err?.message || String(err)
        let statusCode = 400
        let code = 'ATTESTATION_REQUEST_REJECTED'

        if (msg.includes('PROHIBITED_SECRET_DETECTED')) {
          statusCode = 400
          code = 'PROHIBITED_SECRET_DETECTED'
        } else if (msg.includes('PROHIBITED_FISCAL_CREDENTIALS')) {
          statusCode = 403
          code = 'PROHIBITED_FISCAL_CREDENTIALS_IN_HEADERS'
        } else if (
          msg.includes('OIDC_JWKS_UNAVAILABLE') ||
          msg.includes('OIDC_JWKS_TIMEOUT') ||
          msg.includes('OIDC_JWKS_INVALID')
        ) {
          statusCode = 503
          code = msg.includes('OIDC_JWKS_TIMEOUT')
            ? 'OIDC_JWKS_TIMEOUT'
            : 'OIDC_JWKS_UNAVAILABLE'
        } else if (msg.includes('CLIENT_AUTH_VERIFIER_ERROR')) {
          statusCode = 503
          code = 'CLIENT_AUTH_VERIFIER_ERROR'
        } else if (
          msg.includes('CLIENT_AUTH_SCOPE_INSUFFICIENT') ||
          msg.includes('CLIENT_AUTH_AUTHORITY_CONFUSION_REJECTED') ||
          msg.includes('CLIENT_AUTH_MTLS_CLIENT_NOT_ALLOWED')
        ) {
          statusCode = 403
          if (msg.includes('AUTHORITY_CONFUSION')) {
            code = 'CLIENT_AUTH_AUTHORITY_CONFUSION_REJECTED'
          } else if (msg.includes('MTLS_CLIENT_NOT_ALLOWED')) {
            code = 'CLIENT_AUTH_MTLS_CLIENT_NOT_ALLOWED'
          } else {
            code = 'CLIENT_AUTH_SCOPE_INSUFFICIENT'
          }
        } else if (
          msg.includes('CLIENT_AUTH_FAILED') ||
          msg.includes('CLIENT_AUTH_IDENTITY_REQUIRED') ||
          msg.includes('CLIENT_AUTH_MTLS_') ||
          msg.includes('OIDC_') ||
          msg.includes('UNMODELED_BEARER_TOKEN')
        ) {
          statusCode = 401
          code =
            (msg.includes('OIDC_') || msg.includes('CLIENT_AUTH_MTLS_')) &&
            msg.includes(':')
              ? msg.split(':')[0].trim()
              : 'CLIENT_AUTH_FAILED'
        } else if (msg.includes('PROTOTYPE_POLLUTION_REJECTED')) {
          statusCode = 400
          code = 'PROTOTYPE_POLLUTION_REJECTED'
        } else if (msg.includes('DUPLICATE_JSON_KEY_REJECTED')) {
          statusCode = 400
          code = 'DUPLICATE_JSON_KEY_REJECTED'
        } else if (msg.includes('JSON_MAX_DEPTH_EXCEEDED')) {
          statusCode = 400
          code = 'JSON_MAX_DEPTH_EXCEEDED'
        } else if (
          msg.includes('UNEXPECTED_REQUEST_FIELD') ||
          msg.includes('UNEXPECTED_GO_GRANT_FIELD')
        ) {
          statusCode = 400
          code = msg.includes('UNEXPECTED_GO_GRANT_FIELD')
            ? 'UNEXPECTED_GO_GRANT_FIELD'
            : 'UNEXPECTED_REQUEST_FIELD'
        } else if (msg.includes('EVIDENCE_LEVEL_ELEVATION_REJECTED')) {
          statusCode = 400
          code = 'EVIDENCE_LEVEL_ELEVATION_REJECTED'
        } else if (msg.includes('ATTESTATION_REQUEST_EMPTY_BODY')) {
          statusCode = 400
          code = 'ATTESTATION_REQUEST_EMPTY_BODY'
        } else if (msg.includes('ATTESTATION_POLICY')) {
          statusCode = 403
          code = 'ATTESTATION_POLICY_VIOLATION'
        } else if (msg.includes('GO_AUTHORIZATION_')) {
          statusCode = 403
          code = msg.includes(':') ? msg.split(':')[0].trim() : 'GO_AUTHORIZATION_REJECTED'
        } else if (msg.includes('COLLAPSED_AUTHORITIES')) {
          statusCode = 403
          code = 'COLLAPSED_AUTHORITIES_REJECTED'
        } else if (msg.includes('SERVICE_ANTI_REPLAY_UNAVAILABLE')) {
          statusCode = 503
          code = 'SERVICE_ANTI_REPLAY_UNAVAILABLE'
        } else if (
          msg.includes('SERVICE_ANTI_REPLAY_STORAGE_ERROR') ||
          msg.includes('SERVICE_ANTI_REPLAY_SYMLINK_FORBIDDEN')
        ) {
          statusCode = 500
          code = 'SERVICE_ANTI_REPLAY_STORAGE_ERROR'
        } else if (msg.includes('SERVICE_ANTI_REPLAY_LOCK_CONTENTION')) {
          statusCode = 503
          code = 'SERVICE_ANTI_REPLAY_LOCK_CONTENTION'
        } else if (msg.includes('SERVICE_ANTI_REPLAY')) {
          statusCode = 409
          code = 'ATTESTATION_REPLAY_DETECTED'
        } else if (
          msg.includes('PRODUCTION_KMS_UNAVAILABLE') ||
          msg.includes('PRODUCTION_KMS_TIMEOUT')
        ) {
          statusCode = 503
          code = 'PRODUCTION_KMS_UNAVAILABLE'
        } else if (
          msg.includes('PRODUCTION_KMS') ||
          msg.includes('KMS_PUBLIC_KEY_MISMATCH') ||
          msg.includes('UNSUPPORTED_SIGNING_ALGORITHM')
        ) {
          statusCode = 500
          code = 'PRODUCTION_KMS_UNAVAILABLE'
        }

        // Sanitizar mensajes internos y nunca reflejar rutas de disco, tokens ni detalles de OS/KMS
        const INTERNAL_SAFE_MESSAGES = new Map([
          [
            'PROHIBITED_SECRET_DETECTED',
            'Solicitud rechazada por contener material sensible prohibido',
          ],
          [
            'OIDC_JWKS_UNAVAILABLE',
            'Proveedor OIDC / JWKS no disponible para validar identidad del cliente',
          ],
          [
            'OIDC_JWKS_TIMEOUT',
            'Tiempo de espera agotado al consultar el proveedor OIDC / JWKS',
          ],
          [
            'CLIENT_AUTH_VERIFIER_ERROR',
            'Error interno en el verificador de autenticación cliente',
          ],
          [
            'SERVICE_ANTI_REPLAY_UNAVAILABLE',
            'Almacén distribuido anti-replay no disponible o degradado',
          ],
          [
            'SERVICE_ANTI_REPLAY_STORAGE_ERROR',
            'Error interno en el almacén de persistencia anti-replay',
          ],
          [
            'SERVICE_ANTI_REPLAY_LOCK_CONTENTION',
            'Servicio temporalmente ocupado por contención en el almacén anti-replay',
          ],
          [
            'PRODUCTION_KMS_UNAVAILABLE',
            'Proveedor criptográfico de firma no disponible temporalmente',
          ],
        ])

        const safeMessage = INTERNAL_SAFE_MESSAGES.has(code)
          ? INTERNAL_SAFE_MESSAGES.get(code)
          : statusCode >= 500
            ? 'Error interno al procesar la solicitud'
            : msg
        this._sendError(res, statusCode, code, safeMessage)
      }
    })

    req.on('error', () => {
      if (!aborted && !res.writableEnded) {
        this._sendError(
          res,
          500,
          'REQUEST_STREAM_ERROR',
          'Error al leer el flujo de solicitud'
        )
      }
    })
  }

  _extractTransportSecurity(req) {
    const sock = /** @type {any} */ (req?.socket)
    if (!sock || !sock.encrypted) {
      return null
    }
    const rawCert =
      typeof sock.getPeerCertificate === 'function'
        ? sock.getPeerCertificate(false)
        : null
    const hasCert =
      rawCert &&
      typeof rawCert === 'object' &&
      Object.keys(rawCert).length > 0
    return Object.freeze({
      tlsEncrypted: true,
      tlsAuthorized: Boolean(sock.authorized),
      tlsAuthorizationError: sock.authorizationError
        ? String(sock.authorizationError)
        : null,
      peerCertificate: hasCert
        ? Object.freeze({
            subject: rawCert.subject || null,
            subjectaltname: rawCert.subjectaltname || null,
            valid_from: rawCert.valid_from || null,
            valid_to: rawCert.valid_to || null,
            fingerprint256: rawCert.fingerprint256 || null,
          })
        : null,
    })
  }

  _sendPayloadTooLarge(res, req) {
    if (!res.writableEnded) {
      res.writeHead(413, {
        ...this._buildSecurityHeaders(),
        Connection: 'close',
      })
      res.end(
        JSON.stringify({
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: `Cuerpo de solicitud excede el límite permitido (${this._maxBodySizeBytes} bytes)`,
            timestamp: new Date().toISOString(),
          },
        }),
        () => {
          req.destroy()
        }
      )
      return
    }
    req.destroy()
  }

  _sendError(res, statusCode, code, message) {
    if (res.writableEnded) return
    res.writeHead(statusCode, this._buildSecurityHeaders())
    res.end(
      JSON.stringify({
        error: {
          code,
          message,
          timestamp: new Date().toISOString(),
        },
      })
    )
  }
}
