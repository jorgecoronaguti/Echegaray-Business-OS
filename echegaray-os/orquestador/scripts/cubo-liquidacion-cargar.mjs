#!/usr/bin/env node
// LOS NETOS QUE ESTÁN EN EL CUBO Y NO EN NINGÚN PDF.
//
// ═══ POR QUÉ EXISTE (31/08/2026) ═══
//
// El dueño insistió tres veces: «faltan los de todos de la primera quincena de agosto». Contesté
// tres veces que el estudio no los había mandado, y lo "probé" mirando los PDF: el de la 2da tiene
// 19 páginas y el de la 1ra tiene UNA, la de Zogbe. Los dos datos eran ciertos y la conclusión era
// falsa.
//
// **Estaban en el `Cubo Informe de Liquidación.xlsx`, adjunto en el MISMO mail.** Diecinueve
// personas con su neto de la primera quincena. El OS ya usaba ese archivo —`liquidacion-recibos.mjs`
// lo cruza contra los PDF— pero sólo para CONFIRMAR lo que el PDF ya decía: un neto que existe en el
// Cubo y no tiene PDF caía en `SOLO_CUBO` y no se cargaba nunca.
//
// LA LECCIÓN, QUE ES CARA: buscar la ausencia de un dato en UNA fuente y declarar que el dato no
// existe. El Cubo estaba al lado del PDF, en el mail que ya había abierto tres veces.
//
// ═══ POR QUÉ EL CUBO ALCANZA, Y DÓNDE NO ═══
//
// Trae legajo, nombre y neto — **no trae CUIL**, que es la llave de `nomina_recibo_neto`. El puente
// es el LEGAJO contra los recibos ya cargados: mismo legajo, mismo empleador, mismo mes. No se
// empareja por nombre —el error que este repo ya pagó, «Castillo Carlos» cayendo en «GONZALEZ CARLOS
// SAMUEL»— y además el Cubo TRUNCA los nombres a 25 caracteres.
//
// A quien no tenga legajo conocido no se le carga nada y se informa: un neto colgado del CUIL
// equivocado es plata que se le transfiere a otra persona.
//
//   node orquestador/scripts/cubo-liquidacion-cargar.mjs <cubo.xlsx> [--aplicar]

import { execFileSync } from 'node:child_process'
import { query, closePool } from '../lib/db.mjs'
import { periodoNormalizado } from '../lib/liquidacion-recibos.mjs'

const APLICAR = process.argv.includes('--aplicar')
const ARCHIVO = process.argv.slice(2).find((a) => a.endsWith('.xlsx'))
if (!ARCHIVO) {
  console.error('falta el Cubo: node orquestador/scripts/cubo-liquidacion-cargar.mjs <cubo.xlsx> [--aplicar]')
  process.exit(1)
}

/** El lector de xlsx, en Python: un `.xlsx` es un zip con XML y `zipfile` es stdlib. */
const LEER_XLSX = String.raw`
import zipfile, re, sys, json
z = zipfile.ZipFile(sys.argv[1])
ss = re.findall(r'<si>(.*?)</si>', z.read('xl/sharedStrings.xml').decode('utf8'), re.S)
ss = [''.join(re.findall(r'<t[^>]*>(.*?)</t>', s, re.S)) for s in ss]
x = z.read('xl/worksheets/sheet1.xml').decode('utf8')
out = []
for f in re.findall(r'<row[^>]*>(.*?)</row>', x, re.S):
    fila = []
    for m in re.finditer(r'<c\b([^>]*)>(?:<v>(.*?)</v>)?', f):
        at, v = m.group(1), m.group(2)
        fila.append('' if v is None else (ss[int(v)] if 't="s"' in at else v))
    out.append(fila)
print(json.dumps(out))
`

/**
 * EL CUBO, LEÍDO SIN AGREGAR UNA DEPENDENCIA.
 *
 * Traer una librería de Excel para leer tres columnas de un archivo de 10 KB es peso permanente por
 * una necesidad de una vez. Lo que sale de Python es texto plano que este script valida.
 *
 * Devuelve `[{ etiqueta, legajo, nombre, neto }]` EN EL ORDEN DEL ARCHIVO — el orden importa, porque
 * la etiqueta del período encabeza su bloque y rige para las filas que siguen.
 */
export function filasDelCubo(rutaXlsx, ejecutar = execFileSync) {
  const crudo = JSON.parse(ejecutar('python3', ['-c', LEER_XLSX, rutaXlsx], { encoding: 'utf8', maxBuffer: 8e6 }))
  const filas = []
  let etiqueta = null
  for (const f of crudo) {
    const cab = String(f?.[0] ?? '').trim()
    if (/QUINCENA|FINAL/i.test(cab)) { etiqueta = cab; continue }
    const legajo = String(f?.[1] ?? '').trim()
    const nombre = String(f?.[2] ?? '').trim()
    const neto = Number(f?.[3])
    // Una fila de datos tiene legajo numérico, nombre y un neto POSITIVO. Todo lo demás es
    // encabezado, subtotal o separador: no se adivina, se descarta.
    if (!/^\d+$/.test(legajo) || !nombre || !Number.isFinite(neto) || neto <= 0) continue
    filas.push({ etiqueta, legajo, nombre, neto: Math.round(neto * 100) / 100 })
  }
  return filas
}

async function main() {
  const filas = filasDelCubo(ARCHIVO)
  const porEtiqueta = new Map()
  for (const f of filas) porEtiqueta.set(f.etiqueta, (porEtiqueta.get(f.etiqueta) ?? 0) + 1)
  console.log(`${ARCHIVO.split('/').pop()} · ${filas.length} fila(s)`)
  for (const [k, v] of porEtiqueta) console.log(`   ${v} × ${k} → período ${periodoNormalizado(k) ?? '?'}`)

  const { rows } = await query(
    'select distinct on (legajo) legajo, cuil, nombre_recibo from public.nomina_recibo_neto where legajo is not null order by legajo, cargado_en desc')
  const cuilDeLegajo = new Map(rows.map((r) => [String(r.legajo), r]))
  // ═══ EL RESPALDO POR NOMBRE, QUE SE USA SÓLO CUANDO EL LEGAJO NO ALCANZA ═══
  //
  // Jofre y Sosa cobraron la 1ra quincena normalmente —trabajaron hasta el 25/08— pero el único
  // recibo suyo cargado es la LIQUIDACIÓN FINAL, y ésa no trae legajo. Sin respaldo se quedaban
  // afuera de su propia quincena.
  //
  // Se compara por PREFIJO en los dos sentidos porque el Cubo trunca a 25 caracteres, y se exige
  // que la coincidencia sea ÚNICA: si dos personas empiezan igual, no se carga ninguna. Con cuatro
  // González en el plantel, un match ambiguo es plata en la cuenta equivocada.
  const plano = (x) => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
  const { rows: todosLosRecibos } = await query('select distinct cuil, nombre_recibo from public.nomina_recibo_neto')
  const porNombre = (nombreCubo) => {
    const n = plano(nombreCubo)
    const cand = todosLosRecibos.filter((r) => {
      const m = plano(r.nombre_recibo)
      return m.startsWith(n) || n.startsWith(m)
    })
    return cand.length === 1 ? cand[0] : null
  }

  const { rows: yaEstan } = await query('select cuil, periodo from public.nomina_recibo_neto')
  const cargado = new Set(yaEstan.map((r) => `${r.cuil}·${r.periodo}`))

  const nuevos = []
  const sinPuente = []
  const repetidos = []
  for (const f of filas) {
    const periodo = periodoNormalizado(f.etiqueta)
    if (!periodo) { sinPuente.push(`${f.nombre}: no entiendo el período «${f.etiqueta}»`); continue }
    const p = cuilDeLegajo.get(f.legajo) ?? porNombre(f.nombre)
    if (!p) { sinPuente.push(`${f.nombre} (legajo ${f.legajo}): sin CUIL conocido y sin coincidencia única por nombre — NO se carga`); continue }
    if (cargado.has(`${p.cuil}·${periodo}`)) { repetidos.push(`${p.nombre_recibo} ${periodo}`); continue }
    nuevos.push({ ...f, periodo, cuil: p.cuil, nombre_recibo: p.nombre_recibo })
  }

  console.log(`\na cargar: ${nuevos.length} · ya estaban: ${repetidos.length} · sin puente: ${sinPuente.length}`)
  for (const n of nuevos) console.log(`   ${n.periodo}  ${n.nombre_recibo.padEnd(34)} ${n.neto.toLocaleString('es-AR', { minimumFractionDigits: 2 }).padStart(13)}  (legajo ${n.legajo})`)
  for (const s of sinPuente) console.log(`   ⚠ ${s}`)
  if (!APLICAR) return console.log('\n(sin --aplicar: no cargué nada)')

  for (const n of nuevos) {
    await query(
      `insert into public.nomina_recibo_neto (cuil, periodo, neto, nombre_recibo, legajo, etiqueta, fuente)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [n.cuil, n.periodo, n.neto, n.nombre_recibo, n.legajo, n.etiqueta,
        `Cubo Informe de Liquidación del estudio · ${ARCHIVO.split('/').pop()} · legajo ${n.legajo} → CUIL por el recibo ya cargado`])
  }
  const { rows: releido } = await query(
    'select periodo, count(*)::int c, sum(neto)::numeric s from public.nomina_recibo_neto group by periodo order by periodo')
  console.log('\n✓ releído de la base:')
  for (const r of releido) console.log(`   ${r.periodo.padEnd(12)} ${String(r.c).padStart(3)} recibo(s) · ${Number(r.s).toLocaleString('es-AR')}`)
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main().finally(closePool)
}
