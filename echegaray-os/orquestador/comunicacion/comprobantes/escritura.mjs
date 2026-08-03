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
 */
export function aFajoJson(items = []) {
  return items.filter(estaCompleto).map((it) => {
    const c = it.comprobante ?? {}
    return {
      categoria: c.categoria ?? undefined,
      fecha: c.fecha,
      proveedor: c.proveedor,
      tipo: c.tipo,
      numero: c.numero,
      concepto: c.concepto ?? undefined,
      iva: c.iva ?? undefined,
      total: c.total,
      condicion: c.condicion ?? undefined,
      formaPago: c.formaPago ?? undefined,
      obra: c.obra ?? undefined,
      unidad: c.unidad ?? undefined,
      detalle: c.detalleObra ?? undefined,
    }
  })
}

/** Los ítems que van a entrar, en el MISMO orden que `aFajoJson`. Es el índice que devuelve el cargador. */
export function itemsQueEntran(items = []) {
  return items.filter(estaCompleto)
}

/** Corre el cargador y devuelve su línea JSON. Inyectable para poder probar sin Google ni Postgres. */
export async function correrCargador({ fajo, dry = false, spawnImpl = spawn, cwd = resolve(AQUI, '../../..'), env = process.env } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'orq-fajo-'))
  const ruta = join(dir, 'fajo.json')
  await writeFile(ruta, JSON.stringify(fajo, null, 2), 'utf8')
  const args = [RUTA_CARGADOR, '--file', ruta, '--json', ...(dry ? ['--dry'] : [])]
  try {
    const r = await unaCorrida(spawnImpl, args, { cwd, env })
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
  const hielo = hayHielo()
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
  const reservadas = await repo.reservarClaves(port, aReservar)
  // Las que NO volvieron ya estaban: otro camino las cargó entre la confirmación y ahora.
  const yaEstaban = aReservar.filter((f) => !reservadas.includes(f.clave))
  const entran = items.filter((it, k) => reservadas.includes(aReservar[k].clave))
  if (!entran.length) {
    await repo.cerrarFajo(port, { id: fajo.id, estado: ESTADO.CARGADO, filas: [] })
    return { estado: ESTADO.CARGADO, texto: 'Estos comprobantes ya estaban cargados. No los dupliqué.' }
  }

  // 3) Correr el cargador.
  let r
  try {
    r = await correr({ fajo: aFajoJson(entran) })
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

  return { estado: ESTADO.CARGADO, texto: textoCargado(filas, yaEstaban, r.datos), filas }
}

/** El comprobante como fila de `comunicacion.comprobantes_cargados`. */
export function filaDeRegistro(it, fajo = {}) {
  const c = it.comprobante ?? {}
  return {
    clave: it.clave,
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

function textoCargado(filas, yaEstaban, datos) {
  const l = []
  const conFila = filas.filter((f) => f.fila != null)
  l.push(conFila.length === 1
    ? `✔ Cargado en **Compras, fila ${conFila[0].fila}**.`
    : `✔ Cargué ${filas.length} comprobante(s) en **Compras**.`)
  if (filas.length > 1) for (const f of filas) l.push(`· ${f.proveedor ?? '?'} ${f.numero ?? ''} → fila ${f.fila ?? '?'}`)
  if (yaEstaban.length) l.push(`_${yaEstaban.length} ya estaba(n) cargado(s); no los dupliqué._`)
  if (datos?.errores) l.push(`⚠ ${datos.errores} fila(s) quedaron con #ERROR — revisalas.`)
  if (datos?.nuevos?.length) l.push(`⚠ Proveedor(es) fuera del desplegable: ${datos.nuevos.join(' · ')}. Confirmá si hay que agregarlos.`)
  if (datos?.dupesArca?.length) l.push(`ℹ ${datos.dupesArca.length} ya figura(n) en ARCA — revisá que no sea un duplicado.`)
  l.push('_Completá vos la Unidad de Negocio y el Tipo de Costo: ahí clasifica el rubro de caja._')
  return l.join('\n')
}
