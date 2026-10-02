// EL RECIBO DE SUELDO DEL ESTUDIO CONTABLE — de quién es cada página. Texto puro, sin red.
//
// ═══ QUÉ SE ESTÁ LEYENDO ═══
//
// El estudio manda UN PDF por quincena con TODOS los recibos adentro: una página por persona. Para
// que cada uno quede en su legajo hay que saber, página por página, de quién es. La cabecera del
// formulario es estable y trae las tres cosas que identifican a alguien:
//
//     Q MES AÑO APELLIDO Y NOMBRE N° LEGAJO SUELDO BRUTO
//     7 2026 AGUERO CRISTIAN DOMINGO 5 324.400,00
//     CATEGORÍA LABORAL C.U.I.L BANCO F. PAGO APORTES
//     OFICIAL 20-29427106-7 SANTANDER RIO 08/06/2026
//
// ═══ EL CUIL DEL TRABAJADOR NO ES EL PRIMER NÚMERO DE ONCE DÍGITOS ═══
//
// La hoja empieza por el EMPLEADOR —`C.U.I.T.: 30-71630464-3`— y tomar el primero le cargaría a cada
// persona el CUIT de Echegaray como propio. Ya pasó con cinco legajos el 19/08. Acá se toma el que
// NO viene precedido por `C.U.I.T.` y se rechaza el de la empresa explícitamente.
//
// ═══ QUÉ NO HACE ═══
//
// No decide a qué persona corresponde: devuelve lo que dice el papel. El emparejamiento contra
// `personas` es otra decisión —y se hace por CUIL, que es la única clave que no se escribe distinto
// dos veces— y vive en el script, no acá.

/** El CUIT del empleador. Nunca es el CUIL de nadie. */
export const CUIT_EMPRESA = '30-71630464-3'

const CUIL = /\b(\d{2}-\d{8}-\d)\b/g

/** Los doce meses en el texto del formulario, para leer «SEGUNDA QUINCENA 07/2026». */
const QUINCENA = /(PRIMERA|SEGUNDA)\s+QUINCENA\s+(\d{1,2})\/(\d{4})/i
const LIQUIDACION_FINAL = /LIQUIDACI[OÓ]N\s+FINAL/i
const PERIODO_SUELTO = /PERIODO\s+DE\s+PAGO[^\d]{0,40}(\d{1,2})\/(\d{4})/i

/**
 * De quién es esta página, y de qué período.
 *
 * Devuelve `null` cuando la página no es un recibo —una carátula, una hoja de totales, un escaneo
 * sin capa de texto—. NO se adivina: una página sin CUIL no se le cuelga a nadie.
 */
export function personaDelRecibo(textoDePagina) {
  const texto = String(textoDePagina || '')
  if (!texto.trim()) return null

  // ── EL CUIL ────────────────────────────────────────────────────────────────
  const cuils = []
  for (const m of texto.matchAll(CUIL)) {
    if (m[1] === CUIT_EMPRESA) continue
    // El que viene pegado al rótulo del empleador tampoco: `C.U.I.T.: 30-…`.
    const antes = texto.slice(Math.max(0, m.index - 30), m.index)
    if (/C\.?U\.?I\.?T\.?\s*:?\s*$/i.test(antes)) continue
    cuils.push(m[1])
  }
  if (cuils.length === 0) return null
  const cuil = cuils[0]

  // ── EL NOMBRE Y EL LEGAJO ──────────────────────────────────────────────────
  // La fila que sigue a la cabecera: `<q> <año> <APELLIDO Y NOMBRE> <legajo> <bruto>`.
  const lineas = texto.split('\n').map((l) => l.trim())
  const i = lineas.findIndex((l) => /APELLIDO\s+Y\s+NOMBRE/i.test(l))
  let nombre = null
  let legajo = null
  let mesDeLaFila = null
  if (i >= 0 && lineas[i + 1]) {
    // La primera columna es el MES (aunque el rótulo diga «Q»): en la final puede venir precedida de otra.
    const m = /^(?:\d{1,2}\s+)?(\d{1,2})\s+(\d{4})\s+([A-ZÁÉÍÓÚÑÜ' .-]+?)\s+(\d{1,5})\s+[\d.,]+$/.exec(lineas[i + 1])
    if (m) { nombre = m[3].replace(/\s+/g, ' ').trim(); legajo = m[4]; mesDeLaFila = `${m[2]}-${m[1].padStart(2, '0')}` }
  }

  // ── EL PERÍODO ─────────────────────────────────────────────────────────────
  // «SEGUNDA QUINCENA 07/2026» es el período que se está pagando. `PERIODO 05/2026`, que aparece
  // suelto arriba, es OTRA cosa (el período de la obra social) y no se usa.
  let periodo = null
  let quincena = null
  const final = LIQUIDACION_FINAL.test(texto) && !QUINCENA.test(texto)
  const q = QUINCENA.exec(texto)
  if (q) {
    quincena = q[1].toUpperCase() === 'PRIMERA' ? 1 : 2
    periodo = `${q[3]}-${q[2].padStart(2, '0')}`
  } else if (final) {
    // La final NO trae quincena ni mes en el rótulo, por eso caía en «sin-periodo». El mes sale de la
    // fila «mes año APELLIDO» (mismo criterio que `periodoDe` del importador). Si esa fila no se lee,
    // queda null: «final sin mes» explícito, nunca un mes supuesto — el «PERIODO 05/2026» suelto es la
    // obra social, no el mes que se liquida.
    periodo = mesDeLaFila
  } else {
    const p = PERIODO_SUELTO.exec(texto)
    if (p) periodo = `${p[2]}-${p[1].padStart(2, '0')}`
  }

  return { cuil, nombre, legajo, periodo, quincena, final }
}

/**
 * El nombre del archivo de una página suelta: ordena solo y dice de qué es sin abrirlo.
 *
 * La final sigue el patrón que ya lee la web (`periodoDelNombre` en recibosDelLegajo.ts:
 * «Liquidación final 2026-08 · X»). Sin mes legible dice «sin mes»: se avisa, no se supone.
 */
export function nombreDelRecibo({ periodo, quincena, nombre, final }) {
  const quien = nombre ? ` · ${nombre}` : ''
  if (final) return `Liquidación final ${periodo ?? 'sin mes'}${quien}.pdf`
  const p = periodo ?? 'sin-periodo'
  const q = quincena ? ` Q${quincena}` : ''
  return `Recibo ${p}${q}${quien}.pdf`
}

/** Cómo se llamaba (mal) la final antes de este arreglo: 68 archivos históricos. Sólo para reconocerlos
 *  en la carpeta —no volver a subirlos con otro nombre— y para listar su nombre nuevo. */
export const nombreHistoricoSinPeriodo = ({ nombre }) => `Recibo sin-periodo${nombre ? ` · ${nombre}` : ''}.pdf`

/**
 * A qué persona de la nómina corresponde una página.
 *
 * POR CUIL Y NADA MÁS. El nombre se escribe distinto en dos papeles del mismo día —«AVALOS» y
 * «ÁVALOS», «DIAZ GOMEZ» y «DIEZ»— y el número de legajo del estudio no es el mismo que el del OS.
 * Un recibo colgado de la persona equivocada es peor que un recibo sin colgar: queda en el legajo de
 * alguien como si fuera suyo.
 */
export function personaQueCorresponde(datos, plantel) {
  if (!datos?.cuil) return null
  const limpio = (c) => String(c || '').replace(/\D/g, '')
  const suyo = limpio(datos.cuil)
  return plantel.find((p) => limpio(p.cuil) === suyo) ?? null
}

/**
 * ¿ESTA FINAL QUEDA «A DECIDIR» POR UN «Recibo sin-periodo» HISTÓRICO DE LA MISMA PERSONA?
 *
 * Sí cuando la carpeta ya tiene ese histórico y todavía no tiene el nombre nuevo. El histórico no dice
 * de qué mes es, así que NUNCA se puede dar por «ya estaba» una final contra él (una final de
 * septiembre contra un histórico de julio se perdería en silencio) ni subirla a ciegas (podría
 * duplicar la vieja). Se avisa y decide una persona. `previos` es el Set/Map de nombres de la carpeta.
 */
export function finalADecidir(datos, previos) {
  if (!datos?.final) return false
  const nuevo = nombreDelRecibo(datos)
  const viejo = nombreHistoricoSinPeriodo(datos)
  return viejo !== nuevo && previos.has(viejo) && !previos.has(nuevo)
}
