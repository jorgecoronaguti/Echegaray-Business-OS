# Perfil EMPLEADO — mobile primero
Visual: `visual/Empleado.dc.html` (4a Hoy · Mi trabajo · Mis tareas · Detalle de tarea · 4b Mi información · Mi legajo · Mis horas · Asistencia · 4c Mis documentos · Subir documento · Recibos · Detalle de recibo · Reportar problema · 4d desktop).
Reglas globales en `../system/`. Acá sólo lo propio de este perfil.

## Entrar (login) — 4e
La puerta del OS, común a todos los perfiles.
- **Mobile:** logo oficial (lockup horizontal, 212px) + "Business OS" como descriptor · Email · Contraseña con "Mostrar" · primaria **Entrar** de 52px · **Mantener la sesión en este teléfono** marcado por defecto (el teléfono de obra es personal y la sesión de campo no caduca) · "Olvidé mi contraseña". Al pie: no hay registro abierto, las cuentas las crea Administración desde Usuarios.
- **Error:** borde `neg` en el campo y motivo concreto debajo ("Email o contraseña incorrectos. Te quedan 3 intentos."). Sin cajas de alerta ni banners.
- **Recuperación:** enlace al email cargado; si no hay email, lo resuelve Administración. Nunca revelar si el email existe más allá de eso.
- **Sin conexión:** no se puede entrar por primera vez; si ya hubo sesión en el equipo, el OS abre con lo último cargado.
- **Desktop 1440:** dos columnas — formulario a la izquierda (400px de ancho, controles de 40px), panel `quiet` a la derecha con la marca y tres números de la empresa. Sin imagen de fondo, sin gradiente.
- Se aplica el estado de foco del sistema: borde #1F1F1E en el campo activo, sin halo de color.

## Principio
"Abro el OS y sé dónde trabajo hoy, qué tengo que hacer y si tengo algo pendiente." No es un ERP reducido: es otra vista sobre las mismas entidades.

## Navegación — tres contextos, no ocho
Barra inferior fija de 58px con **Hoy · Mi trabajo · Mi información** (activo: regla amarilla de 2px arriba del tab + peso 600). En desktop esos mismos tres pasan al nivel 1 del header global; no hay una cuarta experiencia.

## Hoy (home)
Secuencia vertical, sin cards: fecha → **OBRA** (nombre, ubicación, jefe de obra) → **CUADRILLA** → **ASISTENCIA** (estado + hora + una sola acción primaria de 52px) → **TRABAJO DE HOY** (lista de tareas con punto de estado) → **PENDIENTES** (documento requerido, impedimento de su actividad). Un problema real emerge acá aunque su sección esté plegada.

## Asistencia ≠ HH imputadas
Dos hechos distintos, nunca uno derivado del otro.
- Estados: **sin registrar · entrada registrada · salida registrada · incidencia**. La acción es siempre una sola (Registrar entrada → Registrar salida).
- Historial: **Fecha | Entrada | Salida | Total** con filtros de período. Sin salida ⇒ "falta salida" en `warn`; el día en curso muestra "en curso", no un total inventado.
- En Mis horas se enfrentan las dos puntas: **Presencia registrada / HH imputadas a obra / Pendiente de imputar** — y sólo si existen ambas. Nunca se fabrica el faltante.
- Habilita la cadena futura: persona → asistencia → obra → actividad → HH → período → liquidación → recibo. El motor de liquidación NO se diseña.

## Mi trabajo
Obra actual (etapa, ubicación, responsable, cuadrilla) + secciones plegables: Mis tareas · Próximos trabajos · Impedimentos de mi trabajo · Planos y documentos de obra · Avisos. Debajo, **Mi cuadrilla**: nombre y rol de cada integrante, sin acceso a legajos ni documentos de terceros.
No se muestran: contratado, presupuesto, margen, ni información comercial o administrativa.

## Mis tareas y detalle
Tabs **Hoy · Próximas · Completadas**. Fila: título, actividad, estado (punto + palabra), fecha y, cuando existe, el bloqueo en `neg`. "Sin fecha / sin plan" en `faint`.
Detalle: título, estado, actividad y obra; datos (cómo se mide, avance cargado, responsable, fecha, cuadrilla); indicaciones; y secciones Impedimentos · Documentos · Notas · Depende de. Acciones al pie según estado y permiso: **Marcar avance** (primaria), Completar, Reportar problema. Nunca una fila llena de botones.

## Reportar problema
Actividad/tarea preseleccionada → descripción → foto opcional → "¿frena el trabajo?" (sí/no) → Reportar. Entra como **impedimento de la actividad** en el sistema real: no existe una segunda base de problemas.

## Mi información
Lista plegable: Mi perfil · Mi legajo · Mis horas · Asistencia · Mis documentos · Recibos, cada uno con su señal (2 documentos, 1 día sin salida). Sin cards gigantes.
- **Mi perfil:** edita lo autogestionable (foto, contacto, contraseña). DNI, CUIL, categoría y datos legales, sólo lectura.
- **Mi legajo:** identidad · situación laboral · historial de asignaciones (vigente/cerradas). Persona ≠ Usuario: el legajo pertenece a Persona y no se duplica en Usuario. Lo que falta se ve como "sin cargar"; el empleado avisa, corrige Administración.

## Mis documentos
Mobile: lista legible (nombre, categoría, punto + estado, vencimiento, acción a la derecha) — no una tabla desktop comprimida. Desktop: **Documento | Categoría | Fecha | Vencimiento | Estado | Acción**.
Estados: **Vigente · Por vencer · Vencido · Solicitado · Pendiente de revisión · Requiere corrección**. Vencido/requiere corrección `neg`, por vencer/solicitado `warn`, en revisión gris, vigente `pos`.
Categorías soportadas: DNI, constancias, ART, apto médico, capacitaciones, entrega de EPP, certificados, documentación laboral, otros. No se asume que existan.

## Subir documento
Motivo visible si vuelve corregido (texto del revisor + fecha + quién) → lo que ya subió → **Sacar una foto / Elegir un archivo** → Enviar (deshabilitado hasta adjuntar). Ciclo: **solicitado → subido → en revisión → aprobado / requiere corrección**. Lo presentado no reemplaza el documento oficial hasta la aprobación; los archivos siguen viviendo en su fuente real.

## Recibos
Lista **Período | Estado | Neto | Acción**. Período sin liquidar: "Todavía no liquidado" + "sin recibo" — nunca $ 0.
Detalle: neto, estado de pago, período, días trabajados, HH imputadas, categoría, fecha de emisión y el PDF (Ver / Descargar). El OS no calcula sueldo: consume lo que la liquidación publica.

## Privacidad — se hace cumplir en backend
Ve: lo suyo (legajo, HH, asistencia, documentos, recibos), su obra operativa, su cuadrilla y sus tareas.
No ve: legajos, documentos ni salarios de terceros, información financiera de obra, presupuestos, márgenes ni administración general.
**Ocultar UI no es seguridad:** RLS/Storage/API deben imponer estos límites. Los integrantes de la cuadrilla se listan por nombre y rol, sin puerta a sus datos sensibles.

## Desktop
Mismo Design System y mismos datos. Hoy: columna izquierda 620px (obra, cuadrilla, asistencia, trabajo de hoy) + columna derecha (pendientes, Mi mes con presencia vs HH, documentos de obra). Los detalles reutilizan el patrón lista + detalle contextual ya aprobado; no se inventan pantallas nuevas.

## Una sola verdad
Mi obra ← asignaciones · Mi cuadrilla ← cuadrillas · Mis tareas ← actividades/tareas · Mis HH ← registros HH · Mi legajo ← Persona · Mis documentos ← documentos del legajo · Asistencia ← registros de asistencia · Recibos ← liquidación futura · Reportar problema ← impedimentos.
