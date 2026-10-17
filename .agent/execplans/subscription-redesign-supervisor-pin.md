# Panel de suscripción y reparación del PIN de supervisor

## Objetivo y orden autorizado
Rediseñar Administración comercial, publicar mediante push normal a master y
después corregir el guardado de PIN. PR #1 permanece sin merge. Base: master
0fa1c98, checkout limpio, rama fix/subscription-panel-supervisor-pin.

## Alcance
- Panel responsive con jerarquía de plan/precio/estado, fechas, historial vacío
  y datos de regularización; temas claro/oscuro y accesibilidad.
- Conservar lecturas reales, permisos, errores, reintentos y descarte de respuestas
  de otra identidad. Fechas comerciales DATE sin desplazamiento por zona horaria.
- Diagnosticar cliente → Edge supervisor-pin → secretos/RPC/ACL; mínima corrección
  respaldada por evidencia. Nunca leer/imprimir PIN, hashes ni peppers.
- No rotar secretos ni sobrescribir PIN existente sin evidencia/autorización.
- Sin AFIP/WSFE/Point ni cambios al checkout o a la lógica comercial.

## Validación y publicación
Tests de componente, cliente y servidor afectados; build, diff/índice y escaneo
sin valores. Verificación visual del panel publicado y pruebas PIN en Staging
con fixture aislado antes de reparar Production. La elección y el guardado del
PIN real corresponden al usuario, mediante el formulario seguro.

## Progreso
- [x] Instrucciones, skills y código actual inspeccionados.
- [ ] Rediseño, tests y push normal a master; verificar despliegue y captura.
- [ ] Causa del PIN confirmada y corrección mínima validada.
- [ ] Publicación y verificación final sin secretos; árbol limpio.

## Resultado final
En curso. Los cambios anteriores ya están en master mediante PR #2; no hay
commits pendientes de ese bloque. El panel mostrado corresponde al nuevo módulo
con presentación mínima. ESTADO de PIN funciona pero CONFIGURAR falla; todavía
no se atribuye la causa a conexión, secretos o DB sin evidencia remota.
