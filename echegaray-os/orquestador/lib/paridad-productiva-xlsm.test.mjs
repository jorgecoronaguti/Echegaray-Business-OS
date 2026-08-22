// PARIDAD PRODUCTIVA CONTRA «Horas Hombre.xlsm» — cantidad → cuadrilla → tiempo → HH → productividad.
//
// El libro es un fork MÁS NUEVO (07/08/2026) de la misma planilla de la que salieron las 199 tareas
// que hoy tiene la base (`Planilla para Cotizar (2).xlsm`, 27/05/2026). Eso hace que la comparación
// valga: los números esperados de acá se leyeron del libro nuevo y los que contesta el OS se
// calculan sobre lo cargado del libro viejo. Si coinciden, coinciden por dos caminos distintos.
//
// QUÉ DEFECTO ATRAPA CADA BLOQUE:
//
//   A · el catálogo. Si alguien toca las líneas de mano de obra de una tarea, o cambia cómo
//       `estandar_productivo` suma las HH, el número deja de coincidir con el papel del dueño.
//       A3 es el opuesto: fija la ÚNICA divergencia real entre los dos forks (T1107.1) para que
//       nadie la «arregle» copiando el fork nuevo sin que el dueño lo decida.
//   B · la siembra. Si se revierte `sembrar-evidencia-hh-xlsm.mjs`, o si se le cuelga una
//       `tarea_tipo` o una `obra_id` que el libro no dice, esto se pone rojo.
//   C · la jornada. `produccion_diaria` y `duracion_dias` reciben la jornada como PARÁMETRO con
//       default 8. Si alguien cambia el default a los 7,5 h del libro —que es una decisión del
//       dueño, no un detalle— C1 se pone rojo y la obliga a ser explícita.
//
// TIEMPO DE OBRA = DÍAS es INFERENCIA FUERTE, no un hecho probado: ninguna fórmula del libro
// consume esa columna. Los tests de B que dependen de eso lo dicen en su nombre.
import test from 'node:test'
import assert from 'node:assert/strict'
import { query, getPool } from './db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

const FUENTE = 'xlsm-horas-hombre'
const JORNADA_LIBRO_COSTEO = 8      // `MO Lu-Vi 8 a 16` — con la que se derivaron las HH sembradas
const JORNADA_DIAGRAMACION = 7.5    // `DIAGRAMACION!D4` — con la que el libro calcula jornadas

// El análisis dice las horas por RECURSO; la cuadrilla tipo, por CATEGORÍA. Hoy son dos vocabularios
// que no están vinculados en la base: el puente es el nombre, y se declara acá en vez de suponerse.
// `medio_oficial` no tiene recurso de mano de obra: el libro no lo usa.
const RECURSO_A_CATEGORIA = { 0: 'oficial_especializado', 1: 'oficial', 2: 'ayudante' }

// ═══ Lo que dice el papel. Copiado de fixtures-productivos.json (§8 de HH-PRODUCTIVO.md), que a su
// vez lo recalculó línea a línea contra los valores cacheados del XLSM: 8/8 con dif ≤ $0,01.
// `costo` es el total del bloque en el libro; la base guarda más decimales, de ahí la tolerancia.
const CATALOGO = [
  { cod: 'T1001', un: 'M2', hh: 0.12, cat: { oficial: 0.06, ayudante: 0.06 }, costo: 1219.74 },
  { cod: 'T1002', un: 'M3', hh: 3.4, cat: { oficial: 0.5, ayudante: 2.9 }, costo: 31047.30 },
  { cod: 'T1075', un: 'M2', hh: 5.0, cat: { oficial_especializado: 2.8, ayudante: 2.2 }, costo: 110229.42 },
  { cod: 'T1075.2', un: 'UN', hh: 44, cat: { oficial_especializado: 32, ayudante: 12 }, costo: 1051505 },
  { cod: 'T1123', un: 'M2', hh: 1.7, cat: { oficial: 0.7, ayudante: 1.0 }, costo: 21864.21 },
]
// Tolerancia de costo: el libro muestra 2 decimales y la base guarda el costo con desperdicio
// completo (110229,4115 contra 110229,42). Un centavo es exactamente ese redondeo y nada más.
const TOL_COSTO = 0.01

// Las 9 ejecuciones observadas. `dias` y la cuadrilla son el dato CRUDO de la hoja; `hh` y `hsUn`
// son lo que el fixture derivó, y es lo que el OS tiene que reproducir por su cuenta.
const CAMPO = [
  { celda: 'A2:G2', tarea: 'PINTURA DE CORREAS', of: 1, ay: 2, cant: 25, dias: 6, hh: 144, hsUn: 5.760 },
  { celda: 'A3:G3', tarea: 'PINTURA DE CORREAS', of: 2, ay: 4, cant: 46, dias: 6, hh: 288, hsUn: 6.261 },
  { celda: 'A4:G4', tarea: 'COLOCACION DE CORREAS DE TECHO', of: 3, ay: 3, cant: 24, dias: 5, hh: 240, hsUn: 10.000 },
  { celda: 'A5:G5', tarea: 'MONTAJE DE VM', of: 2, ay: 2, cant: 16, dias: 8, hh: 256, hsUn: 16.000 },
  { celda: 'A6:G6', tarea: 'MONTAJE DE CMP - 6M', of: 4, ay: 2, cant: 10, dias: 6, hh: 288, hsUn: 28.800 },
  { celda: 'A7:G7', tarea: 'pintura de CMP - 6M', of: 2, ay: 4, cant: 9, dias: 6, hh: 288, hsUn: 32.000 },
  { celda: 'A8:G8', tarea: 'MONTAJE DE VM', of: 1, ay: 3, cant: 8, dias: 6, hh: 192, hsUn: 24.000 },
  { celda: 'A10:H10', tarea: 'ARMADO DE CORREAS', of: 1, ay: 1, cant: 35, dias: 8, hh: 128, hsUn: 3.657 },
  { celda: 'A11:G11', tarea: 'MONTAJE DE CMP - 6M', of: 2, ay: 2, cant: 8, dias: 8, hh: 256, hsUn: 32.000 },
]

const num = (x) => (x === null || x === undefined ? null : Number(x))
const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerancia ${tol})`)

test('paridad productiva contra Horas Hombre.xlsm', { skip: !hayBase }, async (t) => {
  const estandar = new Map((await query(
    `select codigo, unidad, hh_por_unidad::float8 hh, rendimiento_unidades_por_hh::float8 rend,
            costo_unitario::float8 costo, capacidad_ponderada::float8 cap,
            produccion_diaria_referencia::float8 pd, sin_cuadrilla_declarada
       from public.estandar_productivo`)).rows.map((r) => [r.codigo, r]))

  const lineas = (await query(
    `select t.codigo, r.codigo rec, l.cantidad::float8 cant
       from public.analisis a
       join public.tarea_tipo t on t.id = a.tarea_tipo_id
       join public.analisis_linea l on l.analisis_id = a.id
       join public.recurso r on r.id = l.recurso_id
      where a.vigente and r.tipo = 'mano_obra'`)).rows
  const porCategoria = (cod) => Object.fromEntries(lineas.filter((l) => l.codigo === cod)
    .map((l) => [RECURSO_A_CATEGORIA[l.rec] ?? `recurso_${l.rec}`, l.cant]))

  await t.test('A1 · las HH por unidad y el costo del catálogo coinciden con el libro', () => {
    for (const c of CATALOGO) {
      const e = estandar.get(c.cod)
      assert.ok(e, `${c.cod} no está en estandar_productivo`)
      assert.equal(e.unidad, c.un, `${c.cod}: unidad distinta`)
      assert.equal(e.hh, c.hh, `${c.cod}: HH por unidad`)
      cerca(e.rend, Number((1 / c.hh).toFixed(4)), 1e-9, `${c.cod}: rendimiento (inversa de HH)`)
      cerca(e.costo, c.costo, TOL_COSTO, `${c.cod}: costo unitario`)
    }
  })

  await t.test('A2 · las HH están abiertas POR CATEGORÍA, no en un solo bulto', () => {
    for (const c of CATALOGO) {
      assert.deepEqual(porCategoria(c.cod), c.cat, `${c.cod}: la descomposición por categoría no es la del libro`)
      const suma = Object.values(c.cat).reduce((a, b) => a + b, 0)
      cerca(suma, c.hh, 1e-9, `${c.cod}: las categorías no suman las HH publicadas`)
    }
  })

  await t.test('A3 · T1107.1 DIFIERE entre forks, y difiere exactamente en lo declarado', () => {
    // El fork nuevo puso el ayudante y las dos cargas sociales en cero y bajó el helicóptero de
    // 0,015 a 0,01 DIA/m². La base sigue con el fork viejo A PROPÓSITO: adoptar el nuevo es
    // decisión del dueño (cambia el costo directo de $17.550,90 a $6.066,00 por m²).
    const e = estandar.get('T1107.1')
    assert.equal(e.hh, 1.6, 'la base ya no tiene las HH del fork viejo: ¿se adoptó el fork nuevo sin decidirlo?')
    assert.deepEqual(porCategoria('T1107.1'), { oficial: 0.9, ayudante: 0.7 })
    cerca(e.costo, 17550.90, TOL_COSTO, 'T1107.1: costo del fork viejo')
    assert.notEqual(e.hh, 0.9, 'el fork nuevo dice 0,9 HH/m²; si la base ya lo dice, la decisión se tomó y este test hay que rehacerlo')
  })

  await t.test('A4 · el libro NO evidencia cuadrilla tipo: la producción diaria es NULL, no cero', () => {
    for (const c of [...CATALOGO.map((x) => x.cod), 'T1107.1']) {
      const e = estandar.get(c)
      assert.equal(e.sin_cuadrilla_declarada, true,
        `${c} tiene cuadrilla tipo declarada: el XLSM no la da (DIAGRAMACION tiene 2/2, 1/1 y 3/2 pero su tarea es #REF!)`)
      assert.equal(e.pd, null, `${c}: sin cuadrilla, la producción diaria tiene que ser NULL — «sin dato» no es «no produce»`)
    }
  })

  const campo = (await query(
    `select composicion, cantidad::float8 cantidad, hh_reales::float8 hh, hs_unitarias::float8 hs_un,
            unidad, tarea_tipo_id, obra_id, hh_improductivas::float8 improd
       from public.rendimiento_historico where fuente = $1`, [FUENTE])).rows
  const porCelda = new Map(campo.map((r) => [String(r.composicion.origen).split('!')[1]?.split(' ')[0], r]))

  await t.test('B1 · están las 9 observaciones sembradas, sin obra y sin tarea inventadas', () => {
    assert.equal(campo.length, 9,
      `hay ${campo.length} observaciones con fuente ${FUENTE}: la siembra no está aplicada o se duplicó`)
    for (const c of CAMPO) {
      const r = porCelda.get(c.celda)
      assert.ok(r, `falta la observación de DESCRIPCION DE TAREAS!${c.celda}`)
      assert.equal(r.obra_id, null, `${c.celda}: se le puso una obra que la hoja no nombra`)
      assert.equal(r.tarea_tipo_id, null,
        `${c.celda}: se la colgó de una tarea del catálogo — «${c.tarea}» no existe ahí y su unidad tampoco`)
      assert.equal(r.composicion.tiempo.unidad, 'dias')
      assert.equal(r.composicion.tiempo.confianza, 'inferida-fuerte',
        `${c.celda}: TIEMPO DE OBRA en días es inferencia, y tiene que seguir diciéndolo`)
    }
  })

  await t.test('B2 · [TIEMPO=días, inferido] HH = personas × días × jornada, reconstruido del crudo', () => {
    for (const c of CAMPO) {
      const r = porCelda.get(c.celda)
      const { cuadrilla, tiempo, jornada_horas: jornada } = r.composicion
      assert.equal(cuadrilla.oficial, c.of, `${c.celda}: oficiales observados`)
      assert.equal(cuadrilla.ayudante, c.ay, `${c.celda}: ayudantes observados`)
      assert.equal(tiempo.valor, c.dias, `${c.celda}: TIEMPO DE OBRA`)
      assert.equal(jornada, JORNADA_LIBRO_COSTEO, `${c.celda}: la jornada con la que se derivó tiene que estar escrita`)
      const personas = cuadrilla.oficial + cuadrilla.ayudante
      assert.equal(personas * tiempo.valor * jornada, c.hh, `${c.celda}: HH reconstruidas del crudo`)
      assert.equal(r.hh, c.hh, `${c.celda}: HH guardadas`)
      assert.equal(r.cantidad, c.cant, `${c.celda}: cantidad observada`)
      assert.equal(r.improd, 0, `${c.celda}: la hoja no observó horas improductivas`)
    }
  })

  await t.test('B3 · Postgres calcula la productividad, y da la del fixture', async () => {
    for (const c of CAMPO) {
      const r = porCelda.get(c.celda)
      // hs_unitarias es columna GENERADA: la calcula la base, no el importador. Tolerancia 0,001
      // porque el fixture publica 3 decimales (6,261 contra 6,26086…).
      cerca(r.hs_un, c.hsUn, 0.001, `${c.celda}: HH por unidad observadas`)
      cerca(r.hs_un, c.hh / c.cant, 0.0006, `${c.celda}: la generada no es HH/cantidad`)
    }
  })

  await t.test('B4 · [TIEMPO=días, inferido] duracion_dias devuelve los días que anotó la hoja', async () => {
    for (const c of CAMPO) {
      const r = porCelda.get(c.celda)
      const personas = c.of + c.ay
      // Se le pasa la DOTACIÓN (cabezas), no la capacidad ponderada del OS: el libro cuenta
      // personas, no las pondera por categoría. Mezclar las dos cosas daría otro número y sería
      // comparar dos definiciones distintas de «cuadrilla».
      const [{ dias }] = (await query('select public.duracion_dias($1, $2, $3)::float8 dias',
        [r.hh, personas, JORNADA_LIBRO_COSTEO])).rows
      assert.equal(num(dias), c.dias, `${c.celda}: el OS no reconstruye el TIEMPO DE OBRA`)
    }
  })

  await t.test('B5 · el círculo cierra: producción diaria × días = la cantidad observada', async () => {
    for (const c of CAMPO) {
      const r = porCelda.get(c.celda)
      const personas = c.of + c.ay
      const [{ pd }] = (await query('select public.produccion_diaria($1, $2, $3)::float8 pd',
        [r.hs_un, personas, JORNADA_LIBRO_COSTEO])).rows
      // produccion_diaria redondea a 3 decimales: sobre `dias` días el error acumulado no puede
      // pasar de 0,0005 × días. La tolerancia es ese redondeo, no un margen de comodidad.
      cerca(num(pd) * c.dias, c.cant, 0.0005 * c.dias + 1e-9,
        `${c.celda}: cantidad → cuadrilla → tiempo → HH → productividad no vuelve a la cantidad`)
    }
  })

  await t.test('C1 · la jornada es parámetro y el default sigue siendo 8, no los 7,5 del libro', async () => {
    const [{ conDefault, con75, con8 }] = (await query(
      `select public.produccion_diaria(2, 3)::float8       "conDefault",
              public.produccion_diaria(2, 3, $1)::float8   "con75",
              public.produccion_diaria(2, 3, 8)::float8    "con8"`, [JORNADA_DIAGRAMACION])).rows
    assert.equal(num(conDefault), num(con8), 'el default de produccion_diaria dejó de ser 8')
    assert.notEqual(num(conDefault), num(con75),
      'el default pasó a los 7,5 h de DIAGRAMACION: eso es una decisión del dueño, no un cambio de default')
    cerca(num(con75), (3 * 7.5) / 2, 1e-9, 'con jornada explícita no da capacidad × jornada ÷ HH')
  })

  await t.test('C2 · el motor de DIAGRAMACION: jornadas = HH ÷ (personas × 7,5)', async () => {
    // La línea viva de la cotización ORICA: 2.144 m² de T1107.1 a 0,9 hs/m² de oficial = 1.929,6 HH.
    // El libro las convierte en jornadas con `Q8 =MAX(N8/(L8*D4), O8/(M8*D4))` y D4 = 7,5.
    const hhOficial = 2144 * 0.9
    cerca(hhOficial, 1929.6, 1e-9, 'las HH de oficial de la línea ORICA')
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const [{ dias }] = (await query('select public.duracion_dias($1, $2, $3)::float8 dias',
        [hhOficial, n, JORNADA_DIAGRAMACION])).rows
      assert.equal(num(dias), Math.ceil(hhOficial / (n * JORNADA_DIAGRAMACION)),
        `con ${n} oficiales el OS no reproduce la Q8 del libro`)
    }
  })

  await t.test('C3 · duracion_dias y produccion_diaria hablan de lo mismo con cualquier jornada', async () => {
    for (const j of [7, JORNADA_DIAGRAMACION, JORNADA_LIBRO_COSTEO]) {
      for (const { hs, cant, cap } of [{ hs: 0.9, cant: 2144, cap: 3 }, { hs: 5, cant: 400, cap: 4 }, { hs: 44, cant: 12, cap: 2 }]) {
        const [{ pd }] = (await query('select public.produccion_diaria($1, $2, $3)::float8 pd', [hs, cap, j])).rows
        const teorico = (hs * cant) / (cap * j)
        // Relativo 1e-3: el único desvío posible es el redondeo a 3 decimales de produccion_diaria.
        cerca(cant / num(pd), teorico, teorico * 1e-3, `jornada ${j}, ${hs} hs/un: las dos funciones no coinciden`)
      }
    }
  })
})

test('cierre del pool', { skip: !hayBase }, async () => { await getPool().end() })
