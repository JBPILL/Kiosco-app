# Despliegue de KioskoPOS en un puesto Windows

## Preparar un puesto persistente

El lanzador abre KioskoPOS en una ventana de aplicación maximizada de Edge,
con un perfil dedicado al puesto. Primero revisá la preparación sin abrir Edge
ni crear carpetas:

```powershell
.\scripts\iniciar-kioskopos-kiosco.ps1 -Url https://pos.tu-dominio.com -Puesto caja-1 -Preparar
```

Después de revisar los pendientes del navegador anterior y aprobar la adopción
del puesto, el operador puede abrirlo con los mismos valores y sin `-Preparar`.
No hace falta usar una cuenta administradora. La URL debe ser pública, HTTPS,
sin usuario/contraseña; no incluyas claves ni tokens en ella. El nombre del puesto
admite letras, números, guion y guion bajo (máximo 40 caracteres).

El perfil queda bajo `%LOCALAPPDATA%\KioskoPOS\Puestos`, separado del Edge
personal. Su identidad combina origen HTTPS y nombre del puesto: cambiar sólo
la ruta o los filtros conserva el perfil; cambiar host, puerto o puesto abre uno
separado. Staging y Production no comparten el perfil. El script no copia,
borra ni modifica perfiles existentes, no guarda contraseñas y no concede
permisos de impresora o cámara. Los accesos directos deben conservar estos
valores. No alternes nombres de puesto para intentar recuperar una venta.

El lanzador anterior usaba `--kiosk`. Microsoft documenta que ese modo utiliza
InPrivate, que elimina los datos de sesión al cerrar todas sus ventanas.
Por eso este arranque usa una ventana de aplicación con `--user-data-dir`,
sin kiosk ni InPrivate. Un perfil persistente no garantiza una sesión de acceso
indefinida: puede expirar, y las políticas de Windows pueden limitar o limpiar
almacenamiento. El lanzador se detiene si detecta `UserDataDir` administrado,
InPrivate forzado o limpieza de datos al salir; no altera esas políticas.
El administrador debe revisar también el resto de políticas efectivas y confirmar
la ruta en `edge://version` antes de aceptar el puesto.

Referencias: [modo kiosk de Edge](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-configure-kiosk-mode),
[datos eliminados al salir de InPrivate](https://support.microsoft.com/en-us/edge/browse-inprivate-in-microsoft-edge),
[directiva UserDataDir](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/userdatadir).

## Adopción y recuperación

1. En el navegador/perfil anterior, revisá cobros, envases, devoluciones y stock
   pendientes. Recuperá la solicitud original desde sus paneles; no repitas la
   venta ni entregues efectivo otra vez por no verla en el nuevo perfil.
2. No borres datos del navegador, ni renombres o copies carpetas de perfiles.
   Si una sesión InPrivate anterior ya se cerró, su cola local puede haberse
   perdido. Usá la recuperación autorizada de servidor y conciliación; el
   lanzador no reconstruye solicitudes desaparecidas.
3. En el comercio aislado de Staging, abrí el puesto, iniciá sesión y verificá
   catálogo, caja y permisos de periféricos. Un acceso nuevo puede requerir
   autorización manual; no se debe pedir durante la confirmación del cobro.
4. Cerrá y volvé a abrir con la misma URL y puesto. Comprobá el perfil efectivo,
   preferencias y lectura de pendientes. Si vuelve a pedir login, autenticarse
   no autoriza generar otra operación financiera.
5. El ensayo de respuesta perdida requiere operaciones ficticias autorizadas:
   recuperá el mismo ID/cuerpo y comprobá un único resultado/stock/pago. Ensayar
   también cierre inesperado, reconexión y dos terminales antes de aceptación.
6. Si se pierde el disco/perfil, detener nuevos cobros ambiguos y conciliar con
   servidor y respaldo. Un perfil persistente no es copia externa ni restauración.

Este script no instala accesos directos, arranque automático, actualizaciones,
Assigned Access ni relanzamiento. Tampoco bloquea Windows. Para un puesto
administrado hay que definir cuenta estándar, salida de emergencia y responsable
de soporte; ese despliegue requiere aceptación separada. No combinar el perfil
persistente con Edge kiosk/InPrivate para intentar conseguir ambas funciones.

## Impresora y cajón

**Canal por driver:** el botón Imprimir Ticket abre el diálogo del navegador
mediante `window.print()`, donde se selecciona la impresora instalada en Windows.
No hay impresión silenciosa ni confirmación de que el papel salió. El ticket
interno y ARCA comparten esta ruta. Durante beforeprint se libera altura y
recorte de los contenedores de vista previa; afterprint/desmontaje los restaura.
También se quita el máximo de ancho usado en pantalla. Dos pruebas DOM cubren
marcado/restauración de ancestros; falta comprobar paginación y márgenes reales
con navegador, driver y tickets largos en papel de 58/80 mm.

El lanzador también rechaza localhost/loopback, nombres `.localhost`, puerto
5173 y URLs con credenciales. Las pruebas PowerShell simulan políticas, presencia
de Edge y lanzamiento: no abren ventanas ni escriben perfiles. Validan identidad,
separación de entornos, argumentos con espacios y fallos de configuración.
La persistencia tras reinicio, permisos y periféricos sigue pendiente de ensayo
físico; las pruebas locales no certifican el puesto instalado.

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
