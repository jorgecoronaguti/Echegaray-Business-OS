#!/usr/bin/env node
// SEMBRAR LA EVIDENCIA PRODUCTIVA DE «Horas Hombre.xlsm» — idempotente, y sin inventar el resto.
//
// El libro es un fork MÁS NUEVO (07/08/2026) de la misma planilla de la que ya salieron las 199
// tareas del catálogo (`Planilla para Cotizar (2).xlsm`, snapshot 27/05/2026). Casi todo lo que
// trae ya está en la base. Lo que NO estaba y sí es evidencia son dos cosas, y son las dos que
// siembra este script:
//
//   1. Las 9 EJECUCIONES REALES observadas en la hoja oculta `DESCRIPCION DE TAREAS`: tarea,
//      sección, cuadrilla por categoría, equipos, cantidad y tiempo de obra. Redactadas en pasado
//      («3 acomodaban y punteaban 3 resoldaban») y con una persona nombrada («Walter y maquina»):
//      son observación, no plantilla. Ninguna fórmula del libro las consume — nadie las usó nunca.
//   2. Los COMENTARIOS DE CAMPO de la hoja `Análisis` que dicen bajo qué condición vale ese
//      rendimiento («se arena 500 m2 en 7 dias», «8 horas en cortar y puntear cada correa»). Van a
//      `analisis.contexto`, que es exactamente su casillero y está vacío en las 199 filas.
//
// ═══ LO QUE ESTE SCRIPT NO SIEMBRA, Y POR QUÉ ═══
//
//   · `analisis_cuadrilla` — NADA. El libro no dice con cuánta gente se midió ninguna tarea del
//     catálogo. `DIAGRAMACION` tiene las cuadrillas (2/2, 1/1, 3/2) pero su columna de tarea es
//     `#REF!`: son tres cuadrillas huérfanas. Colgarlas de una tarea sería elegirla a dedo.
//   · El catálogo del fork nuevo (precios y cantidades). 191 de 200 bloques son idénticos a la
//     base; adoptar los 9 que difieren es DECISIÓN DEL DUEÑO, no un import.
//   · Las 9 observaciones NO se cuelgan de una `tarea_tipo`: «PINTURA DE CORREAS», «MONTAJE DE VM»
//     y «MONTAJE DE CMP» no existen en el catálogo, y sus unidades (correa, viga, columna) no son
//     las de ninguna tarea. Colgarlas de la más parecida contaminaría el estándar de esa tarea.
//   · Sin `obra_id`: la hoja no nombra la obra ni la fecha. Por los elementos (correas PNC, VM,
//     CMP 320x400) es obra de naves metálicas, y eso NO alcanza para elegir un cliente.
//
// Uso:  node orquestador/scripts/sembrar-evidencia-hh-xlsm.mjs [--dry]
import { query, closePool } from '../lib/db.mjs'

const LIBRO = 'Horas Hombre.xlsm'
const FUENTE = 'xlsm-horas-hombre'
const INGESTA = '2026-08-22'

// ═══ LA JORNADA CON LA QUE SE CONVIERTE TIEMPO EN HH ═══
// El libro convive con tres jornadas: 8 h en el costeo laboral (`MO Lu-Vi 8 a 16`), 7,5 h en
// `DIAGRAMACION` y 7 h en `ALAMBRADO`. Acá se usa 8 porque es la del COSTEO FORMAL DEL PROPIO LIBRO
// («MO Lu-Vi 8 a 16»): esta cifra convierte el tiempo que dice el Excel, así que tiene que ser la del
// Excel y no la del OS. NO es `obra_canonica.jornada_horas` —que desde el 27/08 vale 8,8, la jornada
// real del dueño (ver lib/jornada-uocra.mjs)— y confundirlas reescribiría la evidencia sembrada con
// una jornada que su fuente no usó. Queda escrita en `composicion.jornada_horas` de cada fila: quien
// decida que rige otra no tiene que volver al Excel, reconvierte multiplicando.
const JORNADA = 8

// ═══ TIEMPO DE OBRA = DÍAS ═══
// NINGUNA fórmula del libro consume esa columna, así que la unidad no se puede probar por cadena de
// fórmulas. Es INFERENCIA FUERTE por triangulación: todo tiempo transcurrido del libro se mide en
// jornadas; y leído en horas, colocar 24 correas PNC140 con 6 personas daría 1,25 HH por correa
// contra las 8 h que el comentario de T1110 declara sólo para cortar y puntear una. Va declarado en
// cada fila y en `condiciones`, no escondido en la cuenta.
const CONFIANZA_TIEMPO = 'inferida-fuerte'

/** Las 9 ejecuciones observadas. `dias` es la columna «TIEMPO DE OBRA» tal cual, sin convertir. */
const OBSERVACIONES = [
  { celda: 'A2:G2', tarea: 'PINTURA DE CORREAS', seccion: 'CORREAS PNC 80',
    ayudante: 2, oficial: 1, equipos: [], cantidad: 25, unidad: 'correa', dias: 6 },
  { celda: 'A3:G3', tarea: 'PINTURA DE CORREAS', seccion: 'PNC 140',
    ayudante: 4, oficial: 2, equipos: [], cantidad: 46, unidad: 'correa', dias: 6 },
  { celda: 'A4:G4', tarea: 'COLOCACION DE CORREAS DE TECHO, 3 ACOMODABAN Y PUNTEABAN 3 RESOLDABAN',
    seccion: 'PNC 140', ayudante: 3, oficial: 3, equipos: ['PLATAFORMA 4X4', 'ANDAMIO'],
    cantidad: 24, unidad: 'correa', dias: 5 },
  { celda: 'A5:G5', tarea: 'MONTAJE DE VM', seccion: 'VM 460',
    ayudante: 2, oficial: 2, equipos: ['GRUA', 'AUTOELEVADOR'], cantidad: 16, unidad: 'viga', dias: 8 },
  { celda: 'A6:G6', tarea: 'MONTAJE DE CMP - 6M', seccion: '320x400',
    ayudante: 2, oficial: 4, equipos: ['GRUA'], cantidad: 10, unidad: 'columna', dias: 6 },
  { celda: 'A7:G7', tarea: 'pintura de CMP - 6M', seccion: '320x400',
    ayudante: 4, oficial: 2, equipos: ['ANDAMIO'], cantidad: 9, unidad: 'columna', dias: 6 },
  { celda: 'A8:G8', tarea: 'MONTAJE DE VM', seccion: 'PNC 200',
    ayudante: 3, oficial: 1, equipos: ['TIJERA 4X4'], cantidad: 8, unidad: 'viga', dias: 6 },
  { celda: 'A10:H10', tarea: 'ARMADO DE CORREAS', seccion: 'PNC 80',
    ayudante: 1, oficial: 1, equipos: ['máquina (sin especificar)'], cantidad: 35, unidad: 'correa',
    dias: 8, nota: 'columna H: «Walter y maquina» — persona real identificada en la observación' },
  { celda: 'A11:G11', tarea: 'MONTAJE DE CMP - 6M', seccion: 'PNC 200',
    ayudante: 2, oficial: 2, equipos: ['TIJERA 4X4'], cantidad: 8, unidad: 'columna', dias: 8 },
  // La fila 9 (MONTAJE DE VM · PNC 150) queda AFUERA: tiene tarea y sección y nada más — sin
  // cuadrilla, sin cantidad y sin tiempo. Una fila abandonada a mitad de carga no es una medición.
]

/** Comentarios de `Análisis` que declaran RENDIMIENTO o CONDICIÓN, por código de tarea.
 *  Quedan afuera a propósito los cinco «Precio segun Sabina e Hijo de Daniel 1500 $/m2 1/8/2020…»
 *  (son procedencia de PRECIO: su casillero es recurso_precio, no el contexto productivo), los tres
 *  garabatos numéricos sobre celdas de cantidad (E937, E972, E973: «0,004», «0,3»), el que nombra
 *  un producto de UNA LÍNEA (C625, «SEPARADOR DE MINGITORIOS» → sería analisis_linea.nota) y el de
 *  T1107.5, cuya tarea no existe en la base. */
const CONTEXTOS = [
  { codigo: 'T1008', celda: 'C66', autor: 'Rodrigo Echegaray',
    texto: 'Los fierreros cobran el 45% de lo que pesa una barra.' },
  { codigo: 'T1045', celda: 'C474', autor: 'Rodrigo Echegaray', texto: '10 cm de espesor' },
  { codigo: 'T1075', celda: 'C735', autor: 'Rodrigo Echegaray',
    texto: 'Se arman 13 correas por dia por soldador. Se pinta 13 correas por dia (tarro de 20 litros rinde 26 correas terminadas).' },
  { codigo: 'T1094', celda: 'C874', autor: 'Rodrigo Echegaray',
    texto: 'COLUMNAS CONFORMADAS CON 4 PERFILES Y VAN CADA 5M' },
  { codigo: 'T1099', celda: 'C908', autor: 'Ing Echegaray', texto: 'EN TERRENO NATURAL' },
  { codigo: 'T1103', celda: 'C934,C935', autor: 'Ing Echegaray',
    texto: 'Se arena 500 m2 en 7 dias (30 horas segun odometro de moto compresor). NO CONTEMPLA APLICACION DE PINTURA, 3 MANOS. Rendimiento 30 m2 dia.' },
  { codigo: 'T1103.1', celda: 'C942', autor: 'Ing Echegaray',
    texto: 'Se arena 500 m2 en 7 dias (30 horas segun odometro de moto compresor).' },
  { codigo: 'T1103.3', celda: 'C957,C958', autor: 'Ing Echegaray',
    texto: 'Se arena 500 m2 en 7 dias (30 horas segun odometro de moto compresor). NO CONTEMPLA APLICACION DE PINTURA, 3 MANOS. Rendimiento 30 m2 dia.' },
  { codigo: 'T1103.4', celda: 'C963,C964', autor: 'Ing Echegaray',
    texto: 'Se arena 500 m2 en 7 dias (30 horas segun odometro de moto compresor). NO CONTEMPLA APLICACION DE PINTURA, 3 MANOS. Rendimiento 30 m2 dia.' },
  { codigo: 'T1105', celda: 'C993', autor: 'Ing Echegaray', texto: 'Para bases de piletas de JyVA' },
  { codigo: 'T1110', celda: 'C1062', autor: 'Ing Echegaray',
    texto: 'APROX 8 HORAS EN CORTAR Y PUNTEAR cada correa; 12 hr resoldar las 3 correas, 132 cordones de 10cm.' },
  { codigo: 'T1167', celda: 'C1660', autor: 'Rodrigo Echegaray',
    texto: 'Se arman 13 correas por dia por soldador. Se pinta 13 correas por dia (tarro de 20 litros rinde 26 correas terminadas).' },
]

export const EVIDENCIA_HH = { LIBRO, FUENTE, INGESTA, JORNADA, CONFIANZA_TIEMPO, OBSERVACIONES, CONTEXTOS }

/** «Horas Hombre.xlsm · DESCRIPCION DE TAREAS!A2:G2 · ingesta 2026-08-22» — mismo formato que
 *  recurso.origen y tarea_tipo.origen, y clave de idempotencia de la siembra. */
const origenDe = (o) => `${LIBRO} · DESCRIPCION DE TAREAS!${o.celda} · ingesta ${INGESTA}`

function filaDe(o) {
  const personas = o.ayudante + o.oficial
  return {
    origen: origenDe(o),
    unidad: o.unidad,
    cantidad: o.cantidad,
    // HH = personas × días × jornada. Es un DERIVADO de dos declaraciones, no un dato medido: la
    // hoja anotó gente y tiempo, nunca horas. Las dos declaraciones viajan en `composicion` para
    // que cualquiera lo rehaga con otra jornada.
    hh_reales: personas * o.dias * JORNADA,
    composicion: {
      origen: origenDe(o),
      tarea_observada: o.tarea,
      detalle_seccion: o.seccion,
      cuadrilla: { ayudante: o.ayudante, oficial: o.oficial },
      personas,
      equipos: o.equipos,
      tiempo: { valor: o.dias, unidad: 'dias', confianza: CONFIANZA_TIEMPO },
      jornada_horas: JORNADA,
      unidad_implicita: true,
      ...(o.nota ? { nota: o.nota } : {}),
    },
    condiciones: [
      `Ejecución real observada en «${LIBRO}», hoja oculta DESCRIPCION DE TAREAS!${o.celda}.`,
      `Tarea observada: ${o.tarea} — ${o.seccion}.`,
      `Cuadrilla ${o.ayudante} ayudante(s) + ${o.oficial} oficial(es)` +
        (o.equipos.length ? `, equipos: ${o.equipos.join(', ')}.` : ' (sin equipo anotado).'),
      `TIEMPO DE OBRA = ${o.dias}; la unidad DÍAS es inferencia fuerte (${CONFIANZA_TIEMPO}): ninguna` +
        ' fórmula del libro consume esa columna.',
      `HH = ${personas} personas × ${o.dias} días × ${JORNADA} h/jornada — derivado, no medido.`,
      'OBRA NO IDENTIFICADA: la hoja no la nombra ni la fecha. Por los elementos es obra de naves' +
        ' metálicas; eso no alcanza para elegir un cliente.',
      'hh_improductivas = 0 significa NO SE OBSERVARON, no que no hubo.',
      o.nota ?? '',
    ].filter(Boolean).join(' '),
  }
}

async function sembrarObservaciones(dry) {
  const res = { insertadas: 0, actualizadas: 0, sinCambio: 0 }
  for (const o of OBSERVACIONES) {
    const f = filaDe(o)
    const { rows } = await query(
      `select id, cantidad::float8 cantidad, hh_reales::float8 hh_reales
         from public.rendimiento_historico
        where fuente = $1 and composicion ->> 'origen' = $2`, [FUENTE, f.origen])
    if (rows.length > 1) throw new Error(`${f.origen} está cargado ${rows.length} veces: hay que conciliar antes de re-sembrar`)
    if (dry) { res[rows.length ? 'actualizadas' : 'insertadas']++; continue }
    if (!rows.length) {
      await query(
        `insert into public.rendimiento_historico
           (unidad, cantidad, hh_reales, hh_improductivas, composicion, condiciones, fuente)
         values ($1, $2, $3, 0, $4, $5, $6)`,
        [f.unidad, f.cantidad, f.hh_reales, JSON.stringify(f.composicion), f.condiciones, FUENTE])
      res.insertadas++
      continue
    }
    const igual = rows[0].cantidad === f.cantidad && rows[0].hh_reales === f.hh_reales
    await query(
      `update public.rendimiento_historico
          set unidad = $2, cantidad = $3, hh_reales = $4, composicion = $5, condiciones = $6
        where id = $1`,
      [rows[0].id, f.unidad, f.cantidad, f.hh_reales, JSON.stringify(f.composicion), f.condiciones])
    res[igual ? 'sinCambio' : 'actualizadas']++
  }
  return res
}

async function sembrarContextos(dry) {
  const res = { escritos: 0, yaTenia: [], sinTarea: [] }
  for (const c of CONTEXTOS) {
    const texto = `${c.texto} [${LIBRO} · Análisis!${c.celda} · ${c.autor}]`
    const { rows } = await query(
      `select a.id, a.contexto from public.analisis a
         join public.tarea_tipo t on t.id = a.tarea_tipo_id
        where a.vigente and t.codigo = $1`, [c.codigo])
    if (!rows.length) { res.sinTarea.push(c.codigo); continue }
    // NUNCA se pisa un contexto ya escrito: lo que editó una persona manda sobre lo que importa un
    // script. Si difiere, se informa y se deja como está.
    if (rows[0].contexto !== null && rows[0].contexto !== texto) { res.yaTenia.push(c.codigo); continue }
    if (rows[0].contexto === texto) { res.escritos++; continue }
    if (!dry) await query(`update public.analisis set contexto = $2 where id = $1`, [rows[0].id, texto])
    res.escritos++
  }
  return res
}

async function verificar() {
  const { rows: obs } = await query(
    `select count(*)::int n, count(*) filter (where tarea_tipo_id is null)::int sin_tarea,
            count(*) filter (where obra_id is null)::int sin_obra,
            sum(hh_reales)::float8 hh, sum(cantidad)::float8 cant
       from public.rendimiento_historico where fuente = $1`, [FUENTE])
  const { rows: ctx } = await query(
    `select count(*)::int n from public.analisis where vigente and contexto like $1`, [`%${LIBRO}%`])
  return { observaciones: obs[0], contextos: ctx[0].n }
}

const dry = process.argv.includes('--dry')
if (dry) console.log('— DRY RUN: no se escribe nada —')
const o = await sembrarObservaciones(dry)
const c = await sembrarContextos(dry)
console.log(`observaciones: ${o.insertadas} insertadas · ${o.actualizadas} actualizadas · ${o.sinCambio} sin cambio`)
console.log(`contextos: ${c.escritos} escritos de ${CONTEXTOS.length}` +
  (c.yaTenia.length ? ` · ${c.yaTenia.length} ya tenían contexto propio y NO se pisaron: ${c.yaTenia.join(', ')}` : '') +
  (c.sinTarea.length ? ` · sin tarea en la base: ${c.sinTarea.join(', ')}` : ''))
console.log('relectura:', JSON.stringify(await verificar()))
await closePool()
