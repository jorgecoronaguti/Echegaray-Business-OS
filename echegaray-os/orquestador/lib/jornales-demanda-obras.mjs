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
  void celdaPago; void demanda
  // ═══ EL MAX CONTRA LA DEMANDA SE FUE (14/08) ═══
  //
  // Decía `MAX(convenio; demanda de las obras)`. Con eso la columna cambiaba de NATURALEZA fila por
  // fila: de agosto a septiembre publicaba lo que piden las obras vendidas ($18,7M–$21,5M) y de
  // octubre en adelante lo que obliga el convenio ($7,2M–$8,8M). El dueño lo vio en la cara:
  // *"esas proyecciones no pueden ser asi, no dan confianza"* · *"q mierda estas haciendo con las
  // proyecciones de obreros"* · *"hace lo solicitado CON EL PLANTEL ACTUAL"*.
  //
  // Y tenía razón por aritmética, no por gusto: esos $18,7M equivalen a ~38 personas con la Σ $/hora
  // del convenio, contra las 16 del plantel. El número no describía ni a su gente ni a su escala.
  //
  // La regla es una sola y vale para las nueve quincenas: **el 100% del convenio sobre el plantel
  // actual**. La demanda de obra sigue viva y sigue siendo información valiosa —dice si las obras
  // vendidas piden más gente de la que hay— pero es OTRA pregunta y no puede pisar ésta.
  return `=IFERROR(${convenio};"")`
}

/**
 * NÚCLEO PURO: la glosa de la demanda — de dónde salió el término constante del MAX.
 *
 * CORTA Y EN LA PROSA QUE YA EXISTE, no en filas ni columnas nuevas: la orden de diseño del dueño
 * (07/08) es pestaña de tesorería enterprise —importes protagonistas, texto mínimo— así que el MAX
 * no agrega nada visible; esta frase se APPENDEA a la línea de prosa que la sección ya tiene. Y
 * nunca en una nota de celda: ningún generador escribe notas (regla del repo — notas-que-resucitan).
 * Vacía cuando ninguna quincena lleva demanda, para que glosa y fórmulas no puedan contar historias
 * distintas: las dos salen del mismo mapa.
 *
 * @param {{porQuincena?: Map, nObras?: number}|null} demanda lo que armó jornales-demanda-fuente
 * @returns {string} '' o la frase para concatenar a la prosa existente
 */
export function glosaDemanda(demanda = null) {
  const nQ = demanda?.porQuincena?.size ?? 0
  if (!nQ) return ''
  const n = Number(demanda?.nObras) || 0
  // ═══ ESTA GLOSA ESTUVO MINTIENDO DOS SEMANAS (encontrado el 29/08) ═══
  //
  // Decía `Proyectado = MAX(convenio; demanda de N obras)` y se ESCRIBÍA EN LA PESTAÑA. El MAX murió
  // el 14/08 —`formulaProyectadoQuincena` devuelve la expresión del plantel sola— así que la línea
  // describía una fórmula que la celda de al lado no tenía. No es un comentario viejo: es una
  // afirmación falsa publicada en el Sheet, del tipo que hace que alguien concilie contra un
  // criterio que no existe y no encuentre nunca la diferencia.
  //
  // Dice lo que la columna ES. La demanda de obras sigue siendo información —y sigue midiéndose,
  // en `coberturaDeManoDeObra`— pero NO entra en este número, y por eso se nombra para decir
  // exactamente eso.
  return ` · Proyectado = plantel actual, no la demanda de ${n} obra${n === 1 ? '' : 's'}`
}
