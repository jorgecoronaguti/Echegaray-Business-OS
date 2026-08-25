// EL CUADRO 5 DE `OBRAS` ES EL ORIGEN DE LOS MATERIALES PREVISTOS — no `obras-datos.mjs`.
//
// ═══ POR QUÉ SE CAMBIÓ LA FUENTE (24/08/2026) ═══
//
// Hasta hoy el libro leía los egresos de materiales de las constantes de `lib/obras-datos.mjs` —la
// transcripción de los PDF de explosión de gastos del dueño, con las fechas del día en que se
// transcribieron (casi todo el 25/08)—. El dueño ENTRÓ A LA PESTAÑA y corrigió esas fechas a mano.
// (Al 24/08 movió los 17 ítems al 01/10/2026 y colapsó las cuotas de cuatro de ellos en una fecha
// única; el número exacto cambia cada vez que él la toca, que es justamente por qué la fuente es la
// celda y no la constante. Desde el 24/08 el GENERADOR de la pestaña también la respeta: fusiona en
// vez de regenerar — `lib/materiales-fusion.mjs`.)
//
// La regla del repo no admite matices: **la edición manual del dueño es la verdad definitiva.** Un
// generador que sigue leyendo la constante le pisa la corrección en la corrida siguiente y el cash
// flow vuelve a mostrar un pico de $16,3M el 25/08 que él ya dijo que no va a ocurrir. Por eso la
// celda que él editó —la columna D del cuadro 5— pasa a ser la FUENTE, y la constante deja de serlo
// para este camino.
//
// ═══ QUÉ NO HACE, A PROPÓSITO ═══
//
// No hay fallback. Si la pestaña no se puede leer o el cuadro no aparece, esto devuelve CERO
// movimientos y lo grita. Caer a `obras-datos.mjs` sería exactamente el defecto que este módulo
// arregla, con la agravante de que saldría en silencio: fechas viejas que se leen como buenas.
//
// ═══ LA FORMA DE LA CELDA D, QUE ES DE DOS ESPECIES ═══
//
// La escribe `lib/obras-grilla.mjs` (SECCION_MATERIALES) y el dueño la edita encima:
//
//   · un SERIAL de fecha (número; 46272 = 07/09/2026) ⇒ UNA salida por el total de la fila.
//   · un TEXTO de cuotas «10/09 · 10/10 · 10/11 · 10/12» ⇒ UNA salida por cuota, con el importe
//     repartido en partes iguales. Va como texto y no como fecha a propósito: un «10/09» crudo se
//     auto-parsea a serial y la celda muestra 46272.
//
// EL AÑO DE UN «dd/mm» NO ESTÁ EN LA CELDA y hay que convenirlo. La convención, declarada acá porque
// es una INFERENCIA y no un dato: **mes ≥ 7 ⇒ 2026; mes < 7 ⇒ 2027.** Sale de que los ítems son de
// obras que arrancan en julio/agosto de 2026 y ninguna cierra más allá de mediados de 2027; un
// «10/03» es marzo del año que viene, no marzo pasado. El día que haya una obra que cruce dos veces
// el mismo mes, esta convención va a elegir mal y hay que reemplazarla por un año explícito en la
// celda — no por una regla más astuta.
//
// ═══ UNA FILA QUE NO SE ENTIENDE NO SE INVENTA ═══
//
// Importe que no es número, o fecha que no es serial ni «dd/mm»: la fila se OMITE del calendario y
// se nombra en el log con su rótulo. Adivinar el importe o la fecha de un egreso es fabricar un
// dato, y el control de abajo (`totalDeclarado`) permite medir cuánta plata quedó afuera.
//
// PURO. Sin red: recibe las filas crudas de la pestaña (UNFORMATTED_VALUE) y devuelve estructuras.

import { serialDe } from './libro-extractores-fechas.mjs'
import { movimiento, SALE } from './libro-movimientos.mjs'
// El neteo secuencial y el SUMPRODUCT contra Compras son LOS MISMOS que usan las obras futuras: dos
// copias de esa cuenta se desincronizan sin dar error y la factura real se descontaría dos veces.
import { celdasNeteoSecuencial, formulaRealDeCompras, RUBRO_OBRAS, PESTANA_OBRAS } from './libro-extractores-obras.mjs'

// El centinela de «esta celda es mía y va vacía» que escribe el generador de la pestaña. Se IMPORTA
// —no se copia— porque una segunda definición del mismo literal se desincroniza sin dar error: las
// celdas vacías se leerían como texto y las filas del cuadro se omitirían de a una.
import { VACIO } from './preservar-anotaciones.mjs'

/**
 * EL CONTRATO DEL CUADRO 5, tal como lo escribe `obras-grilla.mjs`. Se compara por PREFIJO: el
 * resto del título es prosa que el dueño puede reescribir sin que eso cambie qué es el cuadro.
 */
export const PREFIJO_CUADRO_MATERIALES = '5 · MATERIALES PREVISTOS'
/** La primera celda del encabezado. Si no está, no es el cuadro que creo y no leo nada. */
export const ENCABEZADO_CUADRO_MATERIALES = 'Obra — concepto'
/** La fila de cierre. Marca el fin del bloque y publica el total con el que se controla la lectura. */
export const PREFIJO_TOTAL_MATERIALES = '⇒ TOTAL'
/** El separador que el generador pone entre la obra y el concepto en la columna A. */
export const SEPARADOR_OBRA_CONCEPTO = ' — '

const txt = (v) => (v === VACIO || v === undefined || v === null ? '' : String(v).trim())
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const r2 = (v) => Math.round(v * 100) / 100

/**
 * NÚCLEO PURO: el año de un «dd/mm» sin año. Ver la convención declarada en el encabezado.
 * @param {number} mes 1-12
 * @param {number} anioBase el año de las obras en curso (2026 en el archivo vivo)
 */
export const anioDeMesSuelto = (mes, anioBase = 2026) => (mes >= 7 ? anioBase : anioBase + 1)

/**
 * NÚCLEO PURO: la celda D → los seriales de fecha que declara, o `null` si no se entiende.
 *
 * Un número es UN serial (la fecha única que el dueño dejó como fecha). Un texto es la lista de
 * cuotas «dd/mm · dd/mm»; cualquier otra cosa —«sin fecha», una celda vacía, un texto suelto— no se
 * interpreta: devuelve `null` y el llamador omite la fila.
 *
 * @returns {number[]|null} seriales en el orden en que están escritos
 */
export function serialesDeCelda(d, { anioBase = 2026 } = {}) {
  const n = num(d)
  if (n !== null) return n > 0 ? [Math.round(n)] : null
  const s = txt(d)
  if (!s) return null
  const partes = s.split('·').map((p) => p.trim()).filter(Boolean)
  if (!partes.length) return null
  const seriales = []
  for (const p of partes) {
    const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(p)
    if (!m) return null
    const dia = +m[1]; const mes = +m[2]
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null
    // Un año escrito a mano gana sobre la convención: «10/09/2027» dice 2027 y no hay nada que inferir.
    const anio = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : anioDeMesSuelto(mes, anioBase)
    seriales.push(serialDe(anio, mes, dia))
  }
  return seriales
}

/**
 * NÚCLEO PURO: un total en `n` cuotas iguales, donde LA ÚLTIMA ABSORBE EL REDONDEO.
 *
 * Es el mismo criterio que ya usa el reparto de cuotas del extractor de obras: la suma de las cuotas
 * tiene que reconstruir el total EXACTO. Repartir con `round` en las `n` y no ajustar deja centavos
 * sueltos que después no cierran contra el total que publica la propia pestaña.
 */
export function repartirEnCuotas(total, n) {
  if (!Number.isFinite(total) || !Number.isInteger(n) || n < 1) return []
  const cuota = r2(total / n)
  const cuotas = Array.from({ length: n }, () => cuota)
  cuotas[n - 1] = r2(total - cuota * (n - 1))
  return cuotas
}

/** ¿Esta fila abre el cuadro 5? Por prefijo, sobre la columna A. */
const esTitulo = (fila) => txt(fila?.[0]).startsWith(PREFIJO_CUADRO_MATERIALES)

/**
 * NÚCLEO PURO: dónde empieza y dónde termina el cuadro 5 dentro de las filas de la pestaña.
 * @returns {{primera:number, ultima:number, filaTotal:number|null}|null} índices 0-based
 */
export function ubicarCuadro5(filas = []) {
  const iTitulo = (filas ?? []).findIndex(esTitulo)
  if (iTitulo < 0) return null
  if (txt(filas[iTitulo + 1]?.[0]) !== ENCABEZADO_CUADRO_MATERIALES) return null
  const primera = iTitulo + 2
  let i = primera
  let filaTotal = null
  for (; i < filas.length; i++) {
    const a = txt(filas[i]?.[0])
    if (!a) break
    if (a.startsWith(PREFIJO_TOTAL_MATERIALES)) { filaTotal = i; break }
  }
  return { primera, ultima: i - 1, filaTotal }
}

/**
 * NÚCLEO PURO: el total que la PROPIA PESTAÑA declara en su fila de cierre.
 *
 * Es un control legítimo porque NO sale de este parser: lo calcula una fórmula `SUM()` de Sheets
 * sobre las mismas celdas que el dueño edita. Comparar la lectura contra él es comparar contra otra
 * fuente — un control validado contra la información que produce no controla nada.
 *
 * @returns {number|null}
 */
export function totalDeclarado(filas = []) {
  const u = ubicarCuadro5(filas)
  return u?.filaTotal === null || u === null ? null : num(filas[u.filaTotal]?.[4])
}

/**
 * LOS ÍTEMS DEL CUADRO 5 TAL CUAL ESTÁN EN LA PESTAÑA — SIN INTERPRETAR NADA.
 *
 * La hermana cruda de `materialesDesdeCuadro5`: aquélla EXPLOTA las cuotas y resuelve los seriales
 * para el calendario de caja; ésta devuelve las celdas como están, porque su consumidor —la fusión
 * que regenera la pestaña— tiene que volver a ESCRIBIR exactamente lo que el dueño escribió. Un
 * ítem que se lee explotado y se escribe de vuelta ya no es el mismo: cuatro cuotas volverían como
 * cuatro filas de un cuarto cada una, y la línea que él editó desaparecería.
 *
 * `hayCuadro` distingue las dos situaciones que NO son lo mismo: la pestaña todavía no tiene el
 * cuadro (primera corrida ⇒ hay que sembrarlo entero) y el cuadro está pero vacío (⇒ no hay nada
 * que sembrar, el dueño lo vació). Devolver `[]` para las dos las confundiría.
 *
 * @param {Array<Array>} filas la pestaña OBRAS entera, cruda (UNFORMATTED_VALUE)
 * @returns {{hayCuadro:boolean, items:Array<{fila:number, rotulo:string, familia:string,
 *   proveedor:string, fecha:any, previsto:any, nota:string}>}}
 */
export function itemsCrudosDeCuadro5(filas = []) {
  const u = ubicarCuadro5(filas)
  if (!u) return { hayCuadro: false, items: [] }
  const items = []
  for (let i = u.primera; i <= u.ultima; i++) {
    const f = filas[i] ?? []
    const rotulo = txt(f[0])
    if (!rotulo) continue
    items.push({
      fila: i + 1,
      rotulo,
      familia: txt(f[1]),
      proveedor: txt(f[2]),
      // LA D Y LA E VIAJAN CRUDAS, NO NORMALIZADAS: son las dos celdas que el dueño edita y las dos
      // que se reescriben. El centinela VACIO y el `undefined` sí se traducen a '' — no son valores
      // suyos, son plomería del generador y agujeros de la lectura.
      fecha: f[3] === VACIO || f[3] === undefined || f[3] === null ? '' : f[3],
      previsto: f[4] === VACIO || f[4] === undefined || f[4] === null ? '' : f[4],
      nota: txt(f[5]),
    })
  }
  return { hayCuadro: true, items }
}

/**
 * NÚCLEO PURO: UNA fila de ítem → sus puntos de egreso (uno por cuota), o la razón para omitirla.
 * `null` cuando la fila no es un ítem (columna A vacía).
 *
 * @param {Array} f la fila cruda · @param {number} nFila su número 1-based en la pestaña
 * @returns {{puntos:Array, previsto:number, omitida:null}|{omitida:object}|null}
 */
function puntosDeFila(f, nFila, anioBase) {
  const rotulo = txt(f[0])
  if (!rotulo) return null
  const previsto = num(f[4])
  if (previsto === null || previsto <= 0) {
    // `previsto: null` — no se sabe cuánta plata quedó afuera, y eso es parte del hallazgo.
    return { omitida: { fila: nFila, rotulo, previsto: null, motivo: `el Previsto no es un número positivo (${JSON.stringify(f[4] ?? null)})` } }
  }
  const seriales = serialesDeCelda(f[3], { anioBase })
  if (!seriales) {
    // Acá el importe SÍ se conoce: viaja para que el control contra el total de la pestaña cierre
    // igual —la fila quedó fuera del calendario, no fuera de la cuenta de lo que el cuadro declara—.
    return { omitida: { fila: nFila, rotulo, previsto, motivo: `no puedo interpretar la Fecha estimada (${JSON.stringify(f[3] ?? null)})` } }
  }
  // «PISOS INDUSTRIALES — Gasoil» → obra + ítem. Se corta en el PRIMER separador: un concepto que
  // contenga « — » se queda entero del lado del ítem, que es donde no hace daño.
  const c = rotulo.indexOf(SEPARADOR_OBRA_CONCEPTO)
  const obra = c > 0 ? rotulo.slice(0, c).trim() : rotulo
  const item = c > 0 ? rotulo.slice(c + SEPARADOR_OBRA_CONCEPTO.length).trim() : ''
  const cuotas = repartirEnCuotas(previsto, seriales.length)
  const puntos = seriales.map((fechaSerial, k) => ({
    fechaSerial,
    // EL CONCEPTO SE DEFINE ACÁ Y EN NINGÚN OTRO LADO. Tiene que salir con la MISMA forma que hasta
    // hoy («PISOS INDUSTRIALES · Gasoil», « · cuota k/n» cuando hay varias): las fórmulas SUMPRODUCT
    // de _CAJA_ANEXO filtran por rubro, pero el ojo del dueño lee el concepto, y una línea que cambia
    // de nombre parece una línea nueva.
    concepto: `${obra} · ${item || 'egreso de obra'}${seriales.length > 1 ? ` · cuota ${k + 1}/${seriales.length}` : ''}`,
    importe: cuotas[k],
    obra,
    item,
    familia: txt(f[1]),
    proveedor: txt(f[2]) || '(sin proveedor)',
    nota: txt(f[5]),
    fila: nFila,
    cuota: k + 1,
    cuotas: seriales.length,
  }))
  return { puntos, previsto, omitida: null }
}

/**
 * LOS MATERIALES PREVISTOS DEL CUADRO 5 → puntos de egreso, uno por cuota.
 *
 * @param {Array<Array>} filas la pestaña OBRAS entera, cruda (UNFORMATTED_VALUE)
 * @param {{aviso?:(m:string)=>void, anioBase?:number}} opts
 * @returns {{movimientos:Array<{fechaSerial:number, concepto:string, importe:number, obra:string,
 *   item:string, familia:string, proveedor:string, nota:string, fila:number, cuota:number,
 *   cuotas:number}>, omitidas:Array<{fila:number, rotulo:string, motivo:string}>,
 *   resumen:{items:number, movimientos:number, total:number, omitidas:number}}}
 */
export function materialesDesdeCuadro5(filas = [], { aviso = () => {}, anioBase = 2026 } = {}) {
  const vacio = { movimientos: [], omitidas: [], resumen: { items: 0, movimientos: 0, total: 0, omitidas: 0 } }
  const u = ubicarCuadro5(filas)
  if (!u) {
    aviso(`no encontré el cuadro «${PREFIJO_CUADRO_MATERIALES}» en las filas de OBRAS (o su encabezado `
      + `no dice «${ENCABEZADO_CUADRO_MATERIALES}»): NO caigo a obras-datos.mjs — el libro sale con `
      + 'cero materiales previstos antes que con las fechas viejas que el dueño ya corrigió.')
    return vacio
  }
  const movimientos = []
  const omitidas = []
  let items = 0
  let total = 0
  for (let i = u.primera; i <= u.ultima; i++) {
    const r = puntosDeFila(filas[i] ?? [], i + 1, anioBase)
    if (!r) continue
    if (r.omitida) { omitidas.push(r.omitida); continue }
    items++
    total = r2(total + r.previsto)
    movimientos.push(...r.puntos)
  }
  for (const o of omitidas) {
    aviso(`cuadro 5, fila ${o.fila} «${o.rotulo}»: ${o.motivo}. Se OMITE del calendario — no invento `
      + 'la fecha ni el importe de un egreso.')
  }
  return { movimientos, omitidas, resumen: { items, movimientos: movimientos.length, total, omitidas: omitidas.length } }
}

/**
 * NÚCLEO PURO: UN grupo (obra, proveedor) ya ordenado por fecha → sus movimientos del libro.
 * @param {Array} grupo · @param {{real:string|null, cliente:string, corte:number}} ctx
 */
function emitirGrupo(grupo, { real, cliente, corte }) {
  const celdas = celdasNeteoSecuencial(grupo.map((p) => p.importe), real)
  return grupo.map((p, k) => {
    const base = movimiento({
      // Una fecha planificada que ya pasó no dice VENCIDO: se corre a mañana, va a salir ya. Es el
      // mismo criterio de `deObras` — el dueño dejó el 10/08 en un ítem que todavía no se compró.
      fecha: p.fechaSerial <= corte ? corte + 1 : p.fechaSerial,
      importe: p.importe,
      signo: SALE,
      concepto: p.concepto,
      contraparte: p.proveedor,
      rubro: RUBRO_OBRAS,
      estado: 'PROYECTADO',
      instrumento: '',
      obra: p.obra,
      cliente,
      // La FILA del cuadro y la CUOTA entran a la clave: sin ellas, dos cuotas del mismo ítem
      // comparten clave de deduplicación y `deduplicar` colapsaría una de las dos.
      origen: { pestana: PESTANA_OBRAS, fila: `cuadro5:f${p.fila}${p.cuotas > 1 ? `·cuota ${p.cuota}` : ''}` },
    })
    // `importeVivo` viaja FUERA de movimiento() (que congela su shape): el script lo escribe en la
    // celda C en lugar del número pegado, igual que hace con `deObras` y con `deCompras`.
    return celdas[k] ? { ...base, importeVivo: celdas[k] } : base
  })
}

/**
 * LOS PUNTOS DEL CUADRO 5 → MOVIMIENTOS DEL LIBRO, con el importe VIVO contra Compras.
 *
 * ═══ POR QUÉ EL IMPORTE NO PUEDE IR PEGADO ═══
 *
 * Un número pegado se cuenta DOS VECES desde el instante en que la factura real entra a Compras: la
 * fila real viaja al libro por su propia puerta y la proyección sigue entera hasta la regeneración
 * siguiente. Es la misma cuenta y el mismo SUMPRODUCT que `deObras` — se importan, no se copian.
 *
 * ═══ QUÉ LE FALTA AL CUADRO 5, Y DE DÓNDE SALE ═══
 *
 * El SUMPRODUCT filtra por (proveedor, cliente, fecha ≥ inicio de la obra), y el cuadro 5 no publica
 * ni el cliente ni el inicio: son metadatos de la OBRA, no del egreso. Llegan por `contexto` (el
 * script los arma desde `obras-datos.mjs`, que sigue siendo la ficha de cada obra). Lo que dejó de
 * leerse de ahí es exactamente lo que el dueño editó: la FECHA y el IMPORTE de cada ítem.
 *
 * Una obra del cuadro que no está en `contexto` sale con el importe PEGADO y viaja en `sinNeteoDe`.
 * Esta función no decide si eso se publica: es pura y el llamador puede querer los movimientos igual
 * (para medirlos, por ejemplo). QUIEN PUBLICA ABORTA — igual que `exigirColumnasNeteo` frente a
 * `columnasNeteoDeCompras`: un egreso pegado se cuenta dos veces en cuanto su factura entra a Compras,
 * y un libro equivocado y silencioso es peor que un libro que no se escribió.
 *
 * @param {Array} puntos lo que devolvió `materialesDesdeCuadro5().movimientos`
 * @param {{contexto?:Map<string,{clave?:string, cliente?:string, inicioSerial?:number}>,
 *   colsCompras?:object|null, corte?:number, aviso?:(m:string)=>void}} opts
 * @returns {{movimientos:Array, sinNeteoDe:Array<{obra:string, proveedor:string, causa:string,
 *   salidas:number}>, resumen:{obras:number, movimientos:number, total:number, sinNeteo:number}}}
 */
export function movimientosDeMateriales(puntos = [], {
  contexto = new Map(), colsCompras = null, corte = 0, aviso = () => {},
} = {}) {
  // Un plan por (obra, proveedor): las cuotas de un ítem y los distintos ítems del mismo proveedor
  // dentro de la obra comparten el SUMPRODUCT, así que tienen que compartir la secuencia de neteo.
  const grupos = new Map()
  for (const p of puntos) {
    const k = `${p.obra} ${p.proveedor}`
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(p)
  }
  const movimientos = []
  const obras = new Set()
  const sinNeteoDe = []
  let total = 0
  let sinNeteo = 0
  for (const grupo of grupos.values()) {
    grupo.sort((a, b) => a.fechaSerial - b.fechaSerial || a.fila - b.fila)
    const { obra, proveedor } = grupo[0]
    const ctx = contexto.get(obra) ?? null
    const puedeNetear = Boolean(colsCompras && ctx?.cliente && Number.isFinite(ctx?.inicioSerial))
    if (!puedeNetear) {
      sinNeteo += grupo.length
      const causa = ctx ? 'faltan las columnas de neteo de Compras'
        : `la obra "${obra}" del cuadro 5 no figura en la ficha de obras (obras-datos.mjs)`
      sinNeteoDe.push({ obra, proveedor, causa, salidas: grupo.length })
      aviso(`materiales previstos: «${obra} · ${proveedor}» no se puede netear (${causa}). Cuando la `
        + 'factura real entre a Compras, esa plata quedaría contada dos veces.')
    }
    const real = puedeNetear ? formulaRealDeCompras(colsCompras, proveedor, ctx.cliente, ctx.inicioSerial) : null
    for (const m of emitirGrupo(grupo, { real, cliente: ctx?.cliente ?? '', corte })) {
      movimientos.push(m)
      total = r2(total + m.importe)
    }
    obras.add(obra)
  }
  return { movimientos, sinNeteoDe, resumen: { obras: obras.size, movimientos: movimientos.length, total, sinNeteo } }
}

/**
 * LOS MOVIMIENTOS O UN ABORTO CON NOMBRE Y APELLIDO — la puerta de quien PUBLICA.
 *
 * Misma pareja que `columnasNeteoDeCompras` / `exigirColumnasNeteo`: la función de arriba calcula y
 * ésta decide si eso se puede publicar. No se puede: un egreso proyectado con el importe pegado se
 * cuenta DOS VECES desde el instante en que su factura entra a Compras, y el aviso se pierde entre
 * setenta líneas de log. El mensaje nombra la obra y el proveedor, que es lo que hace falta para
 * arreglarlo (o el rótulo del cuadro 5 cambió, o la obra no está en la ficha).
 *
 * @param {{movimientos:Array, sinNeteoDe:Array}} r lo que devolvió `movimientosDeMateriales`
 * @returns {Array} los movimientos, si todos netean
 */
export function exigirNeteoDeMateriales(r) {
  const sin = r?.sinNeteoDe ?? []
  if (!sin.length) return r?.movimientos ?? []
  throw new Error(`materiales previstos: ${sin.reduce((a, x) => a + x.salidas, 0)} egreso(s) saldrían con el `
    + `importe PEGADO — ${sin.map((x) => `"${x.obra} · ${x.proveedor}" (${x.causa})`).join(' · ')}. Sin el neteo `
    + 'vivo esa plata se cuenta dos veces cuando la factura real entra: no escribo el libro.')
}
