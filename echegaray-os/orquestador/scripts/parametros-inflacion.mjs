#!/usr/bin/env node
// EL ESLABÓN QUE FALTABA: LA BASE ESCRIBE EL BLOQUE DE ÍNDICES DE "PARÁMETROS".
//
// ═══ EL DEFECTO (06/08 — B16 de la auditoría) ═══
//
// `Parámetros!A72` dice, textual: *"ÍNDICES PARA PROYECTAR — inflación mensual esperada. Lo
// actualiza el OS solo desde la web (REM del BCRA). No editar a mano: se pisa en la próxima
// corrida."*
//
// Era falso. NINGÚN script del repositorio escribía ese bloque: un grep exhaustivo sobre
// `orquestador/` encuentra cinco LECTORES (jornales, estructura, recurrentes, cash-flow y el auditor
// de reglas de oro) y cero escritores. Los números los pegó una persona el 27/07 y ahí quedaron.
//
// Mientras tanto `public.indice_economico` SÍ se refresca solo (`lib/indices-economicos.mjs`, con
// búsqueda web y vencimiento a los 7 días). O sea que el OS tenía el dato bueno y la planilla
// proyectaba con otro: julio 2,0% en la celda contra 1,8% en la base, agosto 1,8% contra 1,9%. Dos
// versiones del mismo concepto en dos caras del mismo sistema — exactamente lo que la Realidad Única
// prohíbe. Y sin un solo error a la vista.
//
// Este paso cierra el circuito: la base manda, la celda obedece, y la celda dice CUÁNDO se leyó.
//
// ═══ QUÉ NO HACE ═══
//
// No busca en la web: eso ya lo hace `actualizarIndices`, y duplicarlo sería tener dos escritores del
// mismo dato. Este script sólo BAJA lo que la base ya sabe. Si la base está vieja, lo dice en la
// columna de fuente en vez de disimularlo — una proyección declaradamente vieja es honesta; una
// proyección vieja que parece fresca, no.
//
// NO SIRVE PARA JORNALES. El jornal de obra NO sube por el IPC: sube por la paritaria. Ese cálculo
// vive en lib/motor-salarial.mjs y no mira este bloque. Acá quedan los consumidores que sí proyectan
// contra precios: Estructura, Recurrentes y el cash flow.
//
//   node orquestador/scripts/parametros-inflacion.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { ALERTA } from '../lib/glifos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const TAB = 'Parámetros'
const DRY = process.argv.includes('--dry')
/** El ancla del bloque: el rótulo de su título. NO un número de fila. */
export const ANCLA = 'ÍNDICES PARA PROYECTAR'
/** Los cinco lectores que citan `A74:C90` con la fila escrita a mano. Si el bloque se mueve, hay que tocarlos. */
export const LECTORES_CON_FILA_FIJA = [
  'scripts/jornales-pestana.mjs', 'scripts/estructura-pestana.mjs', 'scripts/recurrentes-pestana.mjs',
  'lib/cash-flow-lineas.mjs', 'scripts/auditar-reglas-de-oro.mjs',
]
/** Dónde vive hoy el bloque de datos. Es el contrato que esos cinco lectores dan por cierto. */
export const FILA_DATOS = 74
export const ENCABEZADOS = ['Mes', 'Inflación mensual', 'Factor acumulado desde hoy', 'Fuente']

/**
 * NÚCLEO PURO: ubica el bloque por su rótulo y devuelve dónde arrancan los datos.
 *
 * SI NO ESTÁ, NO SE ESCRIBE. Escribir en la fila 74 "porque siempre estuvo ahí" es exactamente el
 * defecto que rompió la pestaña de quincenas el 20/07, cuando el dueño borró tres filas de arriba y
 * el agente escribió igual en la posición vieja.
 *
 * @param {any[][]} filas `Parámetros!A1:D…`
 * @returns {{encontrado:boolean, filaTitulo:number|null, filaDatos:number|null, desplazado:boolean}}
 */
export function ubicarBloque(filas = []) {
  const i = filas.findIndex((f) => String(f?.[0] ?? '').toUpperCase().includes(ANCLA))
  if (i < 0) return { encontrado: false, filaTitulo: null, filaDatos: null, desplazado: false, largoPrevio: 0 }
  // Título, encabezados, datos: el bloque tal como está armado hoy.
  const filaDatos = i + 3
  // ═══ CUÁNTAS FILAS OCUPA HOY — Y POR QUÉ HACE FALTA SABERLO (06/08) ═══
  //
  // Medido en el dry contra el archivo real: la base tiene CINCO meses (ago–dic) y la pestaña tiene
  // SEIS (jul–dic, con julio ya vencido). Escribiendo sólo cinco filas, la sexta —la de diciembre del
  // pegado viejo— sobrevive debajo: el bloque queda con diciembre DOS VECES y las fórmulas que hacen
  // `MATCH(EOMONTH(...))` sobre A74:A90 encuentran la primera, que puede ser la vieja. Un mes
  // duplicado en la tabla de la que cuelgan cuatro proyecciones no da ningún error.
  let largoPrevio = 0
  for (let r = filaDatos - 1; r < filas.length; r++) {
    if (!(filas[r] ?? []).some((c) => String(c ?? '').trim())) break
    largoPrevio++
  }
  return { encontrado: true, filaTitulo: i + 1, filaDatos, desplazado: filaDatos !== FILA_DATOS, largoPrevio }
}

const ar = (iso) => `${Number(iso.slice(5, 7))}/1/${iso.slice(0, 4)}`

/**
 * NÚCLEO PURO: las filas del bloque, desde lo que dice la base.
 *
 * EL FACTOR ACUMULADO ES UNA FÓRMULA, NO UN NÚMERO. La primera fila vale 1 —es el mes base— y cada
 * una encadena con la de arriba. Así el bloque se puede auditar de un vistazo y, si alguien corrige
 * un porcentaje a mano para probar un escenario, el acumulado lo sigue en vez de contradecirlo.
 *
 * LA FECHA DE LECTURA VA EN LA CELDA. El dato de la base tiene un `leido_en`; sin él, un REM de hace
 * cuarenta días se lee igual que uno de ayer.
 *
 * @param {{periodo:string, variacion:number, tipo:string, fuente:string, leido_en:Date|string}[]} indices
 * @param {number} fila0 la fila donde arranca el bloque de datos
 */
export function filasBloque(indices = [], fila0 = FILA_DATOS) {
  return indices.map((x, i) => {
    const r = fila0 + i
    const dias = x.leido_en ? Math.floor((Date.now() - new Date(x.leido_en)) / 86400000) : null
    const viejo = dias !== null && dias > 35
    return [
      ar(x.periodo),
      Number(x.variacion),
      i === 0 ? 1 : `=$C$${r - 1}*(1+$B${r})`,
      `${x.tipo === 'dato' ? 'DATO publicado' : 'proyección'} · ${x.fuente ?? 'sin fuente declarada'}`
        + (dias === null ? '' : ` · leído hace ${dias} día(s)${viejo ? ` ${ALERTA} CONVIENE REFRESCARLO ANTES DE DECIDIR` : ''}`),
    ]
  })
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // Desde el mes en curso hacia adelante: el bloque proyecta, no historia. `factor_ajuste` ya ordena
  // y calcula, pero el factor se reescribe como fórmula (ver arriba).
  const { rows } = await query(
    `select periodo, variacion, tipo, fuente, leido_en
       from public.indice_economico
      where indice = 'ipc' and periodo >= to_char(now(),'YYYY-MM')
      order by periodo`,
  )
  if (!rows.length) {
    console.error('la base no tiene índices para el mes en curso ni los que vienen: corré primero la actualización de índices. NO escribo un bloque vacío.')
    process.exit(1)
  }

  const filas = await google.readSheetValues(ID, `'${TAB}'!A1:D400`).catch(() => [])
  const ubic = ubicarBloque(filas)
  if (!ubic.encontrado) {
    console.error(`no encontré el rótulo "${ANCLA}" en ${TAB}: no voy a escribir en una fila adivinada.`)
    process.exit(1)
  }
  if (ubic.desplazado) {
    // No es motivo para no escribir —el bloque es este, lo encontré por su rótulo— pero SÍ para
    // gritarlo: cinco fórmulas de otras pestañas citan A74:C90 con la fila puesta a mano.
    console.warn(`  ⚠ el bloque arranca en la fila ${ubic.filaDatos} y no en la ${FILA_DATOS}.`)
    console.warn(`     Estos citan las filas ${FILA_DATOS}:${FILA_DATOS + 16} escritas a mano y van a leer el bloque equivocado SIN dar error:`)
    for (const l of LECTORES_CON_FILA_FIJA) console.warn(`       · ${l}`)
  }

  const bloque = filasBloque(rows, ubic.filaDatos)
  console.log(`${rows.length} índice(s) desde ${rows[0].periodo} hasta ${rows[rows.length - 1].periodo} · bloque en ${TAB}!A${ubic.filaDatos} (hoy ocupa ${ubic.largoPrevio} fila/s)`)
  for (const f of bloque) console.log(`   ${String(f[0]).padStart(10)}  ${(Number(f[1]) * 100).toFixed(1)}%   ${String(f[3]).slice(0, 92)}`)
  // LA COLA DEL BLOQUE VIEJO SE LIMPIA. `VACIO` es "es mi celda y va vacía": los meses que ya pasaron
  // y quedaron del pegado anterior se van, y lo que haya escrito una persona en otra columna se
  // conserva, porque la fusión sólo limpia donde encuentra el centinela.
  const sobran = Math.max(0, ubic.largoPrevio - bloque.length)
  if (sobran) console.log(`   · limpio ${sobran} fila(s) de meses que ya pasaron: si quedan, el bloque tiene un mes dos veces`)
  for (let k = 0; k < sobran; k++) bloque.push(Array(4).fill(VACIO))
  if (DRY) return

  // El encabezado también, para que el bloque se pueda reconocer aunque alguien lo haya editado.
  const grid = [ENCABEZADOS, ...bloque]
  const r = await escribirPreservando(google, ID, `'${TAB}'`, grid, {
    fila0: ubic.filaDatos - 1, anchoHoja: 4, pestana: TAB,
  })
  if (r?.bloqueada || r?.editadaPorHumano) {
    console.log(`  🔒 "${TAB}" está bajo tu control: no escribí. El bloque queda como lo dejaste.`)
    return
  }

  // ── VERIFICAR MIRANDO LA PESTAÑA, no el request que se mandó ──
  const v = await google.readSheetValues(ID, `'${TAB}'!A${ubic.filaDatos}:D${ubic.filaDatos + bloque.length - 1}`)
  const escritas = (v ?? []).filter((f) => String(f?.[0] ?? '').trim()).length
  // Se cuenta contra los índices REALES, no contra la grilla: las filas de limpieza tienen que quedar
  // vacías, así que sumarlas daría un ⚠ cada vez que se limpia bien.
  console.log(escritas === rows.length
    ? `✓ ${escritas} fila(s) de índice en la pestaña, con su fecha de lectura a la vista`
    : `${ALERTA} escribí ${rows.length} fila(s) de índice y la pestaña devuelve ${escritas}: algo se tragó la escritura o quedó una cola vieja`)
  if (escritas !== rows.length) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
