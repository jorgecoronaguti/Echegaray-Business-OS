// ¿ESTE DATO PUEDE SER CIERTO? — la pregunta que faltaba. NÚCLEO PURO, CERO MODELO, CERO RED.
//
// ═══ EL COMPROBANTE DE BARCELO (04/08, 18:48) ═══
//
// El bot le mostró al dueño esto, y las tres cosas marcadas son imposibles:
//
//   | Fecha    | 05/12/2003            |  ← esta empresa carga comprobantes de 2025-2026
//   | Concepto | Comestibles y bebidas |  ← era una carga de COMBUSTIBLE
//   | IVA      | $0,01                 |  ← un centavo sobre $5.223,35 no es ninguna alícuota
//
// Lo grave no es que el modelo se haya equivocado: leer una foto es visión y se va a equivocar
// siempre. Lo grave es que los tres errores **pasaron todos los controles que ya existían**:
//
//   · la identidad aritmética CERRABA (5.223,35 + 0,01 + 0 = 5.223,36) — el modelo se equivocó de
//     forma coherente, así que `aritmetica.mjs` no tenía nada que delatar;
//   · el número era correcto, así que ARCA y la deduplicación tampoco;
//   · el proveedor terminó bien matcheado (`matchProveedor` tolera el OCR desde el 04/08).
//
// Todos esos controles preguntan lo mismo: **¿los datos son consistentes ENTRE SÍ?** Ninguno pregunta
// **¿este dato puede existir?**, que es otra pregunta y es la que faltaba. Una fecha de 2003 y un IVA
// del 0,0002% son imposibles mirando UN solo campo, sin compararlo con nada.
//
// ═══ QUÉ HACE Y QUÉ NO ═══
//
// DECLARA, NO CORRIGE. Devuelve "esto no puede ser, y esto fue lo que leí". Nunca reemplaza el valor
// por uno inventado ni lo redondea a la alícuota más cercana: quien decide qué dice el papel es la
// persona que lo tiene en la mano. Un IVA "arreglado" a la alícuota más probable sería exactamente
// fabricar el dato que no se pudo leer.
//
// GUARDA EVIDENCIA, NO VEREDICTOS. Como `escala` en `faltantes.mjs`: se recalcula cada vez que se
// evalúa el ítem. Si se guardara el veredicto, corregir la fecha no volvería a mirarla y el control
// quedaría opinando sobre un valor que ya nadie usa.

const red2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

// ── LA FECHA ─────────────────────────────────────────────────────────────────

/**
 * Cuántos años hacia atrás es razonable que llegue un comprobante nuevo.
 *
 * 1 = desde el 1° de enero del año PASADO. El 04/08/2026 eso son 19 meses de ventana, que cubre de
 * sobra el atraso real con el que llega un comprobante a este canal (días, a veces semanas). Es
 * env-configurable porque es una convención de la empresa, no una ley.
 */
export const ANIOS_ATRAS = Number(process.env.ORQ_COMPROBANTES_ANIOS_ATRAS || 1)

/**
 * Un día de tolerancia hacia adelante. El servidor corre en UTC y el comprobante trae la fecha
 * argentina (UTC−3): a la 01:00 UTC del día 5 en San Juan todavía es el día 4. Sin esta tolerancia,
 * un comprobante emitido hoy podría quedar "en el futuro" según el reloj de la máquina.
 */
const DIAS_ADELANTE = 1

/** DD/MM/AAAA → Date al mediodía UTC (el mediodía evita que el huso corra el día). null si no parsea. */
export function aFecha(v) {
  const m = String(v ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [d, mes, anio] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const f = new Date(Date.UTC(anio, mes - 1, d, 12))
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) return null
  return f
}

/**
 * ¿Esta fecha puede ser la de un comprobante que se está cargando ahora?
 *
 * La ventana es **[1° de enero de hace `ANIOS_ATRAS` años, hoy]**. Fuera de ella no hay un
 * comprobante viejo: hay un año mal leído. El 2003 del caso real salió de leer "2023" o "2025" con un
 * dígito cambiado, o de interpretar como año algo que no lo era.
 *
 * `verificable:false` cuando no hay fecha o no parsea: eso ya lo cubre `FALTA.FECHA`, y opinar dos
 * veces sobre el mismo hueco haría que el mensaje lo pregunte dos veces.
 *
 * @param {string|null} fecha  DD/MM/AAAA (lo que devuelve `fechaDeLectura`)
 * @param {{ahora?:Date|string, aniosAtras?:number}} [o]
 * @returns {{verificable:boolean, plausible:boolean|null, leida:string|null, desde:string|null, motivo:string|null}}
 */
export function fechaPlausible(fecha, { ahora, aniosAtras = ANIOS_ATRAS } = {}) {
  const f = aFecha(fecha)
  if (!f) return { verificable: false, plausible: null, leida: null, desde: null, motivo: null }
  const hoy = ahora ? new Date(ahora) : new Date()
  if (!Number.isFinite(hoy.getTime())) return { verificable: false, plausible: null, leida: String(fecha), desde: null, motivo: null }

  const desde = new Date(Date.UTC(hoy.getUTCFullYear() - Math.max(0, aniosAtras), 0, 1, 12))
  const hasta = new Date(hoy.getTime() + DIAS_ADELANTE * 86_400_000)
  const leida = String(fecha)
  const desdeTexto = comoAR(desde)

  if (f.getTime() > hasta.getTime()) {
    return {
      verificable: true, plausible: false, leida, desde: desdeTexto,
      motivo: `está en el futuro (hoy es ${comoAR(hoy)})`,
    }
  }
  if (f.getTime() < desde.getTime()) {
    const anios = hoy.getUTCFullYear() - f.getUTCFullYear()
    return {
      verificable: true, plausible: false, leida, desde: desdeTexto,
      motivo: anios >= 2
        ? `sería de hace ${anios} años y acá se cargan comprobantes desde el ${desdeTexto}`
        : `es anterior al ${desdeTexto}`,
    }
  }
  return { verificable: true, plausible: true, leida, desde: desdeTexto, motivo: null }
}

const comoAR = (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`

// ── EL IVA ───────────────────────────────────────────────────────────────────

/**
 * Las alícuotas de IVA vigentes en Argentina. El 0 está adentro y no es una formalidad: un tique B o
 * C legítimamente NO discrimina IVA, y ahí el IVA es cero y el total es todo neto. Tratar ese caso
 * como un error convertiría el control en una molestia permanente — la mitad de lo que entra por este
 * canal son tiques de estación de servicio.
 */
export const ALICUOTAS_IVA = Object.freeze([0, 2.5, 5, 10.5, 21, 27])

/**
 * Tolerancia sobre cada alícuota, en puntos porcentuales: el mayor entre 0,5 pp y el 5% de la
 * alícuota. Cubre el redondeo por renglón y algún renglón exento diluyendo el promedio, sin llegar
 * ni cerca del error que se busca (leer un dígito de menos cambia el orden de magnitud, no un punto).
 */
const tolerancia = (a) => Math.max(0.5, a * 0.05)

/**
 * Las bandas de proporción IVA/neto que un comprobante real puede tener, en %.
 *
 * Además de una banda por alícuota va la **banda mixta 10,5–21**: una factura con renglones a las dos
 * alícuotas da un promedio en cualquier punto intermedio, y eso es común (materiales al 21% con algún
 * ítem al 10,5%). Con las bandas de 10,5 y 21 pegadas a ella queda un tramo continuo ~[9,98 · 22,05].
 */
export const BANDAS_IVA = Object.freeze([
  ...ALICUOTAS_IVA.filter((a) => a > 0).map((a) => [a - tolerancia(a), a + tolerancia(a)]),
  [10.5, 21],
].sort((x, y) => x[0] - y[0]))

/**
 * ¿El IVA leído guarda alguna relación posible con el neto?
 *
 * EL NETO CONTRA EL QUE SE MIDE ES EL QUE VA A IR A LA CELDA. `valoresInput` deriva la columna M como
 * `Total − IVA`, así que cuando el papel no trae subtotal —un tique nunca lo trae— se usa esa misma
 * resta. Medir contra otra cosa haría que el control opine sobre un número que no se escribe.
 *
 * TRES RESPUESTAS, NO DOS:
 *   · `verificable:false` — no hay con qué opinar (sin total, o el neto da cero). No poder mirar no
 *     es haber mirado.
 *   · IVA cero o ausente → PLAUSIBLE. Es el tique B, y es el caso normal.
 *   · IVA distinto de cero → tiene que caer en alguna banda. Si no cae, es un dígito mal leído.
 *
 * Signos: se trabaja en valor absoluto. Una nota de crédito llega con los tres importes en negativo y
 * su alícuota es exactamente la misma que la de la factura que anula.
 *
 * @param {{neto?:number|null, iva?:number|null, otrosTributos?:number|null, total?:number|null}} c
 * @returns {{verificable:boolean, plausible:boolean|null, ratio:number|null, iva:number|null, neto:number|null, motivo:string|null}}
 */
export function ivaPlausible(c = {}) {
  const iva = num(c.iva) ?? 0
  const total = num(c.total)
  const otros = num(c.otrosTributos) ?? 0
  // El neto declarado manda; si no está, el que se va a escribir en M.
  const neto = num(c.neto) ?? (total == null ? null : red2(total - iva - otros))
  const nada = { verificable: false, plausible: null, ratio: null, iva: null, neto: null, motivo: null }
  if (neto == null || Math.abs(neto) < 0.01) return nada
  if (iva === 0) return { verificable: true, plausible: true, ratio: 0, iva: 0, neto, motivo: null }

  const ratio = red2((Math.abs(iva) / Math.abs(neto)) * 100)
  // El IVA y el neto con signos opuestos no es una alícuota: es un signo mal puesto.
  const mismoSigno = (iva < 0) === (neto < 0)
  const plausible = mismoSigno && BANDAS_IVA.some(([lo, hi]) => ratio >= lo && ratio <= hi)
  return {
    verificable: true,
    plausible,
    ratio,
    iva,
    neto,
    motivo: plausible ? null : `es el ${ratio.toLocaleString('es-AR', { maximumFractionDigits: 2 })}% del neto, y las alícuotas son ${ALICUOTAS_IVA.filter((a) => a > 0).map((a) => a.toLocaleString('es-AR')).join(' · ')}%`,
  }
}

// ── LO QUE SE DEDUJO DE UN NOMBRE MAL LEÍDO ─────────────────────────────────
//
// «COMESTIBLES BARCELO» es «Combustibles Barcelo»: dos letras de diferencia que `matchProveedor`
// perdona desde el 04/08 (`motivo:'ocr'`). Pero el modelo de visión leyó el papel ANTES de esa
// corrección, y con el nombre equivocado en la cabeza escribió el concepto: «Comestibles y bebidas»
// para una carga de combustible. El nombre se arregló y el concepto quedó envenenado.
//
// LA REGLA: cuando el nombre hubo que corregirlo por OCR, todo TEXTO LIBRE que repita una palabra
// del nombre EQUIVOCADO —y que no esté en el correcto— no es un dato del papel: es el eco del error.
// Se descarta y se declara. No se reemplaza por nada: qué se compró lo dice el comprobante, y si no
// se pudo leer, no se pudo leer.
//
// POR QUÉ ES ESTRECHA A PROPÓSITO: sólo opina cuando hubo corrección de OCR. Comprar cemento a
// «Cemento Avellaneda» con el concepto «Cemento» es legítimo y frecuentísimo, y ahí no hay ninguna
// corrección que dispare nada.

const VACIAS = new Set(['y', 'e', 'de', 'del', 'la', 'el', 'los', 'las', 'en', 'sa', 'srl', 'sas', 'sh', 'sacif'])

/** Palabras significativas de un texto, sin tildes ni puntuación. */
export function palabras(v) {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter((p) => p.length >= 3 && !VACIAS.has(p))
}

/**
 * Las palabras del nombre LEÍDO que el nombre CORREGIDO no tiene: las que el OCR inventó.
 * `['comestibles']` para («COMESTIBLES BARCELO» → «Combustibles Barcelo»).
 */
export function palabrasInventadas(leido, corregido) {
  const buenas = new Set(palabras(corregido))
  return palabras(leido).filter((p) => !buenas.has(p))
}

/**
 * ¿Este texto salió de una palabra que el OCR inventó?
 *
 * @param {string|null} texto
 * @param {string[]} inventadas  lo que devolvió `palabrasInventadas`
 * @returns {{contaminado:boolean, palabra:string|null}}
 */
export function ecoDelOcr(texto, inventadas = []) {
  if (!texto || !inventadas.length) return { contaminado: false, palabra: null }
  const malas = new Set(inventadas)
  const p = palabras(texto).find((w) => malas.has(w))
  return { contaminado: Boolean(p), palabra: p ?? null }
}

// ── LAS DUDAS DE UN ÍTEM, EN UN SOLO LUGAR ──────────────────────────────────

/**
 * Todo lo que este ítem leyó y no puede ser cierto.
 *
 * UNA SOLA FUENTE PARA LAS DOS CARAS: `faltantes.mjs` la usa para decidir que no se escribe y
 * `mensaje.mjs` para decidir que no se muestra como dato. Si cada una tuviera su cuenta, el mensaje
 * podría mostrar como leída una fecha que el control ya rechazó.
 *
 * EL RELOJ, EN ORDEN DE PRECEDENCIA: el que pasa quien llama · el momento en que se leyó la foto
 * (`item.leidoEn`, que viaja con el ítem desde `armarItem`) · el reloj de la máquina. El del medio
 * es el correcto y no es un detalle: el mensaje se vuelve a dibujar en cada click y el fajo queda en
 * Postgres, así que juzgar la fecha contra "ahora" haría que la misma foto sea plausible hoy e
 * imposible el año que viene.
 *
 * LO TIPEADO POR UNA PERSONA NO SE CUESTIONA — misma regla que `totalTipeado`: el trabajo de este
 * control es dudar de lo que leyó un modelo, no de lo que escribió alguien que tiene el papel en la
 * mano. Sin esa salida, corregir dispararía el mismo control para siempre.
 *
 * @returns {{fecha?:object, iva?:object}}
 */
export function dudasDeLectura(item = {}, { ahora } = {}) {
  const c = item?.comprobante ?? {}
  const cuando = ahora ?? item?.leidoEn ?? undefined
  const out = {}
  if (!c.fechaTipeada) {
    const f = fechaPlausible(c.fecha, cuando ? { ahora: cuando } : {})
    if (f.verificable && !f.plausible) out.fecha = f
  }
  if (!c.ivaTipeado) {
    const v = ivaPlausible(c)
    if (v.verificable && !v.plausible) out.iva = v
  }
  return out
}

function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
