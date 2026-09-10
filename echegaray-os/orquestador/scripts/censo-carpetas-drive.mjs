#!/usr/bin/env node
// CENSO DE CARPETAS DE DRIVE — qué entidad tiene carpeta, cuál no, y cuál la tiene rota.
//
// ═══ PARA QUÉ SIRVE ═══
//
// El puente Drive ↔ app se apoya en una sola pregunta: cuál es la carpeta de cada obra, cliente,
// persona y proveedor. Este script la contesta para TODAS a la vez y publica lo que falta. No
// escribe nada: es la lista sobre la que el dueño decide, y el insumo del H3 (subir a Drive), que
// sin carpeta no tiene destino.
//
// ═══ LA REGLA ES LA MISMA QUE LA DE LA APP ═══
//
// `estadoDeCarpeta` se IMPORTA de `src/features/documentos/services/carpetaDeEntidad.ts`; no se
// reescribe acá. Node 24 saca los tipos solo, y el patrón ya existe en el repo (`drive-url.test.mjs`
// importa el `.ts` de la web). Una copia de la regla en el orquestador sería la segunda definición
// del mismo concepto, y el día que una cambie nadie sabría cuál manda.
//
// ═══ POR QUÉ NO SUGIERE CARPETAS ═══
//
// Para las obras sin carpeta se listan las subcarpetas de la carpeta de SU CLIENTE, sin puntuar ni
// elegir. Parecerse no es ser: «BSA - DEMOLICION Y PILETA DE CONTENCION» es la carpeta de dos obras
// distintas y «ME - BSA» no se parece a ninguna. Quien decide es el dueño; el script le pone las
// opciones al lado para que no tenga que abrir Drive.
//
//   node orquestador/scripts/censo-carpetas-drive.mjs            # el censo
//   node orquestador/scripts/censo-carpetas-drive.mjs --json     # para consumir

import { closePool, query } from '../lib/db.mjs'
import { clasificar } from '../lib/censo-carpetas.mjs'

/** Qué se censa. `id` y `nombre` son las columnas con las que se lo nombra en el informe. */
const CENSO = [
  { tipo: 'obra', tabla: 'obra_canonica', columna: 'drive_carpeta_id', nombre: 'nombre', extra: 'cliente_id, fusionada_en' },
  { tipo: 'cliente', tabla: 'clientes', columna: 'drive_carpeta_id', nombre: 'coalesce(nombre_comercial, razon_social, slug)', extra: 'null::uuid as cliente_id, null::text as fusionada_en' },
  { tipo: 'persona', tabla: 'personas', columna: 'drive_folder_id', nombre: 'nombre_completo', extra: 'null::uuid as cliente_id, null::text as fusionada_en' },
  { tipo: 'proveedor', tabla: 'proveedores', columna: 'drive_carpeta_id', nombre: 'coalesce(nombre, razon_social)', extra: 'null::uuid as cliente_id, null::text as fusionada_en' },
]

/**
 * PROVEEDORES NO TIENE COLUMNA, y el censo tiene que decirlo en vez de reventar. Se pregunta al
 * catálogo del sistema en vez de asumir: el día que la columna exista, el censo la usa solo.
 */
async function columnaExiste(tabla, columna) {
  const { rows } = await query(
    `select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2`,
    [tabla, columna],
  )
  return rows.length > 0
}

async function filasDe(def) {
  if (!(await columnaExiste(def.tabla, def.columna))) return null
  const { rows } = await query(`
    select e.id::text as id, ${def.nombre} as nombre, e.${def.columna} as carpeta_id, ${def.extra},
           c.path, c.trashed, c.ausente_en_drive, c.web_view_link,
           (select count(*) from public.drive_index d
             where not d.is_folder and d.path like replace(replace(c.path,'\\','\\\\'),'_','\\_') || '/%') as archivos
      from public.${def.tabla} e
      left join public.drive_index c on c.drive_file_id = e.${def.columna}
     order by 2
  `)
  return rows
}

/** Las subcarpetas de la carpeta del cliente de una obra. Opciones, no sugerencias. */
async function opcionesDeObra(clienteId) {
  if (!clienteId) return []
  const { rows } = await query(`
    select d.path
      from public.clientes cl
      join public.drive_index c on c.drive_file_id = cl.drive_carpeta_id
      join public.drive_index d on d.parent_id = c.drive_file_id and d.is_folder
     where cl.id = $1 and not coalesce(d.trashed, false)
     order by d.path
  `, [clienteId])
  return rows.map((r) => r.path)
}

async function main() {
  const json = process.argv.includes('--json')
  const salida = {}
  for (const def of CENSO) {
    const filas = await filasDe(def)
    salida[def.tipo] = filas === null
      // NO ES CERO: es que la columna no existe. Un cero acá se leería como «ninguno tiene carpeta»,
      // que es cierto por accidente y falso como descripción del problema.
      ? { sin_columna: `${def.tabla}.${def.columna} no existe`, filas: [] }
      : { filas: clasificar(def.tipo, filas) }
  }

  for (const f of salida.obra.filas) {
    if (f.estado === 'sin_declarar') f.opciones = await opcionesDeObra(f.cliente_id)
  }

  if (json) { console.log(JSON.stringify(salida, null, 2)); return }

  for (const [tipo, r] of Object.entries(salida)) {
    console.log(`\n═══ ${tipo.toUpperCase()} ═══`)
    if (r.sin_columna) { console.log(`  sin columna de carpeta: ${r.sin_columna} — ${r.filas.length} filas`); continue }
    const porEstado = {}
    for (const f of r.filas) (porEstado[f.estado] ??= []).push(f)
    for (const [estado, filas] of Object.entries(porEstado)) {
      console.log(`  ${estado}: ${filas.length}`)
      if (estado === 'ok') {
        const vacias = filas.filter((f) => f.archivos === 0)
        if (vacias.length) console.log(`    con carpeta y SIN archivos adentro: ${vacias.map((f) => f.nombre).join(' · ')}`)
        continue
      }
      for (const f of filas.slice(0, 40)) {
        const op = f.opciones?.length ? `\n        opciones: ${f.opciones.join(' | ')}` : ''
        console.log(`    · ${f.nombre}${f.fusionada_en ? ` (fusionada en ${f.fusionada_en})` : ''}${op}`)
      }
      if (filas.length > 40) console.log(`    … y ${filas.length - 40} más`)
    }
  }
}

main().then(() => closePool()).catch(async (e) => {
  console.error('FALLA', e.message)
  await closePool()
  process.exitCode = 1
})
