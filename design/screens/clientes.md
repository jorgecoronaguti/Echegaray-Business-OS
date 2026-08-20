# Clientes

Referencia visual: `Echegaray OS - Administración.dc.html` (2g, 2h).

## 2g · Cartera — `/clientes`
Objetivo: encontrar y abrir un cliente. Ancho de lectura (~680px), dos columnas: **Cliente | Obras**. Buscador que filtra en el navegador (son pocos) y busca por nombre comercial y razón social. Cliente sin identificador: se muestra sin enlace y se dice "sin identificador: no tiene ficha todavía". Archivado se rotula. Primaria `+ Nuevo cliente` (Administración).

## 2h · Record del cliente — `/clientes/<cliente>`
**Sin solapas**: el record no se esconde detrás de tabs. Header: nombre + CUIT (o "CUIT sin cargar") + `Editar` (sólo Administración).
Columna ancha: **Actividad** (timeline con certificaciones, cobranzas, notas y documentos; "Ver todo (N) →"; agregar nota) · **Obras asociadas** (Obra | Etapa | Avance | Contratado | Costo real; archivadas a un clic; los importes salen de la obra, acá no se calcula nada propio) · **Contactos** (nombre | rol | mail | teléfono, "sin teléfono" cuando falta) · **Documentos** (últimos, con rol; "sin clasificar" en `warn`).
Aside 320px: **Información** (nombre comercial, razón social, CUIT, IVA, responsable interno, domicilio, carpeta Drive, condición de pago) + archivar.
Permisos: la cartera es de Administración; la ficha se abre en lectura para el nivel Obras (los formularios no se dibujan). Lo contractual (certificaciones, facturación, cobranzas) sólo para quien ve economía, y la ausencia se explica en vez de mostrar una historia recortada.
