// LA PESTAÑA `OBRAS` — TODAS LAS OBRAS DEL AÑO EN UNA SOLA PANTALLA. GRILLA PURA, SIN RED.
//
// QUÉ ES (07/08/2026). El dueño quiere ver el año entero de un vistazo: qué se vendió, qué se cobró,
// qué costó y qué falta desembolsar, obra por obra. Y lo pidió con un estándar explícito: *"No quiero
// una planilla mejor. Quiero que parezca un software de tesorería enterprise construido dentro de
// Google Sheets"* — importes protagonistas, poco texto, mucho aire, jerarquía.
//
// LA TRADUCCIÓN A ESTRUCTURA:
// · Sección 1 — OBRAS DEL AÑO: una fila por cliente con venta / cobrado / pendiente / materiales,
//   TODO fórmula viva sobre Cobranzas y Materiales. Nada tipeado.
// · Sección 2 — OBRAS EN CURSO Y FUTURAS: UNA fila protagonista por obra (venta · cobrado · costo
//   real · pendiente · margen · semáforo ✓/⚠) y el detalle de egresos debajo, indentado y gris.
//   Los ÚNICOS números tipeados de la pestaña son los PROYECTADOS de `obras-datos.mjs` (insumo del
//   dueño) — todo lo demás es fórmula.
//
// LAS REGLAS QUE ESTE ARCHIVO NO ROMPE:
// · Rótulos anclados al TEXTO, nunca a la posición (INDEX/MATCH sobre "TOTAL POR OBRA", no una fila).
// · Fórmulas en locale es-AR: separador `;` — una coma acá es un decimal.
// · Rangos ABIERTOS ($M$5:$M): una fila final tipeada deja de ver lo nuevo sin dar error.
// · Una obra sin fechas se VE pero no se proyecta: sin inicio no hay ventana para medir el real.
//
// LA VENTA DE UNA OBRA NO SE CUENTA DOS VECES. En Cobranzas conviven la fila madre ("Playon Azufre",
// $58M) y su cronograma de certificaciones ("Playon Azufre - Certificación 1/2…", los mismos $58M).
// Sumar todo lo que matchea duplica la venta. La fórmula prefiere las filas SIN "Certificación" y,
// sólo si no existen (Salón Comercial se cargó únicamente como cronograma), suma las certificaciones.
//
// LA REGLA VALE EN LAS DOS SECCIONES, Y ESO ES UNA CORRECCIÓN (13/08). La versión anterior la aplicaba
// sólo por obra: la Sección 1 sumaba TODO lo que matcheaba el cliente, o sea la madre Y su cronograma.
// El número más grande de la pestaña —"⇒ TOTAL 2026"— era el más inflado, y sin un solo #ERROR. Venta
// se define UNA vez (`ventaSinDuplicar`) y las dos secciones la citan; si mañana cambia el criterio,
// cambia en un lugar. Por lo mismo, las dos excluyen el estado CANCELAR: una venta cancelada no es
// venta en la fila del cliente ni en la de la obra.

import { VACIO } from './preservar-anotaciones.mjs'
import { esProyectable } from './obras-datos.mjs'

export const PESTANA_OBRAS = 'OBRAS'

/** A obra/concepto · B semáforo · C venta/proyectado · D cobrado · E real · F pendiente · G margen ·
 *  H fecha · I prosa. */
export const ANCHO_OBRAS = 9

/** Anchos en píxeles — los importes con aire, la prosa angosta y al final (estándar del dueño). */
export const ANCHOS_OBRAS = [300, 44, 138, 138, 138, 138, 138, 92, 300]

/** Los clientes del año, con el texto CANÓNICO del desplegable (Compras col J / Materiales). */
export const OBRAS_DEL_ANO = [
  'LA ESTRELLA', 'San Francisco', 'MESSINA', 'ARCOR', 'Quattropani - Melisa García SAS', 'SAINT GOBAIN',
]

/**
 * Las columnas de Cobranzas / Compras / Materiales que la grilla cita. Son el DEFECTO para construir
 * en frío; el escritor (`scripts/obras-pestana.mjs`) las resuelve contra el encabezado REAL por
 * rótulo — nunca por letra fija — y falla cerrado si un rótulo no está.
 */
export const REFS_OBRAS = {
  cob: { hoja: 'Cobranzas', cliente: 'G', concepto: 'I', total: 'M', estado: 'O', desde: 5 },
  cmp: { hoja: 'Compras', fecha: 'C', proveedor: 'E', cliente: 'J', total: 'O', desde: 4 },
  mat: { hoja: 'Materiales', filaTotal: 'TOTAL POR OBRA', filaCabecera: '2 · POR OBRA' },
}

/** El serial de Sheets de una fecha ISO (base 30/12/1899). Es como se ESCRIBE una fecha tipeada. */
export const serialISO = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
}
const ddmm = (iso) => { const [y, m, d] = String(iso).split('-'); return `${d}/${m}/${y.slice(2)}` }
const ars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

const abierto = (c, campo) => `'${c.hoja}'!$${c[campo]}$${c.desde}:$${c[campo]}`

/** El texto que delata una fila del cronograma. Va CORTADO a propósito: "Certificación" y
 *  "Certificacion" existen los dos en el archivo y un needle con acento perdonaría al sin acento —
 *  y perdonarlo es volver a duplicar la venta. */
const CERT = 'Certificaci'

/** El estado que saca una fila de la venta: cancelada, no vendida. */
const NO_VENTA = 'CANCELAR'

/**
 * LA VENTA VIVA, CONTADA UNA SOLA VEZ — la única definición de "venta" de esta pestaña.
 *
 * `criterios` son los pares campo/criterio que acotan QUÉ se está vendiendo (un cliente entero en la
 * Sección 1, una obra en la Sección 2). El anti-duplicado es el mismo para los dos: si existen filas
 * fuera del cronograma, ésas son la venta; si la obra se cargó SÓLO como cronograma (Salón Comercial),
 * recién ahí suman las certificaciones.
 */
function ventaSinDuplicar(cob, criterios) {
  const base = `${abierto(cob, 'total')};${criterios};${abierto(cob, 'estado')};"<>${NO_VENTA}"`
  const sinCert = `SUMIFS(${base};${abierto(cob, 'concepto')};"<>*${CERT}*")`
  return `=IF(${sinCert}>0;${sinCert};SUMIFS(${base}))`
}

/** Mismo constructor de grilla que el anexo de CAJA: push devuelve la fila 1-based, y toda celda
 *  vacía sale con el centinela VACIO ("es mía y va vacía") para que la fusión la limpie. */
function hoja() {
  const filas = []
  const h = {
    filas,
    tipeadas: [],
    get n() { return filas.length },
    push(c = []) {
      const r = [...c].map((x) => (x === '' || x === undefined || x === null ? VACIO : x))
      while (r.length < ANCHO_OBRAS) r.push(VACIO)
      r.length = ANCHO_OBRAS
      filas.push(r)
      return filas.length
    },
  }
  return h
}

/**
 * SECCIÓN 1 — LAS OBRAS DEL AÑO, POR CLIENTE. Todo fórmula viva.
 *
 * La venta sale de Cobranzas por el TEXTO del cliente (col "Obra / Cliente") con comodines, porque el
 * archivo real escribe "LA ESTRELLA /ALIMENTOS DEL SUR SAS" o "IMOTOR/San Francisco/JAVI SANCHEZ": un
 * match exacto daría $0 sin error. El gasto real en materiales lo declara la pestaña Materiales en su
 * fila "TOTAL POR OBRA", citada por rótulo con INDEX/MATCH — nunca por número de fila.
 */
function seccionObrasDelAno(h, refs, clientes) {
  const { cob, mat } = refs
  h.push(['1 · OBRAS DEL AÑO'])
  h.push(['Cliente', '', 'Venta', 'Cobrado', 'Pendiente de cobro', 'Materiales (real)', '', '', ''])
  const f0 = h.n + 1
  for (const cli of clientes) {
    const f = h.n + 1
    h.push([cli, '',
      ventaSinDuplicar(cob, `${abierto(cob, 'cliente')};"*"&$A${f}&"*"`),
      `=SUMIFS(${abierto(cob, 'total')};${abierto(cob, 'cliente')};"*"&$A${f}&"*";${abierto(cob, 'estado')};"Cobrado")`,
      `=C${f}-D${f}`,
      `=IFERROR(INDEX('${mat.hoja}'!$A:$Z;MATCH("${mat.filaTotal}";'${mat.hoja}'!$A:$A;0);`
        + `MATCH($A${f};INDEX('${mat.hoja}'!$A:$Z;MATCH("${mat.filaCabecera}";'${mat.hoja}'!$A:$A;0)+1;0);0));"—")`,
      '', '', ''])
  }
  const f1 = h.n
  const fTot = h.push(['⇒ TOTAL 2026', '', `=SUM(C${f0}:C${f1})`, `=SUM(D${f0}:D${f1})`,
    `=SUM(E${f0}:E${f1})`, `=SUM(F${f0}:F${f1})`, '', '',
    'Cobranzas, por el texto del cliente · Materiales, fila "TOTAL POR OBRA"'])
  h.push([])
  return { fClientes: [f0, f1], fTot }
}

/** La venta viva de UNA obra: el cliente y, dentro de él, el texto con el que la obra aparece en el
 *  Concepto. El anti-duplicado lo pone `ventaSinDuplicar`, igual que en la Sección 1. */
const formulaVentaObra = (cob, cliente, needle) =>
  ventaSinDuplicar(cob, `${abierto(cob, 'cliente')};"*${cliente}*";${abierto(cob, 'concepto')};"*${needle}*"`)

/** Lo REALMENTE facturado en Compras para un egreso: mismo proveedor (col E, nombre canónico), mismo
 *  cliente (col J) y fecha de factura desde el inicio de la obra — que se lee de la celda H de la
 *  fila protagonista, no de una fecha pegada en la fórmula. */
function formulaRealEgreso(cmp, proveedor, cliente, fProt) {
  return `=SUMIFS(${abierto(cmp, 'total')};${abierto(cmp, 'proveedor')};"${proveedor}";`
    + `${abierto(cmp, 'cliente')};"${cliente}";${abierto(cmp, 'fecha')};">="&$H$${fProt})`
}

/** La prosa consolidada de la obra: fechas · plantel · % ejecutado · notas del dueño. UNA celda. */
function prosaDeObra(o, proyectable) {
  const p = []
  if (proyectable) p.push(`del ${ddmm(o.inicio)} al ${ddmm(o.fin)}`)
  else p.push('⚠ sin fechas — no se proyecta')
  if (o.plantelFullTime != null) {
    p.push(`${o.plantelFullTime} full time${o.plantelTemporales ? ` + ${o.plantelTemporales} temporales` : ''}`)
  }
  if (o.pctEjecutado) p.push(`${Math.round(o.pctEjecutado * 100)}% ejecutado — montos al ${Math.round((1 - o.pctEjecutado) * 100)}% restante`)
  if (o.notas) p.push(o.notas)
  return p.join(' · ')
}

/** La prosa corta de un egreso: cuotas y nota. El origen (explosión del dueño) se declara UNA vez,
 *  en el subtítulo de la sección — no repetido en cada renglón. */
function prosaDeEgreso(e) {
  const p = []
  if (e.cuotas?.length) p.push(`${e.cuotas.length} cuotas: ${e.cuotas.map((c) => `${ddmm(c.fecha).slice(0, 5)} ${ars(c.monto)}`).join(' · ')}`)
  if (e.nota) p.push(e.nota)
  return p.join(' · ')
}

/**
 * UN BLOQUE DE OBRA: la fila protagonista y su detalle.
 *
 * La protagonista se empuja PRIMERO y sus sumas citan las filas del detalle, que se conocen antes de
 * empujarlas (el patrón del anexo de CAJA). El costo real es la suma de lo medible: los egresos con
 * proveedor declarado, contra Compras. La MO no se mide acá — va por Jornales — y su pendiente es el
 * monto entero, declarado en prosa.
 */
function bloqueObra(h, refs, o, idx) {
  const { cob, cmp } = refs
  // La definición de "se puede proyectar" vive en obras-datos.mjs, no acá: repetirla como
  // `o.inicio && o.fin` es la segunda versión del mismo concepto esperando a divergir.
  const proyectable = esProyectable(o)
  const fProt = h.n + 1
  const nDetalle = (o.egresos?.length ?? 0) + 1 // egresos + la fila de MO
  const [f0, f1] = [fProt + 1, fProt + nDetalle]

  h.push([`2.${idx} · ${o.cliente} — ${o.obra}${proyectable ? '' : '   ⚠ sin fechas — no se proyecta'}`,
    `=IF(G${fProt}>=0;"✓";"⚠")`,
    formulaVentaObra(cob, o.cliente, o.ventaTexto),
    `=SUMIFS(${abierto(cob, 'total')};${abierto(cob, 'cliente')};"*${o.cliente}*";${abierto(cob, 'concepto')};"*${o.ventaTexto}*";${abierto(cob, 'estado')};"Cobrado")`,
    `=SUM(E${f0}:E${f1})`, `=SUM(F${f0}:F${f1})`, `=C${fProt}-E${fProt}-F${fProt}`,
    proyectable ? serialISO(o.inicio) : '',
    prosaDeObra(o, proyectable)])
  if (proyectable) h.tipeadas.push({ fila: fProt, col: 7 })

  for (const e of o.egresos ?? []) {
    const f = h.n + 1
    const fecha = e.cuotas?.length ? e.cuotas[0].fecha : e.fechaEstimada
    const medible = Boolean(e.proveedor && proyectable)
    h.push([`      ${e.concepto}`, '', e.monto, '',
      medible ? formulaRealEgreso(cmp, e.proveedor, o.cliente, fProt) : '',
      medible ? `=MAX(0;C${f}-E${f})` : `=MAX(0;C${f})`,
      '', fecha ? serialISO(fecha) : '',
      [e.proveedor ?? '⚠ sin proveedor: el real no se puede medir', prosaDeEgreso(e)].filter(Boolean).join(' · ')])
    h.tipeadas.push({ fila: f, col: 2 })
    if (fecha) h.tipeadas.push({ fila: f, col: 7 })
  }

  const fMO = h.n + 1
  h.push(['      Mano de obra + cargas sociales', '', o.moCargasPesos, '', '', `=C${fMO}`, '', '',
    `va por Jornales, no por Compras · horas: ${o.horas.oficialEspecializado} esp / ${o.horas.oficial} of / ${o.horas.ayudante} ay`])
  h.tipeadas.push({ fila: fMO, col: 2 })

  let fNoCaja = null
  if (o.noCaja?.maquinaPropia) {
    fNoCaja = h.push(['      ⊘ Máquina propia — no es plata que sale', '', o.noCaja.maquinaPropia,
      '', '', '', '', '', 'uso de equipo propio: NUNCA entra al flujo de caja ni a los totales'])
    h.tipeadas.push({ fila: fNoCaja, col: 2 })
  }
  h.push([])
  return { clave: o.clave, fProt, fDetalle: [f0, f1], fMO, fNoCaja, proyectable }
}

/**
 * LA GRILLA COMPLETA DE `OBRAS`.
 *
 * @param {object} ctx `obras` (defecto: OBRAS_FUTURAS de obras-datos.mjs, inyectable en los tests),
 *   `refs` (defecto: REFS_OBRAS; el escritor pasa las resueltas por rótulo), `clientes`.
 * @returns {{filas:Array, tipeadas:Array, protagonistas:number[], detalles:number[], totales:number[],
 *   bloques:Array, fClientes:number[]}} `bloques` expone la anatomía de cada obra (protagonista,
 *   rango de detalle, MO, no-caja) para que la verificación mire la estructura y no el texto.
 */
export function grillaObras(ctx = {}) {
  const refs = { ...REFS_OBRAS, ...ctx.refs }
  const obras = ctx.obras ?? []
  const clientes = ctx.clientes ?? OBRAS_DEL_ANO
  const h = hoja()

  h.push([`${PESTANA_OBRAS} — EL AÑO ENTERO, OBRA POR OBRA`])
  h.push(['Venta, cobrado y costo real por fórmula viva (Cobranzas · Compras · Materiales). Los únicos números tipeados son los PROYECTADOS de la sección 2: la explosión de gastos del dueño (PDFs, 07/08/2026), en obras-datos.mjs.'])
  h.push([])

  const s1 = seccionObrasDelAno(h, refs, clientes)

  h.push(['2 · OBRAS EN CURSO Y FUTURAS'])
  h.push(['Obra', '', 'Venta / Proyectado', 'Cobrado', 'Real', 'Pendiente', 'Margen', 'Inicio', ''])
  const bloques = obras.map((o, i) => bloqueObra(h, refs, o, i + 1))
  const suma = (col) => `=${bloques.map((b) => `${col}${b.fProt}`).join('+')}`
  const fTot2 = bloques.length
    ? h.push(['⇒ TOTAL — OBRAS EN CURSO Y FUTURAS', '', suma('C'), suma('D'), suma('E'), suma('F'), suma('G'), '',
      'margen = venta − real − pendiente · la MO pendiente va entera (se paga por Jornales)'])
    : null

  const totales = [s1.fTot, fTot2].filter(Boolean)
  return {
    filas: h.filas,
    tipeadas: h.tipeadas,
    protagonistas: bloques.map((b) => b.fProt),
    detalles: bloques.flatMap((b) => { const r = []; for (let f = b.fDetalle[0]; f <= b.fDetalle[1]; f++) r.push(f); return b.fNoCaja ? [...r, b.fNoCaja] : r }),
    totales,
    bloques,
    fClientes: s1.fClientes,
  }
}
