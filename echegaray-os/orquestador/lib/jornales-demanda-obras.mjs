// LA DEMANDA DE LAS OBRAS VENDIDAS — EL OTRO LADO DEL MAX DE LA PROYECCIÓN DE JORNALES.
//
// ═══ POR QUÉ EXISTE (07/08/2026, contexto del dueño) ═══
//
// La proyección de quincenas futuras de obreros se hace "al convenio" con el plantel VIGENTE
// (lib/proyeccion-convenio.mjs). Pero hay 7 obras vendidas/futuras con fechas, horas por categoría
// UOCRA y plantel: con ellas entran ~10 temporales y el plantel pico sube a ~35-40 personas. La
// proyección por plantel vigente SUBESTIMA — contesta "cuánto cuesta el plantel de hoy", no "cuánta
// mano de obra piden las obras que ya se vendieron".
//
// La resolución es un MAX declarado, no un reemplazo: el plantel fijo cobra aunque no haya obra
// (el piso es la proyección al convenio del plantel vigente), y cuando la demanda de las obras
// supera ese piso, manda la demanda. `proyeccionQuincena` dice además CUÁL de los dos mandó, para
// que la pestaña pueda mostrarlo en vez de fundir dos conceptos en un número mudo.
//
// ═══ TODO ACÁ ES PURO ═══
//
// Las obras llegan POR PARÁMETRO con el shape acordado con lib/obras-datos.mjs — que este archivo
// NO importa: el puente no-puro (import dinámico con guard) vive en lib/jornales-demanda-fuente.mjs.
// Así los tests ejercitan cada función con fixtures y sin red, y esta lib no se cae si la fuente de
// obras todavía no existe en la rama.
//
//   { clave, cliente, obra, inicio, fin (ISO o null), horas: { oficialEspecializado, oficial,
//     ayudante }, moCargasPesos, plantelFullTime, plantelTemporales, notas }

import { factorUocraEntre, ESCALA_VERIFICADA, PERIODO_VERIFICADO } from './uocra-paritaria.mjs'
import { ALERTA } from './glifos.mjs'

/**
 * LA EQUIVALENCIA ENTRE LAS CLAVES DE HORAS DEL INSUMO Y LAS CATEGORÍAS DEL CONVENIO.
 * Las explosiones del dueño hablan en camelCase; la escala parseada de `_UOCRA_RAW` (y la verificada
 * de uocra-paritaria) hablan con el nombre del convenio. La traducción vive UNA vez, acá.
 */
export const CATEGORIAS_DEMANDA = {
  oficialEspecializado: 'Oficial Especializado',
  oficial: 'Oficial',
  ayudante: 'Ayudante',
}

/**
 * ═══ DATO DECLARADO, NO CÁLCULO ═══
 *
 * La tarifa de CARGAS SOCIALES por hora y categoría es un INSUMO de las explosiones de costos del
 * dueño (07/08/2026), a valores de agosto 2026 — no sale de ninguna fórmula de este repo. El motor
 * salarial no maneja un ratio de cargas propio (verificado por grep el 07/08: motor-salarial.mjs no
 * tiene ninguno), así que se usa este dato del dueño escalado por LA MISMA paritaria que escala los
 * jornales. Si el dueño corrige sus explosiones, se corrige acá y en ningún otro lado.
 */
export const TARIFA_CARGAS_EXPLOSION = {
  oficialEspecializado: 6200,
  oficial: 6200,
  ayudante: 5200,
}
/** El mes al que están expresadas las tarifas de cargas del dueño. Mismo formato que la paritaria. */
export const PERIODO_TARIFAS_CARGAS = '2026-08'

/**
 * EL RESPALDO CUANDO LA RÉPLICA NO TRAE ESCALÓN: la escala Zona A verificada el 07/08/2026, con el
 * MISMO shape que un escalón parseado de `_UOCRA_RAW` ({ periodo, categorias: { [cat]: { basico } } }).
 * No es una segunda fuente de la escala: es LA escala verificada de uocra-paritaria, re-formateada.
 */
export const ESCALON_RESPALDO = {
  periodo: PERIODO_VERIFICADO,
  categorias: Object.fromEntries(
    Object.entries(ESCALA_VERIFICADA).map(([cat, basico]) => [cat, { basico }]),
  ),
}

/** NÚCLEO PURO: 'YYYY-MM' de una fecha — el formato con el que habla la paritaria. */
export const periodoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/**
 * NÚCLEO PURO: la clave de la quincena a la que pertenece una fecha: 'YYYY-MM-1' (día 1–15) o
 * 'YYYY-MM-2' (16–fin de mes). Es el puente entre las quincenas canónicas de este módulo y las
 * `pendientes` de la pestaña, cuya primera fila puede arrancar a mitad de tramo: las dos caen en la
 * misma clave aunque no empiecen el mismo día.
 */
export const claveQuincena = (d) => `${periodoDe(d)}-${d.getDate() <= 15 ? 1 : 2}`

/**
 * NÚCLEO PURO: fecha local desde lo que traiga el insumo (Date, ISO 'YYYY-MM-DD', o null).
 * El ISO se arma a mano y NO con `new Date(string)`: el parser de JS lo lee como medianoche UTC, y en
 * Argentina (UTC−3) eso es el día ANTERIOR — una obra que "empieza el 18" empezaría el 17 y el
 * reparto por días hábiles quedaría corrido sin un solo error. Es la trampa ya pagada en
 * fecha-dd-mm-yy-parser.
 */
export function aFechaLocal(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  const s = String(v ?? '').trim()
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * NÚCLEO PURO: días hábiles DE OBRA entre dos fechas, inclusive ambos extremos — lunes a VIERNES.
 *
 * ═══ ERA LUNES A SÁBADO Y LO CORRIGIÓ EL DUEÑO (13/08) ═══
 *
 * Yo había MEDIDO que la planilla carga 148 días donde el calendario lun–vie cuenta 125, y saqué la
 * conclusión de que la obra trabaja los sábados. El dueño, textual: **"las obras trabajan hasta el
 * viernes"**.
 *
 * La medición era buena y la conclusión estaba mal. El dato observado no dice qué días trabaja la
 * obra: dice qué días tienen HORAS CARGADAS, y los ~23 días de diferencia son sábados trabajados
 * puntualmente —horas extra—, no la semana normal. Un dato observado no reemplaza al criterio de
 * quien decide: la semana de obra la define el dueño.
 *
 * LO QUE QUEDA AFUERA, DECLARADO: proyectar lun–vie deja fuera esas horas extra de sábado. Es plata
 * que sale y que la proyección no ve. Se dice en la pestaña, en una línea, y NO se convierte en un
 * supuesto de cálculo — que es exactamente el error que se acaba de corregir.
 *
 * Coincide hoy con `diasHabilesEntre` de jornales-fecha-pago, que mide días BANCARIOS. Siguen siendo
 * dos conceptos distintos —uno es cuándo se trabaja y el otro cuándo se acredita un pago— y pueden
 * separarse el día que uno de los dos incorpore feriados. No se fusionan.
 */
export function diasHabilesObra(desde, hasta) {
  if (!(desde instanceof Date) || !(hasta instanceof Date) || hasta < desde) return 0
  let n = 0
  const d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate())
  const fin = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate())
  while (d <= fin) {
    if (d.getDay() !== 0 && d.getDay() !== 6) n++
    d.setDate(d.getDate() + 1)
  }
  return n
}

const HORAS_CERO = () => ({ oficialEspecializado: 0, oficial: 0, ayudante: 0 })

/**
 * NÚCLEO PURO: LA DEMANDA DE MANO DE OBRA, QUINCENA POR QUINCENA.
 *
 * Para cada quincena futura (1–15 / 16–fin de mes) desde `desde` y por `hastaMeses` meses:
 *   · qué obras están ACTIVAS en ella (solapamiento de fechas),
 *   · las horas por categoría que le tocan — reparto PROPORCIONAL a los días hábiles lun–sáb de la
 *     obra que caen en la quincena, sobre el total de días hábiles de la obra. Una obra que empieza
 *     un 18 le deja a la 2ª quincena de ese mes sólo su parte, no una quincena entera;
 *   · el plantel requerido: Σ (fullTime + temporales) de las obras activas.
 *
 * Una obra SIN fechas no se puede repartir y NO SE INVENTA un calendario: queda afuera y se REPORTA
 * en `sinFechas`, para que la corrida lo diga en vez de que la demanda quede corta en silencio.
 *
 * @param {Array} obras el shape de lib/obras-datos.mjs (ver cabecera)
 * @param {{desde: Date|string, hastaMeses?: number}} ventana
 * @returns {{quincenas: Array, sinFechas: Array<{clave: string, motivo: string}>}}
 */
export function demandaPorQuincena(obras = [], { desde, hastaMeses = 6 } = {}) {
  const d0 = aFechaLocal(desde)
  if (!d0) return { quincenas: [], sinFechas: [] }

  const quincenas = []
  const meses = Math.max(1, Math.round(Number(hastaMeses) || 6))
  for (let m = 0; m < meses; m++) {
    const y = d0.getFullYear()
    const mo = d0.getMonth() + m
    for (const mitad of [1, 2]) {
      const qDesde = new Date(y, mo, mitad === 1 ? 1 : 16)
      const qHasta = mitad === 1 ? new Date(y, mo, 15) : new Date(y, mo + 1, 0)
      // La quincena que ya terminó antes de `desde` no es futura: no se proyecta lo ya pagado.
      if (qHasta < d0) continue
      quincenas.push({
        desde: qDesde, hasta: qHasta, periodo: periodoDe(qDesde), clave: claveQuincena(qDesde),
        obras: [], horas: HORAS_CERO(), plantel: 0, nObras: 0,
      })
    }
  }

  const sinFechas = []
  for (const o of obras ?? []) {
    const clave = o?.clave ?? o?.obra ?? '(sin clave)'
    const ini = aFechaLocal(o?.inicio)
    const fin = aFechaLocal(o?.fin)
    if (!ini || !fin) {
      sinFechas.push({ clave, motivo: !ini && !fin ? 'sin inicio ni fin' : !ini ? 'sin fecha de inicio' : 'sin fecha de fin' })
      continue
    }
    const totalObra = diasHabilesObra(ini, fin)
    if (!totalObra) {
      sinFechas.push({ clave, motivo: 'fin anterior al inicio o sin un solo día hábil' })
      continue
    }
    for (const q of quincenas) {
      const s = ini > q.desde ? ini : q.desde
      const e = fin < q.hasta ? fin : q.hasta
      if (e < s) continue
      const hab = diasHabilesObra(s, e)
      if (!hab) continue
      const fraccion = hab / totalObra
      for (const k of Object.keys(q.horas)) q.horas[k] += (Number(o?.horas?.[k]) || 0) * fraccion
      q.plantel += (Number(o?.plantelFullTime) || 0) + (Number(o?.plantelTemporales) || 0)
      q.nObras++
      q.obras.push({ clave, fraccion, diasHabiles: hab })
    }
  }
  return { quincenas, sinFechas }
}

/**
 * NÚCLEO PURO: CUÁNTO CUESTA LA DEMANDA DE UNA QUINCENA, REVALUADA AL MES DE ESA QUINCENA.
 *
 * horas × tarifa vigente por categoría, con la tarifa REVALUADA por los tramos de paritaria entre el
 * mes de la escala y el mes de la quincena — el mismo `factorUocraEntre` que gobierna las tres
 * proyecciones de la pestaña, ni una escala ni un % duplicados acá. Después de la vigencia firmada,
 * el factor repite el último tramo y eso viene ROTULADO (`mesesProyectados` > 0).
 *
 * Las CARGAS no salen de un ratio del motor —no existe (ver TARIFA_CARGAS_EXPLOSION)—: son
 * horas × tarifa de carga por categoría del insumo del dueño, escaladas por LA MISMA paritaria desde
 * SU propio mes base. Jornales y cargas viajan SEPARADOS en el resultado porque aguas abajo no van al
 * mismo lugar: la pestaña de Jornales publica jornal puro y Cargas Sociales calcula lo suyo encima.
 *
 * @param {{periodo?: string, desde?: Date, horas: Object}} quincena una de `demandaPorQuincena`
 * @param {{periodo: string, categorias: Object}} escala el escalón vigente parseado, o el respaldo
 * @param {Array} paritaria los escalones parseados de `_UOCRA_RAW` (para tramos posteriores)
 * @returns {{periodo, factor, mesesProyectados, jornales, cargas, total, porCategoria, sinEscala}|null}
 */
export function costoDemanda(quincena, escala = ESCALON_RESPALDO, paritaria = []) {
  const periodo = quincena?.periodo ?? (quincena?.desde instanceof Date ? periodoDe(quincena.desde) : null)
  if (!periodo) return null
  const baseEscala = escala?.periodo ?? PERIODO_VERIFICADO
  const fEscala = periodo === baseEscala ? { factor: 1, mesesProyectados: 0 } : factorUocraEntre(baseEscala, periodo, paritaria)
  // Las cargas se revalúan desde SU mes base, que puede no ser el del escalón: si mañana la réplica
  // trae la escala de septiembre, los jornales parten de septiembre pero el insumo de cargas sigue
  // expresado a agosto — dos bases, dos factores, un solo driver.
  const fCargas = periodo === PERIODO_TARIFAS_CARGAS ? { factor: 1, mesesProyectados: 0 } : factorUocraEntre(PERIODO_TARIFAS_CARGAS, periodo, paritaria)
  if (!fEscala || !fCargas) return null

  const porCategoria = []
  const sinEscala = []
  let jornales = 0
  let cargas = 0
  for (const [k, nombre] of Object.entries(CATEGORIAS_DEMANDA)) {
    const horas = Number(quincena?.horas?.[k]) || 0
    if (!horas) continue
    const basico = escala?.categorias?.[nombre]?.basico
    // Una categoría con horas y sin escala NO entra valuada en $0 —un total corto y plausible es el
    // modo de falla favorito de este libro—: se reporta y el que consume decide con eso a la vista.
    if (typeof basico !== 'number') {
      sinEscala.push(nombre)
      continue
    }
    const j = horas * basico * fEscala.factor
    const c = horas * TARIFA_CARGAS_EXPLOSION[k] * fCargas.factor
    porCategoria.push({ categoria: nombre, horas, basico, jornales: j, cargas: c })
    jornales += j
    cargas += c
  }
  return {
    periodo,
    factor: fEscala.factor,
    mesesProyectados: fEscala.mesesProyectados ?? 0,
    jornales,
    cargas,
    total: jornales + cargas,
    porCategoria,
    sinEscala,
  }
}

/**
 * NÚCLEO PURO: EL MAX ENTRE EL PISO Y LA DEMANDA, CON LA RAZÓN A LA VISTA.
 *
 * El plantel fijo cobra aunque no haya obra: el piso —la proyección al convenio del plantel
 * vigente— nunca baja por falta de demanda. Y cuando las obras vendidas piden más mano de obra que
 * el plantel de hoy, manda la demanda: seguir proyectando el piso sería subestimar a sabiendas.
 * Devuelve cuál de los dos mandó para que la pestaña lo pueda DECIR — un MAX mudo funde dos
 * conceptos en un número que nadie puede auditar.
 *
 * Empate va al piso: con demanda igual al piso no hay nada que la demanda agregue, y el rótulo
 * "manda la demanda" debe significar que el número subió por las obras.
 *
 * @returns {{proyectado: number, manda: 'piso'|'demanda', piso: number, demanda: number}}
 */
export function proyeccionQuincena(piso, demanda) {
  const p = Number(piso) || 0
  const d = Number(demanda) || 0
  return { proyectado: Math.max(p, d), manda: d > p ? 'demanda' : 'piso', piso: p, demanda: d }
}

/**
 * NÚCLEO PURO: la fórmula de la celda «Proyectado» de una quincena futura de la pestaña.
 *
 * Sin demanda es EXACTAMENTE la fórmula que la pestaña ya emitía (`=IFERROR(G*F*D;"")`): el diff en
 * quincenas sin obras vendidas es cero. Con demanda, la celda pasa a `MAX(convenio; demanda)`:
 *
 *   · el término de demanda entra como CONSTANTE documentada — el número que decide sale del insumo
 *     del dueño (sus explosiones de obra), no de una celda del libro, y se recalcula en cada corrida.
 *     Va REDONDEADO a peso entero: una constante con decimales necesitaría la coma decimal del locale
 *     es-AR dentro de una fórmula que ya usa `;` de separador, y ese formato es la trampa ya pagada
 *     en formula-por-api-va-en-locale;
 *   · es la DEMANDA DE JORNAL PURO (sin cargas): la columna compara contra un convenio que tampoco
 *     las tiene, y Cargas Sociales calcula lo suyo sobre JORNALES_PROY_TOTAL — meter las cargas acá
 *     las contaría dos veces;
 *   · la frontera de la caja comprometida SE RESPETA: una quincena que se PAGA dentro del mes en
 *     curso queda con su fórmula original al pactado — es la plata que va a salir, y la orden del
 *     dueño (07/08) es que la planificación no le coma la disponibilidad libre. Es el MISMO gate por
 *     fecha de pago de `formulaSigmaDelMes`, con el mismo `EOMONTH(TODAY();0)` que se reclasifica
 *     solo el 1° de cada mes;
 *   · si el convenio rinde vacío (réplica caída), el MAX publica la demanda igual: acá SÍ hay un
 *     número real que decir —el piso de las obras vendidas— y callarlo no protege nada.
 *
 * ═══ LAS LETRAS YA NO SE ESCRIBEN ACÁ (13/08) ═══
 *
 * Decía `G${r}*F${r}*D${r}` — la Σ $/hora, las horas por persona y los días hábiles, cada una en la
 * columna que tenían en el layout de agosto. El rediseño del calendario sacó tres de esas columnas de
 * la vista y las dos que quedaron cambiaron de letra: la misma fórmula habría seguido multiplicando
 * tres celdas y devolviendo un número plausible contra "Oficina" y "Dirección". Es el defecto del
 * mapa de columnas escrito en prosa, del lado de la lib. Ahora el llamador —que es el dueño del
 * layout— arma la expresión y acá sólo vive la REGLA: el MAX contra la demanda y su gate por fecha
 * de caja.
 *
 * @param {{convenio:string, celdaPago:string}} celdas la expresión del piso de convenio (sin `=` ni
 *   IFERROR) y la celda "Se paga el" de esa fila
 * @param {{jornales?: number}|null} demanda la entrada de esa quincena, o null
 * @returns {string} la fórmula, separador es-AR
 */
export function formulaProyectadoQuincena({ convenio, celdaPago }, demanda = null) {
  // `celdaPago` y `demanda` sobreviven en la firma porque los llamadores y los tests los pasan, y
  // porque el gate por fecha de caja vuelve el día que haya un segundo término. Hoy no hay ninguno:
  // la columna es el convenio y nada más. Ver la cabecera de este bloque.
  void celdaPago; void demanda
  return `=IFERROR(${convenio};"")`
}

/**
 * NÚCLEO PURO: LAS DOS BRECHAS ENTRE EL PLANTEL Y LAS OBRAS — lo que el `MAX` escondía.
 *
 * Sacar la demanda de la columna no puede significar tirarla: es el dato que dice si el plantel
 * alcanza. Pero es OTRA magnitud, así que va afuera del cuadro de importes, en dos líneas que se
 * apagan solas —cada una existe únicamente el día que su brecha es mayor que cero—:
 *
 *   · las obras piden MÁS de lo que el plantel cubre  → falta gente, o van a ir horas extra;
 *   · el plantel cuesta MÁS de lo que las obras piden → plantel sin obra vendida que lo sostenga.
 *
 * Las dos son decisiones del dueño (vender obra, tomar gente, ajustar plantel) y las dos estaban
 * enterradas adentro de un `MAX` que publicaba el ganador y callaba al perdedor.
 *
 * SE CALCULAN EN LA PESTAÑA, NO ACÁ. El término del plantel es la celda «Obreros» de cada fila —una
 * fórmula del Sheet que este proceso no puede evaluar sin recalcular el libro entero—, así que la
 * comparación vive donde viven los dos números. Calcularla en JS obligaría a reimplementar el motor
 * salarial y a que la pestaña y el aviso pudieran decir cosas distintas.
 *
 * @param {{col:string, filas:Array<{fila:number, jornales:number}>}} d la columna «Obreros» y, por
 *   fila del calendario, el jornal puro que piden las obras vendidas en esa quincena (0 si ninguna)
 * @returns {{falta:string|null, sobra:string|null}} las dos fórmulas, o null si no hay nada que medir
 */
export function formulasBrechaDemanda({ col, filas = [] } = {}) {
  const usables = (filas ?? []).filter((f) => Number.isFinite(Number(f?.fila)))
  if (!col || !usables.length) return { falta: null, sobra: null }
  // Una quincena sin obra cargada entra con 0: su plantel entero es plantel sin demanda, que es
  // exactamente lo que hay que ver. Omitirla haría que la brecha se midiera sólo donde hay obra.
  const j = (f) => Math.round(Number(f.jornales) || 0)
  const suma = (dir) => usables
    .map((f) => (dir === 'falta' ? `MAX(0;${j(f)}-N(${col}${f.fila}))` : `MAX(0;N(${col}${f.fila})-${j(f)})`))
    .join('+')
  // LET para no repetir la suma dos veces (la fórmula ya mide ~300 caracteres con nueve términos). El
  // nombre lleva CUATRO letras y ninguna forma de referencia A1: `nPa1` da #NAME? y `brecha` no.
  const linea = (dir, texto) => `=LET(brecha;${suma(dir)};IF(brecha<=0;"";"${ALERTA} $"&TEXT(brecha;"#,##0")&" ${texto}"))`
  return {
    falta: linea('falta', 'que las obras piden por encima del plantel'),
    sobra: linea('sobra', 'de plantel sin obra vendida que lo demande'),
  }
}

/** DD/MM, que es como se leen las fechas en este archivo (locale es_AR). */
const diaMes = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

/**
 * NÚCLEO PURO: EN QUÉ QUINCENAS ENTRA LA DEMANDA AL CÁLCULO — el mismo mapa que emite las fórmulas.
 *
 * Devuelve el índice (0-based) de las `pendientes` que llevan término de demanda. Es un HECHO del
 * generador, no una interpretación: si la clave está en `porQuincena`, esa fila salió con `MAX`.
 *
 * NO dice cuál de los dos GANÓ. Ganar lo decide el MAX adentro del Sheet, contra un convenio que es
 * una expresión de celdas y que acá no se puede evaluar sin recalcular la pestaña entera —y un número
 * calculado por dos caminos distintos es exactamente cómo un control empieza a validarse contra lo que
 * él mismo produce—. Lo que sí se puede afirmar, y es lo que el dueño necesita para explicar el salto,
 * es DÓNDE entra la demanda y desde dónde ya no hay ninguna.
 */
export function quincenasConDemanda(demanda = null, pendientes = []) {
  const mapa = demanda?.porQuincena
  if (!mapa?.size) return []
  return (pendientes ?? []).reduce((acc, q, i) => {
    if (q?.desde instanceof Date && mapa.has(claveQuincena(q.desde))) acc.push(i)
    return acc
  }, [])
}

/**
 * NÚCLEO PURO: la glosa de la demanda — de dónde sale el proyectado de cada quincena.
 *
 * CORTA Y EN LA PROSA QUE YA EXISTE, no en filas ni columnas nuevas: la orden de diseño del dueño
 * (07/08) es pestaña de tesorería enterprise —importes protagonistas, texto mínimo— y el ancho de ocho
 * columnas del calendario es un contrato. Y nunca en una nota de celda: ningún generador escribe notas
 * (regla del repo — notas-que-resucitan). Vacía cuando ninguna quincena lleva demanda, para que glosa
 * y fórmulas no puedan contar historias distintas: las dos salen del mismo mapa.
 *
 * ═══ EL SALTO QUE NO SE PODÍA EXPLICAR (14/08) ═══
 *
 * El dueño, sobre la columna «Obreros»: *"esas proyecciones no pueden ser así, no dan confianza"*. Y
 * medido en la pestaña viva, las tres primeras quincenas triplican a las seis siguientes:
 *
 *     16/08→31/08  $18.759.425      01/10→15/10  $8.220.014
 *     01/09→15/09  $21.576.937      16/10→31/10  $8.220.014
 *     16/09→30/09  $19.100.252      …            …
 *
 * Con el MISMO plantel y la MISMA escala. No es un error: las tres primeras salen del `MAX` contra la
 * demanda de las obras vendidas y las seis siguientes sólo del convenio, porque después del 30/09 no
 * hay obra cargada. Pero la glosa decía únicamente *"Proyectado = MAX(convenio; demanda de 7 obras)"*
 * para las nueve, así que las dos magnitudes se leían como la misma cosa. Un número que el dueño no
 * puede explicar no lo va a usar, y con razón.
 *
 * Ahora la línea declara el CORTE —hasta qué fecha entra la demanda— y el supuesto que estaba oculto
 * detrás del escalón: de ahí en adelante se proyecta el PLANTEL DE HOY y nada más. Eso no es una
 * opinión sobre el futuro: es lo que el cálculo hace, dicho en voz alta.
 *
 * @param {{porQuincena?: Map, nObras?: number}|null} demanda lo que armó jornales-demanda-fuente
 * @param {Array<{desde: Date, hasta: Date}>} pendientes las quincenas que emite la pestaña
 * @returns {string} '' o la frase para concatenar a la prosa existente
 */
export function glosaDemanda(demanda = null, pendientes = []) {
  const nQ = demanda?.porQuincena?.size ?? 0
  if (!nQ) return ''
  const n = Number(demanda?.nObras) || 0
  // LA FÓRMULA DICE MÁS QUE LA FRASE Y OCUPA UN CUARTO. "Donde la demanda de las N obras vendidas
  // (insumo del dueño) supera el convenio, Proyectado es MAX(convenio; demanda)" son 110 caracteres
  // para expresar en palabras exactamente el MAX que la celda ya calcula.
  const base = ` · Proyectado = MAX(convenio; demanda de ${n} obra${n === 1 ? '' : 's'})`
  const con = quincenasConDemanda(demanda, pendientes)
  // Sin las quincenas a la vista no se puede declarar ningún corte, y se dice lo de siempre: una glosa
  // que afirmara un corte que no midió sería peor que la genérica.
  if (!con.length || con.length === (pendientes?.length ?? 0)) return base
  // EL CASO NORMAL es el prefijo contiguo: las obras vendidas terminan y de ahí en más no hay ninguna.
  const contiguo = con.every((v, k) => v === k)
  const corte = pendientes[con[con.length - 1]]?.hasta
  if (contiguo && corte instanceof Date) {
    return `${base} hasta el ${diaMes(corte)} · después, sólo el plantel de hoy`
  }
  return `${base} en ${con.length} de ${pendientes.length} quincenas · el resto, sólo el plantel de hoy`
}
