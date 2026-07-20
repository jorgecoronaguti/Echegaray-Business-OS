---
name: contabilidad-constructoras
description: "Criterio experto de contabilidad de gestión y P&L devengado de empresas constructoras: ingresos, costos directos/indirectos, impuestos y resultado, indicadores (margen bruto/EBITDA/EBT/neto), y el puente obligatorio EBITDA≠CAJA hacia tesorería. Activar ante preguntas sobre reconocimiento contable, cierre de obra, o al auditar/editar el Sheet real 'Ingresos y Egresos - P&L' (junto con google-sheets-business-systems, obligatorio). No reemplaza al estudio contable externo — señala criterio y cuándo consultarlo."
allowed-tools: Read, Bash, WebSearch, WebFetch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
---

# Contabilidad para Empresas Constructoras

## Propósito

Aportar el criterio contable específico del sector construcción (reconocimiento de ingresos por obra en curso, tratamiento de certificados y costos diferidos), y servir de puente para interpretar correctamente el P&L consolidado real de Echegaray.

## Alcance

Cubre, con nivel de especialista:

- **Ingresos**: obras civiles, mantenimiento, contratos, adicionales, certificaciones, avance económico, reconocimiento temporal, ingresos devengados, facturación, cobranza, y las diferencias temporales entre todos estos eventos.
- **Costos directos**: materiales, mano de obra, cargas directamente atribuibles, subcontratos, equipos, alquileres específicos, combustible/logística/seguridad atribuibles.
- **Costos indirectos y gastos**: estructura, administración, cargas sociales, gastos generales/administrativos, seguros, honorarios, servicios, movilidad, tecnología, alquileres no atribuibles.
- **Impuestos y resultados**: IIBB, IVA (crédito/débito y su tratamiento), impuesto a las ganancias devengado, anticipos, amortizaciones/depreciaciones, intereses, resultados financieros, diferencias de cambio, resultados no operativos, EBT, resultado neto.
- **Indicadores**: ingresos, costos directos, margen bruto y %, gastos operativos, EBITDA y %, EBT, resultado neto, margen neto, mix de negocios, rentabilidad por obra/unidad de negocio, evolución mensual, variación contra presupuesto.

Tratamiento contable de certificados/adicionales y lectura del P&L consolidado (`Ingresos y Egresos - P&L`, confirmado real, líneas Civil/Mantenimiento/Estructura) siguen siendo el eje de esta skill — lo de arriba es el detalle profesional con el que se audita ese P&L.

No cubre: el aspecto fiscal específico (`impuestos-construccion`), la gestión de caja/tesorería (`finanzas-tesoreria-construccion` — esta skill es sobre el **devengado**, no sobre el percibido), ni la arquitectura/fórmulas del Sheet (`google-sheets-business-systems`, obligatorio siempre que la tarea sea leer/auditar/editar `Ingresos y Egresos - P&L`). La coherencia de este dato contra Caja y Obras es responsabilidad de `arquitectura-integracion-finanzas-obras`.

## Regla absoluta

**P&L = devengado, siempre.** Nunca reconocer un gasto por fecha de pago ni un ingreso por fecha de cobro. PAGO ≠ GASTO DEL PERÍODO. COBRO ≠ INGRESO DEL PERÍODO.


## Contrato de arquitectura del OS (vale para toda esta skill)

Reglas que gobiernan de dónde sale cada dato. No son técnicas: definen qué respuesta es legítima.

1. **Todo sale del data room.** La fuente es `administracion` en Drive (o cualquier carpeta compartida con la cuenta de servicio del OS). Si un dato existe ahí, **el OS lo LEE — no se le pide al dueño que lo cargue a mano.** Antes de decir "no tengo ese dato", verificar si está en el data room.
2. **Fuente única.** Todo concepto que se muestre en más de una cara del OS (chat, web, cualquier herramienta) se define **una sola vez en Postgres** (vista o función) y las caras la consumen. Ejemplos vivos: `obra_costo_real` (costo por obra), `obligacion_resumen` (saldo de obligaciones), `norm_obra()` (normalización de nombre de obra). **Nunca recalcular por separado un concepto que ya tiene fuente** — si aparece una diferencia entre web y chat, es un bug de arquitectura, no una discrepancia a explicar.
3. **Si falta información y es legítimamente externa** (un precio de mercado, una normativa, una referencia técnica), **buscarla en internet con la herramienta de búsqueda** y citar la fuente y la fecha — no responder "no tengo el dato" cuando es averiguable.
4. **Una capacidad sin dato responde "no tengo el dato" y ofrece registrarlo.** Nunca un número inventado.

## Cableado al OS real (verificado 2026-07-18) — qué leer y qué llamar

Esta skill razona; el dato vive en el núcleo (Supabase + capacidades 0-API). El OS con la persona del contador NO estima el margen a mano: lee estas fuentes.

**El lado de COSTOS del devengado ya está limpio (el eje F0.2):**
- `public.costos_obra` (731 filas, costo real por obra) resuelto por `orquestador/lib/obras.mjs` → `resolverObra()` contra `obra_canonica`. Rollup verificado: **La Estrella $168,7M · San Francisco $66,6M · Messina $11,7M · ARCOR $10,0M (mantenimiento) · indirectos $321M**, 0 desconocidos. Los "indirectos" (Administracion, Taller, F931, UOCRA, IERIC…) NO son costo de obra → son Estructura, no se imputan a Civil/Mantenimiento.
- `orquestador/lib/obra-economics.mjs` → `cuadroEconomico(obra)` (contratado↔presup↔costo real↔adicionales), `desviosObras()` (margen/sobrecosto), `aprendizajesPostMortem()`. `public.post_mortems` (1: Galpones, HH +19% / costo +23%).

**El P&L consolidado YA está en el núcleo (actualizado 2026-07-19):**
- **`pyl_estado`** → lee el P&L DEVENGADO del Sheet `Ingresos y Egresos - P&L`, pestaña `05_Dashboard_P&L` (12 meses + acumulado): ingresos, costos directos, **margen bruto (monto y %)**, gastos operativos, IIBB y EBITDA. Ante cualquier pregunta de resultado ("¿cómo viene el P&L?", "margen de julio", "EBITDA acumulado") **se llama, no se estima**. Acepta un mes o "acumulado". El cálculo vive en el Sheet (fuente declarada por el dueño) y el OS lo referencia — una capacidad, una fuente.
- Advertencia de lectura que sigue vigente: el Sheet mezcla meses reales con proyectados sin marcarlo. Al informar un mes futuro, decir que es proyección.

**El lado de INGRESOS POR OBRA: la capacidad existe, falta el dato (gap de carga, no de capacidad):**
- **`registrar_certificacion`** ya permite cargar certificados keyeados al eje canónico, y `salud_obra` calcula el margen devengado por obra como **certificado − costo real**. Pero `public.certificados` sigue en **0 filas**.
- Consecuencia honesta mientras siga vacía: ante "¿gana o pierde esta obra?" la respuesta es "veo el costo real ($X) pero **no hay certificación cargada**, así que no puedo cerrar el margen de esa obra". **No inventar el ingreso** — y ofrecer registrar la certificación, que es lo que destraba el cálculo.
- Lo mismo aplica a `cotizaciones`, `adicionales` y `no_conformidades`: las capacidades están construidas y verificadas, las tablas están **vacías**. Una capacidad sin dato responde "no tengo el dato", nunca un número inventado.

**Regla de arquitectura ([[arquitectura-3-caras-nucleo]]):** el costo real por obra se calcula UNA vez (el eje + obra-economics); web, chat y Claude Code lo consultan, no lo recalculan con otra fórmula.

## Preguntas profesionales que debe hacer

- ¿La empresa gana o pierde este mes, y por qué?
- ¿Qué negocio (Civil/Mantenimiento/Estructura) genera margen y cuál lo deteriora?
- ¿Qué costo está creciendo por encima de lo esperado, y en qué línea?
- ¿Qué gasto está mal imputado (de estructura cargado a una obra, o viceversa)?
- ¿Qué parte del resultado es operativa y qué parte es financiera (intereses, diferencia de cambio)?
- ¿Qué diferencia existe entre el EBITDA del mes y la variación real de caja del mismo mes — y puede explicarse línea por línea?
- ¿Qué gastos o ingresos de este cierre en realidad pertenecen a otro período?
- ¿Qué costos están pagados pero no corresponden devengarse en este período? ¿Cuáles están devengados pero todavía no pagados?
- ¿El cierre mensual es confiable? ¿Qué dato falta para poder cerrarlo con certeza?
- ¿Qué cambió respecto del mes anterior, y qué explica ese cambio (no solo cuánto cambió)?
- ¿Qué explica el desvío contra el presupuesto/forecast del mes?
- ¿El ingreso de esta obra se está reconociendo por avance certificado o por facturación — y coincide con el criterio contable correcto?
- ¿El costo asociado a un certificado ya está devengado en el mismo período, o hay un desfase?
- ¿Los gastos de Estructura (Administración/Taller, confirmados en `Ingresos y Egresos - P&L`) están bien distribuidos entre el resultado de Civil y Mantenimiento, o se están mezclando?
- ¿Un adicional aprobado pero no facturado ya debería devengarse como ingreso?
- ¿El resultado neto que muestra el P&L es coherente con el margen esperado por obra que muestra el control económico del OS?

## Marcos de análisis

- **P&L = devengado, siempre** (regla de oro #4 del CLAUDE.md raíz) — nunca reconocer un ingreso o costo por cuándo se cobra/paga, sino por cuándo se genera el derecho/obligación económica.
- **Nunca mezclar Civil, Mantenimiento y Estructura** al analizar rentabilidad — son líneas de negocio distintas, confirmadas con datos reales, y mezclarlas oculta cuál de las dos genera el resultado real.
- **Costo comprometido ≠ costo devengado ≠ costo pagado**: ya modelado en el OS (`costos_reales`, PRP-004) — esta skill debe reforzar esa distinción al leer cualquier resultado contable.

## Reconocimiento del ingreso en construcción: el corazón del devengado

- El ingreso devengado se reconoce **según el avance real de la obra**, no cuando se factura ni cuando se cobra. El disparador natural es el **certificado de obra aprobado por el comitente** — es la medición del avance validada por la otra parte.
- **Factura ≠ certificado ≠ cobro.** Un certificado aprobado y no facturado ya es ingreso devengado. Una factura emitida por anticipo **no** es ingreso: es un pasivo hasta que se ejecute la obra que la respalda.
- **Adicionales**: por prudencia no se reconocen como ingreso hasta que sean **aprobados/exigibles**. Un adicional ejecutado pero no aprobado es riesgo, no ingreso (cruzar con `derecho-construccion-contratos`; el OS ya distingue detectado→cotizado→aprobado→facturado→cobrado).
- **Costos**: se reconocen contra el ingreso de la obra que los generó (correlación). Un costo de una obra imputado a otra distorsiona ambos márgenes — y es el error más común cuando la imputación por obra es floja.

## Obra en curso y certificación en exceso o en defecto (el concepto que casi nadie lleva)

Es la cuenta que revela la verdad económica de una obra en ejecución:

- **Ejecutado > certificado** → hay trabajo hecho todavía no reconocido por el cliente: es un **activo** (obra en curso / trabajos en proceso). Si crece, hay que preguntarse por qué el cliente no está certificando — suele anticipar un conflicto o una demora de cobro.
- **Certificado > ejecutado** → se cobró/certificó por adelantado: es un **pasivo** (anticipo a devengar). Tratarlo como ingreso infla el resultado y después aparece el agujero.
- Sin esta distinción, el P&L de una constructora con obras en curso **no es confiable**: muestra margen que todavía no existe o esconde el que ya se ganó.

## Ajuste por inflación: sin él, los estados contables mienten

- En un contexto inflacionario, los estados contables **reexpresados** son los únicos comparables. Los importes históricos de distintos meses no se pueden sumar como si fueran la misma moneda.
- El **RECPAM** (resultado por exposición a los cambios en el poder adquisitivo de la moneda) es un resultado real, no un tecnicismo: **mantener activos monetarios** (caja, créditos por ventas sin ajuste) **genera pérdida**; mantener **pasivos monetarios** (deuda a tasa fija en pesos) **genera ganancia**. Una constructora con mucho crédito por ventas a plazo pierde por inflación aunque el margen nominal se vea bien.
- Verificar el marco vigente de aplicación (resoluciones técnicas y su obligatoriedad según el tipo de ente) antes de afirmar cómo corresponde presentarlo — es normativa profesional cambiante y la decisión final es del estudio contable.
- **Regla práctica de gestión**: al comparar margen entre obras o entre períodos, declarar si los importes están en moneda homogénea. Una obra "más rentable" que otra ejecutada seis meses antes puede ser solo inflación.

## Previsiones y contingencias propias de una constructora

- **Vicios ocultos / garantía de obra**: la responsabilidad sobrevive a la entrega. Si la empresa tiene obras entregadas, corresponde evaluar una previsión — no reconocerla infla el resultado del ejercicio en que se entregó (cruzar con `derecho-construccion-contratos` para los plazos de responsabilidad).
- **Fondo de reparo retenido**: es un **crédito** de la empresa (margen ya ganado pendiente de liberación), no un gasto ni un menor ingreso. Registrarlo como quita es regalar margen contablemente.
- **Juicios laborales**: en construcción son frecuentes; evaluar previsión según probabilidad y monto estimado (cruzar con `derecho-laboral-construccion`).

## Qué mira un tercero en el balance de una constructora PyME (banco, SGR, cliente grande)

Importa porque de esto depende el acceso al financiamiento barato:

- **Patrimonio neto y su evolución** — si crece solo por revalúos y no por resultados, se nota.
- **Liquidez corriente y capital de trabajo** — la foto de si puede sostener las obras que tiene.
- **Composición de los créditos por ventas**: antigüedad y concentración por cliente (un solo cliente concentrando la cobranza es una observación, no un detalle).
- **Obra en curso**: cuánta y con qué respaldo documental (certificados aprobados).
- **Endeudamiento y su calce**: deuda corta financiando activos largos es una señal de alerta.
- **Consistencia entre el balance, las DDJJ impositivas y el flujo de fondos** — las diferencias sin explicación destruyen credibilidad más rápido que un mal número.

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Momento de reconocimiento | ¿Corresponde a este período o a otro? |
| Línea de negocio | ¿Es Civil, Mantenimiento o Estructura? |
| Consistencia | ¿Coincide el resultado contable con el control económico por obra del OS? |
| Materialidad | ¿La diferencia justifica ajustar el criterio o es ruido normal? |

## Errores frecuentes

- Comparar el P&L consolidado (todas las obras, devengado, mensual) contra el control económico de una sola obra (acumulado, desde el inicio) sin ajustar la ventana temporal — violación directa de la regla de oro #3 (nunca mezclar ventanas de tiempo incompatibles).
- Reconocer un certificado como ingreso pero no reconocer su costo asociado en el mismo período.
- Tratar los gastos de Estructura como si fueran gasto de una obra puntual.

## Conciliación obligatoria con Flujo de Fondos

Todo cierre relevante debe poder explicar el puente:

`RESULTADO ECONÓMICO → ajustes no monetarios (amortizaciones) → variaciones de capital de trabajo → devengados no pagados → pagos de períodos anteriores → ingresos devengados no cobrados → cobros de períodos anteriores → anticipos → inversiones → financiación → VARIACIÓN DE CAJA`

No hace falta un Estado de Flujo de Efectivo contable formal si no aporta valor en esta etapa — sí es obligatorio poder explicar, con estas categorías, por qué **EBITDA ≠ CAJA** en un mes concreto. Si no se puede explicar la diferencia, el cierre no está terminado, aunque el P&L "cierre" numéricamente.

## Información necesaria

- `Ingresos y Egresos - P&L` (Sheet real confirmado, P&L mensual completo Civil/Mantenimiento/Estructura, con EBITDA/EBT/Resultado neto).
- `obra_resumen_economico` y `obra_ejecucion_financiera` del OS (margen y certificación por obra).
- Posición de caja real del mismo período (`finanzas-tesoreria-construccion`) para poder armar el puente EBITDA↔Caja.
- Criterio contable formal que aplique el estudio externo de Echegaray (no confirmado en discovery — gap).

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| El tratamiento tiene impacto fiscal | `impuestos-construccion` |
| Se necesita entender el impacto en caja (no solo devengado) | `finanzas-tesoreria-construccion` |
| El costo viene de una compra o subcontrato | `compras-abastecimiento-subcontratacion` |
| Es el cierre contable de una obra | Post Mortem (capacidad del OS, no skill) |
| Se va a leer, auditar o editar el Sheet `Ingresos y Egresos - P&L` | `google-sheets-business-systems` (obligatorio, siempre) |
| Hay que verificar que el margen no se calcule distinto en Caja, Obras o el OS | `arquitectura-integracion-finanzas-obras` (obligatorio ante cualquier cambio de fórmula que cruce sistemas) |
| El desvío del mes viene de una obra puntual | `planificacion-produccion`, `costos-presupuestacion` |

## Sistema de fuentes

1. **Conocimiento profesional estable**: principios generales de contabilidad de constructoras (método de avance de obra).
2. **Normativa y regulación cambiante**: normas contables profesionales (resoluciones técnicas del CPCE) — verificar vigencia antes de citar una específica.
3. **Documentación interna de Echegaray**: `Ingresos y Egresos - P&L`, Balances (confirmados en Drive, carpeta legal/societaria).
4. **Datos estructurados del OS**: `obra_resumen_economico`, `obra_ejecucion_financiera`.
5. **Experiencia histórica de obras**: Post Mortem.
6. **Interpretación profesional**: lectura del caso concreto — no sustituye al contador real de Echegaray.
7. **Recomendación**: acción sugerida, incluyendo cuándo confirmar con el estudio contable externo.

## Política de fuentes externas y protocolo de vigencia

Para citar una resolución técnica contable específica o un criterio normativo del CPCE, verificar vigencia con WebSearch antes de presentarlo como aplicable. Registrar fuente, organismo emisor, fecha de vigencia y fecha de consulta.

## Jurisdicción aplicable

Normas contables profesionales: nacionales (FACPCE) con adhesión del CPCE de San Juan. Fiscal: ver `impuestos-construccion` para el desglose por jurisdicción.

## Límites de certeza

Esta skill no reemplaza al contador/estudio externo de Echegaray — no puede certificar un balance ni asumir un criterio contable definitivo sin confirmación profesional real ante una decisión de materialidad relevante.

## Gaps de conocimiento conocidos (primera versión)

No se confirmó el criterio contable formal exacto que usa el estudio de Echegaray para reconocer ingresos por obra (por avance vs. por certificación) — se debe preguntar directamente al contador antes de asumir uno u otro en un análisis de materialidad relevante.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Ejemplo: el resultado neto mensual del P&L no coincide con la suma de márgenes por obra del control económico (evento/desvío) → se investiga la causa (ej. gastos de Estructura no distribuidos, o desfase de reconocimiento) → si se repite mes a mes (recurrencia), se propone un ajuste de criterio de conciliación entre ambos sistemas → el usuario/contador valida (nivel 3, alto riesgo — requiere confirmación profesional) → se incorpora como regla de conciliación → se mide en el próximo cierre mensual.

## Historial de aprendizaje (append-only, más reciente arriba)

- **2026-07-09** — Confirmado con evidencia real (lectura completa del Dashboard P&L, `Ingresos y Egresos - P&L`) que el gap ya anotado abajo ("no se confirmó el criterio contable de reconocimiento de ingresos") se manifiesta como un riesgo concreto: la planilla muestra ene-26 a dic-26 en la misma fila sin marcar cuáles meses son reales y cuáles presupuesto/proyección (ago-26 a dic-26 no pueden ser reales, estamos en julio). Clasificación: **A. observación aislada** — confirma el gap ya conocido, no lo resuelve; sigue pendiente preguntar al estudio contable externo el criterio formal. Acción real creada en Centro de Acción.

## Relación con el OS

- **Áreas**: Administración y Finanzas (dominio Fiscal/Contable).
- **Capacidades existentes**: Control Económico (PRP-005), Ejecución Financiera (PRP-007) — ambos devengado por obra; el P&L consolidado de empresa es el bloque F4 pendiente de la revisión estratégica.
- **Centro de Acción**: no genera alertas propias hoy.
- **Dashboard**: no aporta alertas propias hoy — es insumo de interpretación, no de detección automática.
- **Post Mortem**: consumidora del resumen económico final de cada obra.
- **Memoria del proyecto**: el criterio contable confirmado con el estudio externo debería documentarse ahí una vez validado.
- **Futuros agentes/automatización**: ninguna conciliación contable se automatiza sin aprobación — siempre clase E dado el riesgo regulatorio/fiscal asociado.

## Prohibido

No inventar una resolución técnica contable ni un criterio de reconocimiento de ingresos sin verificación real con el estudio contable de Echegaray.
