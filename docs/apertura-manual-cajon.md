# Apertura manual de cajón — base SQL 41

Estado: base de autorización y solicitud auditada; interfaz y resultado de hardware pendientes. No habilita una nueva acción en el POS.

Aplicar supabase_fase_apertura_manual_cajon.sql después de 04 y 05, inicialmente en ensayo. La RPC solicitar_apertura_manual_cajon recibe un UUID de solicitud y un motivo de 5 a 300 caracteres. Verifica sesión authenticated, perfil activo único, rol DUEÑO y comercio. El cliente no elige actor ni comercio. Un reintento con igual UUID, actor, comercio y motivo devuelve el mismo UUID sin insertar otra auditoría. Un UUID incompatible se rechaza. La auditoría registra CAJON_APERTURA_SOLICITADA; nunca implica apertura física.

Integración pendiente: campo de motivo, espera de autorización antes del pulso, protección frente a doble clic, resultado del transporte y consulta de estos eventos. Web Serial permanece en el navegador: la autorización SQL no impide a una persona con acceso físico utilizar otra herramienta para activar la impresora. Probar impresora y cajón reales, sesiones reales y concurrencia PostgreSQL antes de aceptar la fase.

Evidencia: securityMigrations.test.ts aprobó 45 pruebas, incluida reaplicación SQL41, motivo normalizado, actor, reintento único y rechazo al cajero. No se validó API remota ni concurrencia real.

Evaluación: exactitud 4 (SQL ejecutado, hardware pendiente), completitud 3 (base parcial, interfaz y resultado pendientes), claridad 4 (solicitud distinguida del resultado físico), acción 3 (integración pendiente), concisión 4 (RPC acotada). Promedio 3,6. Prioridades: completar interfaz y resultado, ampliar rechazos y concurrencia, piloto remoto. El estado parcial debe mantenerse visible para el usuario.
