// LAS FACTURAS EMITIDAS QUE VIVEN EN DRIVE, IDENTIFICADAS POR SU NOMBRE.
//
// ARCA nombra los comprobantes que descarga con un patrón fijo:
//
//     30716304643_001_00001_00000220.pdf
//     └─ CUIT ──┘ └tipo┘ └ p.venta ┘ └ número ┘
//
// Ese nombre es un DATO, no decoración: dice de qué tipo de comprobante se trata y qué número
// tiene, sin abrir el PDF. Leerlo del nombre evita bajar 171 archivos para saber cuáles son ocho.
//
// ═══ LA FECHA NO ESTÁ EN EL NOMBRE ═══
//
// El nombre no dice cuándo se emitió. Se usa `modifiedTime` de Drive, que es cuándo se subió — y
// eso es una INFERENCIA, no un hecho: si alguien vuelve a subir un comprobante viejo, su fecha de
// Drive miente. Por eso el resultado se cruza SIEMPRE contra el libro de IVA de ARCA, que sí tiene
// la fecha de emisión real, y lo que no cruza se declara en vez de darse por bueno.

/** Tipos de comprobante de ARCA que aparecen en estas carpetas. */
export const TIPOS = Object.freeze({
  '001': 'Factura A',
  '002': 'Nota de débito A',
  '003': 'Nota de crédito A',
  '006': 'Factura B',
  '008': 'Nota de crédito B',
  '011': 'Factura C',
  '013': 'Nota de crédito C',
  '201': 'Factura de crédito MiPyME A',
  '202': 'Nota de débito MiPyME A',
  '203': 'Nota de crédito MiPyME A',
})

/** Los que RESTAN facturación: una nota de crédito no es una venta más. */
export const RESTAN = Object.freeze(new Set(['003', '008', '013', '203']))

const RE = /^(\d{11})_(\d{3})_(\d{5})_(\d{8})\.(pdf|PDF)$/

/**
 * Descompone el nombre de un comprobante de ARCA.
 * @param {string} nombre
 * @returns {{cuit:string, tipo:string, tipoNombre:string, puntoVenta:string, numero:string, comprobante:string, resta:boolean}|null}
 */
export function leerNombre(nombre) {
  const m = RE.exec(String(nombre ?? '').trim())
  if (!m) return null
  const [, cuit, tipo, puntoVenta, numero] = m
  return {
    cuit,
    tipo,
    tipoNombre: TIPOS[tipo] ?? `Tipo ${tipo}`,
    puntoVenta,
    numero,
    // El formato con el que se cruza contra ARCA y contra Cobranzas: 0001-00000220.
    comprobante: `${puntoVenta.slice(-4)}-${numero}`,
    resta: RESTAN.has(tipo),
  }
}

/** ¿La fecha ISO cae dentro del mes `aaaa-mm`? */
export function esDelMes(iso, mes) {
  return String(iso ?? '').slice(0, 7) === String(mes ?? '')
}

/** El CUIT de Echegaray: en el PDF aparecen dos, el emisor y el cliente. */
export const CUIT_PROPIO = '30716304643'

const aISO = (dmy) => { const [d, m, a] = dmy.split('/'); return `${a}-${m}-${d}` }
const importe = (s) => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0

/**
 * LEE LO QUE DICE EL PDF POR DENTRO. La fecha de emisión sale de acá, no de Drive.
 *
 * ═══ POR QUÉ LA FECHA ES "LA QUE MÁS SE REPITE" ═══
 *
 * El extractor de texto no conserva la posición, así que la etiqueta "Fecha de Emisión:" termina
 * lejos de su valor y no se puede leer por vecindad. Pero el comprobante de ARCA imprime la fecha
 * de emisión CUATRO veces (original, duplicado, triplicado y el encabezado), mientras que las otras
 * dos fechas del documento —inicio de actividades y vencimiento del CAE— aparecen una sola vez.
 * La moda es un discriminador limpio, y si empatara devuelve `null` en vez de elegir al azar.
 *
 * @param {string} texto
 * @returns {{fecha:string|null, clienteCuit:string|null, cliente:string|null, total:number,
 *            neto:number, iva:number, cae:string|null, concepto:string|null}}
 */
export function leerPdf(texto = '') {
  const t = String(texto)
  const fechas = [...t.matchAll(/\b(\d{2}\/\d{2}\/\d{4})\b/g)].map((m) => m[1])
  const cuenta = new Map()
  for (const f of fechas) cuenta.set(f, (cuenta.get(f) ?? 0) + 1)
  const orden = [...cuenta.entries()].sort((a, b) => b[1] - a[1])
  // Empate en el primer puesto = no hay moda. Antes que inventar una fecha, no hay fecha.
  const fecha = orden.length && (orden.length === 1 || orden[0][1] > orden[1][1]) ? aISO(orden[0][0]) : null

  // El cliente es el CUIT que NO es el propio, y su razón social viene pegada en la misma línea.
  const cli = [...t.matchAll(/\b(\d{11})\b[ \t]*([^\n]*)/g)]
    .map((m) => ({ cuit: m[1], resto: m[2].trim() }))
    .find((x) => x.cuit !== CUIT_PROPIO)
  const num = (re) => { const m = re.exec(t); return m ? importe(m[1]) : 0 }

  return {
    fecha,
    clienteCuit: cli?.cuit ?? null,
    cliente: cli?.resto || null,
    total: num(/Importe Total:\s*\$\s*([\d.,]+)/i),
    neto: num(/Importe Neto Gravado:\s*\$\s*([\d.,]+)/i),
    iva: num(/IVA 21%:\s*\$\s*([\d.,]+)/i),
    cae: (/CAE N°:[\s\S]{0,80}?\b(\d{14})\b/.exec(t)?.[1]) ?? null,
    concepto: (/^\s*\d{4}\s+(.+?)\s+[\d.,]+\s+unidades/mi.exec(t)?.[1] ?? '').trim() || null,
  }
}

/**
 * Filtra y ordena los comprobantes de un mes.
 *
 * @param {Array<{id:string,name:string,mimeType:string,modifiedTime:string,size?:string}>} archivos
 * @param {string} mes formato `aaaa-mm`
 * @returns {Array<{id:string,name:string,fecha:string} & ReturnType<typeof leerNombre>>}
 */
export function delMes(archivos = [], mes) {
  return archivos
    .filter((a) => !String(a.mimeType ?? '').includes('folder') && esDelMes(a.modifiedTime, mes))
    .map((a) => {
      const n = leerNombre(a.name)
      return n && { id: a.id, name: a.name, fecha: String(a.modifiedTime).slice(0, 10), tamaño: Number(a.size) || 0, ...n }
    })
    .filter(Boolean)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero))
}

/**
 * CRUZA lo que hay en Drive contra lo que ARCA registró.
 *
 * Los dos lados importan y por motivos distintos:
 *   · en Drive y no en ARCA → el PDF existe y el comprobante no está declarado, o el nombre engaña;
 *   · en ARCA y no en Drive → se facturó y el respaldo no está guardado.
 * Entregar sólo la primera lista es entregar media respuesta.
 *
 * @param {Array<{comprobante:string}>} enDrive
 * @param {Array<{comprobante:string, importe?:number, fecha?:string}>} enArca
 */
export function cruzar(enDrive = [], enArca = []) {
  const drive = new Map(enDrive.map((d) => [d.comprobante, d]))
  const arca = new Map(enArca.map((a) => [a.comprobante, a]))
  return {
    coinciden: enDrive.filter((d) => arca.has(d.comprobante))
      .map((d) => ({ ...d, importe: Number(arca.get(d.comprobante)?.importe) || 0 })),
    soloDrive: enDrive.filter((d) => !arca.has(d.comprobante)),
    soloArca: enArca.filter((a) => !drive.has(a.comprobante)),
  }
}

const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')

/**
 * El mensaje que se le manda al dueño. Declara lo que no cierra en vez de callarlo.
 * @param {string} mes
 * @param {ReturnType<typeof cruzar>} cruce
 */
export function mensaje(mes, { coinciden = [], soloDrive = [], soloArca = [] } = {}) {
  const [aa, mm] = String(mes).split('-')
  const nombreMes = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][Number(mm)] ?? mes
  const total = coinciden.reduce((a, d) => a + (d.resta ? -d.importe : d.importe), 0)

  const L = [`**Facturas de venta emitidas en ${nombreMes} de ${aa}** — ${coinciden.length + soloDrive.length} comprobante(s) desde Drive`, '']
  L.push('| Fecha | Comprobante | Tipo | Importe |', '|---|---|---|---:|')
  for (const d of [...coinciden, ...soloDrive]) {
    const f = d.fecha.split('-').reverse().join('/')
    const imp = d.importe === undefined ? '—' : (d.resta ? '−' : '') + plata(d.importe)
    L.push(`| ${f} | ${d.comprobante} | ${d.tipoNombre} | ${imp} |`)
  }
  if (coinciden.length) L.push(`| | | **Total neto** | **${plata(total)}** |`)
  L.push('')

  if (soloDrive.length) {
    L.push(`⚠ **${soloDrive.length} PDF en Drive que el libro de IVA de ARCA no registra**: `
      + soloDrive.map((d) => d.comprobante).join(' · '))
  }
  if (soloArca.length) {
    L.push(`⚠ **${soloArca.length} comprobante(s) que ARCA registra y no tienen PDF guardado**: `
      + soloArca.map((a) => `${a.comprobante} (${plata(a.importe)})`).join(' · '))
  }
  if (!soloDrive.length && !soloArca.length && coinciden.length) {
    L.push('✓ Los PDF de Drive y el libro de IVA de ARCA coinciden uno a uno.')
  }
  L.push('', '_La fecha sale de cuándo se subió el archivo a Drive, no del PDF. Donde el comprobante cruza con ARCA, el importe y el número son de ARCA._')
  return L.join('\n')
}
