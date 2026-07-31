#!/usr/bin/env node
// EL VIGÍA, CORRIENDO: inventariar → comparar contra lo último visto → clasificar → registrar → avisar.
//
// ═══ QUÉ ES ═══
//
// La ronda que hace que el Flujo de Fondos sea un DOCUMENTO VIVO: mira las fuentes que lo alimentan,
// se da cuenta de qué cambió y produce NOVEDADES accionables con su evidencia. El criterio de detección
// entero es núcleo puro y vive en `lib/vigia-fuentes.mjs` (testeado sin red ni base); acá está sólo la
// E/S: leer la base, leer Drive si hace falta, imprimir, registrar.
//
//   node orquestador/scripts/vigia-fuentes.mjs             (mira, imprime y REGISTRA la ronda)
//   node orquestador/scripts/vigia-fuentes.mjs --seco      (mira e imprime; no escribe nada)
//   node orquestador/scripts/vigia-fuentes.mjs --json      (salida para otro proceso)
//   node orquestador/scripts/vigia-fuentes.mjs --sin-drive (0 llamadas a Google: sólo base)
//   node orquestador/scripts/vigia-fuentes.mjs --solo banco,arca_ventas
//
// ═══ LO QUE ESTE SCRIPT NO HACE, A PROPÓSITO ═══
//
// NO ESCRIBE EN EL GOOGLE SHEET. Ni una celda. Detecta y enruta hacia los cargadores que ya existen
// (`cargar-comprobantes-compras.mjs`, `cargar-boletas-gremiales.mjs`, `importar-banco.mjs`, el sync de
// ARCA); no reimplementa ninguna carga y no dispara la que toca el archivo del dueño. Su cliente de
// Google se construye con SCOPES DE SÓLO LECTURA, así que no puede escribir aunque alguien se lo pida.
//
// NO ENVÍA AVISOS EXTERNOS. El aviso está escrito (`avisoTexto`) y el enganche interno existe
// (`--al-backlog`, que registra en el Backlog Autónomo — Nivel D, interno y reversible), pero está
// APAGADO por defecto: publicar en un canal es Nivel E y lo engancha el proceso principal.
//
// ═══ POR QUÉ LEE drive_index Y NO DRIVE EN VIVO PARA LAS CARPETAS ═══
//
// `public.drive_index` YA es el inventario del data room (2.465 archivos de `administracion`), y ya lo
// refresca solo un timer cada 6 horas (echegaray-drive-index.timer → scripts/indexar-drive.mjs). Leerlo
// hace que la ronda de carpetas cueste CERO llamadas a Google y funcione aunque la credencial no esté.
// El precio es que el vigía ve el Drive con la edad del índice — así que ESO se informa: si el índice
// tiene más horas que la cadencia esperada, sale una novedad 'ciega' diciendo qué no puede ver.
// Los Sheets vinculados sí necesitan Drive en vivo (no están dentro de `administracion`).

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { query, closePool } from '../lib/db.mjs'
import { createLogger } from '../lib/logger.mjs'
import { makeGoogleClient, MissingGoogleCredential } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import {
  FUENTES, novedadesDrive, novedadesSheetVinculado, novedadesArca, novedadesCct,
  novedadesSilencio, novedadCiega, formatNovedades, resumen, avisoTexto,
} from '../lib/vigia-fuentes.mjs'

const log = createLogger({ component: 'vigia-fuentes' })
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIGRACION = join(RAIZ, 'supabase', 'migrations', '20260731150000_vigia_fuentes.sql')

const SECO = process.argv.includes('--seco') || process.argv.includes('--dry')
const JSON_OUT = process.argv.includes('--json')
const SIN_DRIVE = process.argv.includes('--sin-drive')
const AL_BACKLOG = process.argv.includes('--al-backlog')
const iSolo = process.argv.indexOf('--solo')
const SOLO = iSolo >= 0 ? String(process.argv[iSolo + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : null

const AHORA = new Date()

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// PERSISTENCIA DEL REGISTRO DE FUENTES (el puntero de lectura)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** La declaración del código manda sobre la fila: si cambia `que_decide` o la cadencia, se refleja. */
async function sincronizarRegistro() {
  for (const f of FUENTES) {
    await query(
      `insert into public.vigia_fuentes (clave, tipo, nombre, que_decide, cadencia_horas, fuente_datos_nombre)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (clave) do update set
         tipo = excluded.tipo, nombre = excluded.nombre, que_decide = excluded.que_decide,
         cadencia_horas = excluded.cadencia_horas, fuente_datos_nombre = excluded.fuente_datos_nombre,
         updated_at = now()`,
      [f.clave, f.tipo, f.nombre, f.que_decide, f.cadencia_horas ?? null, f.fuente_datos_nombre ?? null])
  }
}

/**
 * Las señales ya vistas. Tolerante a que la tabla no exista todavía: `--seco` no aplica la migración a
 * propósito (no escribe NADA, ni DDL), y una corrida en seco sobre una base virgen tiene que poder
 * mostrar la línea de base en vez de romperse.
 */
async function senales() {
  try {
    const { rows } = await query('select clave, ultima_senal, ultima_revision from public.vigia_fuentes')
    return Object.fromEntries(rows.map((r) => [r.clave, { senal: r.ultima_senal || {}, revision: r.ultima_revision }]))
  } catch (e) {
    if (!/relation .*vigia_fuentes.* does not exist/i.test(String(e?.message))) throw e
    log.warn('public.vigia_fuentes todavía no existe — la ronda arranca sin señal previa (línea de base)')
    return {}
  }
}

async function guardarSenal(clave, senal, motivoCiega = null) {
  if (SECO) return
  await query(
    `update public.vigia_fuentes
        set ultima_senal = coalesce($2::jsonb, ultima_senal), ultima_revision = now(),
            ultimo_motivo_ciega = $3, updated_at = now()
      where clave = $1`,
    [clave, senal ? JSON.stringify(senal) : null, motivoCiega])
}

/**
 * Registra la novedad. Idempotente por huella: la segunda vez que se ve el MISMO hecho sube
 * `visto_veces` en vez de insertar un duplicado (sin esto la lista se vuelve ruido en una semana).
 * Devuelve true si es la primera vez que se ve.
 */
async function registrar(n) {
  if (SECO) return true
  const { rows } = await query(
    `insert into public.vigia_novedades
       (fuente_clave, tipo, huella, titulo, evidencia, clasificacion, accion_propuesta, ruta_carga, que_decide)
     values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)
     on conflict (huella) do update set
       visto_veces = public.vigia_novedades.visto_veces + 1, vista_en = now(),
       titulo = excluded.titulo, evidencia = excluded.evidencia
     returning visto_veces`,
    [n.fuente, n.tipo, n.huella, n.titulo, JSON.stringify(n.evidencia ?? {}), n.clasificacion,
     n.accion, n.ruta_carga, n.que_decide])
  return (rows[0]?.visto_veces ?? 1) === 1
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// LECTORES (la E/S de cada tipo de fuente)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** Los archivos de una carpeta clave, desde el índice del data room. Cero llamadas a Google. */
async function archivosDeCarpeta(prefijo) {
  const { rows } = await query(
    `select drive_file_id, name, path, modified_time, tipo
       from public.drive_index
      where path like $1 and not is_folder
      order by modified_time desc nulls last`,
    [`${prefijo}%`])
  return rows
}

async function edadDelIndice() {
  const { rows: [r] } = await query('select max(indexed_at) as indexed_at, count(*)::int as n from public.drive_index')
  return { indexed_at: r?.indexed_at ?? null, archivos: r?.n ?? 0 }
}

/** El espejo fiscal contra el que se cruzan los comprobantes de una carpeta. */
async function espejoFiscal(tipoLibro) {
  const { rows } = await query(
    'select tipo_comprobante, punto_venta, numero from public.comprobantes_arca where tipo_libro = $1',
    [tipoLibro])
  return rows
}

async function coberturaArca(tipoLibro) {
  const { rows: [r] } = await query(
    'select max(periodo) as periodo, count(*)::int as n from public.comprobantes_arca where tipo_libro = $1',
    [tipoLibro])
  return { periodoMaximo: r?.periodo ?? null, comprobantes: r?.n ?? 0 }
}

async function escalaGuardada() {
  const { rows } = await query(
    'select vigencia_desde, zona, categoria, basico_hora from public.uocra_escala order by vigencia_desde desc')
  return rows
}

async function ultimoMovimientoBanco() {
  const { rows: [r] } = await query('select max(fecha) as fecha, count(*)::int as n from public.banco_movimientos')
  return { ultimaFecha: r?.fecha ?? null, filas: r?.n ?? 0 }
}

/**
 * Metadatos de un Sheet vinculado. SÓLO LECTURA: el cliente se construye sin scopes de escritura, así
 * que este script no puede tocar un archivo del dueño ni por accidente.
 *
 * Si no hay credencial, no se disimula: se devuelve el motivo para que salga como novedad 'ciega'.
 */
let _google = null
function google() {
  if (_google === null) {
    try { _google = makeGoogleClient({ config: loadConfig() }) } // scopes readonly por defecto
    catch (e) { _google = { error: String(e?.message ?? e) } }
  }
  return _google
}

async function metaDeSheet(fileId) {
  const g = google()
  if (g?.error) return { error: g.error }
  try {
    const m = await g.fileMeta(fileId)
    // fileMeta no trae modifiedTime; se pide explícito por la API de Drive.
    const j = await g.apiGetSheets(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,modifiedTime,trashed&supportsAllDrives=true`)
    return { ...m, modifiedTime: j.modifiedTime, name: j.name ?? m?.name }
  } catch (e) {
    if (e instanceof MissingGoogleCredential) return { error: e.message }
    // El cuerpo de error de Google viene con JSON multilínea: se aplana, porque un motivo de 20 líneas
    // en el informe tapa el resto de las novedades.
    const crudo = String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 160)
    return { error: `${e?.status ? `HTTP ${e.status} — ` : ''}${crudo}` }
  }
}

/**
 * EL ID DECLARADO CONTRA EL DEL CATÁLOGO.
 *
 * Nació de un error propio: la primera versión de este vigía llevaba un drive_file_id INVENTADO para
 * CONTROL DE GASTOS. El síntoma fue un 404 evidente, pero podría haber sido peor —un id válido de otro
 * archivo vigilaría el archivo equivocado y nunca daría error—. Así que el id declarado se contrasta
 * contra `public.fuentes_datos`, que es el catálogo curado de la empresa: si no coinciden, la fuente se
 * declara ciega en vez de vigilar a ciegas.
 */
async function idDesincronizado(f) {
  if (!f.fuente_datos_nombre || !f.drive_file_id) return null
  const { rows: [r] } = await query(
    'select drive_file_id from public.fuentes_datos where nombre = $1', [f.fuente_datos_nombre])
  if (!r) return null // no catalogada: no hay contra qué contrastar, y eso no es un error
  if (!r.drive_file_id || r.drive_file_id === f.drive_file_id) return null
  return `el id declarado (${f.drive_file_id}) no es el del catálogo de fuentes (${r.drive_file_id}) — estaría vigilando otro archivo`
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// LA RONDA
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

async function ronda() {
  const previas = await senales()
  const novedades = []
  const contexto = []
  const indice = await edadDelIndice()

  const activas = FUENTES.filter((f) => !SOLO || SOLO.includes(f.clave))

  for (const f of activas) {
    const previa = previas[f.clave]?.senal ?? {}
    try {
      if (f.tipo === 'drive_carpeta') {
        const archivos = await archivosDeCarpeta(f.path_prefijo)
        if (!archivos.length) {
          const n = novedadCiega(f, `no hay ningún archivo indexado bajo "${f.path_prefijo}" — o la carpeta cambió de nombre o el índice del data room no la cubre`)
          novedades.push(n); await guardarSenal(f.clave, null, n.evidencia.motivo); continue
        }
        const enEspejo = f.cruce === 'arca_ventas' ? await espejoFiscal('E')
          : f.cruce === 'arca_compras' ? await espejoFiscal('R') : null
        const ns = novedadesDrive(f, { archivos, enEspejo, senal: previa, indice })
        novedades.push(...ns)
        // La señal guarda los ids ya vistos para poder distinguir "nuevo" de "modificado" en la
        // próxima ronda. Se acota a los 400 más recientes: la señal es un puntero, no un archivo.
        await guardarSenal(f.clave, {
          ...ns.senal,
          archivos_vistos_ids: archivos.slice(0, 400).map((a) => a.drive_file_id),
        })
        if (ns.linea_base) contexto.push(`· ${f.nombre}: primera ronda — línea de base declarada (${archivos.length} archivos). No se reportan novedades del histórico.`)
        if (ns.extra) contexto.push(`· ${f.nombre}: ${ns.extra} novedad(es) más allá del tope mostrado.`)
        const x = ns.contexto_cruce
        if (x) {
          if (x.huecos_historicos) contexto.push(`· ${f.nombre}: ${x.huecos_historicos} comprobante(s) por DEBAJO del techo del espejo sin correlato — hueco histórico, no novedad de hoy.`)
          for (const nj of x.no_juzgables) contexto.push(`· ${f.nombre}: ${nj.cuantos} archivo(s) que no puedo juzgar (${nj.motivo}).`)
          if (x.sin_patron) contexto.push(`· ${f.nombre}: ${x.sin_patron} archivo(s) sin identidad fiscal en el nombre (remitos, notas) — fuera del cruce.`)
        }
      }

      else if (f.tipo === 'sheet_vinculado') {
        const desincro = await idDesincronizado(f)
        if (desincro) {
          const n = novedadCiega(f, desincro)
          novedades.push(n); await guardarSenal(f.clave, null, desincro); continue
        }
        if (SIN_DRIVE) { contexto.push(`· ${f.nombre}: no revisado (--sin-drive).`); continue }
        const meta = await metaDeSheet(f.drive_file_id)
        if (meta?.error) {
          const n = novedadCiega(f, meta.error)
          novedades.push(n); await guardarSenal(f.clave, null, meta.error); continue
        }
        if (meta?.trashed) {
          const n = novedadCiega(f, 'el archivo está en la papelera de Drive')
          novedades.push(n); await guardarSenal(f.clave, null, n.evidencia.motivo); continue
        }
        const ns = novedadesSheetVinculado(f, { meta, senal: previa })
        novedades.push(...ns)
        await guardarSenal(f.clave, ns.senal)
        if (ns.linea_base) contexto.push(`· ${f.nombre}: primera ronda — línea de base (modificado ${String(meta.modifiedTime).slice(0, 16).replace('T', ' ')}).`)
      }

      else if (f.tipo === 'arca') {
        const c = await coberturaArca(f.tipo_libro)
        const ns = novedadesArca(f, { ...c, senal: previa, ahora: AHORA })
        novedades.push(...ns)
        await guardarSenal(f.clave, ns.senal)
      }

      else if (f.tipo === 'uocra_cct') {
        const ns = novedadesCct(f, { guardada: await escalaGuardada(), ahora: AHORA })
        novedades.push(...ns)
        await guardarSenal(f.clave, ns.senal)
      }

      else if (f.tipo === 'banco') {
        const ns = novedadesSilencio(f, { ...(await ultimoMovimientoBanco()), ahora: AHORA })
        novedades.push(...ns)
        await guardarSenal(f.clave, ns.senal)
      }
    } catch (e) {
      // Una fuente que rompe no cancela la ronda: se declara ciega con el error y se sigue. Un vigía
      // que se cae entero porque una tabla falta deja de vigilar TODO lo demás.
      const motivo = `error al leer la fuente: ${String(e?.message ?? e).slice(0, 180)}`
      novedades.push(novedadCiega(f, motivo))
      await guardarSenal(f.clave, null, motivo).catch(() => {})
      log.warn('fuente ilegible', { clave: f.clave, motivo })
    }
  }

  // LA EDAD DEL ÍNDICE: el vigía ve el Drive con los ojos del indexador. Si el índice se congeló, lo
  // que dice de las carpetas puede estar viejo, y eso se declara (no se disimula).
  const cadenciaIndice = Number(process.env.ORQ_VIGIA_INDICE_HORAS || 12)
  const horasIndice = indice.indexed_at ? Math.round((AHORA - new Date(indice.indexed_at)) / 3600000) : null
  if (horasIndice == null) {
    contexto.push('· ATENCIÓN: el índice del data room (drive_index) está vacío — no puedo ver ninguna carpeta de Drive.')
  } else if (horasIndice > cadenciaIndice) {
    contexto.push(`· ATENCIÓN: el índice del data room se leyó hace ${horasIndice}h (${indice.archivos} archivos). Lo que digo de las carpetas de Drive tiene esa edad; corré scripts/indexar-drive.mjs (o revisá echegaray-drive-index.timer).`)
  } else {
    contexto.push(`· índice del data room: ${indice.archivos} archivos, leído hace ${horasIndice}h.`)
  }

  return { novedades, contexto }
}

/**
 * ENGANCHE DE AVISO — apagado por defecto.
 *
 * El canal interno del OS para "acá hay trabajo" es el Backlog Autónomo, y publicar ahí es Nivel D
 * (interno, reversible, no mueve un peso). Aun así es OPT-IN (`--al-backlog`): una ronda que llena el
 * backlog sola cada 6 horas lo vuelve inservible, que es el mismo defecto que arruinó la alerta de
 * frescura. Sólo suben las novedades que REQUIEREN AL DUEÑO y sólo la primera vez que se ven.
 *
 * El aviso por un canal EXTERNO (Mattermost / mail / reporte) es Nivel E: el texto está listo
 * (`avisoTexto`) y lo engancha el proceso principal — este script no publica afuera.
 */
// El tipo de backlog que le corresponde a cada novedad. No todas son un "riesgo": un comprobante que
// el OS no tiene es un GAP DE DATO, y un extracto que no llegó también. Poner todo como riesgo haría
// inútil el filtro por tipo del backlog.
const TIPO_BACKLOG = {
  sin_correlato: 'gap_dato',
  cobertura_atrasada: 'gap_dato',
  silencio: 'gap_dato',
  ciega: 'gap_dato',
  archivo_nuevo: 'gap_dato',
  archivo_modificado: 'riesgo',
  sheet_modificado: 'riesgo',
  valor_cambiado: 'riesgo',
}

async function alBacklog(novedades) {
  let subidas = 0
  for (const n of novedades.filter((x) => x.clasificacion === 'requiere_dueno')) {
    const r = await query(
      // confianza = 'observado': el vigía VIO el hecho en la fuente. No lo calculó ni lo infirió, y
      // decir 'confirmado' sería subir un grado de evidencia que no tiene (no está conciliado).
      // nivel_autonomia_permitido = 'C': el OS puede preparar el análisis; ejecutar es del dueño.
      // area = 'administracion_finanzas': la clave de public.area_canonica (hay FK: un nombre lindo
      // como 'Finanzas' hace fallar el insert entero).
      `insert into public.backlog_autonomo
         (tipo, titulo, evidencia, fuente, confianza, impacto, urgencia, esfuerzo, recomendacion,
          nivel_autonomia_permitido, estado, area, origen_tabla)
       select $5, $1, $2, $3, 'observado', 'alta', 'alta', 'bajo', $4, 'C', 'abierto', 'administracion_finanzas', 'vigia_novedades'
        where not exists (select 1 from public.backlog_autonomo where titulo = $1 and estado = 'abierto')
       returning id`,
      [n.titulo.slice(0, 300), JSON.stringify(n.evidencia).slice(0, 2000), `vigía de fuentes — ${n.fuente}`,
       n.accion.slice(0, 500), TIPO_BACKLOG[n.tipo] ?? 'gap_dato'])
    if (r.rowCount) subidas++
  }
  return subidas
}

async function main() {
  // La migración es idempotente (create table if not exists): correrla en cada arranque garantiza que
  // el vigía funcione desde la primera corrida sin un paso manual previo.
  if (!SECO) await query(readFileSync(MIGRACION, 'utf8'))
  if (!SECO) await sincronizarRegistro()

  const { novedades, contexto } = await ronda()

  const primeras = []
  for (const n of novedades) if (await registrar(n)) primeras.push(n.huella)

  const r = resumen(novedades)
  if (JSON_OUT) {
    console.log(JSON.stringify({
      generado: AHORA.toISOString(), seco: SECO, resumen: r,
      novedades, contexto, aviso: avisoTexto(novedades, { ahora: AHORA }), nuevas: primeras.length,
    }, null, 2))
  } else {
    console.log(formatNovedades(novedades, { ahora: AHORA, contexto }))
    console.log('')
    console.log(SECO
      ? '(--seco: no se registró nada en public.vigia_novedades)'
      : `registradas: ${primeras.length} novedad(es) nueva(s), ${novedades.length - primeras.length} ya conocida(s) (subieron visto_veces).`)
  }

  if (AL_BACKLOG && !SECO) {
    const n = await alBacklog(novedades)
    console.log(`backlog autónomo: ${n} entrada(s) nueva(s).`)
  }

  // Con --json la salida tiene que ser JSON PURO: otro proceso la parsea. El log del logger va a
  // stdout en nivel info, así que en modo JSON se omite (el resumen ya viaja dentro del JSON).
  if (!JSON_OUT) log.info('ronda del vigía terminada', { ...r, nuevas: primeras.length, seco: SECO })
  await closePool()
}

main().catch(async (err) => {
  log.error('vigia-fuentes falló', { error: err.message })
  console.error(err)
  await closePool().catch(() => {})
  process.exitCode = 1
})
