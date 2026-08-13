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
// ═══ LA VENTA DE UNA OBRA SON TODAS SUS FILAS. NO SE DESCARTA NINGUNA (13/08) ═══
//
// ACÁ VIVIÓ UN DEFECTO Y VALE LA PENA DEJARLO ESCRITO, PORQUE ERA CONVINCENTE. Dos versiones de este
// archivo afirmaron que en Cobranzas convivían "la fila madre" de la obra y su cronograma de
// certificaciones por el mismo importe, y que sumar todo duplicaba la venta. La fórmula descartaba
// entonces las filas que dijeran "Certificaci". Era falso, y lo pagó el archivo real: la pestaña
// publicó $624.243.320 de venta 2026 cuando Cobranzas suma $808.994.353, y mostró Instalación
// Eléctrica con margen NEGATIVO y semáforo ⚠ por comparar el costo entero contra media venta.
//
// LO QUE DICEN LOS DATOS (91 filas de public.cobranzas, verificadas una por una). No existe ninguna
// fila madre: las filas SIN "Certificación" son los ANTICIPOS y su propia columna de orden de compra
// lo dice —"Anticipo inicio obra 50% $ 47.590.272"—, mientras las certificaciones dicen "Resto 50%
// s/ total 47.590.272". Anticipo + certificaciones = 100% del contrato, y ninguna repite a otra.
//
// POR QUÉ ENGAÑABA: como el reparto es 50/50, la suma de los anticipos da EXACTAMENTE igual que la de
// las certificaciones. Dos números idénticos parecen un duplicado. Lo son sólo si uno mira los
// importes y no el concepto — que es justo lo que pasó, y encima quedó escrito como premisa para el
// que viniera después. Un comentario del código no es evidencia de nada: la evidencia es el dato.
//
// LA REGLA HOY: venta = TODAS las filas del cliente/obra, sin descartar por concepto. Lo único que se
// excluye es el estado CANCELAR, que es una venta que dejó de existir, no una fila repetida.
//
// ═══ EL CLIENTE SE ANCLA AL PRINCIPIO DEL TEXTO, NO SE BUSCA ADENTRO ═══
//
// El archivo escribe "LA ESTRELLA /ALIMENTOS DEL SUR SAS", así que el match no puede ser exacto. Pero
// buscar "*San Francisco*" adentro capturaba también "IMOTOR/San Francisco/JAVI SANCHEZ" —otro
// cliente, con sus propias 9 filas y $104.765.646— y lo sumaba a San Francisco. Anclar al PREFIJO
// resuelve los dos casos a la vez, y está verificado contra los 9 clientes reales del archivo.

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

/** El estado que saca una fila de la venta: cancelada, no vendida. Es lo ÚNICO que se descarta. */
const NO_VENTA = 'CANCELAR'

/** El criterio que ancla un cliente al PRINCIPIO de "Obra / Cliente": "San Francisco" toma
 *  "San Francisco" pero no "IMOTOR/San Francisco/JAVI SANCHEZ", que es otro cliente. */
export const anclaCliente = (texto) => `${texto}*`

/**
 * LA VENTA VIVA — la única definición de "venta" de esta pestaña.
 *
 * `criterios` son los pares campo/criterio que acotan QUÉ se está vendiendo (un cliente entero en la
 * Sección 1, una obra en la Sección 2). SUMA TODAS LAS FILAS que caen adentro: anticipo y
 * certificaciones son partes distintas del mismo contrato, no la misma plata dos veces.
 */
function venta(cob, criterios) {
  return `=SUMIFS(${abierto(cob, 'total')};${criterios};${abierto(cob, 'estado')};"<>${NO_VENTA}")`
}

/** Lo cobrado bajo los mismos criterios: mismas filas, filtradas por estado. */
function cobrado(cob, criterios) {
  return `=SUMIFS(${abierto(cob, 'total')};${criterios};${abierto(cob, 'estado')};"Cobrado")`
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
 * El cliente se ancla al PREFIJO de "Obra / Cliente": el archivo escribe "LA ESTRELLA /ALIMENTOS DEL
 * SUR SAS", así que un match exacto daría $0, pero buscarlo adentro le sumaba a San Francisco las 9
 * filas de "IMOTOR/San Francisco/JAVI SANCHEZ", que es otro cliente. El gasto real en materiales lo
 * declara la pestaña Materiales en su fila "TOTAL POR OBRA", citada por rótulo con INDEX/MATCH.
 *
 * EL TOTAL NO ES LA SUMA DE LAS FILAS DE ARRIBA: sale de Cobranzas entera. Y la diferencia contra los
 * clientes listados se publica en su propia fila, con nombre. Así la pestaña se concilia sola contra
 * su fuente y ningún cliente puede desaparecer del número grande sin que se vea dónde fue — que es
 * exactamente lo que pasó cuando el total decía $624M sobre una fuente de $809M.
 */
function seccionObrasDelAno(h, refs, clientes) {
  const { cob, mat } = refs
  h.push(['1 · OBRAS DEL AÑO'])
  h.push(['Cliente', '', 'Venta', 'Cobrado', 'Pendiente de cobro', 'Materiales (real)', '', '', ''])
  const f0 = h.n + 1
  for (const cli of clientes) {
    const f = h.n + 1
    const porCliente = `${abierto(cob, 'cliente')};$A${f}&"*"`
    h.push([cli, '', venta(cob, porCliente), cobrado(cob, porCliente), `=C${f}-D${f}`,
      `=IFERROR(INDEX('${mat.hoja}'!$A:$Z;MATCH("${mat.filaTotal}";'${mat.hoja}'!$A:$A;0);`
        + `MATCH($A${f};INDEX('${mat.hoja}'!$A:$Z;MATCH("${mat.filaCabecera}";'${mat.hoja}'!$A:$A;0)+1;0);0));"—")`,
      '', '', ''])
  }
  const f1 = h.n
  // COBRANZAS ENTERA, sin filtrar por cliente. El único criterio es el estado, así que una fila con la
  // columna de cliente vacía entra igual: si dependiera del cliente, el residuo podría esconder plata.
  const todoElArchivo = `SUMIFS(${abierto(cob, 'total')};${abierto(cob, 'estado')};"<>${NO_VENTA}")`
  const todoCobrado = `SUMIFS(${abierto(cob, 'total')};${abierto(cob, 'estado')};"Cobrado")`
  const fOtros = h.n + 1
  h.push(['Otros clientes — no listados arriba', '',
    `=${todoElArchivo}-SUM(C${f0}:C${f1})`, `=${todoCobrado}-SUM(D${f0}:D${f1})`,
    `=C${fOtros}-D${fOtros}`, '', '', '',
    'lo que hay en Cobranzas y no tiene fila propia acá — si crece, falta un cliente en la lista'])
  const fTot = h.push(['⇒ TOTAL 2026', '', `=SUM(C${f0}:C${fOtros})`, `=SUM(D${f0}:D${fOtros})`,
    `=SUM(E${f0}:E${fOtros})`, `=SUM(F${f0}:F${f1})`, '', '',
    'venta y cobrado = Cobranzas completa · Materiales, fila "TOTAL POR OBRA"'])
  h.push([])
  return { fClientes: [f0, f1], fOtros, fTot }
}

/** La venta viva de UNA obra: el cliente anclado al prefijo y, dentro de él, el texto con el que la
 *  obra aparece en el Concepto. Suma anticipo Y certificaciones: son partes del mismo contrato. */
const criteriosObra = (cob, cliente, needle) =>
  `${abierto(cob, 'cliente')};"${anclaCliente(cliente)}";${abierto(cob, 'concepto')};"*${needle}*"`

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
    venta(cob, criteriosObra(cob, o.cliente, o.ventaTexto)),
    cobrado(cob, criteriosObra(cob, o.cliente, o.ventaTexto)),
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
    fOtros: s1.fOtros,
  }
}
