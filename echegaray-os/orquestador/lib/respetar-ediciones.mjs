// REVISAR LO QUE LA PERSONA EDITÓ **ANTES** DE ESCRIBIR, Y ADAPTARSE A SU CAMBIO.
//
// POR QUÉ EXISTE (23/07). El dueño amplió la regla que ya existía: no alcanza con no borrar lo que
// él escribe. Textual: *"si yo decido una modificación en algún texto, eliminación, reencuadre —
// revisar antes de cambiar algo, respetarla y adaptar la modificación a esto"*.
//
// La diferencia con lo que ya había ([[preservar-anotaciones]]) es grande y hay que verla:
//
//   PRESERVAR protege lo que el generador NO escribe: una columna nueva, una nota al margen. Si el
//   generador escribe un rótulo, gana el generador, siempre.
//
//   RESPETAR protege lo que el generador SÍ escribe pero la persona CAMBIÓ. Si el dueño reescribe
//   "Deuda previsional en cuotas" como "Plan de pago ARCA", o vacía una fila, o mueve un texto, la
//   próxima corrida se lo pisaba sin enterarse. Y como el agente corre cada dos horas, su edición
//   duraba menos de un turno.
//
// ═══ CÓMO SE SABE QUE LO CAMBIÓ UNA PERSONA ═══
//
// No se puede saber mirando el Sheet: un texto distinto puede venir de una persona o de una versión
// anterior del propio generador. La única forma honesta es que el generador RECUERDE lo que escribió
// la última vez. Si hoy la celda dice algo distinto de eso, la cambió alguien más.
//
//     lo que escribí la vez pasada  ==  lo que hay hoy   →  nadie la tocó   →  escribo lo nuevo
//     lo que escribí la vez pasada  !=  lo que hay hoy   →  LA TOCÓ UNA PERSONA  →  respeto lo suyo
//
// ═══ QUÉ ALCANZA, Y POR QUÉ NO MÁS ═══
//
// SÓLO LOS RÓTULOS DE TEXTO. Un importe y una fórmula son la respuesta que la pestaña calcula: si el
// dueño escribe un número a mano encima de un cálculo, eso no es una decisión de redacción, es un
// dato pisado — y para eso ya existe columnas-calculadas.mjs, que lo devuelve a su fórmula y avisa.
// Respetar un número pisado sería congelar un cuadro en un valor que dejó de actualizarse.

import { query } from './db.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

/**
 * Postgres RECHAZA el byte nulo en un texto, y una celda de Sheets puede traerlo (llega de un pegado
 * desde otro programa). Sin esto, una sola celda sucia hacía fallar el guardado ENTERO del registro
 * y la regla dejaba de funcionar en silencio para toda la pestaña.
 */
const limpio = (s) => String(s).replace(/\u0000/g, '')

/**
 * El apóstrofo inicial de Sheets NO es parte del valor: es la marca de "esto entra como texto"
 * (`'ene-26` para que no lo parsee como fecha). Se escribe con él y se lee sin él, así que sin
 * normalizarlo TODOS los encabezados de mes parecían editados por una persona en cada corrida — y
 * la regla los habría congelado, que es justo lo contrario de lo que tiene que hacer.
 */
const sinApostrofo = (s) => String(s ?? '').replace(/^'/, '')

/** ¿Es un rótulo? Texto, no fórmula, no número. Es lo único que esta regla protege. */
export function esRotulo(v) {
  if (typeof v !== 'string') return false
  // El centinela de "esta celda es mía y va vacía" no es un rótulo: es plomería del generador.
  if (v === VACIO) return false
  const t = v.trim()
  if (!t || t.startsWith('=')) return false
  // Un texto que es sólo un número escrito ("1.234", "12%") es un dato, no un rótulo.
  if (/^[-$\s\d.,%]+$/.test(t)) return false
  // UNA FECHA TAMPOCO ES UN RÓTULO (23/07). Se vio en la primera corrida real sobre "Estructura" y
  // "Recurrentes": los doce encabezados de mes —"1/1/2026" … "1/12/2026"— entraban como rótulos
  // porque la barra no es un dígito. Dos consecuencias, las dos malas: la pestaña avanza de año y
  // los doce se leen como "el dueño los borró", y si además se respetaran quedarían CONGELADOS en
  // 2026 para siempre. El encabezado de un mes lo decide el calendario, no una persona.
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(t)) return false
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(t)) return false
  return true
}

/**
 * LA CLAVE ES EL TEXTO QUE YO ESCRIBÍ, NO LA POSICIÓN.
 *
 * POR QUÉ (23/07, el mismo día que se estrenó la regla). La primera versión guardaba el registro por
 * "fila:columna" y comparaba celda contra celda. Funcionó hasta que una pestaña cambió de alto: al
 * agregarse una fila de subtítulo, TODO el contenido de abajo quedó corrido un renglón respecto del
 * registro, así que cada comparación miraba la celda equivocada — y como el registro tenía una
 * entrada para esa posición, la regla "respetó" basura: metió un importe pegado donde iba el título
 * "DISPONIBILIDADES" y dejó CAJA rota en dos filas.
 *
 * Anclar al TEXTO es además lo que el dueño pidió: "respetá MI texto". Si él cambió "Deuda
 * previsional en cuotas" por "Plan de pago ARCA", eso vale esté esa fila donde esté. Una pestaña se
 * reordena; el rótulo que él eligió, no.
 */
const clave = (texto) => String(texto ?? '').trim()

/**
 * ¿Es un texto de ESTRUCTURA de la pestaña —título, subtítulo, encabezado de sección— cuyo borrado
 * nunca sería una decisión deliberada? Esos no se dan nunca por eliminados.
 */
/**
 * Cuántos borrados en UNA corrida siguen siendo creíbles como decisión de una persona. Tres es
 * generoso: el dueño borra una nota que no le sirve, no vacía media pestaña entre dos corridas.
 */
export const MAX_BORRADOS_CREIBLES = 3

/** El marcador de un borrado CANDIDATO: ausente una corrida, todavía sin confirmar. No es '' (borrado
 *  confirmado) ni null (normal): es "lo estoy vigilando". Se guarda en reemplazo. */
export const PENDIENTE = '::PENDIENTE::'

/**
 * NÚCLEO PURO: los rótulos que YO escribo hoy y que NO están en la pestaña — los candidatos a borrado,
 * SIN los seguros de MAX ni estructural. La decisión de confirmarlos la toma la persistencia, no el
 * conteo. "Desapareció y lo sigo queriendo escribir" = alguien lo sacó; si dejé de escribirlo yo, no
 * cuenta (igual que detectarEdiciones).
 *
 * @returns {Set<string>} claves (texto) de los candidatos de esta corrida
 */
export function deteccionCruda(mios = [], actual = [], generado = []) {
  const presentes = new Set()
  for (const f of actual || []) for (const c of f || []) { const t = clave(c); if (t) presentes.add(sinApostrofo(t)) }
  const quiere = new Set()
  for (const f of generado || []) for (const c of f || []) { const t = clave(c); if (t) quiere.add(sinApostrofo(t)) }
  const out = new Set()
  for (const m of mios) {
    const t = clave(m); const norm = sinApostrofo(t)
    if (!t || !quiere.has(norm) || presentes.has(norm)) continue
    out.add(t)
  }
  return out
}

/**
 * NÚCLEO PURO: decide, con los candidatos de HOY y los que ya estaban pendientes de la corrida
 * anterior, cuáles borrados se CONFIRMAN (persistieron dos lecturas) y cuáles quedan pendientes.
 *
 * Un candidato que YA era candidato antes → se confirma (es un borrado real, persistió). Uno nuevo →
 * queda pendiente para la próxima. Así una lectura fallida transitoria nunca borra: no llega a
 * persistir. No hay techo por cantidad: la persistencia reemplaza al viejo MAX_BORRADOS, y por eso un
 * borrado masivo o de un título —si es real y persiste— ahora SÍ se respeta.
 *
 * @param {Set<string>} cruda candidatos de esta corrida
 * @param {Set<string>} previos candidatos de la corrida anterior (del registro)
 * @returns {{confirmados:string[], candidatos:string[]}}
 */
export function resolverPersistencia(cruda = new Set(), previos = new Set()) {
  const confirmados = []
  const candidatos = []
  for (const t of cruda) {
    if (previos.has(t)) confirmados.push(t)
    else candidatos.push(t)
  }
  return { confirmados, candidatos }
}

export function esEstructural(t) {
  const s = String(t ?? '').trim()
  if (!s) return false
  if (/^\s*\d+(\.\d+)?\s*·\s/.test(s)) return true          // "1 · SECCIÓN", "4.1 · SUB"
  // UNA FILA DE TOTAL TAMPOCO SE DA POR BORRADA. Cuando un rediseño mueve los bloques, el rótulo del
  // total aparece en otra fila y la regla lo lee como "el dueño lo borró": el generador deja de
  // escribirlo, el cuadro queda sin su total y la marca se confirma sola. Pasó con "⇒ Costo de la
  // nómina en el año" al incorporar oficina a Jornales. Nadie borra a propósito el total de un
  // cuadro: si desapareció, lo moví yo.
  if (/^\s*⇒/.test(s)) return true
  if (/^(qué|cuánta|cuánto|de dónde|posición|impuestos|cargas|jornales)/i.test(s) && s.length > 40) return true
  return false
}

/**
 * NÚCLEO PURO: aplica las ediciones de la persona sobre la grilla que el generador quiere escribir.
 *
 * @param {any[][]} generado  lo que el generador escribiría hoy
 * @param {any[][]} actual    lo que hay hoy en la pestaña
 * @param {Map<string,string>} registro  lo que el generador escribió la última vez, por "fila:col"
 * @returns {{grid:any[][], respetadas:{fila:number,col:number,mio:string,suyo:string}[]}}
 */
export function respetarEdiciones(generado = [], actual = [], registro = new Map()) {
  const respetadas = []
  // Lo que hay HOY en la pestaña, indexado por texto: sirve para saber si el rótulo que yo escribí
  // la vez pasada todavía está en algún lado.
  const presentes = new Set()
  for (const f of actual || []) for (const c of f || []) { const t = clave(c); if (t) presentes.add(sinApostrofo(t)) }

  const grid = generado.map((f) => (f || []).map((celda) => {
    if (!esRotulo(celda)) return celda
    const reemplazo = registro.get(clave(celda))
    // Sin una edición registrada para este texto, se escribe lo que corresponde. Es el caso normal.
    if (reemplazo === undefined) return celda
    // Si el texto que yo quiero escribir YA está en la pestaña, la edición se deshizo (o el dueño
    // volvió atrás): se deja de respetar y se vuelve a la versión del generador.
    if (presentes.has(sinApostrofo(clave(celda)))) return celda
    respetadas.push({ mio: String(celda), suyo: reemplazo })
    // ═══ "BORRASTE MI RÓTULO" SE ESCRIBE CON EL CENTINELA, NO CON UNA CADENA VACÍA (14/08/2026) ═══
    //
    // Dos módulos usan `''` para dos cosas OPUESTAS, y acá se cruzaban:
    //   · acá, `''` significa "el dueño borró este texto, la celda va vacía";
    //   · en `fusionar`, `''` significa "esta celda NO es mía: conservá lo que haya en la pestaña".
    //
    // Así que un borrado respetado no dejaba la celda vacía: le entregaba el control a lo que hubiera
    // debajo. Medido en el archivo real, filas 118-145 de "Proveedores": la fila de encabezado del
    // cuadro 4 aterrizó con SÓLO la F y la G del layout nuevo ("Qué es", "Anula → la reemplaza") y la
    // A/B/C/D mostrando una fila de datos del layout ANTERIOR —proveedor · CUIT · comprobante ·
    // fecha—, porque 'Proveedor', 'Fecha' e 'Importe' estaban registrados como borrados y su `''`
    // preservó el sedimento en vez de limpiarlo. Eso es, celda por celda, el "capas superpuestas" que
    // el dueño ve; y explica por qué el barrido informa 0: para cuando la guarda mira, la grilla ya
    // trae los valores viejos escritos encima de los míos, así que no hay ninguna celda vacía sobre
    // contenido que barrer.
    //
    // Con el centinela la intención queda dicha entera: la celda es MÍA y va VACÍA. `fusionar` la
    // traduce a vacío real, y quien decide si se puede vaciar sigue siendo `no-borrar.mjs` sobre el
    // destino que ella misma relee — el residuo propio se limpia, una anotación del dueño no.
    return reemplazo === '' ? VACIO : reemplazo
  }))
  return { grid, respetadas }
}

/**
 * NÚCLEO PURO: qué rótulos cambió la persona, comparando lo que YO escribí la última vez contra lo
 * que la pestaña dice hoy. Se busca cada texto propio en TODA la grilla, no en su vieja posición:
 * una pestaña se reordena y un rótulo se mueve sin que nadie lo haya editado.
 *
 * ═══ LA DISTINCIÓN QUE FALTABA (23/07) ═══
 *
 * "Desapareció un texto mío" tiene DOS causas, y confundirlas rompe la pestaña:
 *
 *   · lo borró el DUEÑO            → hay que respetarlo
 *   · dejé de escribirlo YO        → no hay nada que respetar; es un cambio del generador
 *
 * La primera versión no las distinguía, así que cada vez que yo mejoraba un rótulo la versión vieja
 * "desaparecía" y quedaba registrada como borrada por el dueño. Se comió el SUBTÍTULO de Impuestos:
 * lo reescribí, el texto anterior desapareció, y desde entonces la regla respetaba "vacío" y la
 * pestaña quedaba sin subtítulo para siempre.
 *
 * El desempate es simple: sólo cuenta como edición del dueño si el generador SIGUE QUERIENDO
 * escribir ese texto hoy. Si ya no está en mi grilla, el que lo sacó fui yo.
 *
 * @param {string[]} mios     los rótulos que el generador escribió la última vez
 * @param {any[][]} actual    la pestaña hoy
 * @param {any[][]} generado  lo que el generador quiere escribir AHORA
 * @returns {Map<string,string>} texto mío → texto de la persona (cadena vacía = lo borró)
 */
export function detectarEdiciones(mios = [], actual = [], generado = []) {
  const presentes = new Set()
  for (const f of actual || []) for (const c of f || []) { const t = clave(c); if (t) presentes.add(sinApostrofo(t)) }
  const quiereEscribir = new Set()
  for (const f of generado || []) for (const c of f || []) { const t = clave(c); if (t) quiereEscribir.add(sinApostrofo(t)) }
  const ediciones = new Map()
  for (const m of mios) {
    const t = clave(m)
    // Si el generador ya no escribe este texto, el que lo sacó fui yo: no es una edición del dueño.
    if (!quiereEscribir.has(sinApostrofo(t))) continue
    // DESAPARECIÓ UN RÓTULO QUE YO HABÍA ESCRITO. Eso es una eliminación o una reescritura. No se
    // puede saber POR CUÁL texto lo cambió —podría ser cualquiera de los nuevos— así que lo honesto
    // es registrar la eliminación: la próxima corrida no lo vuelve a escribir.
    if (!t || presentes.has(sinApostrofo(t))) continue
    // ═══ EL SEGURO: HAY BORRADOS QUE NADIE PIDE ═══
    //
    // POR QUÉ (23/07). El registro se enganchó en un estado malo y dejó a CAJA sin subtítulo: una
    // vez que un texto queda marcado como "lo borró el dueño", el generador no lo vuelve a escribir
    // nunca, así que sigue ausente y la marca se confirma sola. Un lazo del que sólo se sale
    // purgando la tabla a mano.
    //
    // Contra eso: hay textos cuyo borrado NUNCA es una decisión de negocio plausible. Nadie quiere
    // una pestaña sin título ni sin la línea que dice de dónde salen sus números. Si desaparecieron,
    // el que falló fui yo — y ante la duda, se vuelve a escribir.
    if (esEstructural(m)) continue
    ediciones.set(t, '')
  }
  // ═══ EL SEGUNDO SEGURO: UNA PERSONA NO BORRA ONCE RÓTULOS ENTRE DOS CORRIDAS ═══
  //
  // POR QUÉ (23/07). El registro tenía 13 borrados marcados que el dueño nunca hizo: 11 en
  // "Recurrentes" —incluidas las notas largas que explican de dónde sale cada cuadro— y 2 en
  // "Proveedores" ("TOTAL FACTURADO", "Plazo de pago promedio"). Un bloque entero desapareciendo de
  // golpe no es una decisión de negocio: es que la lectura no alcanzó a ver esa parte de la pestaña
  // (ventana corta, recálculo en curso, bloque movido). Y como un falso borrado se confirma solo
  // —el generador deja de escribirlo, así que sigue ausente— el daño es permanente.
  //
  // Borrar un rótulo es un acto deliberado y puntual. Si aparecen muchos juntos, la explicación
  // económica es que fallé yo leyendo, no que el dueño hizo una limpieza. Ante la duda, no se
  // registra nada: el generador vuelve a escribir y, si el dueño de verdad los borró, los borra otra
  // vez y la próxima corrida —de a uno— sí lo aprende.
  if (ediciones.size > MAX_BORRADOS_CREIBLES) return new Map()
  return ediciones
}

/**
 * El registro tiene DOS cosas por pestaña, y hacen falta las dos:
 *
 *   `rotulo`     → un texto que ESTE generador escribió la última vez. Sirve para detectar que
 *                  desapareció, o sea que alguien lo cambió.
 *   `reemplazo`  → si ya se detectó que la persona lo cambió, con qué. Vacío = lo borró.
 *
 * Un registro que sólo guardara lo primero perdería la decisión de la persona en cuanto el generador
 * dejara de escribir ese texto; uno que sólo guardara lo segundo nunca podría detectar el cambio.
 */
async function asegurarTabla() {
  await query(`
    create table if not exists public.sheet_rotulos (
      file_id    text not null,
      pestana    text not null,
      rotulo     text not null,
      reemplazo  text,
      escrito_en timestamptz not null default now(),
      primary key (file_id, pestana, rotulo)
    )`)
  // Migración desde la primera versión, que guardaba por fila/columna: la posición no sirve —una
  // pestaña que cambia de alto deja todo el registro apuntando a la celda equivocada, y así se
  // "respetó" un importe pegado en el lugar de un título.
  await query(`alter table public.sheet_rotulos add column if not exists rotulo text`)
  await query(`alter table public.sheet_rotulos add column if not exists reemplazo text`)
  await query(`delete from public.sheet_rotulos where rotulo is null`)
}

/** Lo que este generador escribió la última vez, y las ediciones ya detectadas. */
export async function leerRegistro(fileId, pestana) {
  await asegurarTabla()
  const r = await query('select rotulo, reemplazo from public.sheet_rotulos where file_id = $1 and pestana = $2', [fileId, pestana])
  const mios = r.rows.filter((x) => x.reemplazo !== PENDIENTE).map((x) => x.rotulo)
  // Una edición confirmada tiene reemplazo real ('' = borrado, o el texto nuevo). El candidato lleva
  // el marcador PENDIENTE y NO es una edición todavía: es lo que se vigila para la próxima corrida.
  const ediciones = new Map(r.rows.filter((x) => x.reemplazo !== null && x.reemplazo !== PENDIENTE).map((x) => [x.rotulo, x.reemplazo]))
  const candidatos = new Set(r.rows.filter((x) => x.reemplazo === PENDIENTE).map((x) => x.rotulo))
  return { mios, ediciones, candidatos }
}

/**
 * Guarda los rótulos de esta corrida y las ediciones vigentes.
 *
 * SE REGISTRA LO QUE QUEDÓ EN LA PESTAÑA, NO LO QUE EL GENERADOR QUISO ESCRIBIR (23/07). Entre una
 * cosa y la otra hay un paso más: el formato. En CAJA los orígenes largos se acortan y el texto
 * completo pasa a una nota; en Impuestos la columna de procedencia se vacía entera. Registrar el
 * texto que el generador produjo hacía que, a la corrida siguiente, "no está en la pestaña" fuera
 * cierto para noventa rótulos — y la regla los daba por borrados por el dueño. Noventa avisos falsos
 * por corrida, y peor: la regla dejaba de escribirlos.
 *
 * @param {any[][]} [enLaPestana] lo que quedó escrito, releído después de formatear
 */
export async function guardarRegistro(fileId, pestana, grid, ediciones = new Map(), enLaPestana = null, candidatos = new Set()) {
  await asegurarTabla()
  let presentes = null
  if (enLaPestana) {
    presentes = new Set()
    for (const f of enLaPestana) for (const c of f || []) { const t = clave(c); if (t) presentes.add(sinApostrofo(t)) }
  }
  const rotulos = new Set()
  for (const f of grid || []) for (const c of f || []) {
    if (!esRotulo(c)) continue
    const t = limpio(String(c).trim())
    if (presentes && !presentes.has(sinApostrofo(t))) continue
    rotulos.add(t)
  }
  // Las ediciones vigentes se conservan aunque el generador ya no escriba ese texto: si no, la
  // decisión de la persona duraría una sola corrida.
  for (const k of ediciones.keys()) rotulos.add(limpio(k))
  // Los candidatos a borrado también se guardan: son la memoria de "esto estaba ausente la corrida
  // pasada" que permite confirmar el borrado si sigue ausente. Se guardan con el marcador PENDIENTE.
  const candSet = new Set([...candidatos].map((c) => limpio(String(c))))
  for (const k of candSet) rotulos.add(k)
  await query('delete from public.sheet_rotulos where file_id = $1 and pestana = $2', [fileId, pestana])
  const filas = [...rotulos].map((r) => [r, ediciones.has(r) ? limpio(ediciones.get(r)) : (candSet.has(r) ? PENDIENTE : null)])
  if (!filas.length) return 0
  const vals = filas.map((_, k) => `($1,$2,$${k * 2 + 3},$${k * 2 + 4})`).join(',')
  await query(`insert into public.sheet_rotulos (file_id, pestana, rotulo, reemplazo) values ${vals}`,
    [fileId, pestana, ...filas.flat()])
  return filas.length
}

/**
 * El ciclo completo, para que un generador lo use en dos líneas.
 *
 *   const { grid, respetadas, ediciones } = await conEdicionesRespetadas(ID, PESTAÑA, filas, actual)
 *   … escribir grid …
 *   await guardarRegistro(ID, PESTAÑA, grid, ediciones)
 */
/**
 * EL ARRANQUE EN FRÍO: proteger lo que el dueño ya tenía editado ANTES de que existiera la regla.
 *
 * POR QUÉ EXISTE (23/07). La Regla 0 compara contra lo que el generador escribió la última vez. Para
 * una pestaña que nunca la usó, ese registro está vacío — así que la PRIMERA corrida no respeta nada
 * y le pisa al dueño todo lo que hubiera editado hasta ese momento. Justo lo que vino a evitar.
 *
 * El arranque en frío usa el único indicio honesto que hay sin historia: **el generador quiere
 * escribir un rótulo que en la pestaña no está en ninguna parte.** Si el generador lo escribe hoy y
 * no aparece, alguien lo cambió o lo borró — porque el generador es determinístico y la corrida
 * anterior lo puso ahí.
 *
 * NO ES INFALIBLE y hay que decirlo: si el rótulo cambió porque yo mismo mejoré el texto del
 * generador entre dos corridas, esto lo lee como una edición del dueño. Por eso se usa en modo
 * INFORME —se muestra la lista y él confirma— y no se siembra a ciegas.
 *
 * @returns {{fila:number, mio:string}[]} los rótulos que el generador quiere escribir y no están
 */
export function detectarArranqueEnFrio(generado = [], actual = []) {
  const presentes = new Set()
  for (const f of actual || []) for (const c of f || []) { const t = clave(c); if (t) presentes.add(sinApostrofo(t)) }
  const out = []
  const vistos = new Set()
  ;(generado || []).forEach((f, i) => (f || []).forEach((c) => {
    if (!esRotulo(c)) return
    const t = clave(c)
    // Un título o un encabezado de sección no se da nunca por borrado: ver esEstructural().
    if (esEstructural(t) || presentes.has(sinApostrofo(t)) || vistos.has(t)) return
    vistos.add(t)
    out.push({ fila: i + 1, mio: String(c) })
  }))
  return out
}

/**
 * Registra, sin escribir en el Sheet, que estos rótulos los cambió el dueño. Es la confirmación
 * manual del arranque en frío.
 */
export async function sembrarEdiciones(fileId, pestana, rotulos = []) {
  await asegurarTabla()
  for (const r of rotulos) {
    await query(
      `insert into public.sheet_rotulos (file_id, pestana, rotulo, reemplazo) values ($1,$2,$3,'')
       on conflict (file_id, pestana, rotulo) do update set reemplazo = ''`,
      [fileId, pestana, limpio(String(r))],
    )
  }
  return rotulos.length
}

export async function conEdicionesRespetadas(fileId, pestana, generado, actual) {
  const { mios, ediciones, candidatos } = await leerRegistro(fileId, pestana)
    .catch(() => ({ mios: [], ediciones: new Map(), candidatos: new Set() }))
  // ═══ PERSISTENCIA ENTRE CORRIDAS (24/07) — "siempre respetar lo que hago" ═══
  //
  // El dueño: "la indicación es que SIEMPRE se respete lo que yo hago". Los dos seguros viejos
  // (MAX_BORRADOS y esEstructural) protegían contra una lectura fallida que se confirma sola, pero al
  // precio de RESUCITAR borrados reales del dueño: si borraba una sección entera o un título, volvía.
  //
  // El discriminador correcto no es "cuántos" ni "es un título", es EL TIEMPO: un borrado que persiste
  // DOS lecturas seguidas es una decisión; una lectura que falló una vez no persiste. Un borrado se
  // confirma sólo si YA era candidato la corrida anterior. Así se respeta cualquier borrado real
  // —masivo o estructural— sin morder una lectura transitoria.
  const cruda = deteccionCruda(mios, actual, generado)
  const { confirmados, candidatos: nuevosCandidatos } = resolverPersistencia(cruda, candidatos)
  for (const t of confirmados) if (!ediciones.has(t)) ediciones.set(t, '')
  const r = respetarEdiciones(generado, actual, ediciones)
  // Los candidatos viajan para que guardarRegistro los persista: la próxima corrida sabrá que ya
  // estaban pendientes y —si siguen ausentes— los confirmará.
  return { ...r, ediciones, candidatos: nuevosCandidatos }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// AUTO-DETECCIÓN DE "EL DUEÑO REESCRIBIÓ LA PESTAÑA ENTERA" (24/07)
//
// El dueño: "no quiero un fix que me bloquee agentes, quiero un fix en los agentes que respeten mis
// modificaciones". La Regla 0 respeta ediciones rótulo por rótulo, pero NO ve el caso en que él
// reescribe la pestaña COMPLETA con otra estructura (como Cash Flow Semanal → flujo indirecto, más
// corto). Ahí desaparecen la mayoría de los rótulos del generador. Esta señal, agregada, detecta ese
// caso — sin que el dueño tenga que candar nada.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * NÚCLEO PURO: ¿el dueño reescribió la pestaña ENTERA con otra estructura? Señal: de los rótulos que
 * el generador quiere escribir (sus anclas), la GRAN MAYORÍA ya no está en la pestaña. Conservador a
 * propósito, para no auto-candar de más: exige suficientes anclas y una pestaña con contenido real
 * (una lectura vacía/parcial transitoria NO cuenta como reescritura).
 *
 * @param {any[][]} generado lo que el generador quiere escribir
 * @param {any[][]} actual   lo que HAY hoy en la pestaña (texto visible)
 */
export function duenoReescribioLaPestana(generado = [], actual = [], { umbralPresencia = 0.35, minAnclas = 8 } = {}) {
  // ═══ UNA FÓRMULA NO ES UN RÓTULO, Y UN NÚMERO TAMPOCO (31/07) ═══
  //
  // EL FALSO POSITIVO. El dueño: "se ve mal todo en cashflow". La causa no estaba en el cuadro: los dos
  // cash flow se habían AUTO-CANDADO y llevaban semanas sin mantenerse. El detector contaba como
  // "ancla" CADA CELDA que el generador escribe —2.387 en el semanal, casi todas fórmulas— y las
  // comparaba contra lo que la pestaña MUESTRA, que son los valores ya calculados. `=SUMPRODUCT(…)`
  // nunca va a coincidir con "$9.384.100": quedaban 84 de 2.387 (3,5%), muy por debajo del umbral del
  // 35%, y la pestaña se candaba sola. En una pestaña hecha de fórmulas el veredicto era INEVITABLE.
  //
  // Las anclas son los RÓTULOS: el texto que el generador escribe y que se lee igual en la pantalla.
  // Una fórmula y un número no se pueden comparar entre las dos lecturas, así que no entran en el
  // cociente — ni arriba ni abajo. Y el caso para el que existe este detector (el dueño reescribe la
  // pestaña con otra estructura) se detecta MEJOR así: lo que desaparece cuando la rehace son los
  // rótulos, no las fórmulas.
  // NO SE DEFINE OTRA VEZ QUÉ ES UN RÓTULO: `esRotulo` ya existe en este mismo módulo y dice
  // exactamente esto —texto, ni fórmula, ni número, ni importe, ni fecha—. Es la misma definición que
  // usa la Regla 0 celda por celda, y tiene que ser la misma acá: dos definiciones de "rótulo" en el
  // archivo que decide qué es del dueño es justo la clase de duplicación que ya rompió otras cosas.
  const ancla = (v) => (esRotulo(v) ? sinApostrofo(clave(v)) : null)
  const quiere = new Set()
  for (const f of generado || []) for (const c of f || []) { const t = ancla(c); if (t) quiere.add(t) }
  if (quiere.size < minAnclas) return { reescrita: false, fraccion: 1, motivo: 'pocas anclas para juzgar' }
  const presentes = new Set()
  for (const f of actual || []) for (const c of f || []) { const t = ancla(c); if (t) presentes.add(t) }
  // Una pestaña casi vacía NO es una reescritura: es una lectura transitoria fallida o una pestaña
  // nueva que el generador debe llenar. No auto-candar por eso.
  if (presentes.size < Math.max(3, Math.floor(minAnclas * 0.4))) return { reescrita: false, fraccion: 0, motivo: 'pestaña vacía o lectura parcial' }
  let hay = 0
  for (const q of quiere) if (presentes.has(q)) hay++
  const fraccion = hay / quiere.size
  const reescrita = fraccion < umbralPresencia
  return {
    reescrita, fraccion: Math.round(fraccion * 100) / 100, anclas: quiere.size, presentes: hay,
    motivo: reescrita ? `sólo ${hay} de ${quiere.size} de mis rótulos siguen en la pestaña` : `${hay} de ${quiere.size} de mis rótulos siguen`,
  }
}

/**
 * Helper de un solo llamado para los generadores que escriben por su propio camino (no por
 * escribirPreservando): si el dueño reescribió la pestaña entera, la auto-canda (por='auto') y avisa.
 * Devuelve {reescrita:true} para que el generador SALTE esa pestaña y no la toque. DRY: la lógica de
 * detección + candado vive en un solo lugar.
 *
 * @param {string} fileId  id del Sheet
 * @param {string} pestana nombre de la pestaña
 * @param {any[][]} generado lo que el generador quiere escribir
 * @param {any[][]} actual   el texto visible que HAY hoy en la pestaña
 */
export async function autoRespetarReescritura(fileId, pestana, generado, actual) {
  const rew = duenoReescribioLaPestana(generado, actual)
  if (!rew.reescrita) return { reescrita: false }
  try {
    const { bloquear } = await import('./pestana-bloqueada.mjs')
    await bloquear({}, fileId, pestana, { motivo: `auto: detecté que la reescribiste (${rew.motivo})`, por: 'auto' })
    console.log(`  🔒 detecté que reescribiste "${pestana}" (${rew.motivo}): la tomo como tuya, no la toco.`)
  } catch { /* sin base no se puede candar; la Regla 0 celda a celda sigue activa */ }
  return { reescrita: true }
}
