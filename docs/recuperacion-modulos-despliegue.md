# Recuperación de módulos después de un despliegue

## Incidente y corrección (09/10/2026)

La comprobación HTTP pública anterior a esta corrección devolvió 200 HTML para
un JavaScript inexistente en `/assets/`, con caché immutable de un año. El cambio
3168403 detectaba errores MIME, pero mantenía esa respuesta incorrecta y agregaba
tres recargas independientes que podían descartar tickets en memoria.

- Vercel: primero archivos existentes; recursos ausentes devuelven 404/no-store;
  las rutas de la SPA sirven index.html sin caché persistente. Los assets
  existentes con hash mantienen caché prolongada.
- Service Worker v27: valida MIME de scripts/estilos en red y caché, rechaza HTML
  para JavaScript, no intercepta otros orígenes y limpia solamente caches propias.
- Recuperación React: no recarga por errores ni por cambio de controlador del SW.
  Volver al punto de venta reinicia la pantalla conservando los stores en memoria.
  La recarga manual advierte si existen borradores; se pueden pausar primero.
- Fallo del módulo inicial: pantalla HTML independiente de React con reintento
  manual. No depende de sessionStorage ni afirma que un cobro esté confirmado.

## Alcance

No agrega persistencia automática de borradores ante cierre del navegador o
reinicio del sistema. No cambia el protocolo de confirmación de cobros. El usuario
que confirma descartar borradores antes de recargar acepta perder esos borradores.

## Aceptación después del despliegue

1. `/`, `/caja` y `/stock`: HTML 200 con Cache-Control no-store.
2. JS existente del HTML: MIME JavaScript y caché immutable.
3. `/assets/no-existe.js`: 404/no-store, nunca HTML con estado 200.
4. En iPhone/Safari, abrir ticket y fallar una importación secundaria: volver al
   POS conserva artículos; cancelar recarga conserva la pantalla y borrador.
5. Comprobar actualización desde SW v26, error de módulo inicial y modo sin red.

Las pruebas locales de worker ejecutan su código con red/caché simuladas y las
de React comprueban recuperación/cancelación. No sustituyen estos pasos reales.
Referencia de rutas: https://vercel.com/docs/project-configuration/vercel-json

## Evidencia local

Las tres pruebas iniciales reprodujeron los fallos antes del cambio. Después,
12 pruebas en tres archivos pasan: configuración, worker ejecutado en VM,
recuperación inicial y React con borrador y almacenamiento bloqueado.

Autoevaluación del alcance de la entrega:

| Criterio | Puntaje | Evidencia y límite |
| --- | --- | --- |
| Exactitud | 4/5 | Casos locales reproducidos; Safari físico pendiente. |
| Completitud | 4/5 | Código corregido; despliegue y aceptación HTTP pendientes. |
| Claridad | 4/5 | Se explicita pérdida de borradores si el usuario acepta recarga. |
| Accionabilidad | 4/5 | Checklist remoto concreto; requiere nuevo despliegue. |
| Concisión | 4/5 | Informe separado para conservar detalles de soporte. |
