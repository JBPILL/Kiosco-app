# Isolated build context: run `docker build -t independent-attestation-authority ./services/independent-attestation-authority`
# Contains ZERO POS source files, ZERO frontend node_modules, and ZERO private keys.

FROM node:22-alpine AS runtime

LABEL org.opencontainers.image.title="independent-attestation-authority" \
      org.opencontainers.image.description="Isolated PR02-P0 Attestation Authority Service" \
      org.opencontainers.image.vendor="KioskoPOS Security"

# Non-root system user/group
RUN addgroup -g 10001 -S attestation \
 && adduser -u 10001 -S -G attestation -H -s /sbin/nologin attestation \
 && mkdir -p /app/src /var/run/attestation \
 && chown -R attestation:attestation /app /var/run/attestation

WORKDIR /app

# Copy ONLY service runtime files (zero external npm dependencies)
COPY --chown=attestation:attestation package.json /app/package.json
COPY --chown=attestation:attestation src/ /app/src/

ENV NODE_ENV=production \
    ATTESTATION_SERVICE_HOST=0.0.0.0 \
    ATTESTATION_SERVICE_PORT=8080 \
    ATTESTATION_ANTI_REPLAY_FILE=/var/run/attestation/anti-replay.json \
    TMPDIR=/tmp

USER 10001:10001

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.ATTESTATION_SERVICE_PORT || process.env.PORT || 8080) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Compatible with read-only root filesystem when running with:
# --read-only --tmpfs /tmp --tmpfs /var/run/attestation (or persistent volume on /var/run/attestation)
CMD ["node", "src/server.mjs"]
