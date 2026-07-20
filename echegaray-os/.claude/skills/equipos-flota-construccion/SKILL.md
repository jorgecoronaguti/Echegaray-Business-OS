---
name: equipos-flota-construccion
description: "Criterio de gestión de equipos, vehículos y herramientas de una constructora: habilitaciones (RTO/VTV, seguro, patente), utilización y asignación por obra, mantenimiento, y costo real por equipo (operación, inmovilización, amortización). Activar ante preguntas sobre estado de la flota, si un vehículo puede circular/operar, costo de un equipo, o decisión de comprar/alquilar/reparar/dar de baja una unidad. Aporta el criterio de decisión; el costo de compra vs. alquiler lo cruza con finanzas-tesoreria-construccion y la compra en sí con compras-abastecimiento-subcontratacion."
allowed-tools: Read, Bash, WebSearch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
---

# Equipos, Vehículos y Flota de Construcción

## Propósito

Aportar el criterio para gestionar los activos físicos móviles de la constructora — vehículos utilitarios, camiones, equipos y herramientas — de modo que estén **habilitados para operar**, **asignados donde generan valor**, **mantenidos antes de que fallen**, y con su **costo real conocido** (no un gasto difuso de "vehículos" que nadie imputa a una obra).

## Alcance

Cubre: habilitaciones legales de circulación y operación (RTO/VTV, seguro, patente/dominio, título), asignación unidad↔obra, plan de mantenimiento preventivo/correctivo, cálculo de costo por equipo (combustible, mantenimiento, seguro, patente, amortización, costo de inmovilización), y el criterio comprar / alquilar / reparar / dar de baja.

## Cableado al OS real — qué LLAMAR en vez de estimar

- **`gasto_proveedores`** — el gasto real en combustible, repuestos, gomería y talleres sale de los comprobantes de ARCA. Ante "¿cuánto gastamos en combustible?" o "¿cuánto nos costó mantener el camión?" **se llama, no se estima**.
- **`obra_costo_real`** (vista, fuente única) — para ver a qué obra se imputa el costo de equipos.
- **Módulo de herramientas del OS** (`/herramientas`, con fotos en Storage) para el inventario de herramienta menor.
- **Gap real**: hoy el costo NO está atribuido por unidad (patente/equipo) sino por proveedor y obra. **No se puede afirmar el costo por vehículo sin ese dato** — decirlo en vez de estimarlo. Cerrar ese gap requiere imputar cada comprobante a una unidad.

## El costo real de un equipo propio (lo que casi nunca se suma completo)

Comparar "alquilar vs. tener" con solo el combustible es cómo se justifican malas compras. El costo horario real de una unidad propia incluye:

- **combustible y lubricantes** (el único que todos cuentan);
- **mantenimiento preventivo + correctivo** (incluidas las roturas que no se planifican);
- **neumáticos** y consumibles de desgaste;
- **seguro, patente, RTO/VTV, habilitaciones**;
- **operador** con cargas sociales (si aplica);
- **amortización** — la unidad se consume aunque no se pague cuota;
- **costo de INMOVILIZACIÓN**: los días que la máquina está parada siguen costando seguro, patente y capital inmovilizado. Una máquina con baja utilización tiene un costo horario altísimo aunque "sea nuestra";
- **traslado entre obras** (a veces mayor que el alquiler de un día).

**La variable que decide es la UTILIZACIÓN**, no el precio de compra: una máquina usada pocos días al año casi siempre conviene alquilada.

## Comprar, alquilar, reparar o dar de baja

Aplicar el marco de inversiones del CLAUDE.md raíz, con las preguntas propias del rubro:

- **¿Cuántos días/año se va a usar realmente?** (no el uso deseado: el histórico).
- **¿Elimina una restricción real** o solo evita una molestia?
- **Alquilar** cubre picos y evita inmovilizar capital de trabajo — que en una constructora es lo más escaso (cruzar con `finanzas-tesoreria-construccion`).
- **Leasing**: no inmoviliza capital propio y tiene tratamiento fiscal propio (cruzar con `impuestos-construccion`).
- **Reparar vs. reemplazar**: si la reparación supera un porcentaje relevante del valor de la unidad, o si las roturas son recurrentes, la reparación está financiando una baja diferida. Mirar el **historial de fallas**, no la última rotura.
- **Dar de baja**: una unidad inhabilitada (RTO/seguro vencido) que no puede operar sigue costando. O se regulariza o se vende.

## Habilitaciones: sin papeles la unidad no puede facturar

- **RTO/VTV, seguro vigente, patente al día** y documentación del conductor: sin eso la unidad **no debe salir a obra**. Un siniestro con habilitación vencida puede dejar sin cobertura y la responsabilidad recae sobre la empresa.
- En **planta de cliente industrial** (caso ARCOR) suele exigirse además documentación propia del equipo y del operador para poder ingresar — es requisito comercial, no solo legal (cruzar con `seguridad-higiene-art`).
- El vencimiento de una habilitación es **fecha conocida**: debe estar en el calendario con alerta, no descubrirse en un control.

No cubre: la decisión financiera de la inversión en sí (`finanzas-tesoreria-construccion` — payback, capital de trabajo), la compra/contratación del proveedor (`compras-abastecimiento-subcontratacion`), ni el tratamiento contable/fiscal de la amortización (`contabilidad-constructoras`, `impuestos-construccion`). Esta skill decide *qué conviene* con la flota; esas deciden *cómo se paga, compra y registra*.

## Preguntas profesionales que debe hacer

- ¿Esta unidad está **habilitada para circular hoy**? (RTO/VTV vigente, seguro al día, patente al día). Una RTO vencida = la unidad no debe circular, riesgo legal y de siniestro sin cobertura.
- ¿**Qué equipo está en qué obra** y desde cuándo? Sin asignación unidad↔obra no se puede imputar su costo ni saber si una unidad está inmovilizada.
- ¿Cuánto **cuesta realmente** esta unidad por mes (operativa) y cuánto cuesta **parada** (inmovilización: seguro + patente + amortización sin producir)?
- ¿El costo de reparar supera el valor residual o el costo de alquilar una equivalente? (umbral de baja).
- ¿La unidad **produce** lo suficiente para justificar tenerla, o convendría alquilar por obra?

## Marcos de análisis

### 1. Habilitación para operar (semáforo por unidad)
Por cada unidad, verificar y clasificar HECHO / VENCIDO / DESCONOCIDO:
- **RTO/VTV** (Revisión Técnica Obligatoria): vigencia por fecha. En San Juan la RTO es provincial; verificar el organismo y la periodicidad vigentes antes de afirmar un vencimiento. Un "último RTO de marzo" sin renovación posterior es **INFERENCIA de vencimiento**, no un hecho — hay que confirmarlo.
- **Seguro**: póliza vigente, cobertura y vencimiento. Una unidad sin póliza archivada NO implica sin seguro (puede estar en otra fuente) — declararlo como DESCONOCIDO, no como descubierto.
- **Patente/dominio y título**: dominio correcto, deuda de patente, titularidad.
Regla: nunca afirmar "puede circular" sin las tres verificadas; nunca afirmar "no puede" por ausencia de un papel en Drive (ausencia de evidencia ≠ evidencia de ausencia).

### 2. Asignación y utilización
- Mantener un registro **unidad ↔ obra ↔ período** (mínimo: unidad, patente, obra, fecha inicio/fin de asignación). Es el dato que hoy suele faltar y sin el cual el costo de flota queda sin imputar.
- **Utilización**: una unidad asignada pero sin actividad de obra es inmovilización con costo. Cruzar con el avance real de la obra.

### 3. Costo real por equipo
Costo mensual = combustible + mantenimiento (prorrateado) + seguro + patente + amortización. Distinguir:
- **Costo operativo** (cuando produce en una obra → imputable a esa obra).
- **Costo de inmovilización** (cuando está parada → costo de estructura, no de obra: seguro + patente + amortización que corren igual).
Sin discriminar seguro/patente por unidad (suelen estar en "Gastos Fijos" agregados) no se puede calcular. Recomendar la discriminación como paso previo.

### 4. Comprar / alquilar / reparar / dar de baja
- **Alquilar** si el uso es esporádico o por una obra puntual (evita inmovilización).
- **Comprar** si la utilización sostenida lo justifica y hay caja (la decisión de inversión la valida `finanzas-tesoreria-construccion`).
- **Reparar vs. baja**: si el costo de reparación se acerca al valor residual o al costo de reemplazo/alquiler equivalente, evaluar baja.

## Política de fuentes y vigencia

- La **RTO/VTV y su periodicidad** son normativa provincial (San Juan) cambiante: **verificar en la sesión** el organismo, la vigencia y el intervalo antes de afirmarlos. Es el punto de mayor riesgo de desactualización de esta skill.
- El **inventario real** de la flota vive en Drive (carpeta VEHICULOS, una subcarpeta por unidad con RTO/seguro/título) y, estructurado, en la tabla `equipos` del OS. La verdad de "qué hay" es Drive; el OS es índice.
- Clasificá siempre HECHO (papel leído) / INFERENCIA (deducido de una fecha) / DESCONOCIDO (no está en ninguna fuente vista).

## Interacción con otras skills

- `finanzas-tesoreria-construccion`: la decisión de invertir en una unidad (comprar vs. alquilar, payback, impacto en caja) es suya; esta skill le entrega el costo y la utilización real.
- `compras-abastecimiento-subcontratacion`: la compra o el alquiler en sí (proveedor, condiciones) lo decide esa skill.
- `contabilidad-constructoras` / `impuestos-construccion`: amortización contable y tratamiento fiscal del activo.
- `planificacion-produccion` / `direccion-obra`: qué obra necesita qué equipo y cuándo (demanda de flota).
- `seguridad-higiene-art`: habilitación del operador y del equipo para tareas de riesgo; esta skill sólo cubre la habilitación vehicular/registral.

## Límites de certeza

- La **vigencia de RTO/VTV y su periodicidad** (San Juan) es normativa cambiante: se verifica en la sesión, nunca se afirma de memoria.
- Un vencimiento deducido de "último papel de fecha X" es **INFERENCIA**, no HECHO — se declara como tal.
- La **ausencia de un documento en Drive** (póliza, RTO) no prueba que la unidad no lo tenga: es DESCONOCIDO, no descubierto.
- Sin registro unidad↔obra y sin seguro/patente discriminados por unidad, el costo por equipo es **estimación**, no dato.

## Prohibido

- Afirmar que una unidad "puede circular/operar" sin las tres habilitaciones (RTO/VTV, seguro, patente) verificadas.
- Afirmar que una unidad está "sin seguro/sin RTO" por ausencia de un archivo (ausencia de evidencia ≠ evidencia de ausencia).
- Ejecutar cualquier baja, venta, transferencia, renovación ante organismo o reasignación formal con efecto en costo de obra: es Nivel E, va a aprobación.
- Inventar un costo mensual o una amortización sin la base real (seguro/patente/combustible por unidad).

## Nivel de autonomía

Análisis, diagnóstico y recomendación (A–C). Toda acción con efecto externo — dar de baja/vender/transferir una unidad, gestionar una renovación de RTO ante el organismo, reasignar formalmente una unidad a una obra con efecto en su costo — es **Nivel E**: se registra como solicitud de aprobación, no se ejecuta.

## Contribución a la misión

Evita dos pérdidas concretas: (1) una unidad circulando con habilitación vencida (riesgo legal + siniestro sin cobertura), y (2) costo de flota que nadie imputa a una obra ni controla como inmovilización. Convierte "vehículos" de un gasto difuso en un activo con costo, habilitación y utilización conocidos — insumo directo para el margen real de cada obra.
