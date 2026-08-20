# Accesos, campo y comunicación

Referencia visual: `Echegaray OS - Accesos.dc.html` (3a–3d) y `Echegaray OS - Obras.dc.html` (1g, mobile `/campo`).

## 3a · Mi cuenta (diseño nuevo, no existe ruta todavía)
Lo que cada persona gestiona de sí misma. Tabs: Perfil · Seguridad · Notificaciones · Sesiones.
- **Foto**: avatar 88px circular, arrastrar y soltar, "Cambiar foto / Quitar", nota de tamaño mínimo y de dónde se usa (header, partes, cuadrillas).
- **Datos personales**: nombre, email de acceso (cambiar exige verificación), teléfono. Campos gobernados por Administración (cargo, legajo) en superficie `#FAFAF8` con nota "lo define Administración".
- **Acceso y credenciales**: contraseña (última vez cambiada), verificación en dos pasos (sin activar → `warn`), email de recuperación, acceso desde el teléfono.
- **Mi legajo**: categoría, obra actual, HH del mes, antigüedad + **mis documentos** con vencimientos (`warn` por vencer, `neg` vencido, "sin cargar" en `faint`) y acción Ver/Subir. El legajo lo administra Administración; los cambios quedan con fecha.
- **Tu nivel y tus obras**: sólo lectura, con la puerta a pedirlo en Usuarios.
- **Sesiones abiertas**: dispositivo, lugar, cuándo, cerrar una o todas.
Mobile: una columna, filas de 58px con valor secundario, cerrar sesión al pie.

## 3e · Mi legajo · Mis horas · Mis documentos
Tabs de Mi cuenta: Perfil · **Mi legajo** · **Mis horas** · **Mis documentos**. Persona ≠ Usuario: el empleado ve LO SUYO y nunca entra al módulo administrativo Personas.
- **Mi legajo:** ficha limpia (categoría, cuadrilla, obra actual, alta, asignación vigente e historial). Sólo lectura; lo administra Administración.
- **Mis horas:** filtros de período (Este mes · Mes pasado · Últimos 3 meses · Elegir período) + totales (HH del período con días trabajados, normales, extras si el modelo las distingue, obras) + tabla **Fecha | Obra | Actividad | Tipo | HH** con fila de total. "sin actividad imputada" cuando falta; los días sin registro no aparecen como 0. No se edita acá: se corrige en la obra.
- **Mis documentos:** tabla **Documento | Categoría | Fecha | Vencimiento | Estado | Acción (Ver / Subir / Descargar)**. Categorías soportadas: DNI, constancias, ART, apto médico, capacitaciones, entrega de EPP, certificados, documentación laboral, otros — se diseñan para soportarlas, no se asume que existan. Vencido `neg`, por vencer `warn`, faltante `faint`. Los documentos siguen vinculados a su fuente (Drive): no se duplican.
- **Privacidad:** el empleado no ve legajos, documentos ni retribuciones de terceros. La UI lo refleja; el permiso se hace cumplir en DB/API/RLS.
Mobile: total del período grande, últimos días en lista, y accesos a Mis documentos (con la alerta de vencido) y Mi legajo al pie.

## 3b/3c · Operación global y Herramientas
Las mismas listas que dentro de la obra pero sin acotar por obra; cada fila dice a qué obra pertenece. Pedidos: Fecha | Material | Cantidad | Estado | Obra | Para la actividad (select que guarda al elegir; "sin asignar" en `faint`). No hay solicitante porque la fuente no lo tiene.
Herramientas: inventario ↔ ficha del equipo. Estados canónicos del servicio: Disponible (`pos`) · En uso (neutro) · En reparación (`warn`) · Fuera de servicio y Perdida (`neg`). Columnas: Herramienta | Categoría | Estado | Ubicación actual | Responsable (derivado del último movimiento). Ficha: **foto**, categoría, estado + nota, ubicación, responsable, origen, y timeline de movimientos; primaria `Registrar movimiento`.

## `/campo` (mobile)
Entrada de obra en teléfono. Rediseño del actual: **sin gradientes, sin emojis, sin tarjetas de color**. Lista sobria de accesos con señal de estado (Parte del día "sin cargar hoy" en `warn`, Pedir material "2 en camino", Herramientas, Movimientos, Anotar impedimento "1 abierto"), y primaria fija abajo `Cargar parte de hoy` con la nota de que se guarda al instante y sin señal queda pendiente.

## 3d · Chat interno por obra
Tres zonas: canales (uno por obra + Administración, con último mensaje y no leídos en amarillo), conversación (mensajes con avatar, autor, hora y el ancla del mensaje: "Impedimento · Mampostería interior" en `neg`), y **Anclado a la obra** a la derecha. Acciones del compositor: Adjuntar · Anclar a una actividad · Convertir en impedimento · Enviar.
Regla: el chat NO es la fuente. Lo que se decide se ancla a la actividad o al impedimento y aparece ahí; la conversación no reemplaza el dato.
