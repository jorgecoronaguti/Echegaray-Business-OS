// «MÁS → RECIBOS»: EL RECIBO DEL ESTUDIO DE CADA PERSONA, SU PDF Y EL BANCO QUE PUBLICA EL CUADRO.
//
// Dueño, 14/09/2026: *«la sección recibos de liquidación de hs no está mejorada, rota»*. Lo que pide:
// ver y abrir el recibo de sueldo de cada persona en la quincena elegida.
//
// ═══ LOS DEFECTOS, MEDIDOS EN LA BASE EL 14/09/2026 ═══
//
//   · El giro se buscaba con el concepto `'sueldo'`; el cuadro, con `'QUINCENA'`. En `nomina_adelanto`
//     sólo existen `QUINCENA` y `LIQUIDACION_FINAL`: de los 19 recibos Q2-08/2026, 14 tienen su giro
//     con `QUINCENA` y 0 con `sueldo`. Con extracto importado, todo el plantel salía «sin movimiento».
//   · El PDF se buscaba en `recibo_empleado` (1 fila, sin archivo) y la pantalla decía que no había
//     recibos. Están en `documentacion_legajo` (`recibo_sueldo`), con el período en el nombre del
//     archivo: 19 en 2026-08 Q2, 21 en 2026-08 Q1.
//   · La lista se cortaba en 8 personas y no mostraba lo que el cuadro publica por banco.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CONCEPTO_DEL_GIRO, girosDe } from './liquidacionCuadros.ts'
import {
  archivosDeLaQuincena, avisoDeRecibos, filasDeRecibos, recibosFueraDelCuadro, totalesDeRecibos, type LineaParaRecibo,
} from './recibosDeLaQuincena.ts'
import { periodoDelNombre, REGEX_DEL_PERIODO } from '../../empleado/services/periodoDelRecibo.ts'
import { filasDelEspejo, totalesDelEspejo, type DatosDelEspejo } from './espejoDeJornales.ts'
import { quincenaDe } from './quincena.ts'
import type { LineaConOverrides } from './liquidacionOverrides.ts'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

const AGUERO = '1ff87d94-0b78-4308-aff5-e0f4c6fbd553'
const CUIL_AGUERO = '20294271067'

test('Aguero Q2-08/2026: el giro de $215.564,62 con concepto QUINCENA es el giro del recibo', () => {
  const q = quincenaDe('2026-08-16')
  const adelantos = [{ cuil: CUIL_AGUERO, fecha: '2026-08-31', importe: 215564.62, concepto: 'QUINCENA' }]
  assert.equal(CONCEPTO_DEL_GIRO.obreros, 'QUINCENA')
  assert.equal(CONCEPTO_DEL_GIRO.final, 'LIQUIDACION_FINAL')
  assert.equal(girosDe(q, adelantos, CUIL_AGUERO, CONCEPTO_DEL_GIRO.obreros, 215564.62).giroEnElLote, true)
})

test('Recibos no escribe el concepto a mano: usa la misma constante que el cuadro', () => {
  const eslabones = fuente('./eslabonesLegajoService.ts')
  const cuadros = fuente('./liquidacionCuadros.ts')
  // EL DEFECTO QUE ATRAPA: dos strings sueltos que divergen. Con `'sueldo'` nada aparecía girado.
  assert.ok(!/'sueldo'/.test(eslabones), 'el servicio de Recibos no busca el concepto «sueldo»')
  assert.ok(!/girosDe\([^)]*'(QUINCENA|LIQUIDACION_FINAL|sueldo)'/.test(eslabones + cuadros), 'ningún girosDe con el concepto escrito a mano')
  assert.match(cuadros, /export const CONCEPTO_DEL_GIRO/)
})

test('el período sale del NOMBRE del archivo, como en «Mis recibos»', () => {
  assert.deepEqual(periodoDelNombre('Recibo 2026-08 Q2 · AGUERO CRISTIAN.pdf'), { periodo: '2026-08', quincena: '2' })
  assert.deepEqual(periodoDelNombre('Recibo 2026-03 · PEREZ JUAN Q1.pdf'), { periodo: '2026-03', quincena: '1' })
  // SIN PERÍODO EN EL NOMBRE NO SE INVENTA UNA QUINCENA.
  assert.equal(periodoDelNombre('recibo escaneado.pdf'), null)
  assert.deepEqual(periodoDelNombre('Recibo 2026-08 · SIN QUINCENA.pdf'), { periodo: '2026-08', quincena: null })
})

test('el parser es el mismo que la vista `mi_recibo`: si uno cambia, el otro no queda atrás', () => {
  const migracion = fuente('../../../../supabase/migrations/20260820T6000_el_empleado_entra_al_os.sql')
  for (const r of Object.values(REGEX_DEL_PERIODO)) {
    assert.ok(migracion.includes(`from '${r}'`), `la vista mi_recibo usa la misma expresión ${r}`)
  }
})

const doc = (personaId: string, nombre: string, drive: string | null = `drive-${personaId}`) =>
  ({ persona_id: personaId, nombre, drive_file_id: drive })

test('Q2-08/2026: 19 recibos con enlace; los de Q1 y los de otro mes no se cuelan', () => {
  const docs = [
    ...Array.from({ length: 19 }, (_, i) => doc(`p${i}`, `Recibo 2026-08 Q2 · PERSONA ${i}.pdf`)),
    ...Array.from({ length: 21 }, (_, i) => doc(`p${i}`, `Recibo 2026-08 Q1 · PERSONA ${i}.pdf`, `q1-${i}`)),
    doc('p0', 'Recibo 2026-07 Q2 · PERSONA 0.pdf', 'julio'),
    doc('p1', 'Recibo 2026-08 Q2 · SIN ARCHIVO.pdf', null),
  ]
  const q2 = archivosDeLaQuincena(docs, quincenaDe('2026-08-16'))
  assert.equal(q2.size, 19)
  assert.equal(q2.get('p0'), 'drive-p0')
  assert.equal(archivosDeLaQuincena(docs, quincenaDe('2026-08-01')).get('p0'), 'q1-0')
  assert.equal(archivosDeLaQuincena(docs, quincenaDe('2026-09-01')).size, 0)
})

test('Q2-08 en la pantalla: 19 recibos con enlace, aunque 5 sean de personas fuera del cuadro de la quincena', () => {
  // EL DEFECTO QUE ATRAPA (captura del 14/09/2026): la tabla sólo tenía filas para quien tenía línea
  // en la liquidación, y mostraba 14 enlaces de 19 PDF. Los otros 5 existían y no se podían abrir.
  const q = quincenaDe('2026-08-16')
  const conLinea = Array.from({ length: 17 }, (_, i) => `p${i}`)
  const docs = [
    ...conLinea.slice(0, 14).map((id, i) => doc(id, `Recibo 2026-08 Q2 · PERSONA ${i}.pdf`)),
    ...Array.from({ length: 5 }, (_, i) => doc(`baja${i}`, `Recibo 2026-08 Q2 · BAJA NUMERO ${i}.pdf`)),
    doc('baja9', 'Recibo 2026-08 Q1 · OTRA QUINCENA.pdf'),
  ]
  const archivos = archivosDeLaQuincena(docs, q)
  const filas = filasDeRecibos(conLinea.map((id) => ({ grupo: 'obreros' as const, linea: linea(id, {}) })), { hayExtracto: true, archivos })
  const fuera = recibosFueraDelCuadro(docs, q, new Set(conLinea))
  assert.equal(filas.filter((f) => f.driveFileId).length + fuera.length, 19)
  assert.equal(fuera.length, 5)
  assert.deepEqual(fuera[0], { personaId: 'baja0', nombre: 'BAJA NUMERO 0', driveFileId: 'drive-baja0' })
  assert.equal(recibosFueraDelCuadro(docs, quincenaDe('2026-09-01'), new Set(conLinea)).length, 0)
  assert.match(fuente('../components/liquidacion/solapas/recibos.tsx'), /recibosFueraDelCuadro\(/)
})

const linea = (personaId: string, l: Partial<LineaParaRecibo>): LineaParaRecibo => ({
  personaId, nombre: personaId, reciboNeto: null, porBanco: 0, reciboSinGiro: false,
  blancoAcuerdo: null, sinTarifa: false, cobra: 100, ...l,
})

test('estados por fila: girado · recibo sin giro · sin recibo · sin extracto', () => {
  const lineas = [
    { grupo: 'obreros' as const, linea: linea(AGUERO, { nombre: 'AGUERO CRISTIAN', reciboNeto: 215564.62, porBanco: 215564.62, blancoAcuerdo: 313635 }) },
    { grupo: 'obreros' as const, linea: linea('b', { nombre: 'BRAVO', reciboNeto: 192887.48, porBanco: 0, reciboSinGiro: true }) },
    { grupo: 'obreros' as const, linea: linea('c', { nombre: 'CASTILLO' }) },
  ]
  const con = filasDeRecibos(lineas, { hayExtracto: true, archivos: new Map([[AGUERO, 'drive-123']]) })
  assert.deepEqual(con.map((f) => f.estado), ['girado', 'recibo-sin-giro', 'sin-recibo'])
  assert.equal(con[0].diferencia, 0)
  assert.equal(con[0].driveFileId, 'drive-123')
  assert.equal(con[1].diferencia, -192887.48)
  assert.equal(con[2].diferencia, null)
  // UN PDF SIN IMPORTE PUBLICADO ES UN RECIBO: no se acusa «sin recibo».
  const soloPdf = filasDeRecibos([lineas[2]], { hayExtracto: true, archivos: new Map([['c', 'drive-c']]) })
  assert.equal(soloPdf[0].estado, 'sin-importe')
  const sin = filasDeRecibos(lineas, { hayExtracto: false, archivos: new Map() })
  assert.deepEqual(sin.map((f) => f.estado), ['sin-extracto', 'sin-extracto', 'sin-recibo'])
})

test('todas las filas: 18 personas son 18 filas, sin «8 más»', () => {
  const lineas = Array.from({ length: 18 }, (_, i) => ({ grupo: 'obreros' as const, linea: linea(`p${i}`, {}) }))
  assert.equal(filasDeRecibos(lineas, { hayExtracto: true, archivos: new Map() }).length, 18)
  const pantalla = fuente('../components/liquidacion/solapas/recibos.tsx')
  // EL DEFECTO QUE ATRAPA: el corte a 8 (lote y retribución) y a 6 (ausencias).
  assert.ok(!/\.slice\(0, (6|8)\)/.test(pantalla), 'la pantalla no recorta filas')
  assert.ok(!/más`/.test(pantalla), 'sin fila «N más»')
})

test('Q1-09/2026 sin recibos: un solo aviso con el conteo, y ninguna fila acusada', () => {
  const lineas = Array.from({ length: 17 }, (_, i) => ({ grupo: 'obreros' as const, linea: linea(`p${i}`, {}) }))
  const filas = filasDeRecibos(lineas, { hayExtracto: true, archivos: archivosDeLaQuincena([], quincenaDe('2026-09-01')) })
  assert.equal(avisoDeRecibos(filas, '1ª quincena de septiembre · 1 al 15'),
    'El estudio todavía no mandó los recibos de 1ª quincena de septiembre · 1 al 15 (0 de 17).')
  assert.ok(filas.every((f) => f.estado === 'sin-recibo'))
  assert.equal(totalesDeRecibos(filas).sinGiro, 0)
  const unRecibo = filasDeRecibos([{ grupo: 'obreros', linea: linea('x', { reciboNeto: 1000, porBanco: 1000 }) }], { hayExtracto: true, archivos: new Map() })
  assert.equal(avisoDeRecibos(unRecibo, 'x'), null)
})

const lineaCompleta = (personaId: string, l: Partial<LineaConOverrides>): LineaConOverrides => ({
  personaId, nombre: personaId, horas: 80, valorHora: 5000, netoMensual: null, modalidad: 'hora',
  cobra: 400000, adelanto: 0, yaTransferido: 0, porBanco: 0, enEfectivo: 400000, total: 400000,
  efectivoRedondeado: null, sinTarifa: false, reciboNeto: null, blancoAcuerdo: 200000,
  efectivoAcuerdo: 200000, reciboSinGiro: false, origenTarifa: 'test',
  manual: {}, origen: {}, discrepancia: {}, ...l,
} as unknown as LineaConOverrides)

test('el pie de Recibos por banco es EL MISMO número que el pie del cuadro de la quincena', () => {
  const lineas = {
    a: { grupo: 'obreros' as const, linea: lineaCompleta('a', { reciboNeto: 215564.62, porBanco: 215564.62, enEfectivo: 184435.38 }) },
    b: { grupo: 'obreros' as const, linea: lineaCompleta('b', { reciboNeto: 192887.48, porBanco: 192887.48, enEfectivo: 207112.52 }) },
    // SIN TARIFA: el cuadro no la suma a la plata. Recibos tampoco puede sumarla, o los dos pies difieren.
    c: { grupo: 'obreros' as const, linea: lineaCompleta('c', { sinTarifa: true, cobra: null, total: null, enEfectivo: null, reciboNeto: 50000, porBanco: 50000 }) },
  }
  const datos: DatosDelEspejo = {
    quincena: quincenaDe('2026-08-16'),
    personas: ['a', 'b', 'c'].map((id) => ({ id, nombre: id.toUpperCase(), valorHora: 5000, convenio: null })),
    registros: [], presencias: [], lineas, cuadrosCerrados: new Set(),
    horasDeLaPlanilla: new Map(), diasDeLaPlanilla: new Map(), hayEspejo: false, hoy: '2026-09-14',
  }
  const pieDelCuadro = totalesDelEspejo(filasDelEspejo(datos))
  const pieDeRecibos = totalesDeRecibos(filasDeRecibos(Object.values(lineas), { hayExtracto: true, archivos: new Map() }))
  assert.equal(pieDeRecibos.porBanco, pieDelCuadro.porBanco)
  assert.equal(pieDeRecibos.porBanco, 408452.1)
  assert.equal(pieDeRecibos.recibos, 458452.1)
})

test('la pantalla: plata de la liquidación, enlace al PDF, sin el botón falso, Retribución y Ausencias completas', () => {
  const pantalla = fuente('../components/liquidacion/solapas/recibos.tsx')
  assert.match(pantalla, /getLiquidacionDeLaQuincena\(supabase, q\)/)
  assert.match(pantalla, /filasDeRecibos\(/)
  assert.match(pantalla, /Ver recibo ↗/)
  assert.match(pantalla, /sin recibo del estudio/)
  // EL DEFECTO QUE ATRAPA: decir que no hay recibos cuando hay 652 PDF en el legajo.
  assert.ok(!/cargar-recibo-estudio|Sin infraestructura de documentos/.test(pantalla), 'sin el botón apagado ni su párrafo')
  assert.ok(!/Se edita en el bloque LABORAL/.test(pantalla), 'la retribución se edita en el cuadro, no «en el legajo»')
  // `Cuadro` recibe `testid` y lo escribe como `data-testid`.
  assert.match(pantalla, /testid="cuadro-retribucion"/)
  assert.match(pantalla, /testid="cuadro-ausencias"/)
  assert.match(pantalla, /<TablaDeMotivos \/>/)
})
