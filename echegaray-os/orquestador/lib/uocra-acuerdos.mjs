// LOS ACUERDOS DE LA PARITARIA, LEÍDOS DE LA RÉPLICA — CON SU AÑO, QUE ES LO QUE FALTABA.
//
// ═══ EL DEFECTO QUE ESTE MÓDULO MATA (06/08) ═══
//
// `lib/uocra-escala.mjs` ubica el mes con `MATCH(TEXT(fecha;"mmmm")&"*"; _UOCRA_RAW!A:A; 0)`. El
// rótulo de la réplica dice "Agosto\n+1,9%" y NO dice el año. La réplica tiene dos años y medio de
// acuerdos apilados, así que "septiembre*" encuentra la fila 68 —"Septiembre (1,3% s/ago)" de 2025—
// y devuelve el Ayudante a $3.687. La pestaña mostraba que el escalón que viene BAJA y que hoy
// pagamos 22,1% POR ENCIMA del convenio, cuando la verdad medida es 16,7% POR DEBAJO. `IFERROR` no
// dispara porque la fórmula SÍ encuentra una fila: miente callado, que es el modo de falla que este
// repositorio persigue.
//
// La cura no es una fórmula más astuta: en la réplica el año NO ESTÁ en la fila del mes. Está en la
// fila del acuerdo ("Acuerdo Mayo 2026"), quince filas más arriba. Eso no se resuelve con un MATCH.
// Se resuelve leyendo la réplica de una vez, acá, y emitiendo fórmulas con la FILA ya resuelta —el
// mismo patrón con que el generador resuelve los bloques de `_J_OBREROS`— más un canario que grita
// si la réplica se movió debajo de esa fila.
//
// ═══ EL AÑO SE DEDUCE DEL DESCENSO, NO DEL RÓTULO DEL ACUERDO ═══
//
// La tabla va SIEMPRE en orden descendente (agosto arriba, y hacia abajo meses cada vez más viejos).
// Verificado sobre la réplica real: "Acuerdo Febrero 2025 → Marzo, Febrero, Enero" y abajo "Acuerdo
// Noviembre 2024 → Diciembre, Noviembre, Octubre". El año del acuerdo NO alcanza —octubre de 2024
// cuelga de un acuerdo de noviembre— pero el descenso sí: cuando el número de mes SUBE al bajar una
// fila, se cruzó un 1° de enero y el año baja uno. El ancla es el primer grupo: sus meses son los
// del año del acuerdo si son >= su mes, y del año siguiente si no.
//
// ═══ EL % DEL RÓTULO NO ES EL ESCALÓN. MEDIDO, Y ES IMPORTANTE ═══
//
// El rótulo de agosto dice "+1,9%". El básico de Ayudante pasó de $4.948 (julio) a $5.399 (agosto):
// +9,11%. No es un error de la réplica: el básico publicado ABSORBE sumas no remunerativas que el
// porcentaje del acuerdo no menciona, y la réplica no trae esas sumas por separado (su pie de página
// lo dice: "más Suma No Remunerativa que varía en función a la categoría y zona").
//
// Consecuencia para el motor: proyectar con el % del rótulo subestima el jornal. El escalón real es
// el COCIENTE DE BÁSICOS PUBLICADOS entre dos meses, que es un hecho medible. El % del rótulo se
// conserva sólo como ETIQUETA de la fila, para que se lea de dónde viene el escalón.

/** El orden de las categorías dentro de cada grupo mensual. Es la estructura del convenio. */
export const CATEGORIAS = ['Oficial Especializado', 'Oficial', 'Medio Oficial', 'Ayudante', 'Sereno']
/** La categoría que ancla el escalón: es el piso del convenio y la que el control ya compara. */
export const CATEGORIA_ANCLA = 'Ayudante'
/**
 * LAS QUE COBRAN POR MES Y NO POR HORA. El Sereno cobra $980.858 AL MES y las otras cuatro por hora:
 * meter ese número en una columna de $/hora fue lo que hizo que un Sereno pareciera cobrar $980.858 la
 * hora (ver `mapearEscala` en lib/nomina-replica.mjs, que ya lo separa). La lista vive UNA vez.
 */
export const CATEGORIAS_POR_MES = ['Sereno']

/**
 * NÚCLEO PURO: EL TRAMO DE FILAS DE UN ESCALÓN QUE SE COTIZA POR HORA — sin el Sereno.
 *
 * Lo usa el INDEX/MATCH de «Básico convenio»: buscar dentro del grupo COMPLETO deja que un "Sereno"
 * tipeado en la columna «Convenio» del dueño devuelva un importe MENSUAL a una columna de $/hora, que
 * después se multiplica por horas y días. No da error: da una masa salarial absurda con cara de dato.
 *
 * Las filas salen del parser —cada categoría trae la suya—, no de contar cinco desde el rótulo: anclar
 * en la posición es lo que ya rompió tres cosas en este repositorio.
 */
export function filasPorHora(escalon) {
  const fs = CATEGORIAS.filter((c) => !CATEGORIAS_POR_MES.includes(c))
    .map((c) => escalon?.categorias?.[c]?.fila)
    .filter((f) => Number.isInteger(f) && f > 0)
  return fs.length ? { r0: Math.min(...fs), r1: Math.max(...fs) } : null
}
export const HOJA = '_UOCRA_RAW'
/** Dónde vive cada dato en la réplica. San Juan es Zona A, y ahí Zona A == Básico. */
export const COL = { mes: 'A', categoria: 'B', unidad: 'C', basico: 'D', zonaA: 'H' }

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** "setiembre" existe en actas viejas y es el mismo mes. */
const ALIAS = { setiembre: 9 }

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const sinTildes = (s) => norm(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/** NÚCLEO PURO: el número de mes de un rótulo, o null si no empieza con un nombre de mes. */
export function mesDeRotulo(rotulo) {
  const t = sinTildes(rotulo)
  const m = /^([a-z]+)/.exec(t)
  if (!m) return null
  const i = MESES.indexOf(m[1])
  if (i >= 0) return i + 1
  return ALIAS[m[1]] ?? null
}

/** NÚCLEO PURO: el % que el rótulo declara ("Agosto +1,9%", "Febrero (1,8% s/Ene)"). Etiqueta, no escalón. */
export function pctDeRotulo(rotulo) {
  const m = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/.exec(norm(rotulo))
  if (!m) return null
  const v = Number(m[1].replace(',', '.'))
  return Number.isFinite(v) ? Math.round((v / 100) * 1e6) / 1e6 : null
}

/** NÚCLEO PURO: "Acuerdo Mayo 2026" → {mes:5, anio:2026}. null si la fila no es un encabezado de acuerdo. */
export function cabeceraDeAcuerdo(rotulo) {
  const m = /^acuerdo\s+(.+?)\s+(\d{4})\s*$/i.exec(sinTildes(rotulo))
  if (!m) return null
  const mes = mesDeRotulo(m[1])
  return mes ? { mes, anio: Number(m[2]) } : null
}

const periodoDe = (anio, mes) => `${anio}-${String(mes).padStart(2, '0')}`
const numero = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '').replace(/[^\d,.-]/g, '')
  if (!s) return null
  // La réplica llega por IMPORTHTML: los básicos vienen como enteros sin separador ("7420"). Si
  // algún día llegan con formato es-AR ("7.420,00"), el punto es miles y la coma decimal.
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? n : null
}

/**
 * NÚCLEO PURO: la réplica entera → la serie de escalones, con su año, su fila y sus básicos.
 *
 * @param {any[][]} filas `_UOCRA_RAW!A1:K…` tal como lo devuelve readSheetValues
 * @returns {{escalones:Array, problemas:string[]}}
 *   escalón = { periodo, anio, mes, rotulo, pctRotulo, acuerdo, fila, categorias: {cat:{fila, basico, zonaA}} }
 *   `fila` es 1-based sobre la pestaña: la fila del rótulo del mes, que es también la de la 1ª categoría.
 */
export function parsearAcuerdos(filas = []) {
  const problemas = []
  const escalones = []
  let acuerdo = null
  let anio = null
  let mesPrevio = null

  for (let i = 0; i < filas.length; i++) {
    const rotulo = norm(filas[i]?.[0])
    if (!rotulo) continue
    const cab = cabeceraDeAcuerdo(rotulo)
    if (cab) { acuerdo = { ...cab, rotulo }; continue }
    const mes = mesDeRotulo(rotulo)
    if (!mes) continue
    // La fila del mes tiene que traer una categoría al lado: si no, es prosa (el pie de página del
    // acuerdo empieza con "*(más Suma…"), no un grupo de escala.
    const cat0 = norm(filas[i]?.[1])
    if (cat0 !== CATEGORIAS[0]) continue

    if (anio === null) {
      if (!acuerdo) { problemas.push(`la réplica arranca con el mes "${rotulo}" sin un "Acuerdo <mes> <año>" arriba: no puedo fijar el año`); return { escalones, problemas } }
      // El primer grupo: los meses de un acuerdo empiezan en su mes o después; si el mes es anterior,
      // el acuerdo cruzó el 1° de enero.
      anio = mes >= acuerdo.mes ? acuerdo.anio : acuerdo.anio + 1
    } else if (mes > mesPrevio) {
      // Bajando por la tabla los meses descienden. Si sube, se cruzó un 1° de enero hacia atrás.
      anio -= 1
    }
    mesPrevio = mes

    const categorias = {}
    CATEGORIAS.forEach((cat, k) => {
      const f = filas[i + k] ?? []
      const nombre = norm(f[1])
      if (nombre !== cat) { problemas.push(`fila ${i + 1 + k}: esperaba "${cat}" y dice "${nombre || '(vacío)'}" — el grupo de ${rotulo.replace(/\s+/g, ' ')} está incompleto`); return }
      categorias[cat] = { fila: i + 1 + k, basico: numero(f[3]), zonaA: numero(f[7]) }
    })

    escalones.push({
      periodo: periodoDe(anio, mes), anio, mes,
      rotulo: rotulo.replace(/\s+/g, ' '),
      pctRotulo: pctDeRotulo(rotulo),
      acuerdo: acuerdo?.rotulo ?? null,
      fila: i + 1,
      categorias,
    })
  }
  if (!escalones.length) problemas.push(`${HOJA} no tiene ni un grupo de escala reconocible: el IMPORTHTML pudo haberse caído`)
  return { escalones, problemas }
}

/** El escalón de un período 'YYYY-MM', o null. */
export function escalonDe(escalones = [], periodo) {
  return escalones.find((e) => e.periodo === periodo) ?? null
}

/** El escalón publicado más nuevo. */
export function ultimoEscalon(escalones = []) {
  return escalones.slice().sort((a, b) => a.periodo.localeCompare(b.periodo)).pop() ?? null
}

/**
 * NÚCLEO PURO: EL ESCALÓN QUE RIGE UN MES — el suyo si está publicado, y si no el último anterior.
 *
 * ═══ EL DEFECTO QUE ESTO MATA (07/08) ═══
 *
 * Una escala de convenio NO deja de regir el día que se termina su acuerdo: rige hasta que otra la
 * reemplaza. El motor usaba `escalonDe(escalones, mes en curso)` —igualdad exacta de período— para
 * decidir la BASE de la proyección. El acuerdo vigente cierra el 31/08 y la réplica no tiene fila de
 * septiembre: el 01/09, sin que nadie tocara nada, `escalonVigente` pasaba a null, la base volvía sola
 * del convenio al jornal PACTADO (−12,14% sobre la masa) y la nota de Cargas seguía declarando lo
 * contrario. Nada da error: la pestaña se dibuja entera con otro criterio adentro.
 *
 * HACIA ATRÁS NO SE EXTRAPOLA. Si el período pedido es ANTERIOR a todo lo publicado, devuelve null:
 * aplicarle a un mes viejo una escala que se firmó después sería inventarle un aumento que no tuvo.
 *
 * @param {Array} escalones salida de parsearAcuerdos
 * @param {Date|string} cuando una fecha o un período 'YYYY-MM'
 */
export function escalonVigenteEn(escalones = [], cuando = new Date()) {
  const periodo = cuando instanceof Date
    ? periodoDe(cuando.getFullYear(), cuando.getMonth() + 1)
    : String(cuando ?? '')
  if (!/^\d{4}-\d{2}$/.test(periodo)) return null
  return escalonDe(escalones, periodo) ?? ultimoEscalon(escalones.filter((e) => e.periodo < periodo))
}

/**
 * NÚCLEO PURO: el escalón MEDIDO entre dos períodos publicados, para una categoría.
 * Es el cociente de básicos — el hecho— y no el % del rótulo, que subestima (ver cabecera).
 * @returns {number|null} el factor (1,0911 = +9,11%)
 */
export function factorEntre(escalones = [], desde, hasta, categoria = CATEGORIA_ANCLA) {
  const a = escalonDe(escalones, desde)?.categorias?.[categoria]?.basico
  const b = escalonDe(escalones, hasta)?.categorias?.[categoria]?.basico
  if (!a || !b) return null
  return b / a
}

/**
 * NÚCLEO PURO: cuánto subió el básico por mes, en promedio geométrico, sobre los últimos `n` meses
 * publicados y consecutivos. Es el número con el que se propone `PARITARIA_ESPERADA`.
 *
 * SE MIDE SOBRE EL BÁSICO, NO SOBRE EL RÓTULO. Con los rótulos (1,9% · 2% · 2,1%…) el promedio da
 * ~1,9%/mes; con los básicos publicados da bastante más, porque el básico absorbe sumas no
 * remunerativas. Proyectar con el rótulo dejaría el costo laboral corto todos los meses.
 *
 * @returns {{pct:number, desde:string, hasta:string, meses:number, pctRotulos:number|null}|null}
 */
export function escalonPromedio(escalones = [], n = 6, categoria = CATEGORIA_ANCLA) {
  const orden = escalones.slice().sort((a, b) => a.periodo.localeCompare(b.periodo))
    .filter((e) => e.categorias?.[categoria]?.basico > 0)
  if (orden.length < 2) return null
  const tramo = orden.slice(-Math.max(2, n + 1))
  const a = tramo[0]
  const b = tramo[tramo.length - 1]
  const meses = tramo.length - 1
  const pct = (b.categorias[categoria].basico / a.categorias[categoria].basico) ** (1 / meses) - 1
  const rot = tramo.slice(1).map((e) => e.pctRotulo).filter((x) => typeof x === 'number')
  return {
    pct: Math.round(pct * 1e6) / 1e6,
    desde: a.periodo,
    hasta: b.periodo,
    meses,
    pctRotulos: rot.length ? Math.round((rot.reduce((s, x) => s + x, 0) / rot.length) * 1e6) / 1e6 : null,
  }
}

/**
 * NÚCLEO PURO: ¿las cinco categorías se mueven juntas? Si divergen, el motor —que ancla el escalón
 * en el Ayudante— estaría aplicándole a un Oficial un escalón que no es el suyo, y hay que verlo.
 * @returns {{divergencia:number, detalle:Array<{categoria:string, factor:number}>}|null}
 */
export function divergenciaEntreCategorias(escalones = [], desde, hasta) {
  const detalle = CATEGORIAS.map((c) => ({ categoria: c, factor: factorEntre(escalones, desde, hasta, c) }))
    .filter((x) => typeof x.factor === 'number')
  if (detalle.length < 2) return null
  const fs = detalle.map((x) => x.factor)
  return { divergencia: Math.max(...fs) - Math.min(...fs), detalle }
}

/**
 * NÚCLEO PURO: EL CANARIO. Qué le pasa a la réplica hoy, dicho en una frase que va A LA CELDA.
 *
 * Tres estados y ninguno silencioso:
 *   · vacía    — el IMPORTHTML se cayó o el sitio cambió. No hay escala contra la cual comparar.
 *   · vencida  — el último acuerdo publicado ya quedó atrás del mes en curso: de ahí en adelante el
 *                motor proyecta con el % esperado, y eso se dice.
 *   · al día   — el mes en curso tiene acuerdo publicado.
 *
 * @param {Array} escalones
 * @param {Date} hoy
 */
export function estadoReplica(escalones = [], hoy = new Date()) {
  const enCurso = periodoDe(hoy.getFullYear(), hoy.getMonth() + 1)
  const ult = ultimoEscalon(escalones)
  if (!ult) {
    return {
      estado: 'vacía', ultimoPeriodo: null,
      // EL CANARIO GRITA EN UN RENGLÓN. El párrafo explicaba además que no se muestra una escala vieja
      // — pero eso es lo que el canario HACE, no algo que el lector necesite leer para actuar. Queda
      // qué falta y qué hacer; que no hay piso de convenio se VE, en las celdas del piso vacías.
      //
      // EL LARGO ES UN CONTRATO: este mensaje se concatena con " · CCT 76/75 Zona A" (19 caracteres)
      // en la línea de vigencia de la sección 4, así que tiene que entrar en 41 para que esa fila no
      // pase de 60. Ver el test del tope en jornales-pestana.test.mjs.
      mensaje: `⚠ Sin escala UOCRA — revisá el IMPORTHTML`,
    }
  }
  if (ult.periodo < enCurso) {
    return {
      estado: 'vencida', ultimoPeriodo: ult.periodo,
      // "Los meses siguientes se proyectan con el % esperado de Parámetros" se cayó de acá porque el
      // cuadro 1.2 lo dice fila por fila en su columna Estado: "⚠ proyección" en cada mes sin acuerdo.
      // Repetirlo arriba en prosa es la tercera vez que se afirma lo mismo.
      // El período del último acuerdo y el mes en curso se cayeron: el rótulo YA trae el mes ("Agosto
      // +1,9%") y cuál es el mes en curso lo sabe el que mira. Mismo contrato de 41 caracteres.
      mensaje: `⚠ Escala vencida — último: ${ult.rotulo}`,
    }
  }
  return {
    estado: 'al día', ultimoPeriodo: ult.periodo,
    mensaje: `${ult.rotulo} · ${ult.acuerdo ?? 'sin acuerdo declarado'}`,
  }
}
