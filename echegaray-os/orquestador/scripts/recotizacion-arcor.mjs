#!/usr/bin/env node
// RECOTIZACIÓN ARCOR — pedido N° 23050969, "Reparaciones / mantenimiento en gral".
//
// ═══ QUÉ HACE ═══
//
// Crea (o reescribe) UN Sheet nuevo con la recotización de los tres presupuestos que ARCOR pidió
// actualizar, una pestaña por trabajo, más los índices de origen y las dudas abiertas.
//
// ═══ LA REGLA QUE GOBIERNA ESTE ARCHIVO ═══
//
// **Ningún número calculado se pega: se escribe la fórmula.** Los únicos valores duros son los de
// ORIGEN —lo que dice cada PDF y lo que publica el INDEC—, y cada uno lleva su fuente y su fecha al
// lado. Si mañana cambia un índice, se corrige en `_ICC_RAW` y las tres pestañas se recalculan
// solas. Un Sheet con los resultados pegados no es una recotización: es una foto que envejece sin
// avisar y que nadie puede auditar.
//
// ═══ LO QUE ESTE ARCHIVO NO DECIDE ═══
//
// El margen. El dueño lo dijo así: *"plantearlo en el sheet como duda y ambas opciones"*. Las dos
// se calculan, se muestran una al lado de la otra y la diferencia en pesos queda escrita. Elegir es
// de él.
//
//   node orquestador/scripts/recotizacion-arcor.mjs [--dry]
//
// ═══ REGLA 0 (no pisar lo que el dueño edita a mano) ═══
//
// Este archivo escribe en crudo (`updateSheetValues`), sin pasar por `escribirPreservando()` ni
// `conEdicionesRespetadas()`, DECLARADO A PROPÓSITO: `respetar: false`. El motivo es que el
// destino no existe hasta que este mismo `main()` lo crea (`google.createFile`, más abajo) — cada
// pestaña nace en la misma corrida que la escribe, así que no hay texto de ninguna persona que
// preservar todavía. Si en el futuro este script pasa a REESCRIBIR un Sheet ya existente (por
// ejemplo, para actualizar la recotización sin crear un archivo nuevo cada vez), esta decisión se
// vuelve falsa y hay que reemplazarla por el portón real.
//
import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { getTokenFor, accessTokenFor, OAUTH_SCOPES } from '../lib/google-oauth.mjs'

// La cuenta con la que se escribe. `jorge@` tiene el refresh_token vencido (medido 20/08/2026:
// `invalid_grant`), así que el OS trabaja como Rodrigo, que es quien además firma los presupuestos.
const CUENTA = process.env.ORQ_RECOTIZACION_CUENTA || 'rodrigo@ecsas.com.ar'
// La carpeta donde viven los tres presupuestos originales. El entregable nace al lado de su fuente.
const CARPETA = '1yktMWU91QQgTeg_DhNsUFhTHjV3sJR47'
const NOMBRE = 'RECOTIZACIÓN ARCOR 23050969 — Reparaciones y mantenimiento'

// ── ORIGEN 1 · ICC INDEC (Gran Buenos Aires), variación mensual % ──────────────────────────────
// Fuente: INDEC, informe "Índice del costo de la construcción, mayo de 2026" (17/06/2026) cruzado
// contra la serie mensual completa que IERIC espeja de INDEC (ICC-INDEC.xls, actualizado
// 19/08/2026). Último dato publicado: JULIO 2026. Agosto sale a mediados de septiembre.
const ICC = [
  // mes nº, etiqueta, nivel general, materiales, mano de obra, gastos generales
  [1, 'ene-26', 2.48, 1.43, 3.49, 2.19],
  [2, 'feb-26', 2.01, 1.48, 1.96, 4.44],
  [3, 'mar-26', 1.94, 1.78, 2.16, 1.61],
  [4, 'abr-26', 3.93, 2.95, 4.90, 3.38],
  [5, 'may-26', 2.75, 1.56, 3.56, 3.73],
  [6, 'jun-26', 2.62, 1.81, 3.28, 2.75],
  [7, 'jul-26', 2.11, 1.58, 2.46, 2.55],
]

// ── ORIGEN 2 · UOCRA Zona A, básico hora ───────────────────────────────────────────────────────
// Fuente: `public.uocra_escala`. ⚠ La fila de enero-26 está marcada como SOSPECHOSA: es ~14,5% MÁS
// BAJA que diciembre-25 en las cuatro categorías, y su `fuente` registrada dice "Acuerdo Febrero
// 2025" —un acuerdo de un año antes— mientras las filas vecinas citan acuerdos de 2026. No se pudo
// verificar contra la fuente oficial. Va al Sheet con la advertencia puesta, no como dato vigente.
const UOCRA = [
  ['Ayudante', 3833, 3259, 3980, 4851, 5399],
  ['Medio Oficial', 4164, 3550, 4324, 5270, 5866],
  ['Oficial', 4506, 3850, 4679, 5703, 6348],
  ['Oficial Especializado', 5268, 4519, 5470, 6666, 7420],
]

// ── ORIGEN 3 · LOS TRES PRESUPUESTOS, TRANSCRITOS DEL PDF SIN REDONDEAR ─────────────────────────
//
// `mesBase` es el mes del documento: la actualización aplica desde el mes SIGUIENTE, porque el
// precio del mes en que se cotizó ya incorpora la inflación de ese mes.
//
// `indice` dice con qué capítulo del ICC se actualiza cada línea, y no es una elección estética:
// una bolsa de cal sigue a Materiales y una hora de oficial sigue a Mano de obra. Actualizar todo
// por el nivel general mezcla dos cosas que se movieron 8 puntos distinto en siete meses.
const TRABAJOS = [
  {
    hoja: 'A · REPARACIONES VARIAS',
    titulo: 'REPARACIONES VARIAS',
    archivo: 'CAMBIO DE CORTINAS Y DEMAS.pdf',
    fecha: '30/01/2026', mesBase: 1,
    pago: '60 días FF', req: '—',
    nota: 'El nombre del archivo dice «Cambio de cortinas y demás»; el título dentro del PDF dice '
      + '«REPARACIONES VARIAS». Manda el documento, no el nombre del archivo.',
    items: [
      // concepto, unidad, cantidad, precio unitario, subtotal IMPRESO en el PDF, capítulo del ICC
      ['Mano de obra', 'GL', 1, 1232019.05, 1332019.05, 'Mano de obra'],
      ['Materiales', 'GL', 1, 835300.83, 835300.83, 'Materiales'],
      ['Técnico de Higiene y Seguridad', 'GL', 1, 328340.95, 328340.95, 'Gastos generales'],
    ],
    subtotalPdf: 2495660.83, ivaPdf: 524088.77, totalPdf: 3019749.60,
  },
  {
    hoja: 'B · MATERIALES VARIOS',
    titulo: 'MATERIALES VARIOS',
    archivo: 'Materiales Varios.pdf',
    fecha: '03/02/2026', mesBase: 2,
    pago: '60 días FF', req: '—',
    nota: 'Los tres ítems son compra de materiales y equipos: se actualizan por el capítulo '
      + 'Materiales del ICC, no por el nivel general.',
    items: [
      ['Bolsas de cal viva', 'un', 50, 9500.00, 575000.00, 'Materiales'],
      ['Mochilas de fumigar', 'un', 2, 300000.00, 600000.00, 'Materiales'],
      ['Hidrolavadora', 'un', 1, 560578.00, 560578.00, 'Materiales'],
    ],
    subtotalPdf: 1735578.00, ivaPdf: 364471.38, totalPdf: 2100049.38,
  },
  {
    hoja: 'C · CIELORRASO VESTUARIOS',
    titulo: 'REPARACIÓN DE CIELORRASO EN VESTUARIOS',
    archivo: 'Reparacion de Cielo raso - Vestuario.pdf',
    // ═══ LA FECHA BASE LA DECIDIÓ EL DUEÑO (20/08/2026) ═══
    //
    // El PDF está fechado 23/06/2026 pero dice que el trabajo SE EJECUTÓ el sábado 07/02/2026, y
    // ésa era la duda #2. El dueño la resolvió: *"la cotizacion de la reparacion de cielorrasos se
    // consideraran en la misma fecha q el de febrero"*. Así que la actualización arranca en
    // FEBRERO, igual que el Trabajo B, y no en junio.
    //
    // La fecha del documento no se borra: se sigue mostrando, porque es un hecho. Lo que cambia es
    // desde cuándo se indexa, que es una decisión y está declarada como tal.
    fecha: '23/06/2026 (documento) · 07/02/2026 (ejecución)', mesBase: 2,
    pago: '70 días FF', req: '22929405',
    nota: 'Se indexa desde FEBRERO 2026 por decisión del dueño (20/08/2026): el trabajo se ejecutó '
      + 'el 07/02/2026 y se cotiza en la misma fecha que «Materiales Varios». El documento está '
      + 'fechado 23/06/2026 y eso no cambia: cambia desde cuándo corre la actualización.',
    items: [
      ['Mano de obra', 'hr', 12, 65806.14, 789673.68, 'Mano de obra'],
    ],
    subtotalPdf: 789673.68, ivaPdf: 165831.47, totalPdf: 955505.15,
  },
]


/** Fila vacía, para respirar entre bloques. */
const V = () => []

// ── ORIGEN 4 · COSTO REAL, PARA PODER COMPARAR LOS DOS CRITERIOS DE MARGEN ─────────────────────
//
// El dueño: *"considerar q lo cotizado tiene un margen de un 20-30% de precio base de costo, dado q
// es el precio q se paso al cliente"* y después, al ver que el costo real medido no daba eso:
// *"plantearlo en el sheet como duda y ambas opciones"*.
//
// Acá va, ítem por ítem, el costo real que se pudo atribuir a una línea cotizada, con el
// comprobante que lo respalda. **Un ítem sin comprobante NO lleva costo estimado**: lleva `null`, y
// la pestaña MARGEN escribe "sin costo real atribuible" en vez de un número que nadie puede
// defender. Ésa es la diferencia entre una recotización y una cuenta inventada.
//
// Cada entrada: [hoja, concepto, costo unitario, fuente del costo, tipo de atribución]
// donde `tipo` es 'DATO REAL' (el comprobante nombra el ítem) o 'INFERENCIA' (se ató por proveedor
// y fecha, y así queda escrito en el Sheet).
// [ítem, cantidad, costo NETO total, proveedor, fecha, comprobante, atribución]
//
// Todos los importes son NETOS: el IVA no es costo y no se mezcla. Las tres atribuciones son
// INFERENCIA —no hay OC ni REQ que ate el comprobante al ítem—: se ataron por cliente, concepto
// textual y fecha coherente. Queda escrito así en el Sheet, no como hecho.
const COSTOS_REALES = [
  ['Bolsas de cal viva', 50, 306818.17, 'Todo Construcciones', '04/02/2026',
    '0004-00000033 + 0004-00000034', 'INFERENCIA · dos comprobantes del mismo día, "CAL VIVA - 10" y "CAL VIVA - 40": 10+40 = las 50 cotizadas'],
  ['Mochilas de fumigar', 2, 222078.82, 'Agroinsumos SA', '26/01/2026',
    '0006-00000370', 'INFERENCIA + la CANTIDAD es ESTIMACIÓN · el comprobante no discrimina unidades; el total sí es dato'],
  ['Hidrolavadora', 1, 178659.38, 'Ferretec', '01/03/2026',
    '0008-00000310', 'INFERENCIA · "insumos — hidrolavadora", comprado 26 días después del presupuesto'],
]

// Lo que declaró el dueño: *"un margen de un 20-30% de precio base de costo, dado q es el precio q
// se paso al cliente"*. O sea: sobre PRECIO, no sobre costo. La distinción no es semántica —30%
// sobre precio es 43% sobre costo— y es la que decide el número.
const MARGEN_OBJETIVO = [20, 30]

// La hoja del único trabajo con costo real atribuible.
const HOJA_B = "'B · MATERIALES VARIOS'"

function hojaMargen() {
  const f = []
  f.push(['EL MARGEN — LA DECISIÓN QUE ESTE ARCHIVO NO TOMA'])
  f.push(['El dueño pidió las dos opciones a la vista y elegir él. Están abajo, con la diferencia en pesos.'])
  f.push(V())

  f.push(['LA DUDA, EN UNA LÍNEA'])
  f.push(['El margen declarado es 20-30% SOBRE PRECIO. El margen que de hecho tuvo el Trabajo B, medido contra el costo real, fue del 57% al 59%.'])
  f.push(['Recotizar al 20-30% no actualiza el precio: lo BAJA. No es un detalle de cálculo, es política comercial, y por eso no lo decide el OS.'])
  f.push(V())

  f.push(['1 · EL COSTO REAL DEL TRABAJO B, CON SU COMPROBANTE'])
  f.push(['Ítem', 'Cant', 'Costo neto', 'Costo unitario', 'Proveedor', 'Fecha', 'Comprobante', 'Cómo se ató al ítem'])
  const c0 = f.length + 1
  COSTOS_REALES.forEach((c, i) => {
    const fi = c0 + i
    f.push([c[0], c[1], c[2], `=IF(B${fi}=0;"";C${fi}/B${fi})`, c[3], c[4], c[5], c[6]])
  })
  const cn = c0 + COSTOS_REALES.length - 1
  const F_COSTO = cn + 1
  f.push(['COSTO REAL TOTAL (neto)', '', `=SUM(C${c0}:C${cn})`])
  f.push(V())

  f.push(['2 · EL MARGEN QUE DE HECHO TUVO'])
  f.push(['El PDF del Trabajo B no cierra consigo mismo, así que hay DOS lecturas del precio. Las dos se muestran: elegir una sin decirlo sería fabricar el número.'])
  f.push(['Lectura del precio', 'Precio cotizado', 'Costo real', 'Margen sobre precio', 'Margen sobre costo'])
  const m0 = f.length + 1
  f.push(['Subtotal impreso en el PDF', 1735578.00, `=$C$${F_COSTO}`, `=1-C${m0}/B${m0}`, `=B${m0}/C${m0}-1`])
  f.push(['Unitario × cantidad (sin el +$100.000)', 1635578.00, `=$C$${F_COSTO}`, `=1-C${m0 + 1}/B${m0 + 1}`, `=B${m0 + 1}/C${m0 + 1}-1`])
  f.push(V())

  f.push(['3 · LAS DOS OPCIONES, A JULIO 2026'])
  f.push(['', 'Precio sin IVA', 'Qué asume'])
  const o0 = f.length + 1
  f.push(['OPCIÓN A · trasladar el precio', `=${HOJA_B}!B9`,
    'Se toma el precio que el cliente ya aceptó y se actualiza por el ICC. Conserva el margen que de hecho tuvo cada línea.'])
  f.push([`OPCIÓN B · margen ${MARGEN_OBJETIVO[0]}% sobre precio`, `=$C$${F_COSTO}*${HOJA_B}!$B$15/(1-${MARGEN_OBJETIVO[0]}/100)`,
    'Se actualiza el COSTO real por el ICC de Materiales y se le aplica el margen declarado.'])
  f.push([`OPCIÓN B · margen ${MARGEN_OBJETIVO[1]}% sobre precio`, `=$C$${F_COSTO}*${HOJA_B}!$B$15/(1-${MARGEN_OBJETIVO[1]}/100)`,
    'Lo mismo, en el extremo alto del rango declarado.'])
  f.push(V())
  f.push(['LA DIFERENCIA, QUE ES EL NÚMERO CON EL QUE SE DECIDE'])
  f.push([`Opción A menos Opción B al ${MARGEN_OBJETIVO[0]}%`, `=B${o0}-B${o0 + 1}`, 'Lo que se deja de facturar si se recotiza al margen declarado.'])
  f.push([`Opción A menos Opción B al ${MARGEN_OBJETIVO[1]}%`, `=B${o0}-B${o0 + 2}`])
  f.push(['El costo real actualizado a jul-26', `=$C$${F_COSTO}*${HOJA_B}!$B$15`, 'El mismo factor de Materiales que usa la pestaña B: no hay dos versiones del índice.'])
  f.push(V())

  f.push(['4 · LO QUE NO SE PUEDE CALCULAR, Y POR QUÉ NO SE INVENTA'])
  f.push(['Trabajo A · REPARACIONES VARIAS', 'Sin costo real atribuible. Lo más cercano en `costos_obra` es el retainer mensual de Higiene y Seguridad, que es un servicio para toda la planta y no un costo de este trabajo.'])
  f.push(['Trabajo C · CIELORRASO', 'Sin costo real atribuible: son 12 horas de mano de obra y no hay imputación de horas a esta obra en el OS.'])
  f.push(['', 'Para esos dos sólo existe la OPCIÓN A. Poner una Opción B ahí exigiría estimar el costo, y estimar el costo es inventar la base del precio.'])
  return f
}

function hojaIndices() {
  const f = []
  f.push(['ÍNDICES DE ORIGEN — no se calculan acá, se transcriben de la fuente'])
  f.push(['Cada valor de esta pestaña es un DATO DE ORIGEN. Todo lo demás en este archivo sale de acá por fórmula.'])
  f.push(V())
  f.push(['1 · ICC INDEC — Gran Buenos Aires · variación mensual %'])
  f.push(['Fuente', 'INDEC, Índice del costo de la construcción. Serie mensual cruzada contra el espejo de IERIC (ICC-INDEC.xls, actualizado 19/08/2026).'])
  f.push(['Último dato publicado', 'julio 2026 (provisorio). Agosto 2026 se publica a mediados de septiembre: los 20 días de agosto ya transcurridos NO están en ningún factor de este archivo.'])
  f.push(V())
  f.push(['mes nº', 'mes', 'Nivel general', 'Materiales', 'Mano de obra', 'Gastos generales'])
  for (const r of ICC) f.push(r)
  f.push(V())
  f.push(['2 · UOCRA Zona A — básico hora, $'])
  f.push(['Fuente', 'public.uocra_escala (OS). Alimentada por un IMPORTHTML de la pestaña _UOCRA_RAW que ya no existe: hoy NO se actualiza sola.'])
  f.push(['⚠ ADVERTENCIA', 'La columna ene-26 es ~14,5% MÁS BAJA que dic-25 en las cuatro categorías, y su fuente registrada dice "Acuerdo Febrero 2025". Un convenio no baja de nominal. NO usar sin confirmar — ver DUDAS.'])
  f.push(V())
  f.push(['Categoría', 'dic-25', 'ene-26 ⚠', 'feb-26', 'jun-26', 'ago-26 (vigente)'])
  for (const r of UOCRA) f.push(r)
  f.push(V())
  f.push(['3 · Contraste entre las dos fuentes de mano de obra'])
  f.push(['El ICC «Mano de obra» subió 17-20% en las mismas ventanas en que el básico UOCRA subió 35-65%.'])
  f.push(['No es un error: el ICC pondera capataz y subcontratos y suaviza; el básico UOCRA es el número crudo del convenio.'])
  f.push(['Para una hora de obra directa manda UOCRA. Para materiales y para el costo general de la obra, el ICC.'])
  return f
}

/** La letra de columna de un capítulo del ICC dentro de `_ICC_RAW`. */
const COL_ICC = { 'Nivel general': 'C', Materiales: 'D', 'Mano de obra': 'E', 'Gastos generales': 'F' }
const ICC_F0 = 9 // primera fila de datos del ICC en la pestaña (1-based)
const ICC_F1 = ICC_F0 + ICC.length - 1

function hojaTrabajo(t) {
  // LA DISPOSICIÓN ES FIJA Y SE CALCULA ANTES DE ESCRIBIR. Las referencias del titular apuntan al
  // subtotal del detalle, que cae en una fila distinta según cuántos capítulos y cuántos ítems
  // tenga el trabajo. Calcularla a ojo es exactamente la trampa de las filas fijas que este repo ya
  // pagó tres veces: el cuadro queda mudo o apunta a una celda vacía, y no grita.
  const cap = [...new Set(t.items.map((i) => i[5]))]
  const F_FACTOR0 = 15
  const F_DETALLE = F_FACTOR0 + cap.length + 1          // el rótulo "3 · EL DETALLE"
  const F_ITEM0 = F_DETALLE + 2
  const F_ULT = F_ITEM0 + t.items.length - 1
  const F_SUBTOTAL = F_ULT + 1

  // Fórmulas en INGLÉS y con `;`, que es como habla un Sheet es_AR por API. Sin decimales sueltos:
  // `21/100` en vez de `0.21`, porque en es_AR el separador decimal es la coma y un punto adentro
  // de una fórmula es un error silencioso.
  const f = []
  f.push([`${t.titulo} — recotización`])
  f.push(['Presupuesto original', t.fecha, '', 'Archivo', t.archivo])
  f.push(['Condición de pago cotizada', t.pago, '', 'REQ', t.req])
  f.push(['Mes base (nº)', t.mesBase, '', 'Se actualiza desde', 'el mes SIGUIENTE al del presupuesto'])
  f.push(V())

  f.push(['1 · LO QUE SE DECIDE'])
  f.push(['', 'Sin IVA', 'IVA', 'TOTAL'])
  f.push(['Cotizado en su momento', t.subtotalPdf, t.ivaPdf, t.totalPdf])
  f.push(['Recotizado a jul-2026', `=I${F_SUBTOTAL}`, '=B9*21/100', '=B9+C9'])
  f.push(['Diferencia', '=B9-B8', '=C9-C8', '=D9-D8'])
  f.push(['Aumento sobre lo cotizado', '=IF(B8=0;"";B9/B8-1)'])
  f.push(V())

  f.push(['2 · CON QUÉ SE ACTUALIZA CADA LÍNEA'])
  f.push(['Capítulo del ICC', 'Factor', 'Aumento', 'Meses que aplica'])
  cap.forEach((c, i) => {
    const col = COL_ICC[c]
    const fi = F_FACTOR0 + i
    f.push([
      c,
      `=PRODUCT(FILTER(1+_ICC_RAW!${col}$${ICC_F0}:${col}$${ICC_F1}/100;_ICC_RAW!$A$${ICC_F0}:$A$${ICC_F1}>$B$4))`,
      `=B${fi}-1`,
      `=TEXTJOIN(", ";1;FILTER(_ICC_RAW!$B$${ICC_F0}:$B$${ICC_F1};_ICC_RAW!$A$${ICC_F0}:$A$${ICC_F1}>$B$4))`,
    ])
  })
  f.push(V())

  f.push(['3 · EL DETALLE, LÍNEA POR LÍNEA'])
  f.push(['Concepto', 'Un', 'Cant', 'Unitario original', 'Subtotal del PDF', 'Capítulo', 'Factor', 'Unitario a jul-26', 'Subtotal a jul-26'])
  t.items.forEach((it, i) => {
    const fi = F_ITEM0 + i
    f.push([
      it[0], it[1], it[2], it[3], it[4], it[5],
      `=VLOOKUP(F${fi};$A$${F_FACTOR0}:$B$${F_FACTOR0 + cap.length - 1};2;0)`,
      `=D${fi}*G${fi}`,
      `=E${fi}*G${fi}`,
    ])
  })
  f.push(['SUBTOTAL', '', '', '', `=SUM(E${F_ITEM0}:E${F_ULT})`, '', '', '', `=SUM(I${F_ITEM0}:I${F_ULT})`])
  f.push(V())

  f.push(['4 · CONTROLES'])
  f.push(['El subtotal del PDF contra la suma de sus líneas', `=SUM(E${F_ITEM0}:E${F_ULT})-${t.subtotalPdf}`,
    'Tiene que dar 0. Si no da, el PDF no cierra consigo mismo.'])
  f.push(['Cantidad × unitario contra el subtotal impreso', `=SUMPRODUCT(C${F_ITEM0}:C${F_ULT};D${F_ITEM0}:D${F_ULT})-SUM(E${F_ITEM0}:E${F_ULT})`,
    'Tiene que dar 0. En los Trabajos A y B da −100.000: ver DUDAS #4.'])
  f.push(V())
  f.push(['NOTA', t.nota])
  return f
}

function hojaDudas() {
  const f = []
  f.push(['DUDAS ABIERTAS — hay que resolverlas antes de mandar la cotización'])
  f.push(['Ninguna de estas la puede resolver el OS solo. Todas cambian el número final.'])
  f.push(V())
  f.push(['#', 'Qué falta', 'Por qué importa', 'Quién lo resuelve'])
  f.push([1, 'El margen: ¿markup histórico o 20-30% sobre costo real?',
    'El costo real medido del Trabajo B da un margen muy superior al 20-30% declarado. Las dos opciones dan precios distintos. Ver la pestaña MARGEN.', 'El dueño'])
  f.push([2, 'RESUELTA · La fecha base del Trabajo C',
    'El dueño decidió el 20/08/2026 que se cotiza en la misma fecha que el de febrero, porque el trabajo se ejecutó el 07/02/2026. Se indexa desde febrero, no desde junio: el factor pasa de +2,5% a +17,4%.', 'Ya decidida'])
  f.push([3, 'El dato UOCRA de enero-2026 (baja de 14,5% contra diciembre)',
    'Si esa fila está mal, cualquier cálculo de mano de obra anclado en enero arranca torcido.', 'Verificar contra UOCRA oficial'])
  f.push([4, 'El +$100.000 en los Trabajos A y B',
    'En los dos PDF el subtotal de la primera línea supera al unitario × cantidad en exactamente $100.000. El SUBTOTAL general usa el número inflado. O es un agregado real sin explicar, o es un error de planilla — repetido en dos documentos.', 'Rodrigo'])
  f.push([5, 'El plazo de respuesta del pedido',
    'El mail de ARCOR no lo indica. Sin plazo no se puede priorizar.', 'Preguntar a Franco Ventimiglia o Sergio Cuevas'])
  f.push([6, 'La condición de pago',
    'ARCOR pide mínimo 70 días FF. Los Trabajos A y B se cotizaron a 60. Estirar 10 días a las tasas de hoy tiene un costo que hay que poner en el precio.', 'El dueño'])
  f.push([7, 'Los 20 días de agosto-2026 sin índice',
    'El ICC publicado llega a julio. La cotización sale en agosto: falta el tramo. Se puede proyectar, y si se proyecta hay que decirlo.', 'El dueño'])
  f.push(V())
  f.push(['LO QUE NO SE PUDO VERIFICAR'])
  f.push(['· El buzón de jorge@ecsas.com.ar: el refresh_token de OAuth está vencido y la delegación de dominio no está habilitada. El pedido se leyó desde el buzón de rodrigo@ecsas.com.ar, donde también está.'])
  f.push(['· La escala UOCRA contra la fuente oficial: los sitios de UOCRA e IERIC no se pueden leer sin navegador desde este entorno.'])
  f.push(['· public.cotizaciones no tiene ninguna fila de ARCOR: no hay una cotización formal cargada en el OS para estos trabajos.'])
  return f
}

function hojaResumen() {
  const f = []
  f.push(['RECOTIZACIÓN ARCOR — PEDIDO N° 23050969'])
  f.push(['Reparaciones / mantenimiento en gral · Planta La Campagnola, San Juan'])
  f.push(V())
  f.push(['Pedido de', 'Sergio Martín Cuevas González (Comprador MRO, ARCOR)', 'scuevas@arcor.com'])
  f.push(['Solicitante técnico', 'Franco Ventimiglia', 'fventimigl@arcor.com'])
  f.push(['Fecha del pedido', '18/08/2026', 'Reenviado por Rodrigo el 19/08/2026'])
  f.push(['Condición que pide ARCOR', 'Pago mínimo 70 días fecha factura', 'Es su condición estándar: aparece igual en los pedidos 23041221 y 23031760.'])
  f.push(['Plazo de respuesta', 'NO INDICADO en el mail', 'Ver DUDAS #5'])
  f.push(V())
  f.push(['1 · LO QUE SE DECIDE'])
  f.push(['Trabajo', 'Fecha del presupuesto', 'Cotizado (sin IVA)', 'Recotizado a jul-26', 'Aumento', 'TOTAL con IVA'])
  const f0 = f.length + 1
  TRABAJOS.forEach((t, i) => {
    const h = `'${t.hoja}'`
    f.push([t.titulo, t.fecha, `=${h}!B8`, `=${h}!B9`, `=IF(C${f0 + i}=0;"";D${f0 + i}/C${f0 + i}-1)`, `=${h}!D9`])
  })
  const fn = f0 + TRABAJOS.length - 1
  f.push(['TOTAL', '', `=SUM(C${f0}:C${fn})`, `=SUM(D${f0}:D${fn})`, `=IF(C${fn + 1}=0;"";D${fn + 1}/C${fn + 1}-1)`, `=SUM(F${f0}:F${fn})`])
  f.push(V())
  f.push(['2 · CÓMO SE LLEGÓ A ESE NÚMERO'])
  f.push(['· Cada línea se actualiza por el capítulo del ICC-INDEC que le corresponde: materiales por Materiales, horas por Mano de obra, el técnico de HyS por Gastos generales.'])
  f.push(['· El factor se compone mes a mes desde el mes SIGUIENTE al del presupuesto hasta julio-2026, que es el último dato publicado.'])
  f.push(['· No hay un solo número pegado: todo sale de _ICC_RAW por fórmula. Cambiar un índice ahí recalcula las tres pestañas.'])
  f.push(V())
  f.push(['3 · LO QUE ESTE ARCHIVO NO DECIDE'])
  f.push(['El MARGEN. El dueño pidió que las dos opciones se muestren y que la elección quede en sus manos: están en la pestaña MARGEN.'])
  f.push(['El Trabajo B es el único con costo real atribuible, y ahí el margen que de hecho tuvo fue 57-59% sobre precio, no el 20-30% declarado. Recotizar al 20-30% BAJA el precio.'])
  f.push(['La fecha base del cielorraso ya la decidió el dueño: febrero, no junio. Quedan seis cosas sin resolver en DUDAS, numeradas.'])
  f.push(V())
  f.push(['Generado por', 'orquestador/scripts/recotizacion-arcor.mjs', 'Echegaray Business OS'])
  return f
}

async function main() {
  const seco = process.argv.includes('--dry')
  const google = makeGoogleClient({
    config: loadConfig(), scopes: OAUTH_SCOPES, getToken: getTokenFor(CUENTA), soloUsuario: true,
  })

  const hojas = [
    ['RECOTIZACIÓN', hojaResumen()],
    ...TRABAJOS.map((t) => [t.hoja, hojaTrabajo(t)]),
    ['MARGEN', hojaMargen()],
    ['_ICC_RAW', hojaIndices()],
    ['DUDAS', hojaDudas()],
  ]

  if (seco) {
    for (const [nombre, filas] of hojas) console.log(`── ${nombre}: ${filas.length} filas`)
    return
  }

  // `--file=<id>` reescribe uno ya creado en vez de dejar un archivo huérfano por cada reintento.
  const reusar = (process.argv.find((a) => a.startsWith('--file=')) || '').slice(7)
  const creado = reusar
    ? await google.getMeta(reusar)
    : await google.createFile({
      name: NOMBRE, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [CARPETA],
    })
  console.log(reusar ? '✓ reusando:' : '✓ creado:', creado.id)

  // Las pestañas, en orden, con la primera renombrada (un Sheet nace con "Hoja 1").
  // `getSheetMeta` devuelve un ARRAY plano de {sheetId,title}, no el `{sheets:[…]}` de la API cruda.
  const meta = await google.getSheetMeta(creado.id)
  const yaEstan = new Set(meta.map((h) => h.title))
  const primera = meta[0].sheetId
  const requests = [
    { updateSheetProperties: { properties: { sheetId: primera, title: hojas[0][0] }, fields: 'title' } },
    ...hojas.slice(1).filter(([n]) => !yaEstan.has(n))
      .map(([nombre], i) => ({ addSheet: { properties: { title: nombre, index: i + 1 } } })),
  ]
  // El cliente del OS no expone un POST crudo a `spreadsheets:batchUpdate` —sólo el de valores—,
  // así que la creación de pestañas va directo, con el mismo token de la misma cuenta.
  const tok = await accessTokenFor(CUENTA)
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${creado.id}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!r.ok) throw new Error(`no pude crear las pestañas: ${r.status} ${String(await r.text()).slice(0, 200)}`)

  for (const [nombre, filas] of hojas) {
    // NO SE LIMPIA ANTES DE ESCRIBIR, Y NO ES UN OLVIDO. El intento está registrado: `no-borrar.mjs`
    // —regla permanente de este repo— rechaza cualquier borrado explícito sobre una pestaña con
    // contenido, y no se evade. La consecuencia hay que tenerla en la cabeza: si una versión futura
    // de este generador ACORTA una pestaña, las filas de más quedan vivas y no se distinguen del
    // contenido bueno. Mientras el ancho y el alto de cada bloque no bajen, sobrescribir alcanza; el
    // día que bajen, se rehace el archivo entero en vez de reescribirlo encima.
    const ancho = Math.max(...filas.map((r) => r.length), 1)
    const cuadro = filas.map((r) => [...r, ...Array(ancho - r.length).fill('')])
    await google.updateSheetValues(creado.id, `'${nombre}'!A1`, cuadro)
    console.log(`  · ${nombre}: ${filas.length} filas`)
  }
  console.log(`\nListo: https://docs.google.com/spreadsheets/d/${creado.id}/edit`)
}

main().catch((e) => { console.error('falló:', e.message); process.exit(1) })
