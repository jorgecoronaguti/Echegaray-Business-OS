# Administración

Referencia visual: `Echegaray OS - Administración.dc.html` (2a–2i). Nivel 2: Clientes · Usuarios · Personas · Proveedores · Pendientes.

## 2a · Entrada — `/administracion`
No es un menú de tarjetas ni repite la barra: dos columnas. **Maestros** (filas con hairline: nombre + contador tenue + señal de estado a la derecha, ámbar sólo si hay algo que resolver) y **Requiere atención** (lo accionable con su número, rojo sólo si es crítico) + último movimiento. Buscador global de cliente/persona/proveedor arriba a la derecha.

## 2b · Personas — `/administracion/personas`
Una línea: buscar · filtros (Plantel · En obra · Sin asignar · Inactivos) · `Cuadrillas` (navegación discreta) · primaria `+ Nueva persona` (abre panel lateral, no modal).
Tabla: **Persona (con especialidad) | Categoría | Cuadrilla | Obra actual | Alta | Estado**; el filtro Inactivos agrega Baja. Nada de DNI, CUIL, teléfono, retribución ni métricas: no se muestran y tampoco se piden a la base. Categoría fuera de convenio: nota `warn`. Sin asignar y sin cuadrilla se escriben. Estado sale de la pertenencia vigente, no de la fecha.

## 2c · Legajo de persona — `/administracion/personas/<id>`
Ficha de entidad con tabs Resumen · Asignaciones · Horas · Documentos. Bloques: Identidad · Laboral · Asignación actual · Historial · Horas imputadas · Documentos (vínculos a Drive, el archivo no se copia). Vencimientos: `warn` al vencer, `neg` vencido. Retribución y documento sólo en el legajo, nunca en el listado.

## 2i · Cuadrillas — `/administracion/personas/cuadrillas`
Vive DENTRO de Personal. Lista (Cuadrilla | Responsable | Integrantes | Obras derivadas) + panel de la cuadrilla (responsable, obra vigente, HH del período, integrantes con desde/hasta, agregar del plantel, asignar a obra, archivar). Nada se copia: los integrantes son períodos y la obra se deriva de las asignaciones vigentes.

## 2d · Proveedores — `/administracion/proveedores`
Maestro canónico por CUIT. Lista (Proveedor + razón social | CUIT formateado | Estado) ↔ ficha del proveedor (razón social, IVA, contacto, comprado, última compra, condición de pago) con los **nombres de Compras vinculados** a ese CUIT. Sin CUIT en `warn`: no cruza con ARCA ni con el banco. El CUIT se guarda sin guiones; el formato es de la pantalla.

## 2e · Pendientes de imputación — `/administracion/pendientes`
Resumen por fuente (A una obra · Estructura · Pendientes · Sin texto · Total) para no confundir "declarado estructura" con "pendiente". Cola de textos sin resolver ↔ panel de resolución: elegir obra o marcar "es costo de estructura". **No** se propone obra por parecido de nombre: sin evidencia, Sugerido dice que no hay. Resolver escribe una fila del diccionario y vale para todas las filas iguales; nunca en lote.

## 2f · Usuarios — `/administracion/usuarios`
Sólo Dirección y Administración. Tabla: Cuenta (email + persona vinculada) | Nivel | Obras con acceso (chips o "sin obras asignadas") | Último ingreso | Estado. Primaria `+ Invitar usuario`. Asignar una obra acá le abre esa obra en la base: se dice explícitamente. Si falta la clave de servicio, la pantalla explica qué variable falta en vez de quedar en blanco.
