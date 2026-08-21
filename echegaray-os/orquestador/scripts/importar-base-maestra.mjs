#!/usr/bin/env node
// `Planilla para Cotizar (2).xlsm` → la base maestra constructiva de Postgres.
//
//   node orquestador/scripts/importar-base-maestra.mjs              ← ENSAYO: hace todo y hace rollback
//   node orquestador/scripts/importar-base-maestra.mjs --aplicar    ← escribe de verdad
//
// EL ENSAYO NO ES UNA SIMULACIÓN. Abre una transacción real, escribe las 409 filas de recursos, las
// 223 tareas y las 1.365 líneas, vuelve a LEER la base desde adentro de la transacción para
// verificar que una segunda corrida daría 0 nuevos y 0 modificados, consulta `analisis_costo` y
// `analisis_incompleto` sobre los datos ya escritos, y recién entonces hace `rollback`. La evidencia
// es del efecto: los números que imprime salieron de Postgres calculando sobre lo escrito, no de un
// contador de intenciones.
//
// NO TOCA EL LIBRO. Lo abre en modo lectura y nada más: el .xlsm es del dueño.
//
// El criterio —la unidad manda sobre el color, `hr` a secas no es una carga social, un precio de $0
// no es un precio— vive en `lib/base-maestra-xlsm.mjs`. La comparación contra lo que ya hay, en
// `lib/base-maestra-plan.mjs`. Los dos tienen sus tests.

import XLSX from 'xlsx'
import { getPool, closePool } from '../lib/db.mjs'
import {
  leerRecursos, leerAnalisis, verificarEncabezado, ENCABEZADO_RECURSOS, ENCABEZADO_ANALISIS, REC, ANA,
} from '../lib/base-maestra-xlsm.mjs'
import { planDeCarga, ESTADOS } from '../lib/base-maestra-plan.mjs'

const APLICAR = process.argv.includes('--aplicar')
const LIBRO_PATH = process.argv.find((a) => a.endsWith('.xlsm')) ?? '/home/jorge/Planilla para Cotizar (2).xlsm'
const HOJA_R = 'Recursos'
const HOJA_A = 'Análisis'
const FILA_HDR_R = 4, FILA_DATO_R = 5
const FILA_HDR_A = 5, FILA_DATO_A = 7
const n = (x, w = 5) => String(x).padStart(w)

/** Una celda de SheetJS → el valor que espera el núcleo puro. Una celda en error viaja como error. */
const celda = (c) => (c === undefined || c.v === undefined ? null : (c.t === 'e' ? { error: c.w ?? '#ERROR' } : c.v))

/**
 * Un rango de filas de una hoja → las filas planas `{fila, A, B, …, f}` que consume el núcleo.
 *
 * `f` lleva las FÓRMULAS de las columnas pedidas, y no es un adorno: en `Análisis` es lo único que
 * distingue una cabecera de tarea de una línea de insumo rotulada. Sin ella entraban 23 tareas
 * fantasma y se perdían sus 23 líneas.
 */
function filasDe(hoja, desde, columnas, conFormula = []) {
  const rango = XLSX.utils.decode_range(hoja['!ref'])
  const filas = []
  for (let r = desde; r <= rango.e.r + 1; r++) {
    const f = { fila: r, f: {} }
    for (const col of columnas) f[col] = celda(hoja[col + r])
    for (const col of conFormula) f.f[col] = hoja[col + r]?.f ?? null
    filas.push(f)
  }
  return filas
}

/** El destino tiene que existir ANTES de leer una fila: una migración en el repo no es una aplicada. */
async function verificarEsquema(cli) {
  const objetos = ['recurso', 'recurso_precio', 'tarea_tipo', 'analisis', 'analisis_linea', 'recurso_costo', 'analisis_costo', 'analisis_incompleto']
  const { rows } = await cli.query(
    `select table_name from information_schema.tables where table_schema='public' and table_name = any($1)`, [objetos])
  const faltan = objetos.filter((o) => !rows.some((r) => r.table_name === o))
  if (faltan.length) {
    throw new Error(`faltan en la base: ${faltan.join(', ')}. Aplicá primero 20260821T2200_la_base_maestra_constructiva.sql — el archivo en el repo no es una migración aplicada.`)
  }
}

/** Lo que ya hay en Postgres, en la forma exacta que compara el plan (numeric como texto). */
async function leerBase(cli) {
  const recursos = (await cli.query(
    `select codigo, nombre, unidad, tipo, familia, division, desperdicio::text as desperdicio, activo, origen from public.recurso`)).rows
  const precios = (await cli.query(
    `select r.codigo, p.costo::text as costo, p.fecha_precio::text as fecha_precio, p.proveedor, p.fuente
       from public.recurso_precio p join public.recurso r on r.id = p.recurso_id where p.vigente`)).rows
  const tareas = (await cli.query(
    `select codigo, nombre, unidad, descripcion, activo, origen from public.tarea_tipo`)).rows
  const analisis = (await cli.query(
    `select t.codigo, a.version,
            coalesce(json_agg(json_build_object('codigo_recurso', rr.codigo, 'cantidad', l.cantidad::text,
                                                'nota', l.nota, 'orden', l.orden) order by l.orden)
                     filter (where l.id is not null), '[]'::json) as lineas
       from public.analisis a
       join public.tarea_tipo t on t.id = a.tarea_tipo_id
       left join public.analisis_linea l on l.analisis_id = a.id
       left join public.recurso rr on rr.id = l.recurso_id
      where a.vigente group by t.codigo, a.version`)).rows
  return { recursos, precios, tareas, analisis }
}

/** El libro leído y clasificado. No toca la base. */
function leerLibro(ingesta) {
  const wb = XLSX.readFile(LIBRO_PATH, { cellFormula: true, cellDates: false })
  const hr = wb.Sheets[HOJA_R], ha = wb.Sheets[HOJA_A]
  if (!hr || !ha) throw new Error(`el libro no tiene las hojas "${HOJA_R}" y "${HOJA_A}"`)
  const colsR = Object.values(REC), colsA = Object.values(ANA)
  const hdrR = { fila: FILA_HDR_R }; for (const c of colsR) hdrR[c] = celda(hr[c + FILA_HDR_R])
  const hdrA = { fila: FILA_HDR_A }; for (const c of colsA) hdrA[c] = celda(ha[c + FILA_HDR_A])
  const problemas = [
    ...verificarEncabezado(hdrR, ENCABEZADO_RECURSOS).map((p) => `${HOJA_R}: ${p}`),
    ...verificarEncabezado(hdrA, ENCABEZADO_ANALISIS).map((p) => `${HOJA_A}: ${p}`),
  ]
  if (problemas.length) {
    throw new Error(`el encabezado del libro no es el esperado — ABORTO antes de leer una fila:\n   · ${problemas.join('\n   · ')}\n  Una columna insertada corre todo lo que sigue y este ingestor cargaría el costo de una y el desperdicio de otra sin dar error.`)
  }
  const filasR = filasDe(hr, FILA_DATO_R, colsR)
  const filasA = filasDe(ha, FILA_DATO_A, colsA, [ANA.descripcion])
  const r = leerRecursos(filasR, { ingesta })
  const a = leerAnalisis(filasA, { ingesta, recursosValidos: new Set(r.recursos.map((x) => x.codigo)) })
  return {
    recursos: r.recursos, precios: r.precios, tareas: a.tareas,
    invalidosRecurso: r.invalidos, conflictosRecurso: r.conflictos,
    invalidosTarea: a.invalidos, conflictosTarea: a.conflictos,
    filasLeidas: { [HOJA_R]: filasR.length, [HOJA_A]: filasA.length },
    conteoAnalisis: a.conteo,
  }
}

/** Columnas de una lista de objetos → arrays paralelos para `unnest`: una sentencia, no 409. */
const cols = (lista, campos) => campos.map((c) => lista.map((x) => x[c] ?? null))

/** Una escritura que perdió filas por un `join` que no encontró la pareja no es un aviso: es un fallo. */
function exigir(r, esperado, que) {
  if ((r.rowCount ?? 0) !== esperado) throw new Error(`${que}: se esperaban ${esperado} filas y se escribieron ${r.rowCount}`)
}

const C_REC = ['codigo', 'nombre', 'unidad', 'tipo', 'familia', 'division', 'desperdicio', 'activo', 'origen']
const T_REC = '$1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::numeric[],$8::boolean[],$9::text[]'
const C_TAR = ['codigo', 'nombre', 'unidad', 'division', 'metodo_medicion', 'descripcion', 'activo', 'origen']
const T_TAR = '$1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::boolean[],$8::text[]'

/** Escribe recursos y tareas: sólo lo que el plan marcó nuevo o modificado. */
async function escribirMaestros(cli, plan) {
  let escritos = 0
  const lotes = [
    [plan.recurso.nuevo, `insert into public.recurso (${C_REC}) select * from unnest(${T_REC})`, C_REC, 'recurso nuevo'],
    [plan.recurso.modificado, `update public.recurso r set nombre=u.nombre, unidad=u.unidad, tipo=u.tipo, familia=u.familia,
        division=u.division, desperdicio=u.desperdicio, activo=u.activo, origen=u.origen
        from unnest(${T_REC}) as u(${C_REC}) where r.codigo = u.codigo`, C_REC, 'recurso modificado'],
    [plan.tarea_tipo.nuevo, `insert into public.tarea_tipo (${C_TAR}) select * from unnest(${T_TAR})`, C_TAR, 'tarea nueva'],
    [plan.tarea_tipo.modificado, `update public.tarea_tipo t set nombre=u.nombre, unidad=u.unidad, division=u.division,
        metodo_medicion=u.metodo_medicion, descripcion=u.descripcion, activo=u.activo, origen=u.origen
        from unnest(${T_TAR}) as u(${C_TAR}) where t.codigo = u.codigo`, C_TAR, 'tarea modificada'],
  ]
  for (const [lista, sql, campos, que] of lotes) {
    if (!lista.length) continue
    exigir(await cli.query(sql, cols(lista, campos)), lista.length, que)
    escritos += lista.length
  }
  return escritos
}

/** El precio es una VERSIÓN: el que cambia no se edita, se jubila y entra uno nuevo. */
async function escribirPrecios(cli, plan) {
  const lista = [...plan.precio.nuevo, ...plan.precio.modificado]
  if (!lista.length) return 0
  const codigos = lista.map((p) => p.codigo)
  await cli.query(`update public.recurso_precio p set vigente = false
                     from public.recurso r where r.id = p.recurso_id and p.vigente and r.codigo = any($1::text[])`, [codigos])
  const r = await cli.query(
    `insert into public.recurso_precio (recurso_id, costo, fecha_precio, fuente, proveedor, vigente)
     select r.id, u.costo, u.fecha_precio, u.fuente, u.proveedor, true
       from unnest($1::text[],$2::numeric[],$3::date[],$4::text[],$5::text[]) as u(codigo, costo, fecha_precio, fuente, proveedor)
       join public.recurso r on r.codigo = u.codigo`,
    cols(lista, ['codigo', 'costo', 'fecha_precio', 'fuente', 'proveedor']))
  exigir(r, lista.length, 'precios')   // si el join no encuentra el recurso, la fila se perdería en silencio
  return lista.length
}

/** El análisis también es una versión, y se escribe ENTERO: media receta vieja no es una receta. */
async function escribirAnalisis(cli, plan) {
  const lista = [...plan.analisis.nuevo, ...plan.analisis.modificado]
  if (!lista.length) return { versiones: 0, lineas: 0 }
  const codigos = lista.map((a) => a.codigo)
  await cli.query(`update public.analisis a set vigente = false
                     from public.tarea_tipo t where t.id = a.tarea_tipo_id and a.vigente and t.codigo = any($1::text[])`, [codigos])
  const { rows } = await cli.query(
    `with alta as (
       insert into public.analisis (tarea_tipo_id, version, vigente, motivo)
       select t.id, u.version, true, $3 from unnest($1::text[],$2::int[]) as u(codigo, version)
         join public.tarea_tipo t on t.codigo = u.codigo
       returning id, tarea_tipo_id)
     select a.id, t.codigo from alta a join public.tarea_tipo t on t.id = a.tarea_tipo_id`,
    [codigos, lista.map((a) => a.version), `ingesta ${LIBRO_PATH.split('/').pop()}`])
  if (rows.length !== lista.length) throw new Error(`se dieron de alta ${rows.length} análisis de ${lista.length}: alguna tarea_tipo no existe`)
  const id = new Map(rows.map((r) => [r.codigo, r.id]))
  const planas = lista.flatMap((a) => a.lineas.map((l) => ({ ...l, analisis_id: id.get(a.codigo) })))
  if (!planas.length) return { versiones: rows.length, lineas: 0 }
  const r = await cli.query(
    `insert into public.analisis_linea (analisis_id, recurso_id, cantidad, orden, nota)
     select u.analisis_id, r.id, u.cantidad, u.orden, u.nota
       from unnest($1::uuid[],$2::text[],$3::numeric[],$4::int[],$5::text[]) as u(analisis_id, codigoRecurso, cantidad, orden, nota)
       join public.recurso r on r.codigo = u.codigoRecurso`,
    cols(planas, ['analisis_id', 'codigoRecurso', 'cantidad', 'orden', 'nota']))
  exigir(r, planas.length, 'líneas de análisis')
  return { versiones: rows.length, lineas: planas.length }
}

/**
 * EL CUADRE: cada fila del libro tiene que aparecer en algún lado. Un ingestor que informa lo que
 * cargó pero no lo que dejó afuera puede perder 23 líneas sin que ningún número se mueva.
 */
function mostrarCuadre(libro, plan, clasificadas) {
  const c = libro.conteoAnalisis
  const perdedoras = plan.tarea_tipo.conflicto.flatMap((x) => (x.filas ?? []).filter((f) => f.entra === false))
  const dup = perdedoras.length
  const lineasDup = perdedoras.reduce((a, f) => a + (f.n_lineas ?? 0), 0)
  const entran = libro.tareas.reduce((a, t) => a + t.lineas.length, 0)
  console.log('\n── EL CUADRE: DÓNDE FUE A PARAR CADA FILA ──────────────────────────────────')
  console.log(`  Recursos  · ${clasificadas.recurso} filas con contenido = ${plan.recurso.nuevo.length + plan.recurso.modificado.length + plan.recurso.sin_cambios.length} recursos + ${plan.recurso.invalido.length} inválidas + ${clasificadas.recurso - libro.recursos.length - plan.recurso.invalido.length} en conflicto`)
  console.log(`  Análisis  · ${c.cabeceras} cabeceras de tarea = ${libro.tareas.length} que entran + ${dup} descartadas por código duplicado`)
  console.log(`  Análisis  · ${c.lineas} líneas de insumo = ${entran} que entran + ${lineasDup} que colgaban de una cabecera duplicada + ${c.lineasRechazadas} rechazadas`)
  console.log(`              ${c.rotuladas} de las que entran llevan rótulo de sub-bloque en COD T («Correa», «MALLA», «1 OF»…)`)
  if (c.lineas !== entran + lineasDup + c.lineasRechazadas) { console.log('  ✗ EL CUADRE NO CIERRA: hay líneas que no están en ningún lado'); process.exitCode = 1 }
}

/** Imprime los cinco cajones de una entidad y devuelve el total clasificado. */
function mostrarResumen(nombre, cajon) {
  const c = Object.fromEntries(ESTADOS.map((e) => [e, cajon[e].length]))
  const enConflicto = cajon.conflicto.reduce((a, x) => a + (x.filas?.length ?? 1), 0)
  console.log(`  ${nombre.padEnd(12)} nuevo ${n(c.nuevo)} · modificado ${n(c.modificado)} · sin cambios ${n(c.sin_cambios)} · conflicto ${n(c.conflicto)} · inválido ${n(c.invalido)}`)
  return c.nuevo + c.modificado + c.sin_cambios + c.invalido + enConflicto
}

/** Lo excluido, con nombre y motivo. Excluido y silencioso es lo mismo que perdido. */
function mostrarExclusiones(plan) {
  console.log('\n── LO QUE NO ENTRÓ, UNO POR UNO ────────────────────────────────────────────')
  for (const [ent, cajon] of Object.entries(plan)) {
    if (ent === 'resumen') continue
    for (const x of cajon.invalido) console.log(`  ✗ ${ent} · fila ${x.fila}: ${x.motivo}`)
    for (const x of cajon.conflicto) {
      console.log(`  ⚠ ${ent} · "${x.clave}": ${x.motivo ?? x.resuelto}`)
      for (const f of x.filas ?? []) console.log(`       fila ${f.fila} · ${f.nombre ?? ''} ${f.unidad ?? ''} ${f.n_lineas ?? ''} ${f.entra === false ? '← NO ENTRA' : ''}`)
    }
  }
}

/** Los tipos que salieron de la clasificación, y los `otro` con su motivo: la deuda de carga. */
function mostrarClasificacion(libro) {
  const porTipo = new Map()
  for (const r of libro.recursos) porTipo.set(r.tipo, (porTipo.get(r.tipo) ?? 0) + 1)
  console.log('\n── CÓMO QUEDÓ CLASIFICADO CADA RECURSO ─────────────────────────────────────')
  for (const [t, c] of [...porTipo].sort((a, b) => b[1] - a[1])) console.log(`  ${t.padEnd(14)} ${n(c)}`)
  const otros = libro.recursos.filter((r) => r.tipo === 'otro')
  const sinEvidencia = otros.filter((r) => r.porqueTipo.startsWith('sin evidencia'))
  console.log(`  → de los ${otros.length} «otro», ${sinEvidencia.length} no tienen NINGUNA evidencia de tipo (ni familia ni división):`)
  for (const r of sinEvidencia) console.log(`       ${r.codigo.padEnd(6)} ${r.nombre.slice(0, 48).padEnd(50)} ${r.unidad}`)
  const dolar = libro.recursos.filter((r) => /DOLAR|DÓLAR/i.test(r.nombre) || r.unidad === 'DOLAR' || r.unidad === '$')
  console.log(`  → ${dolar.length} recursos cotizados en MONEDA EXTRANJERA entran con el número tal cual (la tabla no tiene columna de moneda):`)
  for (const r of dolar) console.log(`       ${r.codigo.padEnd(6)} ${r.nombre.slice(0, 48).padEnd(50)} ${r.unidad}`)
}

/** Lo que dicen las vistas SOBRE LO ESCRITO. Un control no se valida contra lo que él mismo produce. */
/**
 * EL CONTROL QUE NO SE VALIDA CONTRA SÍ MISMO: `analisis_costo` contra la columna G del libro.
 *
 * `Análisis!G` es el `SUM(G…)` que Excel calculó y dejó cacheado; `analisis_costo.costo_directo` lo
 * recalcula en Postgres desde las líneas y los precios importados, por otro camino entero (unidad →
 * tipo → desperdicio → precio vigente). Si los dos coinciden, la cadena de importación reprodujo el
 * cálculo del libro. Es la única verificación acá que no mira lo que ella misma produjo.
 *
 * NADA DE ESTA COLUMNA SE IMPORTA: lo que se calcula no se guarda. G se lee sólo para contrastar.
 */
async function contrastarContraElLibro(cli) {
  const hoja = XLSX.readFile(LIBRO_PATH, { cellFormula: true }).Sheets[HOJA_A]
  const esperado = new Map()
  for (const t of leerLibro('control').tareas) {
    const g = hoja['G' + t.fila]
    if (g && typeof g.v === 'number' && Number.isFinite(g.v)) esperado.set(t.codigo, g.v)
  }
  const { rows } = await cli.query(
    `select codigo, costo_directo::float8 as costo from public.analisis_costo where vigente and codigo = any($1::text[])`,
    [[...esperado.keys()]])
  const dif = []
  let iguales = 0
  for (const r of rows) {
    const e = esperado.get(r.codigo)
    const c = r.costo ?? 0
    if (Math.abs(c - e) <= 0.01 + Math.abs(e) * 1e-6) { iguales++; continue }
    dif.push({ codigo: r.codigo, excel: e, os: c, delta: c - e })
  }
  console.log('\n── CONTRA EL PROPIO LIBRO: el costo directo que Excel dejó cacheado ─────────')
  console.log(`  ${esperado.size} tareas publican su costo en Análisis!G · ${iguales} coinciden con analisis_costo · ${dif.length} no`)
  const bloques = new Map(leerLibro('control').tareas.map((t) => [t.codigo, t]))
  for (const d of dif.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))) {
    console.log(`     ${d.codigo.padEnd(9)} Excel ${d.excel.toFixed(2).padStart(14)} · OS ${d.os.toFixed(2).padStart(14)} · dif ${d.delta.toFixed(2).padStart(13)}   ${diagnosticar(hoja, bloques.get(d.codigo))}`)
  }
  return { iguales, dif }
}

/**
 * POR QUÉ NO COINCIDE. En 12 de 13 casos no es el importador: es el rango del `SUM` de la cabecera.
 * `=SUM(Gx:Gy)` está tipeado con filas fijas, así que cuando alguien insertó o borró una línea el
 * rango quedó corrido: suma líneas de la tarea de abajo (Excel de más) o deja afuera las suyas
 * (Excel de menos, que es la cara cara: cotizar por debajo del costo).
 */
function diagnosticar(hoja, tarea) {
  if (!tarea) return ''
  const f = hoja['G' + tarea.fila]?.f ?? ''
  const m = /SUM\(G(\d+):G(\d+)\)/i.exec(f)
  if (!m) return `Análisis!G${tarea.fila} no es un SUM: "${f}"`
  const [desde, hasta] = [Number(m[1]), Number(m[2])]
  const filas = tarea.lineas.map((l) => l.fila)
  if (!filas.length) return `SUM(${desde}:${hasta}) sobre una tarea sin líneas`
  const min = Math.min(...filas), max = Math.max(...filas)
  const sobra = hasta - max, falta = min - desde
  // Una fila DENTRO del SUM y sin COD R no es un hueco inocente: `VLOOKUP(celda vacía)` en una
  // columna numérica busca el código 0, que en `Recursos` es OFICIAL ESPECIALIZADO. El libro cobró
  // horas de especializado en tres tareas sin que ninguna celda lo diga.
  for (let r = desde; r < min; r++) {
    if (/VLOOKUP/i.test(hoja['C' + r]?.f ?? '') && (hoja['B' + r]?.v ?? '') === '') {
      return `⚠ la fila ${r} está dentro del SUM y NO tiene COD R: el VLOOKUP de una celda vacía trae el código 0 = OFICIAL ESPECIALIZADO`
    }
  }
  if (sobra > 0) return `⚠ el SUM llega a la fila ${hasta} y el bloque termina en la ${max}: suma ${sobra} fila(s) DE OTRA TAREA`
  if (hasta < max) return `⚠ el SUM termina en la fila ${hasta} y el bloque llega a la ${max}: DEJA AFUERA ${max - hasta} línea(s) propias`
  if (falta > 0) return `⚠ el SUM arranca ${falta} fila(s) antes del bloque`
  return 'el rango del SUM es correcto: el valor cacheado quedó viejo'
}

async function mostrarVistas(cli) {
  console.log('\n── LO QUE DICEN LAS VISTAS SOBRE LO YA ESCRITO ─────────────────────────────')
  const c = (await cli.query(`select count(*)::int total,
      count(*) filter (where n_lineas = 0)::int sin_lineas,
      count(*) filter (where tiene_mano_obra and not tiene_cargas_sociales)::int mo_sin_cs,
      count(*) filter (where n_lineas_sin_precio > 0)::int con_sin_precio,
      count(*) filter (where hs_unitarias is null or hs_unitarias = 0)::int sin_rendimiento,
      sum(n_lineas_sin_precio)::int lineas_sin_precio,
      round(sum(costo_directo))::text costo_directo_sumado
     from public.analisis_costo where vigente`)).rows[0]
  console.log(`  analisis_costo · ${c.total} tareas con análisis vigente`)
  console.log(`     sin ninguna línea .................. ${n(c.sin_lineas)}`)
  console.log(`     con mano de obra y SIN carga social  ${n(c.mo_sin_cs)}   (la auditoría del libro decía 33)`)
  console.log(`     con líneas de recurso sin precio ... ${n(c.con_sin_precio)} tareas · ${c.lineas_sin_precio} líneas`)
  console.log(`     sin rendimiento (0 hs/unidad) ...... ${n(c.sin_rendimiento)}`)
  const d = (await cli.query(`select falta, count(*)::int c from public.analisis_incompleto group by falta order by 2 desc`)).rows
  const completas = c.total - (await cli.query(`select count(*)::int c from public.analisis_incompleto`)).rows[0].c
  console.log(`  analisis_incompleto · ${c.total - completas} tareas con deuda de carga · ${completas} COMPLETAS`)
  for (const f of d) console.log(`     ${String(f.falta).padEnd(34)} ${n(f.c)}`)
  const p = (await cli.query(`select count(*)::int total, count(*) filter (where costo_base is null)::int sin_precio,
      count(*) filter (where fecha_precio is null and costo_base is not null)::int sin_fecha,
      count(*) filter (where fecha_precio < '2018-01-01')::int de_2017 from public.recurso_costo`)).rows[0]
  console.log(`  recurso_costo · ${p.total} recursos · ${p.sin_precio} sin precio · ${p.sin_fecha} con precio y SIN fecha · ${p.de_2017} con precio anterior a 2018`)
}

async function main() {
  const ingesta = new Date().toISOString().slice(0, 10)
  const libro = leerLibro(ingesta)
  const cli = await getPool().connect()
  try {
    await verificarEsquema(cli)
    await cli.query('begin')
    const base = await leerBase(cli)
    const plan = planDeCarga({ libro, base })

    console.log(`libro: ${LIBRO_PATH}`)
    console.log(`hojas leídas: ${HOJA_R} ${libro.filasLeidas[HOJA_R]} filas · ${HOJA_A} ${libro.filasLeidas[HOJA_A]} filas · ingesta ${ingesta}`)
    console.log(`base antes: ${base.recursos.length} recursos · ${base.precios.length} precios vigentes · ${base.tareas.length} tareas · ${base.analisis.length} análisis vigentes\n`)
    console.log('── EL PLAN ─────────────────────────────────────────────────────────────────')
    const clasificadas = {
      recurso: mostrarResumen('recurso', plan.recurso),
      precio: mostrarResumen('precio', plan.precio),
      tarea_tipo: mostrarResumen('tarea_tipo', plan.tarea_tipo),
      analisis: mostrarResumen('analisis', plan.analisis),
    }
    mostrarCuadre(libro, plan, clasificadas)
    mostrarClasificacion(libro)
    mostrarExclusiones(plan)

    // ── LA ESCRITURA (en el ensayo también: adentro de la transacción que se revierte) ──────────
    const escritos = await escribirMaestros(cli, plan)
    const precios = await escribirPrecios(cli, plan)
    const an = await escribirAnalisis(cli, plan)
    console.log(`\n── ESCRITO EN LA TRANSACCIÓN ───────────────────────────────────────────────`)
    console.log(`  ${escritos} maestros (recurso + tarea_tipo) · ${precios} precios · ${an.versiones} análisis con ${an.lineas} líneas`)

    // ── IDEMPOTENCIA CONTRA LA BASE REAL, NO CONTRA UNA SIMULACIÓN ─────────────────────────────
    const plan2 = planDeCarga({ libro: leerLibro(ingesta), base: await leerBase(cli) })
    const sucios = Object.entries(plan2.resumen).filter(([, c]) => c.nuevo || c.modificado)
    console.log(`\n── IDEMPOTENCIA (segunda pasada leyendo Postgres) ──────────────────────────`)
    for (const [ent, c] of Object.entries(plan2.resumen)) console.log(`  ${ent.padEnd(12)} nuevo ${n(c.nuevo)} · modificado ${n(c.modificado)} · sin cambios ${n(c.sin_cambios)}`)
    if (sucios.length) { console.log(`  ✗ NO es idempotente: ${sucios.map(([e]) => e).join(', ')}`); process.exitCode = 1 }
    else console.log('  ✓ segunda corrida: 0 nuevos y 0 modificados')

    await mostrarVistas(cli)
    await contrastarContraElLibro(cli)

    if (APLICAR) { await cli.query('commit'); console.log('\n✓ APLICADO. La transacción se confirmó.') }
    else { await cli.query('rollback'); console.log('\n(ensayo) rollback hecho: la base quedó como estaba. Para aplicar: --aplicar') }
  } catch (e) {
    await cli.query('rollback').catch(() => {})
    throw e
  } finally { cli.release() }
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exitCode = 1 }).finally(() => closePool())
