// UN LIBRO DE COTIZACIÓN DE VERDAD, EN BYTES — la única entrada válida para probar estos controles.
//
// ═══ POR QUÉ ESTO NO VIVE ADENTRO DE UN TEST ═══
//
// El negative test de un control tiene que construir el defecto por la RUTA DE PRODUCCIÓN: bytes →
// `leerArchivo` → `leerOferta`/`leerPresupuesto`/`leerGastosGenerales` → la regla. Los cuatro
// defectos que aparecieron mientras se escribía este circuito —el valor cacheado de una celda en
// error, el rango que no empieza en A1, `cellFormula: false` y `Number('')` valiendo 0— vivían
// TODOS en ese tramo. Un test que arma la cotización a mano empieza después del tramo donde estaban
// los bugs y los deja pasar a los cuatro.
//
// Estaba adentro de `cotizaciones.test.mjs`. Se sacó acá porque ahora lo usan dos archivos de test,
// y dos copias de un armador de fixtures divergen: la segunda copia deja de reproducir el defecto y
// nadie se entera, porque el test sigue en verde.
//
// Mismo lugar y mismo criterio que `lib/cobranzas-fixture.mjs` y `lib/jornales-fixture.mjs`.
import { createRequire } from 'node:module'
import { estudiarTanda } from './estudio-cotizaciones.mjs'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

/** Los códigos con los que Excel guarda cada error de fórmula. El VALOR CACHEADO de `#DIV/0!` es 7,
 *  y ese 7 es el que se coló como si fuera plata hasta que el lector aprendió a distinguirlo. */
export const CODIGO_DE_ERROR = Object.freeze({
  '#NULL!': 0x00, '#DIV/0!': 0x07, '#VALUE!': 0x0f, '#REF!': 0x17,
  '#NAME?': 0x1d, '#NUM!': 0x24, '#N/A': 0x2a,
})

/** El código de `#DIV/0!`, que es el caso medido en ARCOR · Concentrador Rossi. */
export const DIV_CERO = CODIGO_DE_ERROR['#DIV/0!']

/** Una celda en error, tal como la escribe Excel: con su código numérico y su texto. PURA. */
export const celdaEnError = (texto) => ({ t: 'e', v: CODIGO_DE_ERROR[texto] ?? DIV_CERO, w: texto })

/** Un renglón de análisis: código, descripción, unidad y las horas por unidad al final. */
export const filaAnalisis = (cod, desc, un, ofH, ayH) => [cod, null, desc, un, null, null, 1000, 500, 500, 0, 46000, null, ofH, ayH]

export const ENCABEZADO_ANALISIS = ['COD T', 'COD R', 'DESCRIPCION', 'UN', 'CANTIDAD', 'COSTO', 'TOTAL', 'MO', 'MA', 'CS', 'FECHA', 'CONSIDERACIONES', 'OF E - OF', 'AY']
export const ENCABEZADO_PRESUPUESTO = ['ID TAREA', 'ID', 'TAREA', 'U.', 'CANT.', 'COSTO U TOTAL', 'COEF. AJUSTE', 'SUBTOTAL', 'FECHA', 'COSTO MO', 'COSTO MA', 'COSTO CS']

/** El nombre con el que cada pestaña entra al libro, en el orden en que lo arma la plantilla real. */
const PESTANA = Object.freeze({ OFERTA: 'OFERTA', PRESUPUESTO: 'Presupuesto', ANALISIS: 'Análisis', GG: 'GG' })

/**
 * ARMA UN LIBRO CON LA MISMA FORMA QUE LA PLANTILLA REAL DE ECSAS.
 *
 * `ivaConFormula` y `subtotalRoto` existen para poder producir los dos casos que se encontraron en
 * Drive: el IVA tipeado a mano al lado de un error, y el cierre entero en `#DIV/0!`.
 *
 * `erroresExtra` y `formulasExtra` escriben celdas ARBITRARIAS de cualquier pestaña. Sin eso no se
 * puede armar el caso de «la fórmula apunta a una celda rota»: hace falta una celda en error Y otra
 * que la referencie, y ninguna de las dos es parte del cierre de la oferta.
 */
export function libroDeCotizacion({
  items = [['REPLANTEO', 'M2', 10, 100, 1000]], subtotal = 1000, iva = 210, total = 1210,
  ivaConFormula = true, subtotalRoto = false, partidas = [filaAnalisis('T1001', 'REPLANTEO', 'M2', 0.06, 0.06)],
  codigosUsados = ['T1001'], unidadesPresupuesto = ['M2'], coeficientesAjuste = [1], tareasExtra = [], rotuloGG = 'Gastos contables (0.6 % de CD)',
  coeficienteGG = 0.006, importeGG = 600, cliente = 'CLIENTE UNO', bloquesAjenos = [], notas = ['Nota 1: solo mano de obra'],
  erroresExtra = [], formulasExtra = [], filasPresupuesto = null,
} = {}) {
  const oferta = [
    [], [], [], [], [], [],
    [cliente, null, null, null, null, ...bloquesAjenos],
    [], [], [], [],
    ['TAREA', 'UN', 'Cant', 'Precio Unicario', 'Sub Total'],
    [],
    ...items,
    [],
    [null, null, 'SUB TOTAL ', null, subtotal],
    [null, null, 'IVA', null, iva],
    [null, null, 'TOTAL', null, total],
    [],
    ...notas.map((n) => [n]),
    ['Forma de Pago: Anticipo 40%'],
  ]
  const hOferta = XLSX.utils.aoa_to_sheet(oferta)
  // 1-based: encabezado en la 12, una fila en blanco, los ítems, otra en blanco y ahí el SUB TOTAL.
  const filaCierre = 15 + items.length
  if (subtotalRoto) {
    hOferta[`E${filaCierre}`] = celdaEnError('#DIV/0!')
    hOferta[`E${filaCierre + 2}`] = celdaEnError('#DIV/0!')
  }
  if (ivaConFormula) hOferta[`E${filaCierre + 1}`] = { t: 'n', v: iva, f: `E${filaCierre}*0.21` }

  const presupuesto = filasPresupuesto ?? [
    ['PRESUPUESTO GENERAL'], [], [], [], [], [],
    ENCABEZADO_PRESUPUESTO,
    ['ESTRUCTURA'],
    ...codigosUsados.map((c, i) => [1, c, `TAREA ${c}`, unidadesPresupuesto[i] ?? 'M2', 10, 100, coeficientesAjuste[i] ?? 1, 1000, 46000, 500, 500, 0]),
    ...tareasExtra.map((t) => [null, 'T9999', t, 'M2', 1, 1, 1, 1, 46000, 0, 0, 0]),
  ]
  const gg = [
    [0], [], [],
    ['COSTOS DIRECTOS (Sin IVA)', null, null, null, null, null, null, null, 100000],
    [], ['COSTOS INDIRECTOS (Sin IVA)', null, null, null, null, null, null, null, 50000],
    [], [null, 'Gastos Comunes de obra:'],
    [null, 'BAÑO QUIMICO', null, null, 50000, 'por mes', 3, 150000],
    [null, 'Gastos Generales de la Empresa:'],
    [null, rotuloGG, null, null, null, 1, coeficienteGG, importeGG],
    [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
    ['BENEFICIO', null, null, 0.15, 0.02, 0.17],
  ]
  const hojas = {
    [PESTANA.OFERTA]: hOferta,
    [PESTANA.PRESUPUESTO]: XLSX.utils.aoa_to_sheet(presupuesto),
    [PESTANA.ANALISIS]: XLSX.utils.aoa_to_sheet([['ANALISIS DE COSTOS'], [], [], [], ENCABEZADO_ANALISIS, ...partidas]),
    [PESTANA.GG]: XLSX.utils.aoa_to_sheet(gg),
  }
  // Una celda escrita FUERA del `!ref` de la hoja no la lee nadie: `filasDeHoja` recorre el rango
  // declarado. Por eso además de escribirla hay que estirar el rango, o el fixture produciría un
  // defecto que el lector no puede ver y el test daría verde por el motivo equivocado.
  for (const { hoja, celda, texto } of erroresExtra) escribir(hojas[hoja], celda, celdaEnError(texto))
  for (const { hoja, celda, formula, valor = 0 } of formulasExtra) escribir(hojas[hoja], celda, { t: 'n', v: valor, f: formula })

  const wb = XLSX.utils.book_new()
  for (const [nombre, hoja] of Object.entries(hojas)) XLSX.utils.book_append_sheet(wb, hoja, nombre)
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

/** Escribe una celda y estira el `!ref` de la hoja para que el lector la alcance. */
function escribir(hoja, celda, contenido) {
  if (!hoja) throw new Error(`el fixture no tiene la pestaña pedida para escribir ${celda}`)
  hoja[celda] = contenido
  const r = XLSX.utils.decode_range(hoja['!ref'] ?? 'A1:A1')
  const c = XLSX.utils.decode_cell(celda)
  r.e.r = Math.max(r.e.r, c.r)
  r.e.c = Math.max(r.e.c, c.c)
  hoja['!ref'] = XLSX.utils.encode_range(r)
}

/** Un archivo listo para `estudiar`: nombre, ruta de Drive y los bytes del libro. PURA. */
export const libro = (nombre, ruta, opciones) => ({ nombre, ruta, bytes: libroDeCotizacion(opciones) })

/** Corre el circuito ENTERO —bytes, hash, parseo, lectura, práctica, hallazgos— igual que el comando. */
export async function estudiar(libros, { obtenidoEn = '2026-08-28', modificado = '2026-08-01', opciones = {} } = {}) {
  const archivos = libros.map((l, i) => ({ driveId: `id${i}`, nombre: l.nombre, ruta: l.ruta, modificado: l.modificado ?? modificado }))
  const porId = new Map(archivos.map((a, i) => [a.driveId, libros[i].bytes]))
  return estudiarTanda(archivos, { traer: (a) => porId.get(a.driveId), obtenidoEn, opciones })
}
