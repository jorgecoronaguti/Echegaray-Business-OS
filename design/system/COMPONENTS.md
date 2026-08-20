# Componentes aprobados

Formato: propósito · anatomía · variantes · estados · spacing · uso correcto / incorrecto.

## Global header
Barra de 48px, hairline inferior. `[isotipo 26 + wordmark + "Business OS"] [áreas nivel 1] … [email · rol] [salir] [avatar 26]`.
Variantes: dos áreas (Administración | Obras) o nombre del área cuando el rol ve una sola.
Activa = regla `#FDC900` 2px. Incorrecto: exponer módulos internos como áreas; agregar una segunda fila.

## Entity header
`← volver` (12px muted) · h1 22/600 · línea de campos rotulados (`Cliente: · Etapa: · Inicio: · Fin plan:`) 12,5px · a la derecha estado o ciclo de vida.
Cada campo dice su ausencia por su nombre ("sin fecha"), nunca un guión suelto.

## Primary tabs (nivel 2)
Fila de tabs 14/500, padding 9×14, activa con regla `#FDC900` 2px y `margin-bottom:-1px` sobre hairline `#E7E6E2`. Desplazable en teléfono.

## Secondary tabs / sub-vistas
Texto 12,5–13,5px con contador mono a la derecha; activa con subrayado `#1F1F1E` 1,5px o regla amarilla si es la vista principal. No usar pastillas rellenas.

## Buttons
Primaria: `#FDC900`, texto `#1F1F1E`, 600, padding 7×14, radio 6. Secundaria: borde `#E7E6E2` o texto `muted`. Destructiva: texto `neg`. Disabled: `#EFEEEA` + `faint`. Una primaria por contexto.

## Inputs / selects / search
Alto 34–36px, borde `#D7D5CF`, radio 6, texto 13px, placeholder `faint`. Buscador de lista: sólo hairline inferior + icono 13px. Mobile: 48px.
Select que guarda al elegir (sin botón por fila) cuando el campo es único.

## Filters
Texto en línea, activo subrayado; contador "N de M" a la derecha. No aparecen con una sola fila. Estado en la URL.

## Status badges
Punto de 6px + palabra. Hecha `pos` · En curso grafito · Pendiente punto hueco `#C9C4C2` · Impedimento `neg` · Falta de dato `warn` · Ausencia: sólo texto `faint` sin punto. Prohibidas las pastillas de color.

## Table / compact table / grouped rows
Hairline superior, encabezado 32px (10px, 0.06em, uppercase, faint), filas 42–46px separadas por `#EFEEEA`, sin caja. Números a la derecha, tabulares. Grupos (rubros) colapsables: fila de 38px, 11,5/600, 0.04em, con contador mono y caret; separación de 8px antes de cada grupo.
Fila de total: borde superior `#D7D5CF`.

## Empty state
Una línea, accionable: "Nadie tiene una asignación vigente. Se asigna desde la solapa Personal de la obra." Sin ilustraciones ni párrafos permanentes.

## Alert / inline error
Bloque con borde `neg`/`warn` y su `-soft` sólo cuando hay un problema real; el mensaje incluye lo que dijo la fuente. Error de campo: texto `neg` 11,5px debajo del control.

## Drawer / panel de detalle
Panel lateral permanente (no modal, no overlay) mientras haya selección. Cabecera con título 16/600 + estado + ✕. Contenido: comparación Plan/Real y secciones plegables. Footer con la primaria del objeto.
En tablet pasa a drawer; en mobile, a pantalla.

## Resizable split
Ver `LAYOUT_RESPONSIVE.md`. Handle 9px, amarillo en hover/drag, col-resize, mínimos y colapso.

## Accordion / progressive disclosure
Fila de 44px: `Nombre · contador` a la izquierda, chevron `›` que rota 90° al abrir. Cerrado por defecto. Una alerta crítica se muestra en la fila cerrada (ej. "vence 22/08" en `neg`).

## Timeline (actividad de entidad)
Fila por evento: fecha mono 11,5px · tipo en versalitas `faint` · texto 13px · importe a la derecha. Se muestran los últimos N con "Ver todo (N) →".

## Status bar
Franja inferior de 56px, hairline superior, sin fondo propio: 6 métricas como `etiqueta 10px faint / valor 14–16px 600 / contexto 11px`. Sin cards, sin gráficos, sin números gigantes.

## Gantt row
Fila de 38px alineada 1:1 con la tabla. Track `#EAE7E6` radio 2 alto 10–14px; relleno grafito (verde si 100%, ámbar/rojo si el semáforo lo marca); baseline punteada `#D7D5CF` 2px debajo; hito rombo 7px `ink` con etiqueta en su carril; dependencias en L `#DAD6D5` 1px con flecha; impedimento triángulo `neg` sobre la barra; HOY línea `#FDC900` 1,5px con bandera. Sin fechas: no se dibuja barra, se escribe el motivo.

## Contextual action menu
`···` al final de la fila, visible en hover; abre menú con sombra `pop`, ítems 13px, destructivo en `neg`.
