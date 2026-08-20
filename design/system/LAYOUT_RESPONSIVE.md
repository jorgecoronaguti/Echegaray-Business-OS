# Layout y responsive

## Estructura
Header global de UNA línea (48px): `[marca] [Administración | Obras] … [usuario · rol] [salir]`. Sin sidebar, sin dashboard, sin mosaicos.
Nivel 2 según área: Administración (Clientes · Usuarios · Personas · Proveedores · Pendientes) · Obra (Resumen · Planificación · Ejecución · Personal · Operación · Economía · Documentos). **Máximo dos niveles visibles**; un tercero es texto subrayado.

## Anchos
- Workspaces operativos (Planificación, Ejecución, tablas de cartera): ancho completo, padding 40px.
- Fichas de entidad: columna ancha + aside de 320–360px de propiedades.
- Listas de lectura corta (Clientes): máximo ~680px; una tabla de dos columnas estirada a 1440 es ilegible.
- Formularios: máximo ~560px.

## Split workspace (patrón reutilizable)
Ver `../screens/planificacion-gantt.md` §Resize. Handle de 9px, hairline `#EFEEEA` en reposo, `#FDC900` de 2px en hover y durante el drag, `cursor: col-resize`. Mínimos útiles (tabla ≥300px, panel ≥340px), máximos 760px, sin tamaños preestablecidos. El panel se contrae por completo y se reabre desde la barra de acciones; con el panel cerrado el Gantt toma todo el ancho. La preferencia de ancho se guarda por usuario y pantalla.

## Responsive
- **Desktop (≥1280)** referencia: 1440. Split, tablas completas, panel lateral.
- **Tablet (768–1279)** el panel de detalle pasa a drawer sobre el contenido; la tabla del Gantt reduce columnas a Actividad + Estado + %; los filtros colapsan en "Filtros".
- **Mobile (≤767)** una columna. La tabla se vuelve lista de dos datos por fila y el resto se ve en la ficha. El Gantt NO se intenta mantener: se reemplaza por "Próximos" (lista por fecha). Objetivos táctiles ≥44px (campos y primaria 48px). La acción del día va fija abajo. `/campo` es la entrada de obra en teléfono.
- Lo que **no** debe conservarse en mobile: split arrastrable, Gantt de barras, tablas de 6+ columnas, status bar de 6 métricas (se reduce a Avance + Impedimentos).
