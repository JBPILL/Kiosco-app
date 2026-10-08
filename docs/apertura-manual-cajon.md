# Apertura manual de cajón — base SQL 41

Estado: base de autorización y solicitud auditada; interfaz y resultado de hardware pendientes. No habilita una nueva acción en el POS.

Aplicar supabase_fase_apertura_manual_cajon.sql después de 04 y 05, inicialmente en ensayo. La RPC solicitar_apertura_manual_cajon recibe un UUID de solicitud y un motivo de 5 a 300 caracteres. Verifica sesión authenticated, perfil activo único, rol DUEÑO y comercio. El cliente no elige actor ni comercio. Un reintento con igual UUID, actor, comercio y motivo devuelve el mismo UUID sin insertar otra auditoría. Un UUID incompatible se rechaza. La auditoría registra CAJON_APERTURA_SOLICITADA; nunca implica apertura física.

Integración pendiente: campo de motivo, espera de autorización antes del pulso, protección frente a doble clic, resultado del transporte y consulta de estos eventos. Web Serial permanece en el navegador: la autorización SQL no impide a una persona con acceso físico utilizar otra herramienta para activar la impresora. Probar impresora y cajón reales, sesiones reales y concurrencia PostgreSQL antes de aceptar la fase.

Evidencia: securityMigrations.test.ts aprobó 45 pruebas, incluida reaplicación SQL41, motivo normalizado, actor, reintento único y rechazo al cajero. No se validó API remota ni concurrencia real.

Evaluación: exactitud 4 (SQL ejecutado, hardware pendiente), completitud 3 (base parcial, interfaz y resultado pendientes), claridad 4 (solicitud distinguida del resultado físico), acción 3 (integración pendiente), concisión 4 (RPC acotada). Promedio 3,6. Prioridades: completar interfaz y resultado, ampliar rechazos y concurrencia, piloto remoto. El estado parcial debe mantenerse visible para el usuario.

Avance del cliente: acción integrada en Configuración → Seguridad y Caja para dueño activo. manualDrawer.ts solicita SQL41 antes del pulso, comprueba identidad después de la respuesta y bloquea solicitudes concurrentes en la pestaña. Cinco pruebas del flujo aprobadas. El resultado local distingue pulso enviado de apertura física. Persistir el resultado del transporte y mostrar solicitudes en la consulta comercial siguen pendientes; no hay validación hardware ni remota.

Protección de formulario: se reinicia por identidad/comercio y al perder rol, evitando trasladar motivos entre sesiones. 53 pruebas aprobadas en tres archivos (SQL, flujo y formulario). Queda pendiente validar navegadores y el resultado físico; esta cobertura local no completa la fase.

SQL42: supabase_fase_resultado_apertura_cajon.sql requiere SQL41. Registra un resultado declarado por el navegador vinculado a la solicitud y al mismo actor/comercio; un resultado repetido conserva el ID. El índice impide duplicados. El flujo guarda PULSO_ENVIADO o ERROR_TRANSPORTE después del intento; si el registro falla, conserva la información local del pulso sin reintentarlo. 53 pruebas de SQL y flujo aprobadas. Falta consulta visual de resultados, ampliar pruebas de rechazos y validar remotamente. Evaluación actual: exactitud 4, completitud 3 por piloto/consulta pendiente, claridad 4, acción 4 con SQL42 y flujo disponible, concisión 4; promedio 3,8. Prioridad: visibilidad de resultados y recuperación del registro sin nuevos pulsos.

SQL43 (supabase_fase_consulta_auditoria_cajon.sql), posterior a 40–42, amplía la consulta comercial con solicitudes y resultados del cajón. La tarjeta presenta el resultado explícitamente como declaración del navegador. Reaplicar SQL40 al final ocultaría estos eventos; reaplicar 43 después. Quedan pendientes piloto remoto, hardware y recuperación del resultado de auditoría tras desconexión.
