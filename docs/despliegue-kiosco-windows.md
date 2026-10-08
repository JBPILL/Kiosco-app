# Despliegue de KioskoPOS en un puesto Windows

## Lanzamiento de Edge

El lanzador `scripts/iniciar-kioskopos-kiosco.ps1` abre la URL de producción en Edge a pantalla completa. Pasale la URL real del comercio:

```powershell
.\scripts\iniciar-kioskopos-kiosco.ps1 -Url https://pos.tu-dominio.com
```

El script rechaza HTTP y no abre el servidor Vite de desarrollo. Antes, instalá Edge, publicá la aplicación por HTTPS y verificá que el terminal y su red tengan hora correcta y conectividad estable.

Este lanzamiento por sí solo no bloquea Windows ni reinicia Edge después de un cierre. Para un equipo dedicado, configurá una cuenta estándar separada y Windows Assigned Access (quiosco de aplicación única) o una política administrada de Shell Launcher; definí también quién conserva la cuenta administrativa y el procedimiento de recuperación. Probá primero en una terminal piloto. La configuración de Assigned Access depende de la edición y política de Windows del comercio.

Edge kiosk se ejecuta en sesión InPrivate. KioskoPOS guarda la preferencia local de impresora y la apertura del cajón en almacenamiento del navegador; validá si sobreviven al cierre completo de Edge en la configuración piloto. Una sesión reiniciada puede requerir iniciar sesión y volver a autorizar Web Serial. Si eso impide la operación, mantené el piloto detenido hasta definir si el puesto debe reconfigurarse por turno o requiere otro perfil de navegador administrado compatible con la política del comercio.

Microsoft documenta el lanzamiento de Edge con `--kiosk <URL> --edge-kiosk-type=fullscreen --no-first-run` y la asignación del navegador como aplicación de quiosco [en su guía de Edge kiosk](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-configure-kiosk-mode) y [la guía de Windows Assigned Access](https://learn.microsoft.com/en-us/windows/configuration/assigned-access/quickstart-kiosk).

## Impresora y cajón

**Canal por driver:** el botón Imprimir Ticket abre el diálogo del navegador
mediante `window.print()`, donde se selecciona la impresora instalada en Windows.
No hay impresión silenciosa ni confirmación de que el papel salió. El ticket
interno y ARCA comparten esta ruta. Durante beforeprint se libera altura y
recorte de los contenedores de vista previa; afterprint/desmontaje los restaura.
También se quita el máximo de ancho usado en pantalla. Dos pruebas DOM cubren
marcado/restauración de ancestros; falta comprobar paginación y márgenes reales
con navegador, driver y tickets largos en papel de 58/80 mm.

El lanzador rechaza también HTTPS en localhost/loopback, nombres `.localhost`,
el puerto de desarrollo 5173 y URLs con usuario/contraseña. Diez pruebas
ejecutan PowerShell con detección de Edge y lanzamiento simulados: validan
rechazos, argumentos y falta del navegador sin abrir ventanas reales.
Build aprobado. Sigue pendiente probar el puesto físico, persistencia,
reinicio y periféricos; no se instalaron políticas de Windows desde esta sesión.

1. Iniciá sesión en KioskoPOS y abrí Configuración desde la sesión de administración.
2. Elegí la impresora Web Serial para ese puesto y ejecutá **Imprimir prueba**.
3. Probá permiso denegado, cable desconectado, reintento, reimpresión y cierre de Edge. Reimprimir un ticket no debe abrir el cajón.
4. Activá apertura automática solo si hay cajón conectado y validado. La apertura ocurre después de una venta confirmada que contiene efectivo; los errores se notifican y no revierten la venta.
5. Registrá marca/modelo, conexión USB/COM, ancho de papel, versión de Edge y resultado para cada terminal. Si Web Serial no está soportado, usá el ticket en pantalla o impresión manual.

## Matriz piloto

| Terminal / Windows | Edge | Impresora y conexión | Cajón | Venta efectiva | Pago mixto | Desconexión / recuperación |
|---|---|---|---|---|---|---|
| Completar en el local | Completar | Completar | Completar | Pendiente | Pendiente | Pendiente |

No actives el modo quiosco para todos los puestos hasta comprobar impresión, lector, balanza y acceso de soporte en el piloto. Una PWA a pantalla completa mejora el uso en mostrador; el bloqueo y relanzamiento pertenecen a Windows/Edge administrado.
