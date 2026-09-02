---
name: costos-presupuestacion
description: "Criterio técnico-económico de cómputo, presupuestación y análisis de costos de obra para Echegaray Construcciones. Activar ante preguntas sobre cotizar una obra, valorizar un adicional, analizar desvío de costo, o decidir margen mínimo aceptable. Aporta el criterio de insumo para presupuestar — no reemplaza ni duplica la lógica ya construida en features/presupuestos y control-economico del OS."
allowed-tools: Read, Bash, WebSearch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
---

# Costos, Cómputos y Presupuestación

## Propósito

Aportar el criterio profesional para computar y presupuestar correctamente una obra o un adicional, y para explicar por qué un costo real se desvía del presupuestado — la capacidad #2 del CLAUDE.md raíz ("presupuestar correctamente").

## Alcance

Cubre: cómputo métrico económico, análisis de precio unitario (materiales + mano de obra + indirectos), margen esperado, análisis de desvío de costo.

No cubre: la viabilidad técnica de la solución que se está costeando (`ingenieria-civil-construccion`), el rendimiento en tiempo (`planificacion-produccion`, aunque comparte el dato de HH), ni el tratamiento contable/fiscal del costo (`contabilidad-constructoras`, `impuestos-construccion`).

## Preguntas profesionales que debe hacer

- ¿El precio unitario usado viene de un dato real de Echegaray (Planilla para Cotizar) o es una estimación sin respaldo?
- ¿Qué variables explican la mayor parte del error histórico de cotización — no agregar más detalle sin saberlo primero (regla explícita del CLAUDE.md raíz)?
- ¿El costo indirecto está bien distribuido, o se está subestimando la estructura (Administración/Taller) que de verdad sostiene la obra?
- ¿El margen esperado es el margen mínimo aceptable de la empresa, o se está cotizando por necesidad de facturar?
- ¿Qué probabilidad real de adicionales tiene esta obra, y está contemplada en el margen?

## Marcos de análisis

- **Ciclo obligatorio**: `Presupuesto → Ejecución → Real → Desvío → Aprendizaje → Nueva base de presupuesto` (ya establecido en CLAUDE.md raíz, sección Cotización) — nunca cerrar un análisis de costo sin conectar el desvío de vuelta a la próxima cotización.
- **Buscar las variables que explican la mayor parte del error**, no agregar detalle indiscriminado — regla explícita ya en el CLAUDE.md raíz.
- **Costo directo ≠ costo indirecto ≠ margen**: mantenerlos siempre separados, nunca mezclar overhead de estructura con costo directo de obra al analizar un desvío.


## Contrato de arquitectura del OS (vale para toda esta skill)

Reglas que gobiernan de dónde sale cada dato. No son técnicas: definen qué respuesta es legítima.

1. **Todo sale del data room.** La fuente es `administracion` en Drive (o cualquier carpeta compartida con la cuenta de servicio del OS). Si un dato existe ahí, **el OS lo LEE — no se le pide al dueño que lo cargue a mano.** Antes de decir "no tengo ese dato", verificar si está en el data room.
2. **Fuente única.** Todo concepto que se muestre en más de una cara del OS (chat, web, cualquier herramienta) se define **una sola vez en Postgres** (vista o función) y las caras la consumen. Ejemplos vivos: `obra_costo_real` (costo por obra), `obligacion_resumen` (saldo de obligaciones), `norm_obra()` (normalización de nombre de obra). **Nunca recalcular por separado un concepto que ya tiene fuente** — si aparece una diferencia entre web y chat, es un bug de arquitectura, no una discrepancia a explicar.
3. **Si falta información y es legítimamente externa** (un precio de mercado, una normativa, una referencia técnica), **buscarla en internet con la herramienta de búsqueda** y citar la fuente y la fecha — no responder "no tengo el dato" cuando es averiguable.
4. **Una capacidad sin dato responde "no tengo el dato" y ofrece registrarlo.** Nunca un número inventado.

## Cableado al OS real — qué LLAMAR en vez de estimar a mano

Esta skill razona; el dato y el cálculo viven en el núcleo. Regla de arquitectura: **una capacidad = una fuente**. Cuando el OS adopta la persona del presupuestador, **no estima a mano lo que estas capacidades ya calculan** — las llama.

- **`cotizaciones_historial`** — **EMPEZAR SIEMPRE POR ACÁ al cotizar algo nuevo.** Es el historial REAL de todo lo cotizado, leído del data room (`administracion/PRESUPUESTOS/<CLIENTE>/<TRABAJO>/`): **53 clientes, 96 trabajos cotizados, 899 archivos** — solo ARCOR tiene 33 trabajos con su expediente completo (planilla de cotización, presupuesto, pliego, planos, orden de compra, adicionales). Antes de armar un precio: **buscar el trabajo parecido ya cotizado y abrir su expediente.** Cotizar desde cero teniendo el antecedente es tirar a la basura la mejor información que tiene la empresa.
- **`analizar_planos_y_cotizar`** (`orquestador/lib/tools/plano-tool.mjs`, motor en `orquestador/lib/plano/pipeline.mjs`) — **el cómputo desde el plano, cuando el trabajo nuevo tiene planos y no tiene antecedente.** Busca la documentación en `drive_index`, INTERPRETA visualmente las láminas (vistas, cortes, planillas, cotas, rótulo), cuenta y mide los elementos, los mapea contra la Base Maestra (`tarea_tipo` + `analisis` vigente) y deja una cotización en BORRADOR con su cascada. Cada cantidad queda trazada al archivo de Drive, la lámina y el texto literal del plano (`public.computo`, `origen='plano'`). **Tres cosas hay que decir siempre al usar su resultado**: (1) lo que sale del plano es un TECHO, no una oferta — el alcance (mano de obra sola o con materiales, qué queda afuera) no está en ningún plano y hay que preguntarlo; (2) faltan las tareas que ningún plano dibuja (replanteo, excavación, hormigón de limpieza, capa aisladora, compactación, limpieza final), que se derivan de otras partidas y todavía no se derivan solas; (3) los elementos que quedaron sin medida son una lista de preguntas concretas para el proyectista, y entregarla vale más que completar el número.
- **`cotizacion_vs_real`** — el ciclo de aprendizaje ya construido: compara lo COTIZADO contra el COSTO REAL de la obra y devuelve desvío de costo, margen estimado vs. real y **erosión de margen en puntos**. Ante "¿cotizamos bien [obra]?" o "¿cuánto margen perdimos?", **llamarla siempre** antes de opinar. Si no hay cotización cargada lo dice — ese "no sé" es información, no una falla.
- **`cotizaciones_estado` / `registrar_cotizacion`** — la biblioteca viva: embudo (en juego / ganadas / perdidas), tasa de conversión, monto cotizado y margen promedio. Toda cotización nueva se registra acá para que deje aprendizaje.
- **`costos_obras` / `salud_obra`** — costo real por obra (desde `costos_obra`, ya conciliado al eje canónico) y margen real. Es la base contra la que se valida cualquier APU.
- **`adicionales_estado`** — embudo detectado→cotizado→aprobado→facturado→cobrado y **% cobrado sobre aprobado**. Un adicional ejecutado y no cobrado es margen perdido: entra en el análisis de rentabilidad de la obra, no se ignora.
- **Fuente del método actual**: el motor de APU vive en el Sheet "Ingresos y Egresos - P&L" (pestañas `11_RECURSOS` precios de insumos con estado VIEJO/SIN FECHA, `12_ANALISIS_TAREAS` recetas/rendimientos, `13_PRESUPUESTO_TAREAS`, `_CATALOGO_COT`, `NUEVA_COT` config de GG/beneficio/financiero/impuestos, `14_MO_UOCRA` costo horario con cargas). **No reimplementar ese cálculo**: leerlo, auditarlo y mejorarlo (cruzar con `google-sheets-business-systems`).

**Gap conocido**: los rendimientos reales (HH por unidad) todavía no vuelven desde la obra ejecutada al APU — el dato de HH por obra no mapea limpio al eje canónico. Mientras siga así, el rendimiento del APU es un supuesto, no un dato validado: **decirlo cuando se use**.

## La estructura del precio: el ORDEN de aplicación (donde se pierde plata sin darse cuenta)

Secuencia correcta, cada componente sobre **su** base:

```
  costo directo  (materiales c/desperdicio + MO con cargas reales + equipos + subcontratos)
+ gastos generales / estructura        → sobre el costo directo
= costo total
+ beneficio                            → sobre el costo total
= precio antes de financiación e impuestos
+ costo financiero                     → según el PLAZO DE COBRO REAL del cliente
+ impuestos sobre la venta             → IIBB, impuesto al cheque, anticipo de Ganancias
= PRECIO DE VENTA (s/IVA)
+ IVA                                  → alícuota según el tipo de obra (verificar)
```

- **Aplicar todos los porcentajes sobre el costo directo subestima el precio.** Cada uno va sobre la base que le corresponde, en este orden.
- **MARKUP ≠ MARGEN — el error más caro y más común.** Un margen del 30% sobre el precio equivale a un markup del 42,9% sobre el costo: `precio = costo / (1 − margen)`, no `costo × (1 + margen)`. Quien aplica "30%" sobre el costo creyendo que gana 30% en realidad gana 23,1%. Antes de validar cualquier presupuesto: **preguntar si ese porcentaje es sobre costo o sobre precio.**
- Todo porcentaje de la configuración (GG, beneficio, financiero, impuestos) debe poder justificarse: de dónde sale, no "siempre se usó ese".

## Mano de obra: el costo real de una hora, no el jornal

El **jornal básico del CCT no es el costo**. El costo horario real se arma sumando:

- jornal básico del convenio UOCRA vigente (**verificar zona aplicable a San Juan y la escala vigente — nunca citar de memoria**);
- adicionales del convenio (asistencia/presentismo, zona desfavorable, altura, insalubridad, especialización según corresponda);
- **cargas sociales y contribuciones**: en construcción la incidencia sobre el jornal es muy alta — verificar el porcentaje vigente y **nunca asumirlo**;
- **Fondo de Cese Laboral (Ley 22.250)**: aporte patronal específico del régimen, no es indemnización (cruzar con `derecho-laboral-construccion`);
- ART, seguro de vida obligatorio;
- ropa de trabajo y EPP **prorrateados** por la duración de obra;
- **improductividad**: lluvia y clima, traslados dentro de obra, esperas por material o frente no liberado, reuniones, limpieza. Si el APU asume 100% de productividad, está mal.
- incidencia de horas extras si la obra las requiere estructuralmente.

El otro factor del APU es el **rendimiento** (HH por unidad). Un jornal correcto con rendimiento equivocado destruye el precio igual. El rendimiento se valida contra la obra real ejecutada (ciclo de aprendizaje) — es el dato que más mejora la próxima cotización.

## Materiales

- **Precio de reposición, no el histórico**: se cotiza con lo que va a costar comprarlo, no con lo que costó.
- **Desperdicio declarado por ítem**, no un porcentaje global (no desperdicia igual el hormigón que el cerámico).
- **Flete, descarga y acarreo**: en San Juan la logística puede ser un componente relevante, no un detalle.
- **Acopio**: comprar adelantado congela el precio pero inmoviliza caja — la decisión es económica *y* financiera (cruzar con `finanzas-tesoreria-construccion`).

## Cotizar con inflación (Argentina)

- Toda cotización lleva **validez explícita y corta**. Sin fecha de validez, el riesgo de inflación queda 100% del lado del constructor.
- **Obra privada**: solo protege la **cláusula de ajuste escrita en el contrato**. Si no está, no existe.
- **Obra pública**: el mecanismo es la **redeterminación de precios por fórmula polinómica** — hay que cotizar sabiendo qué índices y qué estructura de ponderación va a aplicar, y pedirla en plazo (cruzar con `finanzas-tesoreria-construccion` y `derecho-construccion-contratos`).
- El **costo financiero se cotiza sobre el plazo de cobro REAL del cliente**, no el teórico del contrato: un cliente que paga a 90 días requiere financiar 90 días.
- **Nunca comparar un precio de hace meses con uno de hoy sin actualizar** — en Argentina la comparación nominal miente.

## Costos indirectos, estructura y subcontratos

- Los **gastos generales** son la estructura que sostiene la obra (administración, taller, conducción, vehículos, seguros). Se distribuyen por obra con un criterio **declarado** (facturación, HH o duración) — no un número heredado.
- Una obra que no absorbe su parte de estructura parece rentable y no lo es.
- **Subcontratos**: antes de comparar el precio del sub contra el APU propio, verificar que **incluya lo mismo** (materiales, equipos, andamios, seguridad, retiro de escombros, garantía). Un sub "más barato" que excluye tres ítems no es más barato.

## Errores que destruyen el margen antes de empezar la obra

- Confundir **markup con margen** (ver arriba) — el más caro.
- Aplicar todos los porcentajes **sobre el costo directo**.
- Costear la MO con el **jornal básico sin cargas** ni improductividad.
- **No cotizar el costo financiero** del plazo de pago real del cliente.
- Olvidar el **fondo de reparo**: durante meses se cobra menos de lo que se factura.
- **No dejar el alcance por escrito** → todo lo que aparezca después es discusión, y los adicionales no se cobran.
- Cotizar bajo **por necesidad de facturar** (jugar a no perder — CLAUDE.md raíz).
- Usar precios de la planilla **sin verificar cuáles están desactualizados** respecto del precio de reposición de hoy.

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Fuente del precio | ¿Viene de Planilla para Cotizar o costos reales recientes? |
| Margen mínimo | ¿Está por encima del mínimo aceptable definido por la empresa? |
| Riesgo de adicionales | ¿Se contempló la probabilidad histórica de este tipo de obra/cliente? |
| Comparabilidad | ¿Esta obra es comparable a las que dieron el dato histórico usado? |

## Errores frecuentes

- Cotizar bajo para ganar la obra (advertencia explícita ya en CLAUDE.md raíz, "Jugar a no perder").
- Confundir un costo real parcial (obra en curso) con el costo real final al comparar contra presupuesto.
- Recalcular márgenes sin actualizar el costo indirecto de estructura (Administración/Taller — confirmado como categorías reales en Drive) al ritmo real de la empresa.

## Información necesaria

- `obra_resumen_economico` (margen esperado/real, PRP-005).
- Planilla para Cotizar (fuente de verdad de precios unitarios y mano de obra, confirmado en discovery).
- Gastos de Estructura (Administración/Taller) del P&L consolidado (`Ingresos y Egresos - P&L`, confirmado, aún no migrado al OS).

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| Se está costeando una solución técnica nueva | `ingenieria-civil-construccion` |
| El desvío es de HH/rendimiento | `planificacion-produccion` |
| Hay que decidir si algo es adicional cotizable | `derecho-construccion-contratos` |
| El costo tiene impacto fiscal (IVA, retenciones) | `impuestos-construccion` |
| Se necesita entender el impacto en caja del presupuesto | `finanzas-tesoreria-construccion` |

## Sistema de fuentes

1. **Conocimiento profesional estable**: métodos de cómputo y análisis de precio unitario.
2. **Normativa y regulación cambiante**: índices de costos de la construcción (ej. INDEC, Cámara Argentina de la Construcción) si se usan para actualizar precios — verificar vigencia antes de citar un valor puntual.
3. **Documentación interna de Echegaray**: Planilla para Cotizar (fuente de verdad confirmada).
4. **Datos estructurados del OS**: `presupuestos`, `costos_reales`, `obra_resumen_economico`.
5. **Experiencia histórica de obras**: Post Mortem, desvíos de costo documentados.
6. **Interpretación profesional**: lectura del caso concreto.
7. **Recomendación**: acción sugerida.

## Política de fuentes externas y protocolo de vigencia

Si se necesita un índice de costos de la construcción o un precio de mercado actual para validar un presupuesto, verificar con WebSearch la fecha de publicación del índice y registrar: fuente, autoridad emisora, fecha de publicación, fecha de consulta. Nunca usar un precio de memoria del modelo como si fuera el precio de mercado actual.

## Jurisdicción aplicable

Los precios y costos son de mercado local (San Juan/Cuyo) — un índice nacional puede no reflejar el costo real regional; señalarlo si se usa un índice nacional como proxy.

## Límites de certeza

No puede afirmar un precio unitario de mercado sin verificación si no viene de Planilla para Cotizar o de un dato reciente de Echegaray. No puede afirmar que un desvío de costo "es normal para este tipo de obra" sin comparar contra datos reales.

## Gaps de conocimiento conocidos (primera versión)

No hay todavía una vista consolidada del costo de Estructura de empresa (Administración/Taller) integrada al OS para distribuirlo entre obras — vive en `Ingresos y Egresos - P&L` (Sheet), confirmado, pendiente de integración (Bloque F4 de la revisión estratégica).

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Ejemplo: una partida se presupuesta sistemáticamente baja en obras con un tipo de cliente (evento/desvío recurrente) → Post Mortem documenta la causa (`cambios_sugeridos_cotizacion`) → con 2+ casos comparables (recurrencia/patrón probable) se propone ajustar el precio unitario base de esa partida → el usuario valida (nivel 1, dato empírico) → se incorpora a esta skill y a la próxima cotización → se mide si el desvío se redujo.

## Relación con el OS

- **Áreas**: Comercial/Presupuestación (dominio Presupuestación), Obras (Control Económico).
- **Capacidades existentes**: Presupuesto Base (PRP-003), Control Económico (PRP-005), Costos Reales (PRP-004).
- **Centro de Acción**: consumidora de alertas de margen crítico/en atención.
- **Dashboard**: consumidora directa de la sección Control Económico.
- **Post Mortem**: fuente principal de aprendizaje (`cambios_sugeridos_cotizacion`).
- **Memoria del proyecto**: patrones de desvío validados deberían documentarse ahí.
- **Futuros agentes/automatización**: predicción de sobrecostos (clase B/C) es candidata futura explícita del CLAUDE.md raíz (sección IA) — solo tras responder las 8 preguntas de IA.

## Prohibido

No inventar precios unitarios, índices de costos ni rendimientos técnicos que no vengan de Planilla para Cotizar, datos reales del OS, o una fuente externa verificada y fechada.

## Razonamiento técnico base del cotizador — v1 (definido por el dueño, 02/09/2026)

Motor: `orquestador/lib/plano/razonamiento.mjs` (+ `pipeline.mjs`, `interpretar.mjs`). Tool XSAS:
`plano.razonamiento`. Este conocimiento es del DOMINIO cotizador; /xsas sólo lo invoca.

**Los pasos, en orden:**

1. **Superficies** — impronta/cubierta, semicubierta, por nivel cuando corresponda, dimensiones
   generales. Sólo superficies DECLARADAS con cita, o impronta como CÁLCULO con sus entradas.
2. **Bases / muertos** — B0=n, B1=n… y M0=n, M1=n… por tipología: cantidad, sección X/Y,
   dimensiones, altura/espesor, posición, cota/nivel, evidencia. Un muerto de anclaje NO es una base.
3. **Vigas** — de fundación, arriostramientos, de carga; condición/función sísmica SÓLO con
   evidencia (cita) — sin mención es DESCONOCIDO, nunca «no tiene». Secciones, tramos, apoyos, niveles.
4. **Columnas / encadenados** — columnas de carga, tipologías, secciones, niveles, posición X/Y;
   encadenados documentados con secciones y longitudes.
5. **Longitud unitaria de vigas** — tramos REALES entre apoyos (C1→C2=L1, C2→C3=L2…; total = suma
   de tramos). PROHIBIDO cantidad × longitud promedio inventada.
6. **Lectura X/Y + barrido** — reconstruir ejes, distancias, intersecciones, módulos, niveles.
   Barrido X1→Xn con Y1→Yn y control inverso Y1→Yn con X1→Xn: evitar omisiones y duplicados,
   localizar y relacionar espacialmente.

**Foco prioritario: EXCAVACIONES.** Por cada una: elemento que la genera, cantidad, largo, ancho,
PROFUNDIDAD, sección, longitud si es lineal, volumen, evidencia. Tipos: PUNTUAL (bases, dados,
muertos, pozos/cabezales; V = cantidad × largo_exc × ancho_exc × profundidad_exc) · LINEAL (vigas
de fundación, cimientos, zanjas, arriostramientos enterrados; V = longitud × ancho_exc ×
profundidad_exc) · GENERAL (plateas, rebajes, desmontes/cajas).

**Profundidades — NO INVENTAR.** Evidencia en este orden: 1) corte/detalle específico · 2) planta
acotada · 3) cuadro de fundaciones · 4) memoria/pliego · 5) documento inequívocamente relacionado.
Sin evidencia: `FALTA_DATO: profundidad_excavacion`. Nunca asumir altura estructural = profundidad
excavada. Nunca usar precio/composición/presupuesto histórico para forzar geometría.

**Cruce documental:** PLANTA → CORTE → DETALLE → CUADRO → MEMORIA/PLIEGO → CAD. Complementarias se
COMBINAN con provenance; contradictorias = CONFLICTO; ausencia = FALTA_DATO.

**Relaciones (con evidencia):** base→columna→viga · baseA↔viga fundación↔baseB · columnaA↔tramo↔
columnaB · muerto→estructura asociada. Sirven para DETECTAR omisiones/duplicados/huérfanos —
detectar ≠ inventar.

**El cotizador NO diseña:** lee, reconstruye, relaciona, computa, detecta. No inventa bases,
columnas, vigas, secciones, armaduras, profundidades ni condición sísmica. El diseño estructural,
si alguna vez corresponde, es de otro motor explícitamente autorizado.

**NUMBER → EVIDENCE:** todo número importante debe poder reconstruirse — elementos incluidos,
cantidades, dimensiones, profundidades, tramos, fórmula, documento, lámina, detalle.

**Aprendizaje:** el cotizador usa el aprendizaje general de XSAS (cotizado→planificado→ejecutado→
real→comparación; `xsas-aprendizaje.mjs` + `rendimiento-para-cotizar.mjs`): candidatos gobernados,
nunca una obra sola como regla universal.
