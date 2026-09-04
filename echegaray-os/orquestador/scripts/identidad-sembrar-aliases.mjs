// SIEMBRA LOS ALIAS QUE EL CUIT YA PRUEBA. Read-only sobre las fuentes; sólo escribe la tabla de alias.
//
//   node orquestador/scripts/identidad-sembrar-aliases.mjs [--escribir]
//
// Un alias sembrado por CUIT nace VERIFICADO: no es una inferencia del modelo, es un identificador
// fuerte que dice que esos dos nombres son la misma entidad. Es lo que convierte
// «DUPEC» = «DUBOS UGARTE PEDRO LUIS RAUL» de imposible a instantáneo.
import { query, closePool } from '../lib/db.mjs'
import { normalizar } from '../lib/ml/embeddings.mjs'
import { cuitCanonico } from '../lib/ml/entity-resolution.mjs'

const ESCRIBIR = process.argv.includes('--escribir')

async function main() {
  const prov = (await query(
    `select id::text as id, nombre, cuit from public.proveedores where cuit is not null and cuit <> ''`)).rows
  const porCuit = new Map()
  for (const p of prov) { const c = cuitCanonico(p.cuit); if (c) porCuit.set(c, p) }
  console.log(`padrón con CUIT: ${porCuit.size} proveedores`)

  // Cómo aparece escrito ese mismo CUIT en las otras fuentes del OS.
  const otras = []
  for (const r of (await query(
    `select distinct emisor_nombre nombre, emisor_cuit cuit from public.comprobantes_arca
      where emisor_cuit is not null and emisor_nombre is not null`)).rows) otras.push({ ...r, fuente: 'arca' })
  for (const r of (await query(
    `select distinct proveedor nombre, cuit from public.compra_sheet
      where cuit is not null and cuit <> '' and proveedor is not null`)).rows) otras.push({ ...r, fuente: 'compra_sheet' })

  const nuevos = []
  for (const o of otras) {
    const c = cuitCanonico(o.cuit)
    if (!c) continue
    const canon = porCuit.get(c)
    if (!canon) continue
    const norm = normalizar(o.nombre)
    if (!norm || norm === normalizar(canon.nombre)) continue // ya es el mismo texto: no es un alias
    nuevos.push({ entidad: 'proveedor', entidadId: canon.id, alias: o.nombre, aliasNorm: norm, fuente: o.fuente, canon: canon.nombre })
  }
  const vistos = new Set()
  const unicos = nuevos.filter((n) => { const k = n.aliasNorm; if (vistos.has(k)) return false; vistos.add(k); return true })

  console.log(`\nALIAS que el CUIT prueba (${unicos.length}):`)
  for (const n of unicos) console.log(`  «${n.alias}»  →  «${n.canon}»   [${n.fuente}]`)

  if (!ESCRIBIR) { console.log('\nENSAYO: no escribí nada. Con --escribir se siembran.'); return }
  let ok = 0
  for (const n of unicos) {
    await query(
      `insert into public.ml_entidad_alias (entidad, entidad_id, alias, alias_norm, fuente, confianza, verificado, verificado_por)
       values ($1,$2,$3,$4,$5,1,true,'CUIT')
       on conflict (entidad, alias_norm) do nothing`,
      [n.entidad, n.entidadId, n.alias, n.aliasNorm, n.fuente])
    ok++
  }
  console.log(`\n✓ ${ok} alias sembrados, todos VERIFICADOS por CUIT`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exitCode = 1 }).finally(() => closePool())
}
