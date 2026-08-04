// ESCRIBIR EL FAJO EN "Compras" — reusando el cargador que ya existe, sin duplicar una sola regla.
//
// ═══ POR QUÉ SE INVOCA EL SCRIPT Y NO SE REESCRIBE SU LÓGICA ═══
//
// `scripts/cargar-comprobantes-compras.mjs` ya sabe todo lo caro de saber: dónde termina la última
// fila, qué columnas se tocan y cuáles NO (AC/AD/AE/AF/AJ son ARRAYFORMULA y escribir ahí, aunque sea
// "", rompe el derrame), cómo estampar las fórmulas por fila con PASTE_FORMULA, qué hacer cuando el
// dueño tiene un filtro puesto, y cómo cruzar contra ARCA. Reimplementar eso acá para "integrarlo
// mejor" sería crear una segunda verdad del contrato de columnas, y la segunda verdad siempre
// termina distinta de la primera.
//
// Entonces: se arma el fajo.json y se corre el cargador. El bot no sabe escribir en un Sheet.
//
// ═══ EL FRENO DE MANO SE MIRA ANTES DE ARRANCAR ═══
//
// `congelador-sheets.mjs` ya frena adentro de google.mjs, así que aunque se corriera igual no se
// escribiría nada. Pero se consulta ANTES por dos razones: para poder contestar "está congelado,
// queda encolado" en vez de un error críptico, y para no reservar claves de idempotencia de una
// carga que no va a ocurrir.
//
// ═══ LAS RESERVAS, Y POR QUÉ VAN PRIMERO ═══
//
// Entre escribir el Sheet y anotar en la base hay una ventana. Si el proceso muere ahí, el gasto ya
// está en Compras y la base no lo sabe: el mismo comprobante mandado de nuevo entra por segunda vez
// y el costo de la obra se duplica en silencio. Reservando primero, la falla cambia de forma: queda
// una reserva sin fila —visible, consultable, borrable— en lugar de plata duplicada en el Flujo de
// Fondos. Entre un error que se ve y uno que no se ve, se elige el que se ve.

import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { congelado } from '../../lib/congelador-sheets.mjs'
import { estaCompleto, ESTADO } from '../../lib/comprobantes/fajo.mjs'
import { numeroCanonico, claveComprobante, conceptoConAnotacion } from '../../lib/comprobantes/lectura.mjs'
import * as repoReal from './repositorio.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
export const RUTA_CARGADOR = resolve(AQUI, '../../scripts/cargar-comprobantes-compras.mjs')

/** Marca que delimita la línea de resultado del cargador (contrato con `--json`). */
const MARCA_JSON = '##ORQ-JSON##'

/** Techo de la corrida. El cargador lee el Sheet, cruza ARCA y escribe: minutos, no horas. */
export const TIMEOUT_MS = Number(process.env.ORQ_COMPROBANTES_TIMEOUT_MS || 180_000)

/**
 * Ítems del fajo → el array que el cargador espera en `--file`.
 *
 * NÚCLEO PURO. No se manda `neto`: `valoresInput` DERIVA M = Total − IVA cuando hay total, y ese es
 * el camino correcto —absorbe la percepción de IIBB/SUSS y el impuesto interno del combustible para
 * que el Total del Sheet cierre con la plata que salió—. Mandar el neto crudo sería reintroducir a
 * mano el defecto que ese contrato ya arregló.
 *
 * Los importes viajan CON SU SIGNO: una nota de crédito llega en negativo desde la lectura.
 *
 * ═══ EL CUIT Y EL DUPLICADO YA RESUELTO VIAJAN (03/08) ═══
 *
 * La pestaña Compras no tiene columna de CUIT y el cargador no lo escribe en ninguna celda: viaja
 * porque desde que el cargador también busca el duplicado (`compras-vivas.mjs`, la misma lib que
 * usa el bot), el CUIT es lo que le permite afirmar la identidad del proveedor sobre la fila
 * candidata. Sin él, la misma búsqueda corre con menos datos de un lado que del otro y las dos caras
 * dejan de dar la misma respuesta — que es exactamente lo que se está arreglando.
 *
 * Y `duplicadoResuelto` viaja porque el dueño ya contestó: apretó "Es otro, cargalo" sobre una fila
 * candidata que vio. Sin eso, el cargador volvería a encontrar el mismo PROBABLE y bloquearía una
 * carga que una persona ya autorizó.
 */
export function aFajoJson(items = []) {
  return items.filter(estaCompleto).map((it) => {
    const c = it.comprobante ?? {}
    return {
      categoria: c.categoria ?? undefined,
      fecha: c.fecha,
      proveedor: c.proveedor,
      cuit: c.cuit ?? undefined,
      cae: c.cae ?? undefined,
      tipo: c.tipo,
      numero: c.numero,
      // LO ESCRITO A MANO VIAJA AL CONCEPTO, LITERAL (04/08). Ver `conceptoConAnotacion`: la
      // anotación es la que decide la imputación, y la imputación se discute meses después. Sin la
      // transcripción en la fila, esa discusión obliga a ir a buscar la foto.
      concepto: conceptoConAnotacion(c) ?? undefined,
      iva: c.iva ?? undefined,
      total: c.total,
      condicion: c.condicion ?? undefined,
      formaPago: c.formaPago ?? undefined,
      obra: c.obra ?? undefined,
      unidad: c.unidad ?? undefined,
      detalle: c.detalleObra ?? undefined,
      duplicadoResuelto: it.duplicadoResuelto ?? undefined,
    }
  })
}

/** Los ítems que van a entrar, en el MISMO orden que `aFajoJson`. Es el índice que devuelve el cargador. */
export function itemsQueEntran(items = []) {
  return items.filter(estaCompleto)
}

/** Corre el cargador y devuelve su línea JSON. Inyectable para poder probar sin Google ni Postgres. */
export async function correrCargador({ fajo, dry = false, actor = null, spawnImpl = spawn, cwd = resolve(AQUI, '../../..'), env = process.env } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'orq-fajo-'))
  const ruta = join(dir, 'fajo.json')
  await writeFile(ruta, JSON.stringify(fajo, null, 2), 'utf8')
  const args = [RUTA_CARGADOR, '--file', ruta, '--json', ...(dry ? ['--dry'] : [])]
  // EL FRENO DE MANO SE LEVANTA POR ESTA CARGA, NO PARA TODOS. El freno existe para que ningún timer
  // ni ningún agente escriba el Sheet solo, y eso sigue igual: acá el deshielo va en el entorno de
  // ESTE proceso hijo y sólo llega hasta que termina. Lo que lo justifica es que del otro lado hubo
  // una persona apretando "Confirmar" sobre un comprobante que ya vio — no es el OS decidiendo.
  // Sin esto el flujo entero quedaba en "encolado" y la foto nunca llegaba a Compras.
  // El motivo lleva el NOMBRE de quien confirmó. Un deshielo anónimo no se puede auditar después, y
  // auditarlo después es la única razón por la que esta puerta es admisible.
  const entorno = dry || !actor
    ? env
    // El motivo dice "mandado al chat", no "confirmado": desde el 04/08 un comprobante al que no le
    // falta nada se carga sin que nadie apriete un botón, y el rastro de auditoría tiene que decir
    // lo que de verdad pasó. Lo que justifica la puerta no cambia — hay una PERSONA identificada que
    // mandó ese comprobante a ese canal —, pero un log que describe un click que no ocurrió es un
    // log que miente, y el rastro es la única razón por la que esta puerta es admisible.
    : { ...env, ORQ_SHEETS_DESCONGELAR: `carga de comprobante mandado al chat por ${actor}` }
  try {
    const r = await unaCorrida(spawnImpl, args, { cwd, env: entorno })
    const linea = String(r.stdout ?? '').split('\n').reverse().find((l) => l.startsWith(MARCA_JSON))
    if (!linea) {
      return { ok: false, error: r.code === 0 ? 'el cargador no devolvió resultado' : (recorte(r.stderr) || `el cargador salió con código ${r.code}`), salida: r }
    }
    const datos = JSON.parse(linea.slice(MARCA_JSON.length))
    return { ok: datos.ok === true, datos, salida: r }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

function unaCorrida(spawnImpl, args, { cwd, env }) {
  return new Promise((res, rej) => {
    const p = spawnImpl(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''; let cortado = false
    const t = setTimeout(() => { cortado = true; try { p.kill('SIGTERM') } catch { /* ya murió */ } }, TIMEOUT_MS)
    p.stdout?.on('data', (c) => { stdout += c })
    p.stderr?.on('data', (c) => { stderr += c })
    p.on('error', (e) => { clearTimeout(t); rej(e) })
    p.on('close', (code) => {
      clearTimeout(t)
      // UN TIMEOUT NO ES UN "NO ESCRIBIÓ". El cargador pudo haber muerto A MITAD de escritura —ya
      // pasó con systemd cortando un generador a los 10 minutos— así que se dice exactamente eso y
      // no se reintenta solo: reintentar una escritura que quizá ocurrió es cómo se duplica un gasto.
      if (cortado) return res({ code: -1, stdout, stderr: `${stderr}\n[el cargador se pasó de ${TIMEOUT_MS} ms y se cortó A MITAD: revisá Compras antes de reintentar]` })
      res({ code, stdout, stderr })
    })
  })
}

const recorte = (s) => String(s ?? '').trim().split('\n').slice(-3).join(' ').slice(0, 300)

/**
 * Escribe un fajo YA CONFIRMADO. El fajo tiene que venir en estado `confirmado`
 * (`repo.tomarParaConfirmar` lo garantiza con un compare-and-set), no `abierto`.
 *
 * @returns {Promise<{estado:string, texto:string, filas?:Array}>}
 */
export async function escribirFajo(d, fajo) {
  const { port, log } = d
  const correr = d.correr ?? correrCargador
  // Repositorio y corrida del cargador entran INYECTABLES: es lo que permite probar la escritura
  // —el freno de mano, las reservas, el mapeo fila↔comprobante— sin tocar el Sheet real.
  const repo = d.repo ?? repoReal
  // El freno se consulta por una función INYECTABLE. No es una puerta trasera: el default es el
  // freno real de `congelador-sheets.mjs`, que ninguna opción de código levanta. Es la única forma
  // de que el test pueda ejercitar los DOS estados —congelado y no congelado— sin depender de si la
  // marca está puesta en la máquina de quien lo corre. `RUTA_MARCA` se evalúa al importar el módulo,
  // así que pisar la variable de entorno después no alcanza, y un test que pasa o falla según el
  // filesystem no prueba nada.
  const hayHielo = d.congelado ?? congelado
  const items = itemsQueEntran(fajo.items ?? [])
  if (!items.length) {
    await repo.cerrarFajo(port, { id: fajo.id, estado: ESTADO.DESCARTADO, error: 'nada cargable' })
    return { estado: ESTADO.DESCARTADO, texto: 'No quedó nada para cargar.' }
  }

  // 1) EL FRENO DE MANO. Se mira antes de reservar claves y antes de gastar una corrida.
  //
  // ═══ LA PUERTA DE LA PERSONA (03/08) ═══
  //
  // El deshielo del proceso hijo (`correrCargador`) existía desde el 03/08 a la mañana y NUNCA se
  // ejecutaba: este chequeo devuelve ENCOLADO sesenta líneas antes de llegar a correr el cargador.
  // O sea que con la marca puesta el bypass era código muerto, y el dueño creía —yo le dije eso—
  // que comprobantes escribía mientras la asistencia no. Las dos estaban frenadas.
  //
  // El freno existe para que ningún TIMER y ningún AGENTE escriba solo. Un fajo confirmado tiene un
  // `plataforma_username`: una persona identificada que miró el comprobante y apretó Confirmar. Esa
  // es la misma distinción que habilita `frenar(..., {confirmacion})` para la asistencia, y acá se
  // aplica igual. Sin actor identificado NO se levanta nada: se encola, como antes.
  const quienConfirmo = String(fajo?.plataforma_username ?? '').trim() || null
  const hielo = hayHielo() && !quienConfirmo
  if (hielo) {
    await repo.cerrarFajo(port, { id: fajo.id, estado: ESTADO.ENCOLADO, error: 'sheets congelados' })
    return {
      estado: ESTADO.ENCOLADO,
      texto: [
        '🧊 **La escritura de Sheets está congelada.** No toqué nada.',
        items.length === 1
          ? 'Dejé el comprobante guardado: cuando Dirección levante el freno se carga.'
          : `Dejé los ${items.length} comprobantes guardados: cuando Dirección levante el freno se cargan.`,
      ].join('\n'),
    }
  }

  // 2) RESERVAR las claves antes de escribir (ver el encabezado de este archivo).
  const aReservar = items.map((it) => filaDeRegistro(it, fajo))

  // ═══ SIN CLAVE NO ES "YA ESTABA CARGADO" (04/08) ═══
  //
  // `registrarCargados` SALTEA en silencio toda fila sin `clave` —la columna es NOT NULL— así que un
  // ítem sin clave nunca vuelve de `reservarClaves`. Antes eso caía en la misma bolsa que "la clave
  // ya estaba en la tabla" y el bot contestaba "Estos comprobantes ya estaban cargados. No los
  // dupliqué." cerrando el fajo como CARGADO, con `filas: []`: el gasto no se escribía en ningún
  // lado y el mensaje declaraba éxito. Pasó en producción con el tique de Combustibles Barcelo del
  // 03/08 ($60.000,02) — `comprobantes_cargados` estaba VACÍA, o sea que no había con qué haber
  // deduplicado nada.
  //
  // Las dos situaciones se leen igual desde acá y son opuestas: una es "no hace falta escribir", la
  // otra es "no puedo garantizar que no se duplique". Se separan ANTES de reservar, y la segunda
  // frena todo el fajo: sin clave de idempotencia no se escribe: un reintento lo cargaría dos veces.
  const sinClave = items.filter((it, k) => !aReservar[k].clave)
  if (sinClave.length) {
    const motivo = sinClave.map((it) => sinQueNoHayClave(it)).join(' · ')
    await repo.reabrirFajo(port, { id: fajo.id, error: recorte(`sin clave de idempotencia: ${motivo}`) })
    log?.error?.('comprobantes: ítem sin clave, no se escribió nada', { fajo: fajo.id, motivo })
    return {
      estado: ESTADO.ERROR,
      texto: [
        `**No cargué nada.** ${sinClave.length === 1 ? 'A un comprobante' : `A ${sinClave.length} comprobantes`} le falta lo que necesito para no cargarlo dos veces: ${motivo}.`,
        'Tocá **Corregir** y completalo. No se escribió una sola fila en Compras.',
      ].join('\n'),
    }
  }

  const reservadas = await repo.reservarClaves(port, aReservar)
  // Las que NO volvieron ya estaban: otro camino las cargó entre la confirmación y ahora.
  const yaEstaban = aReservar.filter((f) => !reservadas.includes(f.clave))
  const entran = items.filter((it, k) => reservadas.includes(aReservar[k].clave))
  if (!entran.length) {
    await repo.cerrarFajo(port, { id: fajo.id, estado: ESTADO.CARGADO, filas: [] })
    // DÓNDE están, no sólo que están. Se pregunta a la tabla —la reserva no trae la fila— porque
    // "ya estaba cargado" sin decir dónde no se puede verificar, y todo lo que no se puede verificar
    // termina siendo una afirmación que nadie chequea.
    const ya = await repo.yaCargados(port, yaEstaban.map((f) => f.clave))
    const donde = [...ya.values()].map((r) => r?.fila).filter((f) => f != null)
    return {
      estado: ESTADO.CARGADO,
      texto: donde.length
        ? `Estos comprobantes ya estaban cargados (fila${donde.length > 1 ? 's' : ''} ${donde.join(', ')} de Compras). No los dupliqué.`
        : 'Estos comprobantes ya estaban cargados. No los dupliqué.',
    }
  }

  // 3) Correr el cargador.
  let r
  try {
    r = await correr({ fajo: aFajoJson(entran), actor: quienConfirmo })
  } catch (e) {
    r = { ok: false, error: String(e?.message ?? e).slice(0, 200) }
  }

  if (!r.ok) {
    // No se escribió (o no se sabe): se sueltan las reservas SÓLO si el cargador dijo explícitamente
    // que no escribió nada. Ante la duda se dejan puestas: una reserva de más se ve y se limpia; un
    // gasto duplicado en el Flujo de Fondos, no.
    const seguroQueNo = r.datos?.escritas === 0
    if (seguroQueNo) await repo.soltarReservas(port, reservadas)
    await repo.reabrirFajo(port, { id: fajo.id, error: recorte(r.error ?? r.datos?.detalle) })
    log?.error?.('comprobantes: la carga falló', { fajo: fajo.id, detalle: recorte(r.error ?? r.datos?.motivo) })
    const congeladoAhora = r.datos?.congelado === true
    return {
      estado: ESTADO.ERROR,
      texto: congeladoAhora
        ? '🧊 La escritura de Sheets está congelada. No cargué nada; los comprobantes quedan guardados.'
        : `No pude cargarlos: ${r.error ?? r.datos?.detalle ?? 'el cargador falló'}.${seguroQueNo ? ' No se escribió nada.' : ' **Revisá Compras antes de reintentar.**'}`,
    }
  }

  // 4) Anotar en qué fila quedó cada uno. `i` es el índice dentro del fajo que se le pasó.
  const porIndice = new Map((r.datos?.filas ?? []).map((f) => [f.i, f.fila]))
  const filas = entran.map((it, k) => ({
    ...filaDeRegistro(it, fajo),
    fila: porIndice.get(k) ?? null,
  }))
  await repo.anotarFilas(port, filas)
  await repo.cerrarFajo(port, {
    id: fajo.id,
    estado: ESTADO.CARGADO,
    filas: filas.map((f) => ({ clave: f.clave, fila: f.fila, proveedor: f.proveedor, numero: f.numero })),
  })

  // Los que entraron SIN obra, con su fila, para poder decirlo por su nombre en el mensaje.
  // `entran` y `filas` están en el mismo orden por construcción (los dos salen del mismo filtro).
  const sinObra = entran
    .map((it, k) => ({ it, fila: filas[k] }))
    .filter(({ it }) => !it.comprobante?.obra)
    .map(({ it, fila }) => ({ proveedor: it.comprobante?.proveedor ?? null, fila: fila.fila ?? null }))
  return { estado: ESTADO.CARGADO, texto: textoCargado(filas, yaEstaban, r.datos, { sinObra }), filas }
}

/**
 * POR QUÉ este comprobante no tiene clave de idempotencia, en las palabras del dueño.
 *
 * `claveComprobante` devuelve null y no dice por qué: acá se reconstruye mirando los mismos tres
 * datos que ella mira. Un "no pude" sin el qué obliga a la persona a adivinar cuál de los campos
 * corregir, y en un fajo de diez fotos eso es un flujo abandonado.
 */
export function sinQueNoHayClave(it = {}) {
  const c = it.comprobante ?? {}
  const falta = []
  if (!numeroCanonico(c.numero)) falta.push('el número')
  if (!(c.esNotaCredito || c.tipo)) falta.push('la letra (A/B/C o NC)')
  if (String(c.cuit ?? '').replace(/\D/g, '').length !== 11 && !String(c.proveedor ?? '').trim()) {
    falta.push('el CUIT y el proveedor')
  }
  const quien = c.proveedor || c.numero || 'el comprobante'
  return `${quien}: falta ${falta.join(' y ') || 'un dato para identificarlo'}`
}

/**
 * El comprobante como fila de `comunicacion.comprobantes_cargados`.
 *
 * LA CLAVE SE DERIVA, NO SE CONFÍA (04/08). `it.clave` es un campo GUARDADO: lo calcula la lectura y
 * lo recalcula el formulario de Corregir. Un fajo que quedó dormido en Postgres desde antes de un
 * deploy —o al que un camino nuevo le tocó el comprobante sin recalcularla— la trae vieja o en null,
 * y una clave en null hace que la reserva saltee la fila **en silencio**. Se recalcula desde el
 * comprobante, que es de donde sale: el campo guardado es una caché, y una caché no manda sobre el
 * dato. Si el comprobante tampoco alcanza para identificarlo, queda null y lo frena la guarda.
 */
export function filaDeRegistro(it, fajo = {}) {
  const c = it.comprobante ?? {}
  return {
    clave: it.clave ?? claveComprobante(c)?.clave ?? null,
    cuit: c.cuit ?? null,
    tipo: c.esNotaCredito ? 'NC' : (c.tipo ?? null),
    numero: c.numero ?? null,
    proveedor: c.proveedor ?? null,
    fechaIso: aIso(c.fecha),
    total: c.total ?? null,
    plataforma: fajo.plataforma ?? 'mattermost',
    channelId: fajo.channel_id ?? null,
    postId: (fajo.post_ids ?? [])[0] ?? null,
    userId: fajo.plataforma_user_id ?? null,
    fajoId: fajo.id ?? null,
    hoja: 'Compras',
  }
}

/** DD/MM/AAAA → AAAA-MM-DD, que es lo que espera una columna `date`. */
export function aIso(v) {
  const m = String(v ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function textoCargado(filas, yaEstaban, datos, { sinObra = [] } = {}) {
  const l = []
  const conFila = filas.filter((f) => f.fila != null)
  l.push(conFila.length === 1
    ? `✔ Cargado en **Compras, fila ${conFila[0].fila}**.`
    : `✔ Cargué ${filas.length} comprobante(s) en **Compras**.`)
  if (filas.length > 1) for (const f of filas) l.push(`· ${f.proveedor ?? '?'} ${f.numero ?? ''} → fila ${f.fila ?? '?'}`)
  if (yaEstaban.length) l.push(`_${yaEstaban.length} ya estaba(n) cargado(s); no los dupliqué._`)
  if (datos?.errores) l.push(`⚠ ${datos.errores} fila(s) quedaron con #ERROR — revisalas.`)
  if (datos?.nuevos?.length) l.push(`⚠ Proveedor(es) fuera del desplegable: ${datos.nuevos.join(' · ')}. Confirmá si hay que agregarlos.`)
  // EL CARGADOR TAMBIÉN MIRA COMPRAS. Si encontró uno que ya estaba, no lo escribió: entre la
  // confirmación y la escritura pasa tiempo, y en ese hueco el comprobante pudo entrar por Claude
  // Code o a mano. Decirlo es lo que evita que el dueño lo dé por cargado y lo mande de nuevo.
  if (datos?.duplicados?.length) {
    l.push(`⛔ ${datos.duplicados.length} NO lo(s) cargué: ya estaban en Compras (${datos.duplicados.map((d) => `fila ${d.fila}`).join(', ')}).`)
  }
  // Estar en ARCA no es un duplicado: es el libro fiscal confirmando el comprobante. Lo que importa
  // avisar es cuando el número que se leyó de la foto NO era el verdadero.
  if (datos?.arca?.corregidos) l.push(`ℹ ${datos.arca.corregidos} número(s) de comprobante corregido(s) contra ARCA.`)
  // CARGADO SIN OBRA, DICHO CON TODAS LAS LETRAS (03/08/2026). El dueño decidió que la obra no
  // bloquee, no que se cargue en silencio: una fila sin imputar entra al Flujo de Caja con el rubro
  // sin clasificar y la única forma de que alguien la complete es que sepa que existe. Va con la fila
  // para que completarla sea abrir Compras e ir a esa línea, no buscarla.
  if (sinObra.length) {
    l.push(sinObra.length === 1
      ? `⚠️ Cargado **SIN obra** — completala en Compras${sinObra[0].fila ? `, fila ${sinObra[0].fila}` : ''}.`
      : `⚠️ ${sinObra.length} quedaron **SIN obra** — completalas en Compras: ${sinObra.map((s) => `fila ${s.fila ?? '?'}${s.proveedor ? ` (${s.proveedor})` : ''}`).join(' · ')}.`)
  }
  l.push('_Completá vos la Unidad de Negocio y el Tipo de Costo: ahí clasifica el rubro de caja._')
  return l.join('\n')
}
