---
name: finanzas-tesoreria-construccion
description: "Criterio experto de tesorería y flujo de fondos de empresas constructoras: posición de caja, cobranzas, pagos, obligaciones (UOCRA/IERIC/Fondo de Cese/impuestos/financiación), forecast semanal/8 semanas/mensual y controles anti-duplicación. Activar ante cualquier pregunta sobre caja, cobranzas, pagos, financiamiento de capital de trabajo, o al auditar/editar el Sheet real 'Flujo de Caja - Cash Flow' (junto con google-sheets-business-systems, obligatorio). Trabaja siempre en percibido, nunca mezclar con contabilidad-constructoras (devengado)."
allowed-tools: Read, Bash, WebSearch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
---

# Finanzas y Tesorería de Empresas Constructoras

## Propósito

Aportar el criterio de gestión financiera de caja y capital de trabajo — la pregunta que el CLAUDE.md raíz plantea como central: "¿cuándo entra y sale efectivamente el dinero?", y cómo financiar la brecha entre ejecutar una obra y cobrarla.

## Alcance

Cubre, con nivel de especialista (no de resumen):

- **Posición de caja**: bancos, cajas, efectivo, saldos reales, saldos conciliados, saldos contables vs. bancarios, disponibilidades, fondos restringidos.
- **Cobranzas**: cuentas por cobrar, certificados, facturas, hitos contractuales, anticipos, adicionales, retenciones, cobros parciales/totales, fechas comprometidas/estimadas/reales, mora, probabilidad de cobro, concentración por cliente.
- **Pagos**: proveedores, compras, obligaciones, pagos parciales/totales, vencimientos, prioridades, pagos críticos vs. diferibles, transferencias, efectivo, tarjetas, débitos, cheques, eCheq.
- **Obligaciones de construcción**: proveedores, subcontratistas, nómina, cargas sociales, UOCRA, IERIC, Fondo de Cese Laboral, ART, impuestos, seguros, alquileres, servicios, financiación, cuotas, intereses.
- **Forecast**: diario cuando haga falta, semanal, 8 semanas / 13 semanas, mensual, escenarios (base/optimista/conservador), sensibilidad, déficit, superávit, necesidad de financiación.

Capital de trabajo, financiamiento de obra (adelantos, SGR, ANR, préstamos) y condiciones de cobro/pago siguen siendo el marco de decisión de esta skill — lo de arriba es cómo se audita y opera ese marco sobre datos reales.

No cubre: el reconocimiento contable devengado (`contabilidad-constructoras`), la carga impositiva de una operación financiera (`impuestos-construccion`), ni la arquitectura/fórmulas del Sheet donde vive este dato (`google-sheets-business-systems`, a activar siempre que la tarea sea leer/auditar/editar `Flujo de Caja - Cash Flow` o cualquier otro Sheet financiero real). La coherencia entre este dato y P&L/Obras es responsabilidad de `arquitectura-integracion-finanzas-obras`.

## Regla absoluta

**Flujo de fondos = criterio percibido y temporal.** Todo movimiento se clasifica explícitamente como uno de: REAL · COMPROMETIDO · PROYECTADO · ESTIMADO · VENCIDO · PAGADO · COBRADO · CONCILIADO. Nunca se suman dos categorías distintas en la misma columna sin distinguirlas. Un proyectado que se cumple se marca como real — no se duplica sumando ambos.


## Contrato de arquitectura del OS (vale para toda esta skill)

Reglas que gobiernan de dónde sale cada dato. No son técnicas: definen qué respuesta es legítima.

1. **Todo sale del data room.** La fuente es `administracion` en Drive (o cualquier carpeta compartida con la cuenta de servicio del OS). Si un dato existe ahí, **el OS lo LEE — no se le pide al dueño que lo cargue a mano.** Antes de decir "no tengo ese dato", verificar si está en el data room.
2. **Fuente única.** Todo concepto que se muestre en más de una cara del OS (chat, web, cualquier herramienta) se define **una sola vez en Postgres** (vista o función) y las caras la consumen. Ejemplos vivos: `obra_costo_real` (costo por obra), `obligacion_resumen` (saldo de obligaciones), `norm_obra()` (normalización de nombre de obra). **Nunca recalcular por separado un concepto que ya tiene fuente** — si aparece una diferencia entre web y chat, es un bug de arquitectura, no una discrepancia a explicar.
3. **Si falta información y es legítimamente externa** (un precio de mercado, una normativa, una referencia técnica), **buscarla en internet con la herramienta de búsqueda** y citar la fuente y la fecha — no responder "no tengo el dato" cuando es averiguable.
4. **Una capacidad sin dato responde "no tengo el dato" y ofrece registrarlo.** Nunca un número inventado.

## Cableado al OS real (verificado 2026-07-18) — qué leer y qué llamar

Esta skill razona; el dato y el cálculo viven en el núcleo (Supabase + capacidades 0-API). Regla de arquitectura del proyecto ([[arquitectura-3-caras-nucleo]]): **una capacidad = una fuente**; web, chat y Claude Code consultan lo mismo, no recalculan. Cuando el OS adopta la persona del CFO, NO estima a mano lo que estas capacidades ya calculan — las llama.

**Capacidades determinísticas existentes (0 API — llamar, no reimplementar):**
- `orquestador/lib/caja-alertas.mjs` → `saldoActual()`: posición de caja real anclada a `max(saldo_fecha)` (evita el doble conteo de movimientos ya reflejados en el saldo). Es el número canónico de "cuánta caja hay hoy".
- **`caja_vencido_sin_conciliar`** — cobros y pagos que estaban PROYECTADOS, cuya fecha ya pasó, y que nadie marcó como reales. **Hoy: $25.000.000 en cobros (el más viejo del 2 de julio) y $9.949.042 en pagos.** Es la aplicación directa de la regla "un proyectado que se cumple se marca como real": mientras no se concilie, no se sabe si ese dinero entró. Ante "¿qué tengo vencido?" o "¿de qué me ocupo en la caja?", **llamarla**. Si vuelve vacía, distinguir "está todo conciliado" de "hace tiempo que nadie carga movimientos" — no son lo mismo.
- `orquestador/lib/cash-briefing.mjs` → posición + **cobranzas vencidas** + **proyección 7 días** (caja + entra7 − vencimientos). Tool del chat: `briefing_caja`. Corre solo a las 8am (briefing diario, 0 API, verificado).

**Tablas reales (Supabase `public`, verificado):**
- `cuentas_financieras` (3): `saldo_inicial` + `saldo_fecha`. HOY: *Santander Empresas Pesos = $13.916.209 al 2026-07-17*; **Banco y Caja/Efectivo en $0 → la posición NO está consolidada de verdad** (gap de carga, no de capacidad). Sync `echegaray-caja-sync` cada 30 min desde el Sheet `Flujo de Caja - Cash Flow` (pestaña Caja, ledger de saldos).
- `movimientos_caja` (48): `tipo` (cobro/pago), `estado` (proyectado/real), `fecha_esperada`/`fecha_real`. Rango jun→oct (incluye proyección).
- `obligaciones` (10, fino) + `aplicaciones_pago` (16): salidas comprometidas. **Gap: 10 obligaciones es incompleto** — faltan cargas sociales, IIBB/IVA, Crédito Prendario, Plan de pago (todas visibles hoy como "indirecto" en `costos_obra`).

**Gaps reales de HOY (no los viejos "Bloques Fx"):**
1. **Cobranzas NO está en el núcleo** — vive solo en el Sheet `02_Cobranzas`. Sin esto no hay DSO ni proyección de ingresos desde el OS, y la proyección de caja del `cash-briefing` es coja del lado de las entradas. Es el mayor gap de tesorería.
2. **Posición de caja incompleta** — solo 1 de 3 cuentas tiene saldo real; los $13,9M de Santander no cuadran con los ~$17,7M del ledger completo del Sheet (falta cargar efectivo/otras).
3. **Capital de trabajo** = `saldoActual()` + cobranzas − `obligaciones`: calculable en cuanto cobranzas entre al núcleo; hoy queda como cálculo ad-hoc marcado como tal.

## Preguntas profesionales que debe hacer

- ¿Cuánta caja real tenemos hoy, y está conciliada contra el banco?
- ¿Qué entra esta semana? ¿Qué sale esta semana?
- ¿Qué está realmente comprometido (obligación firme) contra lo que es solo estimado?
- ¿Cuál es la peor semana del forecast, y qué la explica?
- ¿Qué cliente concentra la tensión de cobranza? ¿Qué proveedor concentra la tensión de pago?
- ¿Qué cobro está atrasado (mora) y qué probabilidad real tiene de cobrarse?
- ¿Qué pago puede diferirse sin costo relevante y cuál no?
- ¿Qué obligaciones no tienen fecha asignada (UOCRA, IERIC, ART, impuestos) y por qué?
- ¿Qué diferencia hay entre lo que el forecast de la semana pasada decía y lo que realmente pasó — y qué supuesto falló?
- ¿Qué obra consume caja y cuál genera caja?
- ¿Cuánto capital de trabajo requiere la operación completa, no solo una obra?
- ¿Cuánto capital de trabajo necesita esta obra antes de recibir el primer cobro?
- ¿La condición de cobro pactada (anticipo, certificación mensual, contra entrega) alcanza para financiar la ejecución sin recurrir a deuda?
- ¿Un cheque o echeq ya emitido está realmente debitado, o solo comprometido a futuro? (distinción ya establecida en PRP-010 del OS)
- ¿El financiamiento disponible (SGR, ANR, préstamo) tiene costo financiero menor que el retorno de aceptar la obra?

## Marcos de análisis

- **Cash Flow = percibido, siempre** (regla de oro #5 del CLAUDE.md raíz) — nunca confundir con el resultado devengado que ve `contabilidad-constructoras`.
- **Una empresa puede ganar dinero y quedarse sin caja** (CLAUDE.md raíz, sección Cash Flow y P&L) — el análisis de esta skill nunca se apoya solo en el margen esperado, siempre cruza contra la posición de caja real.
- **Capital de trabajo = Cuentas por Cobrar + Caja − Cuentas por Pagar** — métrica pendiente de construir en el OS (Bloque F2 de la revisión estratégica), calculable hoy con los datos ya existentes.

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Necesidad de capital de trabajo | ¿Cuánto y por cuánto tiempo? |
| Costo de financiamiento | ¿Qué instrumento es más barato para esta necesidad? |
| Tensión de liquidez | ¿Hay semanas con posición proyectada negativa? |
| Instrumento de pago | ¿Cheque, echeq, transferencia — y cuándo impacta realmente en caja? |

## Inflación: en Argentina es la variable que decide el resultado

No es un tema macro de fondo — es operativo y destruye margen obra por obra.

- **Descalce de certificación**: se certifica a precio de contrato (viejo) y se pagan insumos a precio de reposición (nuevo). En obra larga es el principal destructor de margen, más que cualquier ineficiencia de ejecución. Toda obra de plazo largo debe analizarse por este descalce antes de firmarse.
- **Redeterminación de precios**: en obra pública el mecanismo formal es la redeterminación por **fórmula polinómica** (marco nacional Decreto 691/2016 y concordantes; para San Juan verificar el régimen provincial aplicable antes de invocarlo). Requiere: estructura de ponderación por insumo, índices publicados (INDEC / los que fije el pliego), umbral de disparo y **solicitud formal en plazo** — si no se pide en tiempo y forma, se pierde. En obra **privada** no existe redeterminación por ley: solo vale la **cláusula de ajuste escrita en el contrato**. Sin cláusula, el riesgo de inflación es 100% del constructor.
- **Validez de oferta**: sin cláusula de ajuste, la protección es una validez de oferta corta y explícita (días, no meses), o precio referido a un índice/moneda.
- **Costo financiero real vs. nominal**: una tasa nominal alta puede ser tasa **real negativa**. Financiarse puede convenir en términos reales — pero el riesgo no es la tasa, es el **descalce de plazos** entre lo que se paga y lo que se cobra.
- **Nunca comparar montos de distintas fechas sin deflactar/indexar**: en Argentina la comparación nominal miente (un costo "que subió 80%" puede ser una baja en términos reales). Al comparar presupuesto vs. real, o mes contra mes, declarar el criterio usado.
- El **ajuste por inflación** contable (RECPAM) e impositivo afecta resultado e impuesto a pagar — cruzar con `contabilidad-constructoras` e `impuestos-construccion`.

## El ciclo financiero de la obra: dónde se consume la caja

Secuencia real: **anticipo → acopio → ejecución → certificación → facturación → cobro → fondo de reparo → liberación**.

- **Anticipo**: mejora la caja al inicio, pero **no es ingreso adicional** — se amortiza descontándose proporcionalmente en cada certificado. Suele exigir póliza de caución. Un forecast que trata el anticipo como ingreso neto está mal armado.
- **Acopio de materiales**: comprar adelantado protege del aumento de precio pero **inmoviliza caja**. La decisión es: ahorro esperado por inflación vs. costo financiero del dinero inmovilizado + riesgo de robo/deterioro/cambio de proyecto. Si el cliente certifica acopio, cambia por completo la ecuación.
- **Fondo de reparo / retención de garantía**: un % de cada certificado retenido hasta la recepción definitiva. Es **margen ya ganado pero no cobrado**; hay que tenerlo en el forecast con su fecha de liberación real, no olvidado. Suele poder sustituirse por póliza de caución: comparar el costo de la póliza contra el costo de tener ese dinero inmovilizado meses.
- **Garantías típicas** (cada una cuesta o inmoviliza): mantenimiento de oferta, cumplimiento de contrato, anticipo, fondo de reparo.
- **PEAK FUNDING — el número que decide si podés tomar la obra**: toda obra tiene un punto de **máxima caja negativa acumulada** antes de darse vuelta. Ese número, no la facturación ni el margen, define si la obra es tomable. Calcularlo ANTES de firmar, y calcular el **pico agregado de todas las obras en el tiempo** (la suma de los picos individuales no es el pico del conjunto: hay que sumarlos mes a mes).

## Instrumentos de financiamiento de una PyME constructora argentina

Regla madre: **el instrumento debe calzar con el plazo de la necesidad**. Un descalce de días no se financia con deuda a 3 años, y una inversión en equipo no se financia con descubierto.

- **Certificado MiPyME (ARCA/AFIP)**: es la llave de acceso a FCE, tasas preferenciales y programas de fomento. Sin él, la empresa queda afuera de los instrumentos más baratos. Verificar que esté vigente (se renueva).
- **Factura de Crédito Electrónica MiPyME (FCE)**: cuando una gran empresa le compra a una PyME, corresponde FCE. Si el cliente no la rechaza en el plazo legal queda **aceptada tácitamente** y se convierte en título ejecutivo **negociable** — se puede descontar en el mercado para adelantar el cobro. *Echegaray ya la emite (visible en `CF_COB` con ARCOR)*: es un activo financiero que hoy probablemente no se está aprovechando para descontar.
- **Cheque de pago diferido / echeq**: descontable en banco o en el mercado de capitales (MAV). El **echeq avalado por SGR** consigue tasas sensiblemente menores que el descuento bancario común.
- **SGR (Sociedad de Garantía Recíproca)**: avala los cheques/pagarés de la PyME; con ese aval la tasa baja fuerte. Requiere ser socio partícipe. Suele ser **el financiamiento más barato disponible para una PyME sin garantías reales** — evaluar si Echegaray está incorporada a alguna.
- **Descubierto / adelanto en cuenta corriente**: el más caro. Solo para descalces de días, nunca estructural.
- **Leasing**: para equipos y vehículos; no inmoviliza capital propio y tiene tratamiento fiscal propio (cruzar con `impuestos-construccion` y `equipos-flota-construccion`).
- **Líneas de inversión productiva, BICE, Banco Nación, programas provinciales de San Juan**: verificar vigencia y condiciones antes de recomendarlas — cambian permanentemente.

## Impuestos mirados como caja (timing, no solo costo)

Desde tesorería lo que importa no es cuánto es el impuesto sino **cuándo sale la plata** y cuánta caja queda atrapada.

- **IVA — saldo técnico inmovilizado**: el IVA pagado en compras y anticipos que no encuentra débito suficiente queda como saldo a favor **técnico**, que no se puede pedir de vuelta ni compensar libremente. Un saldo técnico creciente es **caja atrapada** y hay que monitorearlo como tal.
- **Retenciones y percepciones** (IVA, Ganancias, IIBB, **SIRCREB** sobre acreditaciones bancarias): inmovilizan caja mucho antes del vencimiento del impuesto. Un régimen mal gestionado genera saldos a favor permanentes que financian gratis al fisco.
- **Impuesto al cheque (Ley 25.413)**: grava débitos y créditos bancarios; una porción es computable contra otros impuestos. Verificar alícuota y porcentaje de cómputo vigentes antes de citarlos.
- **Convenio Multilateral**: si se trabaja en más de una provincia, la asignación de base imponible cambia la carga de IIBB.

## Indicadores que mira un CFO de constructora (no los genéricos de manual)

- **Peak funding** por obra y agregado (ver arriba) — el más importante para decidir si se toma una obra.
- **Ciclo de conversión de efectivo de obra**: días entre pagar el insumo y cobrar el certificado que lo contiene. Es el que explica por qué una empresa con margen se queda sin caja.
- **DSO por cliente, nunca solo el promedio**: el promedio esconde al cliente malo. Un cliente que paga a 90 días con otro que paga a 15 da un promedio "sano" que no existe.
- **Cobertura de obligaciones**: (caja + cobranzas comprometidas) / obligaciones de los próximos 30-60-90 días.
- **Concentración de cobranza**: % de la cobranza que depende de un solo cliente (caso real de Echegaray: ARCOR). Alta concentración = el riesgo de caja no es financiero, es comercial.
- **Backlog sostenible**: cuánta obra contratada se puede sostener con la caja y el financiamiento disponibles — crecer más rápido que eso es cómo una constructora rentable quiebra.

## Errores frecuentes

- Aceptar una obra grande sin evaluar si el capital de trabajo que requiere pone en riesgo la caja de las obras en curso.
- Confundir un cheque emitido con dinero ya debitado (distinción explícita ya resuelta en PRP-010 del OS — obligaciones y medios de pago).
- Proyectar caja sumando cobros "esperados" sin distinguir probabilidad real de cobro por cliente.

## Controles obligatorios antes de dar por buena una posición de caja o un forecast

Buscar activamente, no asumir que no existen:

- doble conteo de un mismo movimiento (ej. un cheque cargado como pago Y como obligación proyectada aparte);
- cobros o pagos duplicados entre dos pestañas/fuentes que registran lo mismo (patrón real ya confirmado entre `Flujo de Caja` y `Control de Gastos`);
- un cheque/echeq contado como "pago contado" y también como "cheque pendiente";
- un histórico real mezclado en la misma columna que el forecast (sin marcar cuál es cuál);
- pagos sin obligación de origen, u obligaciones sin fecha;
- saldos no conciliados contra el extracto bancario real;
- movimientos de obra sin obra asignada (no se puede calcular exposición ni capital de trabajo por obra sin este dato);
- pagos o cobros parciales tratados como si cerraran el total (verificar que el saldo pendiente sea `comprometido − suma de parciales reales`, nunca se fuerza un solo registro por el total).

## Forecast: horizonte y disciplina de actualización

- El horizonte de referencia profesional es el **forecast rodante de 13 semanas** (o 8 si la volatilidad de obra lo justifica): se actualiza cada semana quitando la que ya pasó, agregando una al final, y comparando lo proyectado la semana anterior contra lo que realmente ocurrió — este contraste explícito hoy no existe en ningún Sheet real de Echegaray (gap confirmado) y es la base para que Dirección vea qué supuesto de cobro/pago falló.
- Rutina semanal mínima: lunes, saldo real de banco + revisión de cobranzas vs. lo esperado + aging de cuentas por pagar; seguimiento de cobros atrasados; viernes, revisión de las salidas comprometidas de la semana siguiente.
- Reforzar el forecast con 3 escenarios cuando la decisión lo amerite (financiamiento, aceptar obra grande): base, optimista, conservador — variando velocidad de cobro y timing de pago, no el monto total.

## Obligaciones específicas del régimen de la construcción (verificado 2026-07)

- **Fondo de Cese Laboral (Ley 22.250)**: aporte patronal (no se descuenta del neto del trabajador) depositado mensualmente en una cuenta a nombre del trabajador administrada por **IERIC**; debe depositarse dentro de los 15 días de devengado el salario; se calcula sobre básico + adicionales tipo presentismo, excluye SAC, horas extra e indemnizaciones. Está prohibido pagarlo directamente al trabajador.
- **IERIC** es el ente de contralor de la actividad — toda empresa constructora debe estar inscripta y llevar la libreta del Fondo de Cese de cada trabajador.
- Verificar siempre la alícuota y plazos vigentes antes de citarlos como definitivos — esto es normativa laboral sectorial, cruzar con `derecho-laboral-construccion` para cualquier caso concreto (desvinculación, cálculo de indemnización, fiscalización).
- Estas obligaciones son recurrentes y de calendario conocido — deben aparecer en el forecast con fecha, no como "gasto general" sin fecha.

## Información necesaria

- `movimientos_caja` reales y proyectados (PRP-001).
- `obligaciones` con fecha de vencimiento y saldo pendiente (PRP-010).
- Posición de caja consolidada (Bloque F1 de la revisión estratégica, aún no construido — hoy hay que calcularla manualmente cruzando ambas fuentes).

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| El resultado devengado no coincide con la caja | `contabilidad-constructoras` |
| Hay impacto impositivo en el instrumento financiero | `impuestos-construccion` |
| Se está evaluando si aceptar una obra por su necesidad de capital | `costos-presupuestacion`, `gestion-empresarial-riesgos` |
| El financiamiento afecta la decisión de comprar vs. alquilar un equipo | `compras-abastecimiento-subcontratacion` |
| Se va a leer, auditar o editar un Sheet real (`Flujo de Caja - Cash Flow`, Control de Gastos) | `google-sheets-business-systems` (obligatorio, siempre, antes de tocar una celda) |
| Hay que verificar que este dato no se calcule distinto en P&L, Obras o el OS | `arquitectura-integracion-finanzas-obras` (obligatorio ante cualquier cambio de fórmula que cruce sistemas) |
| Una obra puntual explica la tensión de caja | `planificacion-produccion`, `direccion-obra` |

## Sistema de fuentes

1. **Conocimiento profesional estable**: principios de gestión de capital de trabajo y tesorería.
2. **Normativa y regulación cambiante**: tasas de referencia (BCRA), condiciones de SGR/ANR — verificar vigencia antes de citar una tasa específica.
3. **Documentación interna de Echegaray**: `Flujo de Caja - Cash Flow` (Sheet real confirmado, fuente de verdad de caja).
4. **Datos estructurados del OS**: `movimientos_caja`, `obligaciones`, `obligacion_resumen`.
5. **Experiencia histórica de obras**: Post Mortem, si documenta problemas de financiamiento.
6. **Interpretación profesional**: lectura del caso concreto.
7. **Recomendación**: acción sugerida.

## Política de fuentes externas y protocolo de vigencia

Para citar una tasa de interés, condición de SGR/ANR o instrumento financiero específico, verificar con WebSearch la fuente (BCRA, entidad financiera, SGR) y registrar fecha de publicación y de consulta. No asumir que una tasa de hace meses sigue vigente en un contexto de alta variabilidad como el argentino.

## Jurisdicción aplicable

Nacional (BCRA, entidades financieras) — no suele haber variación provincial relevante en instrumentos financieros, salvo programas específicos de fomento provincial (verificar si San Juan tiene alguno vigente antes de descartarlo).

## Límites de certeza

No puede afirmar una tasa de interés o condición de financiamiento vigente sin verificación. No puede afirmar la posición de caja de la empresa sin cruzar `movimientos_caja` y `obligaciones` reales — no estimar sin dato.

## Gaps de conocimiento conocidos (actualizado 2026-07-18)

- **Posición de caja: YA existe** como capacidad (`caja-alertas.saldoActual()` + `cash-briefing.mjs`), pero está **incompleta por dato**: solo Santander tiene saldo real; Banco y Caja/Efectivo en $0. No es un gap de capacidad sino de carga.
- **Cobranzas: gap real y prioritario** — no está en el núcleo (solo en el Sheet `02_Cobranzas`). Hasta que entre, la proyección de ingresos y el DSO no se calculan desde el OS.
- **Capital de trabajo**: calculable en cuanto cobranzas entre al núcleo; mientras tanto es cálculo ad-hoc (marcarlo como tal), no vista persistida.
- **Obligaciones**: 10 cargadas es fino — faltan las recurrentes (cargas sociales, IIBB/IVA, financieras) que hoy aparecen como "indirecto" en `costos_obra`.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Ejemplo: una obra genera tensión de liquidez recurrente por su condición de cobro pactada (evento/desvío) → se documenta la causa (ej. certificación mensual pero pago a 60 días) → si se repite con el mismo tipo de cliente (recurrencia), se propone exigir mejores condiciones de anticipo en la próxima cotización con ese perfil de cliente → el usuario valida (nivel 2) → se incorpora como criterio de `costos-presupuestacion` también → se mide en la próxima obra comparable.

## Historial de aprendizaje (append-only, más reciente arriba)

- **2026-07-09** — Auditoría real de `Flujo de Caja - Cash Flow` confirmó tres controles obligatorios de esta skill como necesarios, no teóricos: (1) un total de Cuentas por Pagar calculado por SUMIFS ($178.647.280,11) generó una alarma falsa al compararlo contra una lectura parcial vía QUERY — se resolvió con verificación independiente (COUNTIF/SUMPRODUCT), reforzando la regla de nunca aceptar una discrepancia sin cruce de componentes; (2) el saldo disponible real de banco requiere descontar cheques emitidos no debitados y consumos de tarjeta no debitados — antes no existía ese cálculo, ahora vive en `Caja!I7`; (3) una edición concurrente real (Rodrigo) pisó parte de un panel de resumen — la Regla de Oro de "saldo conciliado" debe entenderse siempre como un dato vivo, no una foto fija. Clasificación: **D. conocimiento interno validado** (verificado con datos reales de la empresa, no una obra aislada).

## Relación con el OS

- **Áreas**: Administración y Finanzas (dominio Tesorería y Planeamiento Financiero).
- **Capacidades existentes**: Caja Operativa (PRP-001), Obligaciones y Medios de Pago (PRP-010).
- **Centro de Acción**: consumidora de alertas de vencimiento próximo, tensión de liquidez (ya calculadas en PRP-010/Dashboard).
- **Dashboard**: consumidora directa de la sección Caja y Obligaciones.
- **Post Mortem**: consumidora si documenta problemas de financiamiento por obra.
- **Memoria del proyecto**: patrones de tensión de liquidez validados deberían documentarse ahí.
- **Futuros agentes/automatización**: un forecast de caja (clase B, analítica) es candidato directo del Bloque F1 — ninguna decisión de financiamiento se automatiza, siempre clase E.

## Prohibido

No inventar tasas de interés, condiciones de SGR/ANR, ni afirmar una posición de caja sin cruzar datos reales del OS.
