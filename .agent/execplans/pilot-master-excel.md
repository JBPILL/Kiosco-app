# Piloto — Excel maestro compatible y sin truncamiento silencioso

## Objetivo y contexto
Continuar los pendientes del piloto desde ac36921. Usuario confirmó Reportes y
mejor distancia de cámara. Impresora no disponible; PR #1 permanece sin merge.
ConfigPage solicita afip_cae en el Excel maestro aunque no existe en strict.
Además las seis consultas usan límites fijos y no recorren páginas; el máximo
del servidor puede cortar resultados aun cuando la consulta pida 50000 filas.

## Alcance y decisiones
Reutilizar el helper de proyección fiscal y leerColeccionPorId. Extraer solamente
la carga/exportación del Excel maestro a un módulo comprobable. Paginar por ID,
mantener filtros de tenant y ventas COMPLETADAS, ordenar para presentación al
final y cargar costos protegidos en lotes acotados para no crear URLs enormes.
Un fallo de cualquier página o costo impide descargar y registrar éxito.
Excel sigue siendo una exportación de análisis, no un snapshot transaccional:
conservar JSON integral para copia consistente/restaurable. Sin nuevo SQL ni RPC.
No modificar checkout, restauración, AFIP/WSFE, Point ni .env.local.

## Validación y riesgos
Probar modo estricto/completo, páginas cortas por cap remoto, filtros/cursor,
costos por lotes, error tardío y ausencia de descarga/recordatorio ante fallos.
Dirigidos de backup/proyección, suite, build, diff/index, audit y escaneo.
Publicar por push normal a master con gates verdes y verificar Vercel.
Lecturas reales sólo con JWT de Dueño y claves en memoria, sin guardar ni
imprimir datos comerciales o descargar copias de Production para este ensayo.
Las lecturas paginadas pueden observar cambios concurrentes; no presentarlas
como copia transaccional, ni sustituir el snapshot JSON.

## Progreso
- [x] Identificado fallo de columna fiscal y límite no paginado.
- [x] Implementación y regresiones: dirigidos finales de backup 24 PASS; validación
      de filas añadida tras diagnóstico de TypeScript, sin suprimir tipos. La suite
      detectó .from dinámico sin inventario; se sustituyó por seis fuentes literales
      permitidas, manteniendo intacto el test de contrato (5 PASS).
- [x] Lecturas reales de las seis proyecciones con JWT Dueño en Production,
      cursores y costos PASS; sin descargar copias ni imprimir registros.
- [x] Validación local completa: 1870 PASS / 1 skipped / 198 archivos, 255,81 s;
      hashes de fuentes probadas sin cambios. Build PASS 611 módulos. Audit 0;
      diff/index PASS; escaneo 1077 textos, 14 binarios omitidos, mismos 44
      candidatos sintéticos conocidos sin secretos nuevos; historial no escaneado.
- [ ] Publicación y comprobación pública.

## Resultado final
Corrección y validación local PASS. Exportación strict compatible, páginas cortas
completas hasta página vacía, costos por lotes, rechazo de errores tardíos antes
de descargar. No convierte Excel en snapshot transaccional: JSON integral sigue
siendo la copia consistente/restaurable. No hay cambios SQL, Edge, checkout,
facturación ni .env.local en este bloque. Publicación normal y checks pendientes
de comprobar después del push. Preparación fiscal separada en arca-homologation.md.
