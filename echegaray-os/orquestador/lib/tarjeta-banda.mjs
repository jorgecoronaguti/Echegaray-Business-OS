// LA BANDA DE "Tarjeta de Credito" — NÚCLEO PURO: no mira el reloj, la red ni la base.
//
// ═══ QUÉ CONTESTA, Y EN QUÉ ORDEN ═══
//
// Textual del dueño, 28/08/2026: «quiero saber CUÁNTO TENGO QUE PAGAR en ambos saldos, ARS y USD,
// QUÉ ME ESTÁN COBRANDO en los resúmenes, SI YA SE PAGÓ, CUÁNTO PUEDE VENIR LA PRÓXIMA».
//
// Y sobre la primera versión de esta banda: «inentendible el diseño… no se respetó la regla de oro:
// minimalista y de clase mundial. Less is more. Como se usaría y se vería en JP Morgan».
//
// ═══ POR QUÉ ESTA FORMA (28/08, segunda versión) ═══
//
// La primera versión tenía el CONTENIDO bien y la FORMA mal, y el defecto era medible: SEIS
// secciones numeradas apiladas, todas con el mismo peso visual, con su encabezado «Concepto ·
// Monto · Cuándo» repetido CINCO veces, 52 filas de alto, un subtítulo de 40 palabras y una columna
// derecha que era un párrafo. Nada decía qué mirar primero.
//
// Lo que se hizo, con su fuente:
//
//   1. UNA SOLA CIFRA MANDA, Y ESTÁ ARRIBA. `dataviz/references/marks-and-anatomy.md` (skill del
//      repo): «Hero figure. The single number a dashboard leads with… EXACTLY ONE per view». Acá es
//      lo que hay que pagar en pesos. Al lado, dos tarjetas más —los dólares y el estado del pago—
//      porque son la MISMA obligación en otra moneda y la respuesta a "¿ya se pagó?". Quien abre
//      esto para decidir si paga hoy lee tres celdas, no seis cuadros.
//   2. UNA TARJETA NO ES UNA TABLA. Nielsen Norman Group, "Data Tables"
//      (nngroup.com/articles/data-tables/, consultado 28/08/2026): una tabla existe para ENCONTRAR
//      registros, COMPARARLOS y editarlos. Tres cifras sueltas no son ninguna de esas cosas, así que
//      arriba no hay encabezado de tabla: hay rótulo, número y una línea de contexto.
//   3. LO SECUNDARIO NO DESAPARECE: BAJA. NN/g, "Progressive Disclosure"
//      (nngroup.com/articles/progressive-disclosure/, consultado 28/08/2026): diferir lo avanzado a
//      un segundo plano hace el sistema más fácil sin sacarle poder. Ninguna cifra se perdió — el
//      desglose, la proyección, la brecha y el historial siguen enteros, abajo y en dos columnas.
//   4. DOS COLUMNAS, NO SEIS PISOS. IBCS 2.0 / ISO 24896 "Notation for business reporting"
//      (ibcs.com/standards/, verificado 28/08/2026, versión alineada con la ISO desde el 11/06/2026).
//      De su fórmula SUCCESS pesan dos: SAY —el mensaje primero, el respaldo después— y CONDENSE
//      —agregar a la granularidad de la DECISIÓN—. Cuatro bloques en dos pistas ocupan 31 filas en
//      vez de 52, y el ojo compara de un lado al otro en vez de recorrer una lista.
//   5. NUMERACIÓN CORRIDA Y SIN HUECOS, y sólo en la pista izquierda (1, 2, 3). La skill
//      `admin-finanzas-sheets-clase-mundial` lo pide explícito: «numeración de bloques CONSECUTIVA
//      y sin huecos» y «los controles van DEBAJO del mensaje principal». Los bloques de la derecha
//      no llevan número: son la segunda pista, y numerarlos obligaría a leer en zigzag.
//   6. LA COLUMNA DE CONTEXTO DEJA DE SER UN PÁRRAFO. Cada celda de la tercera columna es un dato
//      corto —un porcentaje, una procedencia, un veredicto—, nunca una explicación. Es la misma
//      regla que ya gobierna el resto del archivo (`patron-pestana.mjs`: las notas largas van en la
//      última columna o no van).
//
// La piel —sin reja, sin barras de color, totales rulados, versalita apagada— la pone
// `estilo-statement.mjs`, que es la misma de CAJA y de las dos pestañas de cheques.
//
// ═══ DE DÓNDE SALE CADA COSA — Y POR QUÉ NO TODO PUEDE SER FÓRMULA ═══
//
//   · Lo del RESUMEN (a debitar, cargos, cuotas comprometidas, pago mínimo) se PEGA, con su fecha y
//     su semáforo de antigüedad: no existe en ninguna otra pestaña del archivo, así que no hay
//     fórmula posible. Entra por `scripts/importar-tarjeta.mjs` desde el PDF y vive en Postgres.
//   · Lo del BANCO (si el débito ocurrió, cuándo y por cuánto) es FÓRMULA sobre `_BANCO_RAW`. Así se
//     actualiza solo cada vez que se importa el extracto, sin volver a correr este generador — que
//     es exactamente lo que hace que "¿ya se pagó?" no envejezca.
//   · Lo del REGISTRO de abajo (cuánto de lo que se va a debitar está cargado) también es fórmula:
//     el control se pone en verde solo, a medida que el dueño carga las cuotas que faltan.
//
// ═══ LO QUE ESTE ARCHIVO NO PUEDE ROMPER ═══
//
//   · LA COLUMNA E NO LLEVA NÚMEROS Y LA J NO LLEVA "SI". CAJA suma
//        SUMPRODUCT((UPPER('Tarjeta de Credito'!$J$3:$J$400)<>"SI")*IF(ISNUMBER($E$3:$E$400);…))
//     sobre el rango de columna ENTERO, y la banda cae adentro: un importe en E se sumaría al
//     consumo de tarjeta de CAJA como si fuera una compra más. Por eso E y J son las CANALETAS de
//     las dos pistas —siempre vacías— y hay test.
//   · EL ALTO ES FIJO (`BANDA`), aunque los datos varíen. De ese número cuelga `filaCab` en
//     `cash-flow-lineas.mjs`, y un rango corrido no da error: da cero, que se lee como un cero real.
//     Por eso los bloques de largo variable tienen tope y el sobrante se rellena al final.
//   · LA BANDA ES DUEÑA DE TODO SU RECTÁNGULO (filas 1..BANDA, columnas A..L). Toda celda que le
//     pertenece y va vacía sale con el centinela `VACIO`, no con "": una celda vacía sin declarar la
//     conserva `no-borrar.mjs` —correctamente, porque no puede saber de quién es— y así sobrevivió
//     el layout anterior, celda por celda, adentro del nuevo.

import { seccion, total, sub } from './patron-pestana.mjs'
import { BANDA, FILA_DATO0, rangoAbierto } from './tarjeta-geometria.mjs'
import { VENTANA, TOLERANCIA, BANDA_TC, estadoDePago, historial, proyectarProxima } from './tarjeta-estado.mjs'
import { ALERTA } from './glifos.mjs'

/** Ancho de grilla de la banda. El registro es más ancho: es el ledger, y el patrón admite uno. */
export const COLS = 12

/** La fila del titular (1-based): la cifra que decide si se paga hoy. Una sola por vista. */
export const TITULAR = 5

/** Dónde arranca cada pista. La izquierda en A, la derecha en F; E y J son canaletas vacías —y la E
 *  además es contrato con CAJA, que suma esa columna entera—. */
export const PISTA = { izq: 0, der: 5 }

/** Topes de los bloques de largo variable. Sin tope, el alto de la banda dependería de los datos y
 *  `filaCab` del cash flow apuntaría a otra fila cada mes, sin dar error. */
export const TOPES = { cargos: 6, componentes: 4, huecos: 2, historial: 6 }

/** A partir de cuántos días un resumen deja de ser el presente. Llega uno por mes: a los 40 días sin
 *  resumen nuevo, o no llegó o nadie lo cargó — y las dos cosas hay que verlas. */
const DIAS_FRESCURA = 40

const ymd = (iso) => { const [a, m, d] = String(iso).split('-').map(Number); return { a, m, d } }
const dmy = (iso) => { const { a, m, d } = ymd(iso); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}` }
const DATE = (iso) => { const { a, m, d } = ymd(iso); return `DATE(${a};${m};${d})` }
const corrida = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const MES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const mesCorto = (iso) => { const { a, m } = ymd(iso); return `${MES[m]}/${String(a).slice(2)}` }
const $ = (n) => `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * UN NÚMERO ADENTRO DE UNA FÓRMULA VA EN LOCALE, IGUAL QUE EL SEPARADOR. PURA.
 *
 * Sheets guarda `2208958.42` como `2208958,42` en un archivo es-AR, así que la fórmula que este
 * generador sella nunca coincide con la que el Sheet devuelve al releerla. Consecuencia medida el
 * 28/08: las dos celdas del veredicto quedaron "sin poder probarse mías" en el inventario de
 * `conservadas-sin-prueba.mjs` — o sea que el día que este generador dejara de escribirlas, serían
 * residuo inmortal. Se emite en locale y la ida y la vuelta cierran.
 */
export const num = (n) => String(n).replace('.', ',')

/**
 * El semáforo de antigüedad. PURA.
 *
 * Un número pegado no puede envejecer en silencio: la celda de al lado dice de qué documento es, y
 * cuando el documento pasa de `dias` deja de decir la fecha y pasa a pedir uno nuevo.
 */
export function frescura(iso, dias = DIAS_FRESCURA, normal = null) {
  const { a, m, d } = ymd(iso)
  // El texto normal se pasa ENTERO, no se le pega la fecha atrás: la primera versión concatenaba
  // `${rotulo} ${fecha}` y el pie de la tarjeta quedó "…débito automático de la 00000000913836
  // 20/08/2026", con una fecha suelta que no era la del débito. Cada rótulo sabe qué fecha lleva.
  const texto = normal ?? `resumen al ${dmy(iso)}`
  return `=LET(dd_;TODAY()-DATE(${a};${m};${d});IF(dd_>${dias};"${ALERTA} el último resumen es de hace "&dd_&" días";"${texto}"))`
}

/** Los cargos, nombrados como los entiende un humano. Lo que el banco imprime es un código. */
const NOMBRE_CARGO = {
  sellos: 'Impuesto de sellos',
  sellos_provinciales: 'Impuesto de sellos provincial',
  rg5617: 'Percepción RG 5617',
  iva: 'IVA',
  interes_financiacion: 'Intereses de financiación',
  punitorio: 'Intereses punitorios',
  comision: 'Comisiones y cargos',
  seguro: 'Seguros',
  percepcion: 'Otras percepciones',
}


/**
 * LOS RÓTULOS QUE ESCRIBIÓ LA VERSIÓN ANTERIOR DE ESTE GENERADOR Y HOY YA NO EXISTEN.
 *
 * ═══ POR QUÉ HACE FALTA UNA LISTA, SI YA HAY UN REGISTRO ═══
 *
 * `sheet_rotulos` guarda lo que la pestaña tiene HOY: en cuanto un rediseño reemplaza los rótulos, la
 * prueba de que esos textos los escribió el OS se pierde. Y sin prueba, `no-borrar.mjs` conserva —
 * correctamente, porque no puede saber de quién es una celda—. Resultado medido el 28/08: 29 celdas
 * del layout anterior sobrevivieron adentro del nuevo, entre ellas una sección entera publicando
 * $5.749.674 con "▲ revisar la carga". Un número muerto, gritando.
 *
 * Esta lista es evidencia AUDITABLE, no una excepción: cada texto está en el archivo anterior de este
 * mismo generador (`git show 4c9fc5d3:…/tarjeta-pestana.mjs`), así que cualquiera puede verificar que
 * los escribió el OS y no una persona. No amplía lo que la guarda puede borrar: `residuosPropios`
 * sigue exigiendo que la FILA esté anclada y que la CELDA tenga forma de generador.
 *
 * Se saca de acá cuando la pestaña se haya reescrito entera al menos una vez y el inventario de
 * `conservadas-sin-prueba.mjs` no las nombre más.
 */
export const RETIRADOS = [
  'LA LÍNEA — CUÁNTO SE PUEDE GASTAR HOY',
  'Límite de compra',
  '⇒ Disponible para comprar',
  '   · en cuotas el cupo es otro, y manda',
  '   · consumido en dólares — se paga del mismo cupo',
  '1 · CUÁNTO VENCE Y CUÁNDO',
  'Próximo débito',
  'Los tres meses siguientes',
  'Más adelante',
  '⇒ Comprometido y todavía sin debitar',
  '2 · CÓMO SE USA — MEDIO DE PAGO O FINANCIAMIENTO',
  'Pagado al banco en lo que va del año',
  'Del último pago — cuotas ya cargadas acá',
  'Del último pago — consumo del período',
  '⇒ Del último pago, financiado en cuotas',
  '3 · CONTROL — LA PESTAÑA CONTRA EL RESUMEN DEL BANCO',
  'Pendiente según esta pestaña',
  'Pendiente según el resumen del banco',
  '⇒ Diferencia',
  '4 · EL DETALLE — CADA COMPRA Y CADA CUOTA',
]

/**
 * DOS PISTAS, UNA GRILLA. PURA.
 *
 * Recibe los bloques de la izquierda y de la derecha ya armados —cada uno una lista de ternas
 * [rótulo, monto, contexto]— y los emite EN PARALELO. El alto del par es el del más largo; el más
 * corto se completa con celdas propias vacías, nunca con "" (ver la nota del encabezado: una celda
 * vacía sin declarar la conserva la guarda y así sobrevive el layout anterior).
 *
 * @returns {{filas:any[][], usdDer:number[]}} filas de COLS columnas
 */
export function apilar(izq = [], der = [], desde = 0) {
  const filas = []
  const alto = Math.max(izq.length, der.length)
  for (let i = 0; i < alto; i++) {
    const a = izq[i] || ['', '', '']
    const b = der[i] || ['', '', '']
    const f = Array(COLS).fill('')
    f[PISTA.izq] = a[0] ?? ''; f[PISTA.izq + 1] = a[1] ?? ''; f[PISTA.izq + 2] = a[2] ?? ''
    f[PISTA.der] = b[0] ?? ''; f[PISTA.der + 1] = b[1] ?? ''; f[PISTA.der + 2] = b[2] ?? ''
    filas.push(f)
  }
  return { filas, alto, primera: desde + 1 }
}

/**
 * LAS FILAS DE LA BANDA. PURA y determinística.
 *
 * @param {number} hdr    fila (1-based) del encabezado del registro
 * @param {object} datos  { resumen, estado, historial, proyeccion } — lo que arma `datosDeLaBanda`
 */
export function bandaFilas(hdr = BANDA + 1, datos = {}) {
  const r = datos.resumen
  if (!r) throw new Error('bandaFilas: sin resumen no hay pestaña. Cargá uno con importar-tarjeta.mjs.')
  const hist = datos.historial || []
  const proy = datos.proyeccion || { componentes: [], huecos: [], piso: 0 }

  // ── Rangos. Los del registro, ABIERTOS: una cuota nueva entra sola al control ───────────────────
  const E = rangoAbierto('E')   // monto de la cuota
  const H = rangoAbierto('H')   // fecha de pago (la misma columna que lee el cash flow)
  const RF = "'_BANCO_RAW'!$A$4:$A$1000"
  const RC = "'_BANCO_RAW'!$C$4:$C$1000"
  const RN = "'_BANCO_RAW'!$F$4:$F$1000"
  const PAGO = `${RN};"Pago de la tarjeta"`
  const desde = corrida(r.vencimiento, -VENTANA.antes)
  const hasta = corrida(r.vencimiento, VENTANA.despues)
  const enVentana = `${RF};">="&${DATE(desde)};${RF};"<="&${DATE(hasta)}`
  const mes0 = `${r.vencimiento.slice(0, 8)}01`
  const mes1 = corrida(mes0, 32).slice(0, 8) + '01'

  const filas = []
  const usd = []      // filas (1-based) cuyo importe está en dólares, columna B
  const usdDer = []   // idem, columna G
  const push = (f) => { filas.push(f); return filas.length }
  const tres = (a = '', b = '', c = '') => { const f = Array(COLS).fill(''); f[0] = a; f[1] = b; f[2] = c; return f }

  // ── 1-3 · QUIÉN HABLA. El subtítulo dice qué tarjeta y de qué documento, y nada más: de dónde sale
  //         el dato y cómo se carga es documentación, no pestaña. ───────────────────────────────────
  push(tres('Tarjeta de crédito'))
  push(tres(`${r.tarjeta} · Santander · resumen ${r.numero ?? 's/n'}, cerrado el ${dmy(r.cierre)}`))
  push(tres())

  // ── 4-6 · LAS TRES TARJETAS. Rótulo arriba, cifra grande, una línea de contexto abajo ────────────
  const rot = Array(COLS).fill('')
  rot[PISTA.izq] = 'A PAGAR — PESOS'
  rot[PISTA.izq + 2] = 'A PAGAR — DÓLARES'
  rot[PISTA.der] = '¿YA SE PAGÓ?'
  const fRot = push(rot)

  const cif = Array(COLS).fill('')
  cif[PISTA.izq] = r.aDebitarPesos
  cif[PISTA.izq + 2] = r.aDebitarDolares || ''
  // El veredicto SE RECALCULA EN EL SHEET. Pegado diría "A VENCER" para siempre — y este renglón es
  // la respuesta a una de las cinco preguntas, no un adorno.
  cif[PISTA.der] = veredicto({ r, debito: `-SUMIFS(${RC};${PAGO};${enVentana})`, hasta })
  const fCif = push(cif)

  const pie = Array(COLS).fill('')
  // La celda de al lado dice de qué documento sale y, si el documento envejeció, deja de decirlo y
  // pide uno nuevo: un resumen de hace 40 días no describe lo que hay que pagar este mes.
  pie[PISTA.izq] = frescura(r.cierre, DIAS_FRESCURA, `vence el ${dmy(r.vencimiento)} · débito automático de la CC ${String(r.cuentaDebito ?? '?').replace(/^0+/, '')}`)
  pie[PISTA.izq + 2] = r.aDebitarDolares ? 'el mismo débito, en dólares' : ''
  pie[PISTA.der] = `=LET(f_;MAXIFS(${RF};${PAGO};${enVentana});IF(f_=0;"el extracto todavía no lo registra";"el banco debitó "&TEXT(-SUMIFS(${RC};${PAGO};${enVentana});"$#,##0")&" el "&TEXT(f_;"dd/mm")))`
  push(pie)
  push(tres())

  // ── BLOQUE 1 · qué me están cobrando (izq) · cuánto puede venir la próxima (der) ─────────────────
  const izq1 = [[seccion(1, 'Qué me están cobrando'), '', ''], ['Concepto', 'Monto', 'Cuánto pesa']]
  // "PROYECCIÓN" va en el título y no en una nota: una estimación presentada como hecho es la regla
  // de oro que más caro sale romper, y el rótulo es lo único que se lee siempre.
  const der1 = [['CUÁNTO PUEDE VENIR LA PRÓXIMA — PROYECCIÓN', '', ''], ['Concepto', 'Monto', 'De dónde sale']]
  const base = filas.length            // filas ya emitidas antes del bloque
  const fCons = base + izq1.length + 1
  izq1.push(['Consumos del período', r.consumosPesos, `${(r.consumos || []).length} compra(s) y cuota(s)`])
  if (r.consumosDolares > 0) { izq1.push([sub('en dólares'), r.consumosDolares, 'se pagan aparte']); usd.push(base + izq1.length) }
  const pct = (f) => `=IF($B$${fCons}=0;"—";TEXT(B${f}/$B$${fCons};"0.0%")&" del consumo")`
  for (const c of (r.cargos || []).slice(0, TOPES.cargos)) {
    izq1.push([NOMBRE_CARGO[c.concepto] ?? c.comercio ?? c.concepto, c.importe, ''])
    const f = base + izq1.length
    // LA PERCEPCIÓN NO ES UN GASTO: es pago a cuenta de Ganancias, recuperable en la DDJJ. Tratarla
    // como costo pierde el crédito fiscal. Se muestra separada y rotulada; el criterio contable lo
    // decide el dueño con el estudio — acá sólo no se esconde.
    izq1[izq1.length - 1][2] = c.concepto === 'rg5617'
      ? `=IF($B$${fCons}=0;"—";TEXT(B${f}/$B$${fCons};"0.0%")&" · pago a cuenta, no gasto")`
      : pct(f)
  }
  izq1.push([total('Cargos e impuestos'), r.cargosPesos, ''])
  const fCargos = base + izq1.length
  izq1[izq1.length - 1][2] = pct(fCargos)
  izq1.push([total('Total a debitar'), r.aDebitarPesos, 'consumos + cargos'])
  if (r.pagoMinimoVerificado) izq1.push([sub(`pago mínimo $${Math.round(r.pagoMinimo).toLocaleString('es-AR')}`), '', 'el resto financia al 6,411% mensual'])

  for (const c of proy.componentes.slice(0, TOPES.componentes)) {
    der1.push([c.concepto, c.importe, c.corta ?? c.procedencia])
    if (c.moneda === 'USD') usdDer.push(base + der1.length)
  }
  der1.push([total('Piso de la próxima'), proy.piso, proy.proximoVencimiento ? `vence el ${dmy(proy.proximoVencimiento)}` : ''])
  const fPiso = base + der1.length
  for (const h of proy.huecos.slice(0, TOPES.huecos)) der1.push([sub(h), '', ''])

  const b1 = apilar(izq1, der1, base)
  for (const f of b1.filas) push(f)
  push(tres())

  // ── BLOQUE 2 · la brecha contra el Cash Flow (izq) · el historial (der) ──────────────────────────
  const base2 = filas.length
  const izq2 = [[seccion(2, 'Lo que va a salir y el Cash Flow no espera'), '', ''], ['Concepto', 'Monto', 'Qué falta']]
  const der2 = [['HISTORIAL', '', ''], ['Fecha de cierre', 'A debitar', 'Pagado']]
  const fSale = base2 + izq2.length + 1
  izq2.push([`A debitar el ${dmy(r.vencimiento)}`, r.aDebitarPesos, 'sale sin que nadie lo mande'])
  const fCargado = fSale + 1
  izq2.push([`Cargado en el registro (${mesCorto(r.vencimiento)})`,
    `=SUMIFS(${E};${H};">="&${DATE(mes0)};${H};"<"&${DATE(mes1)})`,
    'lo único que el Cash Flow proyecta'])
  const fBrecha = fCargado + 1
  izq2.push([total('Brecha sin proyectar'), `=B${fSale}-B${fCargado}`,
    `=IF(ABS(B${fBrecha})<=1;"✓ el registro cubre el débito";"${ALERTA} el Cash Flow espera "&TEXT(B${fCargado};"$#,##0"))`])
  if (r.aDebitarDolares > 0) { izq2.push([sub('y los dólares, que ninguna línea proyecta'), r.aDebitarDolares, '']); usd.push(base2 + izq2.length) }

  for (const f of hist.slice(0, TOPES.historial)) {
    der2.push([`${dmy(f.cierre)}${f.numero ? ` · ${f.numero}` : ''}${f.procedencia === 'INFERENCIA' ? ' · inferido' : ''}`, f.pesos, rotuloHistorial(f)])
  }
  const b2 = apilar(izq2, der2, base2)
  for (const f of b2.filas) push(f)

  // ── El relleno. El alto es fijo porque de él cuelga el cash flow ────────────────────────────────
  while (filas.length < BANDA - 2) push(tres())
  push(tres())
  const fDetalle = push(tres(seccion(3, 'El detalle — cada compra y cada cuota')))
  if (filas.length !== BANDA) throw new Error(`bandaFilas: la banda quedó de ${filas.length} filas y el contrato dice ${BANDA}`)

  return {
    filas,
    fRot, fCif, fArs: fCif, fEstado: fCif, fCons, fCargos, fPiso, fSale, fCargado, fBrecha, fDetalle,
    usd, usdDer,
    // Las filas de encabezado y de título de la pista DERECHA: la piel las reconoce por la columna A
    // y ahí no hay nada, así que las formatea el generador.
    titulosDer: [b1.primera, b2.primera],
    encabezadosDer: [b1.primera + 1, b2.primera + 1],
    hdr,
  }
}

/** El rótulo de "pagado" de una fila del historial. PURA: el hecho, con su prueba o su hueco. */
export function rotuloHistorial(f) {
  if (f.estado === 'PAGADO') {
    return `${f.concilia ? '✓' : ALERTA} ${$(f.pagado)} el ${dmy(f.debitos[f.debitos.length - 1].fecha)}${f.concilia ? '' : ' — NO coincide'}`
  }
  if (f.estado === 'IMPAGO') return `${ALERTA} IMPAGO — venció sin débito`
  return `a vencer el ${f.vencimiento ? dmy(f.vencimiento) : '?'}`
}

/**
 * EL VEREDICTO VIVO. PURA: devuelve la fórmula, no el resultado.
 *
 * Los tres estados son los mismos que decide `estadoDePago()` y con los mismos parámetros —de ahí se
 * importan `VENTANA`, `TOLERANCIA` y `BANDA_TC`—. La diferencia es que ésta la recalcula el Sheet:
 * el día que el extracto traiga el débito, la celda cambia sola.
 *
 * EL CASO QUE NO PUEDE DAR VERDE POR ERROR: cuando el débito no coincide con el resumen, la única
 * explicación admitida es el saldo en dólares convertido a un tipo de cambio cercano al del cierre.
 * Cualquier otra diferencia sale como hallazgo.
 */
export function veredicto({ r, debito, hasta }) {
  const ars = num(r.aDebitarPesos)
  const usd = r.aDebitarDolares || 0
  const tc = r.tcCierre || 0
  const otro = `"${ALERTA} PAGADO POR OTRO IMPORTE"`
  // La única diferencia admitida es el saldo en dólares convertido: la cuenta de débito es en pesos
  // y el banco liquida las dos monedas en un solo débito (probado con el pago del 03/08:
  // 1.090.924,47 + U$S 193,25 × 1.520 = 1.384.664,47 exacto). Fuera de esa banda, es un hallazgo.
  const explicaDolares = usd > 0 && tc > 0
    ? `IF(AND(dif_/${num(usd)}>=${num((tc * BANDA_TC.piso).toFixed(2))};dif_/${num(usd)}<=${num((tc * BANDA_TC.techo).toFixed(2))});"PAGADO";${otro})`
    : otro
  return `=LET(pag_;${debito};dif_;pag_-${ars};IF(pag_=0;IF(TODAY()>${DATE(hasta)};"${ALERTA} IMPAGO";"A VENCER");IF(ABS(dif_)<=${TOLERANCIA};"PAGADO";${explicaDolares})))`
}

/**
 * LO QUE LA BANDA NECESITA, ARMADO DE UNA VEZ. PURA.
 *
 * Existe para que el script no tenga que saber en qué orden se llaman las tres funciones de estado,
 * y sobre todo para que el test le pase EXACTAMENTE la misma forma que le pasa la base. Un test que
 * construye a mano una forma parecida a la real prueba la forma parecida.
 */
export function datosDeLaBanda(resumenes = [], movimientos = [], { hoy } = {}) {
  const orden = [...resumenes].sort((a, b) => String(b.cierre).localeCompare(String(a.cierre)))
  const resumen = orden[0]
  if (!resumen) return { resumen: null, estado: null, historial: [], proyeccion: null }
  return {
    resumen,
    estado: estadoDePago(resumen, movimientos, { hoy }),
    historial: historial(orden, movimientos, { hoy }),
    proyeccion: proyectarProxima(orden),
  }
}

export { BANDA, FILA_DATO0 }
