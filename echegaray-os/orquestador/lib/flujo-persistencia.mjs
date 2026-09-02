// EL FLUJO DE FONDOS, MAPEADO A FILAS DE POSTGRES. NÚCLEO PURO: no toca Google, no toca la base.
//
// ═══ QUÉ CONTESTA ESTE ARCHIVO Y QUÉ NO ═══
//
// Contesta: "dado el libro `_MOVIMIENTOS` ya leído, ¿qué filas van a `flujo_movimiento`,
// `flujo_periodo` y `flujo_asimetria`?". No contesta cómo se lee ni cómo se escribe — eso vive en
// scripts/sync-flujo-fondos.mjs, que es el único que necesita red.
//
// Está separado por la misma razón que `libro-movimientos.mjs`: la parte que decide qué es cada cifra
// se puede probar en frío, con un libro armado a mano, sin credenciales y sin base. Es la única forma
// de verificar que el total de un período cuadra con el detalle que lo sostiene.
//
// ═══ LOS PERÍODOS NO SE COPIAN DE LA PESTAÑA: SE CALCULAN CON SU MISMA DEFINICIÓN ═══
//
// Cada celda de `Cash Flow Mensual` es `formulaMedida(m, desde, hasta)` — un SUMPRODUCT que sale de
// `terminosDeMedida` (lib/cash-flow-medidas.mjs). Acá se toman ESOS MISMOS TÉRMINOS y se evalúan en
// JS con `sumar`, que desde el 02/09 entiende el campo `medida` justamente para poder hacerlo.
//
// La consecuencia es la que importa: no hay una definición para la hoja y otra para la base. Si
// mañana alguien cambia cómo se trata una devolución, cambia en `terminosDeMedida` y las dos
// materializaciones lo siguen. Un test de este archivo lo prueba sobre un libro chico: el total del
// período tiene que ser el neto del libro en esa ventana, exactamente al peso.

import { createHash } from 'node:crypto'
import { sumar } from './libro-movimientos.mjs'
import { MEDIDAS, terminosDeMedida, terminosDeRubro } from './cash-flow-medidas.mjs'
import { RUBROS_INGRESO, RUBROS_EGRESO, OTROS, rubrosDeApertura } from './cash-flow-rubros.mjs'
import { LIBRO } from './libro-sumas.mjs'
import { ventanas, serialDeFecha } from './cash-flow-matriz.mjs'
import { asimetriaDeLaProyeccion } from './cash-flow-asimetria.mjs'

const DIA_MS = 86400000
const EPOCA = Date.UTC(1899, 11, 30)

/** El serial de Sheets a fecha calendario UTC. `2026-01-01` es lo que consulta la analítica. PURA. */
export const fechaDeSerial = (serial) => new Date(EPOCA + Math.round(serial) * DIA_MS)

/** La fecha en ISO corto, que es como entra a una columna `date`. PURA. */
export const iso = (d) => new Date(d).toISOString().slice(0, 10)

/**
 * EL ÍNDICE DE CADA COLUMNA DEL LIBRO, DERIVADO DE `LIBRO.col` Y NO TIPEADO.
 *
 * `libro-sumas.mjs` ya declara qué letra es cada campo, y su propio test comprueba que esas letras
 * son las del ENCABEZADO que escribe el generador. Tipear los índices acá sería la tercera copia del
 * mismo contrato — y la que nadie audita. El comentario de aquel archivo lo dice con su factura: el
 * portón lee por índice y meter una columna en el medio le corre tres campos sin dar un solo error.
 */
export const COL = Object.freeze(Object.fromEntries(
  Object.entries(LIBRO.col).map(([campo, letra]) => [campo, letra.charCodeAt(0) - 65]),
))

const texto = (v) => String(v ?? '').trim()
const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN)

/**
 * NÚCLEO PURO: el libro reconstruido desde el rectángulo YA LEÍDO de `_MOVIMIENTOS`.
 *
 * ═══ POR QUÉ SE LEE LA PESTAÑA Y NO SE REUSA LA MEMORIA DEL GENERADOR ═══
 *
 * Porque no dicen lo mismo, y el que tiene razón es el archivo. Las columnas C y H de las filas de
 * Compras son FÓRMULAS VIVAS (ver lib/libro-estado-vivo.mjs): el estado se pregunta solo si el dueño
 * ya marcó el pago, y el importe es el saldo Total−Pagado. El propio generador lo dice: *"para una
 * fila autopromovida el archivo dice REAL y la memoria del generador dice PROYECTADO, y las dos
 * tienen razón"*. Persistir la memoria congelaría cada pago del dueño hasta la regeneración siguiente
 * — el defecto que esas fórmulas vinieron a arreglar, reintroducido una capa más abajo.
 *
 * Por eso el rectángulo tiene que leerse con `UNFORMATTED_VALUE`: es lo que devuelve el RESULTADO de
 * la fórmula. Con `FORMULA` entrarían cadenas `=IF(...)` como si fueran estados.
 *
 * FALLA ABIERTO Y DECLARADO: una fila rota no rompe la corrida, se acumula en `problemas` y no entra
 * al libro. Fallar cerrado acá dejaría la base sin actualizar por una sola celda mal tipeada; entrar
 * igual metería una fila sin importe que después aparece como una diferencia sin causa.
 *
 * @param {any[][]} valores rectángulo con encabezado, leído con UNFORMATTED_VALUE
 * @returns {{libro:Array<object>, problemas:string[]}}
 */
export function libroDesdeLaPestana(valores = []) {
  const problemas = []
  const libro = []
  for (let i = 1; i < valores.length; i++) {
    const f = valores[i] || []
    const fecha = numero(f[COL.fecha])
    // El colchón de filas vacías que deja el generador NO es un problema: es su forma de limpiar el
    // sobrante sin `clearValues`. Reportarlo llenaría el log de ruido que se aprende a saltear.
    if (!Number.isFinite(fecha) && !texto(f[COL.clave])) continue
    const fila = filaDelLibro(f, fecha)
    if (typeof fila === 'string') { problemas.push(`_MOVIMIENTOS f${i + 1}: ${fila}`); continue }
    libro.push(fila)
  }
  return { libro, problemas }
}

/** Una fila del rectángulo a movimiento, o el motivo por el que no se puede. PURA. */
function filaDelLibro(f, fecha) {
  const signo = numero(f[COL.signo])
  const importe = numero(f[COL.importe])
  const estado = texto(f[COL.estado])
  if (!Number.isFinite(fecha)) return 'la fecha no es un serial'
  if (signo !== 1 && signo !== -1) return `el signo dice ${JSON.stringify(f[COL.signo])} y tiene que ser +1 o -1`
  if (!Number.isFinite(importe)) return `el importe dice ${JSON.stringify(f[COL.importe])}`
  if (!ESTADOS_VALIDOS.has(estado)) return `el estado dice ${JSON.stringify(f[COL.estado])}`
  const origenFila = numero(f[COL.fila])
  return {
    fecha, signo, importe: Math.abs(importe), estado,
    moneda: texto(f[COL.moneda]) || 'ARS',
    concepto: texto(f[COL.concepto]),
    rubro: texto(f[COL.rubro]),
    actividad: texto(f[COL.actividad]) || 'operativa',
    instrumento: texto(f[COL.instrumento]) || 'desconocido',
    contraparte: texto(f[COL.contraparte]),
    cuit: texto(f[COL.cuit]),
    comprobante: texto(f[COL.comprobante]),
    obra: texto(f[COL.obra]),
    cliente: texto(f[COL.cliente]),
    origen: { pestana: texto(f[COL.origen]), fila: Number.isFinite(origenFila) ? origenFila : null },
    // Sin clave propia la fila no tiene identidad y dos corridas no pueden compararse. El origen es
    // la última red: es exactamente lo que hace `claveDe` cuando no hay identificador propio.
    clave: texto(f[COL.clave]) || `origen:${texto(f[COL.origen]).toLowerCase()}:${origenFila || '?'}`,
  }
}

const ESTADOS_VALIDOS = new Set(['REAL', 'COMPROMETIDO', 'PROYECTADO', 'VENCIDO'])

/**
 * NÚCLEO PURO: las filas de `flujo_movimiento` para una corrida.
 *
 * Es un mapeo, no un cálculo: cada campo sale de una columna del libro. Lo único que se decide acá es
 * la fecha calendario, y va JUNTO al serial para que la fila se pueda volver a verificar contra la
 * celda de la que salió.
 */
export function filasDeMovimiento(libro = []) {
  return libro.map((m) => ({
    clave: m.clave,
    fecha: iso(fechaDeSerial(m.fecha)),
    fecha_serial: Math.round(m.fecha),
    signo: m.signo,
    importe: m.importe,
    moneda: m.moneda,
    importe_origen: null,
    tipo_cambio: null,
    concepto: m.concepto,
    rubro: m.rubro,
    actividad: m.actividad,
    estado: m.estado,
    instrumento: m.instrumento,
    contraparte: m.contraparte,
    cuit: m.cuit,
    comprobante: m.comprobante,
    obra: m.obra,
    cliente: m.cliente,
    origen_pestana: m.origen.pestana,
    origen_fila: m.origen.fila,
  }))
}

/** El nombre de la columna de `flujo_periodo` de cada medida. Las claves de MEDIDAS son camelCase. */
const COLUMNA_MEDIDA = Object.freeze({
  ingresoReal: 'ingreso_real', ingresoProyectado: 'ingreso_proyectado',
  egresoReal: 'egreso_real', egresoProyectado: 'egreso_proyectado',
})

/** Evalúa una lista de términos de `cash-flow-medidas` sobre el libro, en JS. PURA. */
const evaluar = (libro, terminos) =>
  terminos.reduce((total, t) => total + t.coef * sumar(libro, t.filtro).total, 0)

/**
 * NÚCLEO PURO: el valor de las cuatro medidas en una ventana, y el resultado que se despeja de ellas.
 *
 * `signoNeto` decide cómo entra cada medida en el resultado, igual que en la fórmula de la hoja: los
 * egresos se MUESTRAN en positivo y RESTAN. Recalcularlo acá con otro criterio haría que el resultado
 * de la base y el de la pestaña se separaran sin que nada diera error.
 */
export function medidasDeVentana(libro, desde, hasta) {
  const out = { ingreso_real: 0, ingreso_proyectado: 0, egreso_real: 0, egreso_proyectado: 0, resultado: 0 }
  for (const m of MEDIDAS) {
    const v = evaluar(libro, terminosDeMedida(m, desde, hasta))
    out[COLUMNA_MEDIDA[m.clave]] = redondear(v)
    out.resultado += m.signoNeto * v
  }
  out.resultado = redondear(out.resultado)
  return out
}

/** Dos decimales: la columna es numeric(16,2) y un flotante largo entra truncado sin avisar. */
const redondear = (n) => Math.round(n * 100) / 100

/** Todos los rubros que abren el cuadro, más el rótulo del resto. PURA. */
export const RUBROS_DEL_CUADRO = Object.freeze([...RUBROS_INGRESO, ...RUBROS_EGRESO, OTROS])

/**
 * NÚCLEO PURO: la apertura por rubro de una ventana.
 *
 * ═══ "Otros" SE DESPEJA DE LA RESTA, IGUAL QUE EN LA HOJA ═══
 *
 * `formulasDeMedida` escribe el subtotal como el LIBRO ENTERO de la ventana y "Otros" como
 * `subtotal − SUM(rubros)`. No es un detalle de presentación: si el subtotal fuera la suma de las
 * sub-líneas, un rubro que el libro empiece a emitir mañana desaparecería del cuadro y el total
 * seguiría cerrando consigo mismo. Con el despeje, ese rubro nuevo aparece en "Otros" y se ve.
 */
export function rubrosDeVentana(libro, desde, hasta, totales) {
  const filas = new Map(RUBROS_DEL_CUADRO.map((r) => [r, { rubro: r, ...vacio() }]))
  for (const m of MEDIDAS) {
    const columna = COLUMNA_MEDIDA[m.clave]
    let sumaAbierta = 0
    for (const rubro of rubrosDeApertura(m.signo, m.estados.includes('REAL'))) {
      const v = redondear(evaluar(libro, terminosDeRubro(m, desde, hasta, rubro)))
      filas.get(rubro)[columna] = v
      sumaAbierta += v
    }
    filas.get(OTROS)[columna] = redondear(totales[columna] - sumaAbierta)
  }
  for (const fila of filas.values()) {
    fila.resultado = redondear(MEDIDAS.reduce((s, m) => s + m.signoNeto * fila[COLUMNA_MEDIDA[m.clave]], 0))
  }
  return [...filas.values()]
}

const vacio = () => ({ ingreso_real: 0, ingreso_proyectado: 0, egreso_real: 0, egreso_proyectado: 0, resultado: 0 })

/**
 * NÚCLEO PURO: las filas de `flujo_periodo` de UNA granularidad.
 *
 * Las ventanas salen de `ventanas(tipo, {anio})` — las MISMAS que abren las columnas de la pestaña,
 * así que la fila de la base y la columna del cuadro cubren exactamente el mismo tramo. Inventar acá
 * un calendario propio sería garantizar que las dos discrepen en los bordes del año.
 *
 * @param {Array<object>} libro
 * @param {{granularidad:'mes'|'semana', anio:number, saldos?:Map<string,{inicio:number|null, cierre:number|null}>}} p
 */
export function filasDePeriodo(libro, { granularidad, anio, saldos = new Map() } = {}) {
  const filas = []
  for (const v of ventanas(granularidad, { anio })) {
    const desde = serialDeFecha(v.desde)
    const hasta = serialDeFecha(v.hasta)
    const inicio = iso(v.desde)
    const totales = medidasDeVentana(libro, desde, hasta)
    const saldo = saldos.get(inicio) ?? {}
    filas.push({
      granularidad, periodo_inicio: inicio, periodo_fin: iso(v.hasta), nivel: 'total', rubro: null,
      ...totales,
      // `null` y no 0: un saldo que la vista no publica es un saldo que nadie declaró. Un cero se
      // leería como "la empresa cerró el período sin plata".
      saldo_inicio: saldo.inicio ?? null,
      saldo_cierre: saldo.cierre ?? null,
    })
    for (const r of rubrosDeVentana(libro, desde, hasta, totales)) {
      filas.push({
        granularidad, periodo_inicio: inicio, periodo_fin: iso(v.hasta), nivel: 'rubro', rubro: r.rubro,
        ingreso_real: r.ingreso_real, ingreso_proyectado: r.ingreso_proyectado,
        egreso_real: r.egreso_real, egreso_proyectado: r.egreso_proyectado, resultado: r.resultado,
        saldo_inicio: null, saldo_cierre: null,
      })
    }
  }
  return filas
}

/**
 * NÚCLEO PURO: los hallazgos del auditor de asimetría, armados desde los períodos MENSUALES.
 *
 * ═══ SE ALIMENTA DE LOS PERÍODOS Y NO DE LA PESTAÑA (02/09/2026) ═══
 *
 * `mesesDesdeLaPestana` existe para el control que corre contra el archivo y verifica sus rótulos.
 * Acá esa verificación no aporta nada: las filas ya salieron de `terminosDeRubro`, o sea de la misma
 * definición que escribió la pestaña, así que no hay rótulo que se pueda haber corrido. Releer el
 * cuadro sería pagar una lectura de red para confirmar una aritmética que ya se hizo.
 */
export function filasDeAsimetria(periodosMes = []) {
  const porRubro = (inicio, columna) => Object.fromEntries(periodosMes
    .filter((p) => p.periodo_inicio === inicio && p.nivel === 'rubro')
    .map((p) => [p.rubro, p[columna]]))
  const meses = periodosMes.filter((p) => p.nivel === 'total').map((p) => ({
    mes: p.periodo_inicio,
    egresoRealPorRubro: porRubro(p.periodo_inicio, 'egreso_real'),
    egresoProyectadoPorRubro: porRubro(p.periodo_inicio, 'egreso_proyectado'),
    ingresoProyectado: p.ingreso_proyectado,
  }))
  return asimetriaDeLaProyeccion(meses).hallazgos.map((h) => ({
    tipo: h.tipo,
    periodo_inicio: h.mes,
    jornales: h.jornales ?? null,
    material_estimado: h.materialEstimado ?? null,
    ratio: h.ratio ?? null,
    nomina: h.nomina ?? null,
    ingreso_proyectado: h.ingreso ?? null,
    cobertura: h.cobertura ?? null,
    faltante: h.faltante ?? null,
  }))
}

/**
 * NÚCLEO PURO: la FIRMA del libro — sha256 sobre las filas canónicas, ordenadas por su clave.
 *
 * ═══ PARA QUÉ SIRVE ═══
 *
 * El pipeline corre cada dos horas. Sin firma, cada corrida crearía una foto nueva de miles de filas
 * aunque no haya cambiado un peso, y en un año la tabla del detalle sería inconsultable. Con firma,
 * una corrida que no cambió nada NO nace: se le corre la fecha a la vigente y listo.
 *
 * SE ORDENA POR CLAVE Y NO POR FECHA: el generador escribe el libro ordenado por fecha, y dos
 * movimientos del mismo día pueden salir en distinto orden entre dos corridas sin que nada haya
 * cambiado. Ordenar por la clave —que es la identidad— hace que la firma dependa del contenido y no
 * del orden en que Google devolvió las filas.
 */
export function firmaDelLibro(filas = []) {
  const h = createHash('sha256')
  for (const f of [...filas].sort((a, b) => (a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0))) {
    h.update(`${f.clave}|${f.fecha_serial}|${f.signo}|${f.importe}|${f.estado}|${f.rubro}|${f.obra}|${f.cliente}\n`)
  }
  return h.digest('hex')
}

/**
 * CUÁNTAS CORRIDAS CONSERVAN SU DETALLE. Medido en el ensayo del 02/09/2026: una corrida son 1.235
 * filas de período (12 meses + 53 semanas, cada uno con su total y sus 18 rubros) más una fila por
 * movimiento del libro. El pipeline corre cada dos horas y el libro cambia con cada comprobante que
 * se carga, así que sin poda son decenas de miles de filas por día y en un año la tabla del detalle
 * no se puede consultar.
 */
export const CORRIDAS_CON_DETALLE = 30

/**
 * NÚCLEO PURO: de qué corridas se poda el DETALLE, conservando la cabecera.
 *
 * ═══ SE PODA EL DETALLE, NUNCA LA HISTORIA ═══
 *
 * `flujo_corrida` NO se borra jamás: es una fila chica por foto, con su firma y sus totales de
 * control, y es lo que contesta "¿qué decíamos en agosto sobre noviembre?". Lo que se poda es el
 * detalle fino —movimientos y períodos— de las corridas viejas, que es lo que pesa. Así la serie
 * histórica de totales queda completa para siempre y la comparación fina alcanza las últimas 30.
 *
 * LA VIGENTE NO SE PODA NUNCA, aunque quedara fuera del corte por cualquier motivo. Podarla dejaría
 * la pantalla leyendo una corrida vigente sin una sola fila: vacía, sin error y sin explicación.
 *
 * @param {Array<{id:string, vigente?:boolean}>} corridas de la más reciente a la más vieja
 * @param {{retener?:number}} [opciones]
 * @returns {string[]} los ids que pierden el detalle
 */
export function corridasAPodar(corridas = [], { retener = CORRIDAS_CON_DETALLE } = {}) {
  return corridas.slice(retener).filter((c) => !c.vigente).map((c) => c.id)
}

/**
 * NÚCLEO PURO: los totales de control de una corrida.
 *
 * No es un resumen decorativo: es contra lo que se verifica que la escritura aterrizó entera. Un
 * total guardado que no cuadra contra la suma del detalle es una carga rota, y sin guardarlo no hay
 * contra qué compararla — que es la diferencia entre una escritura verificada y una que contestó 200.
 */
export function resumenDeCorrida(libro = []) {
  const neto = (estados) => redondear(sumar(libro, estados ? { estados } : {}).total)
  return {
    movimientos: libro.length,
    neto: neto(null),
    neto_real: neto(['REAL']),
    neto_pendiente: neto(['PROYECTADO', 'VENCIDO', 'COMPROMETIDO']),
  }
}
