// LO QUE DICE EL RECIBO DE SUELDO — leído del recibo, no de una planilla que lo resume.
//
// ═══ POR QUÉ ESTE MÓDULO EXISTE ═══
//
// El cuadro de la pestaña «Nómina» calculaba la parte que va POR BANCO como el 50% del acuerdo. El
// dueño lo corrigió el 31/08/2026, textual: *«por banco va lo q dice recibo y en efectivo se
// completa todo hasta llegar al numero»*. O sea: la columna Banco deja de ser un cálculo y pasa a
// ser un HECHO que produce el estudio contable. Un hecho necesita una fuente, y la fuente es el PDF
// del recibo.
//
// La diferencia no es cosmética. Para Aguero, el 50% calculado da $294.000 y el recibo dice
// $215.564,62: son $78.435 que el cuadro mandaba al banco y en realidad se pagan en efectivo.
//
// ═══ DOS FUENTES, NO UNA ═══
//
// El mismo mail del estudio trae los PDF de los recibos Y un `Cubo Informe de Liquidación.xlsx` con
// los netos en tabla. Leer sólo el Excel sería más fácil y sería peor: el Excel es un resumen que
// alguien exportó, el PDF es el papel que firma el trabajador. Se leen los DOS y se comparan. Si un
// neto no coincide, no se elige el más cómodo: sale `CONFLICTO` y no se carga.
//
// Es la regla del repo —un control no se valida contra la misma información que produce— aplicada a
// la única parte del sistema donde un número equivocado se convierte en plata que alguien no cobra.
//
// PURO: recibe bytes ya leídos. Ni red, ni disco, ni base.

/** El estado de cada línea leída. Un neto en disputa NUNCA se carga. */
export const ESTADO = Object.freeze({
  CONFIRMADO: 'CONFIRMADO', // el PDF y el Cubo dicen lo mismo
  SOLO_PDF: 'SOLO_PDF',     // está en el recibo y no en el Cubo
  SOLO_CUBO: 'SOLO_CUBO',   // está en el Cubo y no hay recibo
  CONFLICTO: 'CONFLICTO',   // los dos lo traen y NO coinciden
})

/** es-AR: el punto es separador de miles y la coma es el decimal. Al revés que en JS. */
export function importeArgentino(texto) {
  const s = String(texto ?? '').replace(/[^\d.,-]/g, '')
  if (!s) return null
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * EL ENCABEZADO DE UNA PÁGINA DE RECIBO.
 *
 * Viene todo pegado, sin separadores, porque el PDF dibuja una tabla y el extractor la aplana:
 *
 *   `82026AGUERO CRISTIAN DOMINGO56.348,00387.349,2420-33836450-5`
 *    │└─ año   └─ apellido y nombre  │└─ rem. asignada  └─ bruto  └─ CUIL
 *    └─ mes (1 dígito)               └─ legajo, PEGADO al primer dígito de la remuneración
 *
 * ═══ LA TRAMPA DEL LEGAJO ═══
 *
 * El legajo y la remuneración no tienen separador: «56.348,00» es legajo 5 + $6.348,00, y también
 * podría leerse legajo 56 + $348,00. Un `\d{1,3}` codicioso se lleva el primer dígito de la plata y
 * devuelve un legajo que no existe — probado: daba 56, 155, 266 para los legajos 5, 15 y 26.
 *
 * Por eso el legajo NO se usa como identidad. La identidad es el **CUIL**, que viene entero, con
 * guiones y en una posición inequívoca. El legajo se devuelve como pista y se marca `legajoDudoso`.
 */
export function encabezadoDeRecibo(linea) {
  const t = String(linea ?? '').trim()
  const cuil = t.match(/(\d{2}-\d{7,8}-\d)\s*$/)?.[1] ?? t.match(/(\d{2}-\d{7,8}-\d)/)?.[1] ?? null
  if (!cuil) return null
  const nombre = t.replace(/^\d{1,2}2026/, '').match(/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]+/)?.[0]?.trim() ?? null
  if (!nombre) return null
  const resto = t.replace(/^\d{1,2}2026/, '').replace(nombre, '')
  const legajoCrudo = resto.match(/^(\d{1,3})/)?.[1] ?? null
  return {
    nombre,
    cuil: cuil.replace(/-/g, ''),
    legajoCrudo,
    // Se dice que es dudoso SIEMPRE que haya dígitos pegados: no hay forma de saber dónde termina
    // el legajo y empieza la plata, y afirmar que se sabe es peor que declarar la duda.
    legajoDudoso: legajoCrudo !== null,
  }
}

/** El «SUELDO NETO $ 215.564,62» de una página. `null` si la página no lo trae. */
export function netoDeRecibo(lineas = []) {
  for (const l of lineas) {
    const m = String(l).match(/SUELDO\s+NETO\s*\$?\s*([\d.,-]+)/i)
    if (m) return importeArgentino(m[1])
  }
  return null
}

/** El período que declara la página: «LIQUIDACION FINAL», «SEGUNDA QUINCENA 08/2026»… */
export function periodoDeRecibo(lineas = []) {
  for (const l of lineas) {
    const m = String(l).match(/(?:ADMISTRACION|ADMINISTRACION)\s+CENTRAL,\s*(\d{2}\/\d{2}\/\d{4})(.*)$/i)
    if (m) return { fechaPago: m[1], etiqueta: m[2].trim() || null }
  }
  return { fechaPago: null, etiqueta: null }
}

/**
 * EL PERÍODO, NORMALIZADO — porque las dos fuentes lo escriben distinto.
 *
 * El PDF dice «SEGUNDA QUINCENA 08/2026»; el Cubo, «2da. QUINCENA 08/2026». Es el mismo período y
 * dos textos que no se parecen. Devuelve `Q1-08/2026`, `Q2-08/2026` o `FINAL`.
 */
export function periodoNormalizado(texto) {
  const t = String(texto ?? '').toUpperCase()
  if (/LIQUIDACION\s+FINAL/.test(t)) return 'FINAL'
  const mes = t.match(/(\d{2})\/(\d{4})/)
  const q = /SEGUNDA|^2DA|\b2DA/.test(t) ? 'Q2' : /PRIMERA|^1RA|\b1RA/.test(t) ? 'Q1' : null
  if (!q || !mes) return null
  return `${q}-${mes[1]}/${mes[2]}`
}

/**
 * CRUZA LOS RECIBOS CONTRA EL CUBO Y DICTAMINA.
 *
 * `recibos`: [{nombre, cuil, neto, etiqueta, pagina, archivo}] — del PDF.
 * `cubo`: [{legajo, nombre, neto, liquidacion}] — del xlsx.
 *
 * El cruce es por NOMBRE NORMALIZADO **y PERÍODO**, no por legajo: el legajo del PDF es dudoso por
 * construcción (ver arriba) y el Cubo no trae CUIL. Se normaliza sacando comas, acentos y espacios
 * de más, y se compara por prefijo en los dos sentidos porque el Cubo TRUNCA a 25 caracteres —
 * «MALDONADO, BATISTA EMILIA» contra «MALDONADO BATISTA EMILIANO MIGUEL». Exigir igualdad exacta
 * dejaría a los de apellido largo en SOLO_PDF, que se lee como «el Cubo no lo tiene».
 *
 * ═══ POR QUÉ EL PERÍODO ENTRA EN LA LLAVE ═══
 *
 * El Cubo trae LAS DOS QUINCENAS del mes: cada persona aparece dos veces con importes distintos.
 * Emparejando sólo por nombre, el recibo de la 2da quincena se comparaba contra el importe de la
 * 1ra y salía CONFLICTO — 21 de 23 líneas, con los dos números idénticos en pantalla. El control
 * hizo lo suyo (no eligió ninguno), pero la llave estaba mal. Sin el período, la otra mitad del
 * error es peor: si los importes de las dos quincenas hubieran coincidido, habría dado CONFIRMADO
 * emparejando la fila equivocada.
 */
export function cruzar({ recibos = [], cubo = [] } = {}) {
  const norm = (s) => String(s ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-ZÑ ]/g, ' ').replace(/\s+/g, ' ').trim()
  const empata = (a, b) => a === b || (a.length >= 12 && b.startsWith(a)) || (b.length >= 12 && a.startsWith(b))
  // `null` sólo empata con `null`: un período ilegible no se hace pasar por cualquiera.
  const mismoPeriodo = (a, b) => periodoNormalizado(a) === periodoNormalizado(b)

  const filas = []
  const usados = new Set()
  for (const r of recibos) {
    const n = norm(r.nombre)
    const i = cubo.findIndex((c, idx) => !usados.has(idx) && empata(n, norm(c.nombre))
      && mismoPeriodo(r.etiqueta, c.liquidacion))
    const c = i >= 0 ? cubo[i] : null
    if (i >= 0) usados.add(i)
    // La comparación es al centavo. Redondear para que «coincidan» es exactamente el gesto que este
    // módulo existe para impedir.
    const estado = !c ? ESTADO.SOLO_PDF
      : Math.abs(Number(r.neto) - Number(c.neto)) < 0.005 ? ESTADO.CONFIRMADO
        : ESTADO.CONFLICTO
    filas.push({
      ...r,
      legajo: c?.legajo ?? null,
      netoCubo: c?.neto ?? null,
      liquidacion: c?.liquidacion ?? null,
      estado,
      diferencia: c ? Number(r.neto) - Number(c.neto) : null,
    })
  }
  for (const [idx, c] of cubo.entries()) {
    if (usados.has(idx)) continue
    filas.push({ nombre: c.nombre, cuil: null, neto: c.neto, legajo: c.legajo, netoCubo: c.neto, liquidacion: c.liquidacion, estado: ESTADO.SOLO_CUBO, diferencia: null })
  }
  return filas
}

/** Lo único que se puede cargar: lo que las dos fuentes confirman. */
export const cargables = (filas = []) => filas.filter((f) => f.estado === ESTADO.CONFIRMADO)
