#!/usr/bin/env node
// ESCENARIO · #4 SELECCIONAR PARTIDAS Y #6 EXPLOTAR RECURSOS, CONTRA LA BASE MAESTRA REAL.
//
// ═══ POR QUÉ ESTE SCRIPT EXISTE ═══
//
// La DoD dejaba los dos criterios en NO_VERIFICABLE. No porque el código no estuviera: `seleccion.mjs`
// tiene 25 tests y `explosion.mjs` corre en cada `correr()`. Estaban sin verificar porque el
// recolector mide la corrida de QUATTROPANI, cuyas partidas vienen CARGADAS en la cotización —el
// selector nunca se ejercita— y cuyo costo directo no se afirma, así que `reconciliacion.cuadra`
// sale `null` y la explosión no tiene contra qué reconciliar.
//
// Este escenario ejercita las dos contra los datos reales: los 12 ítems que ARCOR mandó en su propia
// planilla, contra las tareas VIGENTES de la Base Maestra de la empresa. Y corre los cuatro
// negativos que el selector tiene que poder decir que NO — con partidas reales del catálogo, no
// inventadas.
//
// ═══ NO ESCRIBE NADA ═══
//
// Sólo lee. No toca el Sheet, no escribe en Postgres, no llama a ningún modelo. Devuelve 0 si todo
// lo que tenía que pasar pasó, y 1 si algún negativo mapeó — que es el modo en que este script puede
// decir que no.

import { readFileSync } from 'node:fs'
import { getPool } from '../lib/db.mjs'
import { seleccionar, seleccionarTodas, candidatosDe, ESTADO as SEL } from '../lib/plano/seleccion.mjs'
import { computosDePlanilla } from '../lib/cotizador/planilla-cliente.mjs'
import { versionOperativa } from '../lib/cotizador/ambito-planillas.mjs'
import { armarCaso, numerosDelCaso } from '../lib/cotizador/caso-planilla-cliente.mjs'
import { correr, etapa } from '../lib/cotizador/orquestador.mjs'
import { baseMaestraCompleta, preciosVigentes, politicaVigente, costosDeRecursos } from './cotizador-casos-reales.mjs'

const ARCOR = JSON.parse(readFileSync(new URL('../datos/conocimiento/ambito-arcor-filtro-sanitario.json', import.meta.url), 'utf8'))
const linea = (t) => console.log(t)
const plata = (v) => (v === null || v === undefined ? 'no medida' : `$ ${Math.round(v).toLocaleString('es-AR')}`)

/**
 * LOS CUATRO NEGATIVOS QUE EL SELECTOR TIENE QUE PODER DECIR QUE NO.
 *
 * Cada uno es un elemento que se PARECE textualmente a una partida real del catálogo y es
 * técnicamente otra cosa. El resultado esperado NO es «que elija bien»: es que NO cierre. Un
 * `AMBIGUO` o un `PARTIDA_CANDIDATA` son respuestas correctas; `MAPEADA` es el defecto.
 */
const NEGATIVOS = [
  {
    nombre: 'unidad incompatible',
    computo: { id: 'NEG-1', nombre: 'PISO DE HORMIGON ALISADO MECÁNICO', unidad: 'ml', cantidad: { valor: 40 } },
    porQue: 'T1107.1 y T1107.2 dicen EXACTAMENTE esto y están en M2. El elemento viene en metros lineales: multiplicar ml por un precio por m² da un número sin significado, y el filtro de unidad lo descarta antes de puntuar aunque el texto coincida al 100 %',
  },
  {
    nombre: 'material distinto',
    computo: { id: 'NEG-2', nombre: 'CORREA METALICA C 100x50', unidad: 'ml', material: 'acero', cantidad: { valor: 120 } },
    porQue: 'una correa metálica comparte vocabulario con las partidas de hormigón («correa», «viga») y es otro material: el conflicto de atributos la descarta antes de puntuar',
  },
  {
    nombre: 'sistema constructivo distinto',
    computo: { id: 'NEG-3', nombre: 'TABIQUE DE DURLOCK e=0,10 CON PERFILERIA', unidad: 'm2', material: 'placa de yeso', cantidad: { valor: 85 } },
    porQue: 'un tabique en seco no es una mampostería: comparten el sistema «cerramiento» y no comparten cómo se construye',
  },
  {
    nombre: 'nombre parecido, técnicamente incompatible',
    computo: { id: 'NEG-4', nombre: 'EXCAVACION A MANO PARA BASES', unidad: 'm3', metodo: 'a mano', cantidad: { valor: 18 } },
    porQue: 'la partida de excavación con máquina dice casi lo mismo y tiene otro rendimiento y otro precio: el método SEPARA',
  },
]

async function main() {
  const pool = getPool()
  const query = (s, p) => pool.query(s, p)
  const bm = await baseMaestraCompleta(query)
  const precios = await preciosVigentes(query)
  const politica = await politicaVigente(query)

  linea('# ESCENARIO · SELECCIÓN DE PARTIDAS (#4) Y EXPLOSIÓN DE RECURSOS (#6)')
  linea('')
  linea(`Base Maestra REAL: **${bm.tareas.length} tareas** con análisis vigente · ${precios.length} observaciones de precio.`)
  linea('')

  // ── 1 · EL SELECTOR SOBRE LA PLANILLA REAL DE ARCOR ────────────────────────────────────────
  const version = versionOperativa(ARCOR)
  const planilla = computosDePlanilla(version.elegido.lectura, { documento: version.elegido.nombre })
  const sel = seleccionarTodas(planilla.computos, bm.tareas)
  linea('## 1 · El selector sobre los ítems que el cliente escribió en SU planilla')
  linea('')
  linea(`Documento que rige: **${version.elegido.nombre}** — ${version.porQue}`)
  linea('')
  linea('| ítem | lo que dice el cliente | estado | partida | por qué |')
  linea('|---|---|---|---|---|')
  for (const m of sel.mapeos) {
    linea(`| ${m.computo.evidencia?.fila ?? '?'} | ${String(m.computo.nombre).slice(0, 55)} | **${m.estado}** | ${m.tarea?.codigo ?? '—'} | ${String(m.porQue).slice(0, 110)} |`)
  }
  linea('')
  linea(`**${sel.mapeadas} mapeadas · ${sel.ambiguas} ambiguas · ${sel.candidatas} sin partida**, sobre ${sel.mapeos.length} cómputos.`)
  linea('')
  linea('Un `AMBIGUO` y un `PARTIDA_CANDIDATA` NO son fallas del selector: son la pregunta que cierra')
  linea('el hueco. Lo que sería una falla es un `MAPEADA` que no se puede defender.')
  linea('')

  // ── 2 · LOS CUATRO NEGATIVOS ───────────────────────────────────────────────────────────────
  linea('## 2 · Los cuatro negativos — lo que el selector tiene que poder decir que NO')
  linea('')
  linea('| negativo | mejor candidato del catálogo real | puntaje | estado | veredicto |')
  linea('|---|---|---|---|---|')
  const fallados = []
  for (const n of NEGATIVOS) {
    const r = seleccionar(n.computo, bm.tareas)
    const { candidatos } = candidatosDe(n.computo, bm.tareas)
    const top = candidatos[0]
    const ok = r.estado !== SEL.MAPEADA
    if (!ok) fallados.push({ ...n, resultado: r })
    linea(`| ${n.nombre} | ${top ? `${top.codigo} · ${String(top.nombre).slice(0, 40)}` : '(ninguno pasó los filtros duros)'} | ${top?.puntaje ?? '—'} | **${r.estado}** | ${ok ? 'NO cerró ✔' : 'CERRÓ ✖'} |`)
  }
  linea('')
  for (const n of NEGATIVOS) linea(`- **${n.nombre}**: ${n.porQue}`)
  linea('')

  // ── 2b · EL ATRACTOR — lo que este escenario ENCONTRÓ y no venía a buscar ──────────────────
  //
  // El primer negativo que se escribió fue «HORMIGON ARMADO PARA VIGAS en m²» y CERRÓ contra T1133
  // PUENTE DE HORMIGON. No era una falla del negativo: es que T1133 está en M2 y se lleva a
  // cualquier elemento en m² que diga «hormigón», con 1,65 de puntaje y sin competencia. Una viga no
  // es un puente y una losa tampoco, y las tres cierran contra la misma partida.
  //
  // Esto no aparecía en los 25 tests de `seleccion.mjs` porque todos usan catálogos sintéticos de
  // tres o cuatro partidas. Contra las 205 reales, aparece.
  const SONDAS = [
    'LOSA DE HORMIGON ARMADO', 'HORMIGON ARMADO PARA VIGAS', 'TABIQUE DE HORMIGON VISTO',
    'CARPETA DE HORMIGON DE NIVELACION', 'CORDON DE HORMIGON PERIMETRAL',
  ]
  const atraidos = SONDAS
    .map((nombre) => ({ nombre, r: seleccionar({ id: `SONDA-${nombre}`, nombre, unidad: 'm2', cantidad: { valor: 40 } }, bm.tareas) }))
    .filter((x) => x.r.estado === SEL.MAPEADA)
  linea('## 2b · HALLAZGO · el material solo alcanza para cerrar una partida')
  linea('')
  linea('| elemento en m² | cerró contra | puntaje | por qué |')
  linea('|---|---|---|---|')
  for (const a of atraidos) linea(`| ${a.nombre} | **${a.r.tarea.codigo} · ${a.r.tarea.nombre}** | ${a.r.candidatos[0].puntaje} | ${String(a.r.porQue).slice(0, 80)} |`)
  linea('')
  const aT1133 = atraidos.filter((a) => a.r.tarea.codigo === 'T1133').length
  linea(`**${atraidos.length} de ${SONDAS.length}** elementos de hormigón en m² CIERRAN contra una partida que no`)
  linea(`comparte el sustantivo de la pieza — ${aT1133} de ellos contra «PUENTE DE HORMIGON». La única palabra en`)
  linea('común es «hormigón», que es el material, y no hay competencia que los baje a AMBIGUO.')
  linea('')
  linea('> **NO SE CORRIGIÓ ACÁ, Y ES DELIBERADO.** Las dos salidas posibles son subir `UMBRAL` /')
  linea('> `PESO_ATRIBUTO` —que es aflojar o apretar un número para que un caso dé lo que uno quiere— o')
  linea('> extender el vocabulario de `pieza` en `plano/atributos.mjs` con los sustantivos reales del')
  linea('> catálogo (puente, losa, viga, cordón, carpeta, tabique). Lo segundo es lo correcto y cambia')
  linea('> QUÉ PARTIDAS SE COTIZAN en toda obra futura: es una decisión con efecto económico y la firma')
  linea('> quien no escribió esto. El mecanismo ya existe —T1156 rechazó dos paños fijos porque exige')
  linea('> «puerta»—; lo que falta son los sustantivos, no el motor.')
  linea('')

  // ── 3 · LA EXPLOSIÓN Y SU RECONCILIACIÓN, SOBRE UNA CORRIDA QUE SÍ AFIRMA SU COSTO ─────────
  const caso = armarCaso(ARCOR, {
    catalogo: bm.tareas, composiciones: bm.composiciones,
    cliente: 'ARCOR', costoPorRecurso: costosDeRecursos(precios),
  })
  const r = correr({
    documentos: caso.documentos, elementos: caso.elementos, partidas: caso.partidas,
    composiciones: bm.composiciones, observaciones: precios, politica,
    cliente: 'ARCOR - SAN JUAN', clientesConocidos: ['ARCOR - SAN JUAN'],
    mapeos: caso.mapeos, issuesHeredados: caso.issues,
    alcancePorDefecto: { estado: 'INCLUIDO', fuente: `planilla del cliente: ${version.elegido.nombre}`, motivo: 'lo que el cliente escribió en su propia planilla está pedido' },
  })
  const cost = etapa(r, 'COST').result
  const n = numerosDelCaso(caso)
  linea('## 3 · La explosión de recursos y su reconciliación')
  linea('')
  linea('| | |')
  linea('|---|---|')
  linea(`| ítems del cliente | ${n.itemsDelCliente} |`)
  linea(`| partidas costeables | ${n.partidasCosteables} |`)
  linea(`| choques de suministro (material del cliente) | ${n.choquesDeSuministro} — ${plata(n.plataDeSuministro)} |`)
  linea(`| costo directo | ${r.costoDirecto.total === null ? `**no afirmable** (parcial ${plata(r.costoDirecto.parcial)})` : plata(r.costoDirecto.total)} |`)
  linea(`| recursos explotados | ${r.explosion.nRecursos ?? r.explosion.recursos?.length ?? 0} |`)
  linea(`| reconcilia | **${r.reconciliacion.cuadra === null ? 'NO SE PUDO MEDIR' : r.reconciliacion.cuadra}** — ${r.reconciliacion.porQue ?? 'sin diferencia'} |`)
  linea(`| subcontratos declarados | ${cost.subcontratos === null ? 'ninguno (no es un cero medido)' : JSON.stringify(cost.subcontratos)} |`)
  linea('')
  if (r.reconciliacion.cuadra === null) {
    linea('> La reconciliación NO se puede medir cuando el costo directo no se afirma: no hay contra qué')
    linea('> reconciliar. `cuadra: null` es «no se pudo mirar», y no es lo mismo que `cuadra: false`.')
    linea('')
  }
  for (const c of r.costos.filter((x) => x.subtotal === null)) linea(`- \`${c.partida}\` sin costo: ${(c.faltan ?? []).join(' · ')}`)
  linea('')

  await pool.end()

  linea('## VEREDICTO')
  linea('')
  if (fallados.length) {
    linea(`- **#4 NO PASA** — ${fallados.length} de los cuatro negativos cerraron una partida que no pueden defender:`)
    for (const f of fallados) linea(`  - ${f.nombre} → ${f.resultado.tarea?.codigo}: ${f.resultado.porQue}`)
  } else {
    linea('- Los cuatro negativos NO cerraron: unidad, material, sistema constructivo y método SEPARAN.')
  }
  if (atraidos.length) {
    linea(`- **#4 NO PASA IGUAL** — ${atraidos.length} de ${SONDAS.length} elementos de hormigón en m² cierran contra una partida que no comparte el sustantivo de la pieza.`)
    linea('  El criterio de la DoD es «`porParecidoTextualSinAtributos === 0`», y esto es exactamente eso.')
  }
  linea(`- **#6 ${r.reconciliacion.cuadra === true ? 'MEDIDO' : 'NO MEDIDO'}** — la explosión ${r.reconciliacion.cuadra === true ? `reconcilia sobre ${r.explosion.nRecursos ?? 0} recursos` : 'no tuvo contra qué reconciliar'}.`)
  linea(`- **Suministro del cliente MEDIDO** — ${n.choquesDeSuministro} choque(s), ${plata(n.plataDeSuministro)}, encontrados por el motor sin que nadie le dijera qué buscar.`)
  if (fallados.length || atraidos.length) process.exitCode = 1
}

await main()
