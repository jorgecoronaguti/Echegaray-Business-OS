import test from 'node:test'
import assert from 'node:assert/strict'
import { bajadaPlanilla, fechaDePlanilla, itemsReconocidos, leerPlanilla } from './planillaPegada.ts'

const PEGADO = [
  '#\tActividad\tUni\tCant\tComienzo\tFin\tDías',
  '1\tOBRA GRUESA\t\t\t\t\t',
  '1.1\tPreparación de terreno\t\t\t\t\t',
  '1.1.1\tDemolición\t\t\t\t\t',
  '1.1.1.1\tDemolición de construcción existente\tun\t4\t24-ago\t28-ago\t5',
  '1.1.1.2\tRetiro de escombros\tun\t14\t24-ago\t28-ago\t5',
  '1.1.2\tMovimiento de suelo\t\t\t\t\t',
  '1.1.2.1\tDesmonte\tm³\t0,5\t26-ago\t28-ago\t3',
  '1.2\tFundaciones\t\t\t\t\t',
  '1.2.1\tPlatea\t\t\t\t\t',
  '1.2.1.2\tArmadura\tkg\t1840\t1-sep\t4-sep\t4',
  '\tMalla inferior\tkg\t920\t1-sep\t2-sep\t2',
  '\tMalla superior\tkg\t920\t3-sep\t4-sep\t',
  '2\tESTRUCTURA METÁLICA\t\t\t\t\t',
].join('\n')

const PLAZO = { inicio: '2026-08-24', fin: '2026-09-22' }

test('la fecha «24-ago» se resuelve con el año del plazo; otras formas también', () => {
  assert.equal(fechaDePlanilla('24-ago', 2026), '2026-08-24')
  assert.equal(fechaDePlanilla('1-sep', 2026), '2026-09-01')
  assert.equal(fechaDePlanilla('24/08', 2026), '2026-08-24')
  assert.equal(fechaDePlanilla('24/08/2026', 2026), '2026-08-24')
  assert.equal(fechaDePlanilla('2026-08-24', 2026), '2026-08-24')
  assert.equal(fechaDePlanilla('', 2026), null)
  assert.equal(fechaDePlanilla('mañana', 2026), null)
})

test('el nivel sale de la numeración y una fila sin número es subtarea de la anterior', () => {
  const l = leerPlanilla(PEGADO, PLAZO)
  assert.equal(l.filasPegadas, 13)
  assert.equal(itemsReconocidos(l), 13)
  const niveles = l.filas.map((f) => f.nivel)
  assert.deepEqual(niveles.slice(0, 4), ['rubro', 'epica', 'historia', 'tarea'])
  const malla = l.filas.find((f) => f.nombre === 'Malla inferior')!
  assert.equal(malla.nivel, 'subtarea')
  assert.equal(malla.codigo, null)
  assert.equal(l.filas[malla.padre!].nombre, 'Armadura')
  assert.equal(malla.aviso, 'sin número · subtarea')
  // Los días faltantes se cuentan entre las fechas (hábiles).
  const superior = l.filas.find((f) => f.nombre === 'Malla superior')!
  assert.equal(superior.dias, 2)
  // El padre de una épica es el último rubro; el de una historia, la última épica.
  const platea = l.filas.find((f) => f.nombre === 'Platea')!
  assert.equal(l.filas[platea.padre!].nombre, 'Fundaciones')
  const estructura = l.filas.find((f) => f.nombre === 'ESTRUCTURA METÁLICA')!
  assert.equal(estructura.padre, null)
})

test('los avisos: subtareas, cantidad menor que la unidad, ponderación por días y fechas en el plazo', () => {
  const l = leerPlanilla(PEGADO, PLAZO)
  assert.deepEqual(l.avisos.map((a) => a.texto), [
    '2 filas sin número → subtareas de «Armadura»',
    '«Desmonte» 0,5 m³ · cantidad menor que la unidad',
    'Ponderación: la planilla no la trae · se reparte por días teóricos',
    '6 fechas dentro del plazo 24/08 → 22/09',
  ])
  assert.equal(l.avisos[3].tono, 'ok')
  const desmonte = l.filas.find((f) => f.nombre === 'Desmonte')!
  assert.equal(desmonte.aviso, 'revisar cantidad')
  assert.equal(bajadaPlanilla(desmonte), 'm³ · 0,5 · 3 d')
})

test('una fecha fuera del plazo se avisa en warn y el vacío no rompe nada', () => {
  const l = leerPlanilla('1\tRubro\n1.1\tÉpica\n1.1.1\tHist\n1.1.1.1\tTarea\tun\t1\t10-oct\t12-oct\t', PLAZO)
  assert.equal(l.avisos.at(-1)?.texto, '1 de 1 fechas fuera del plazo 24/08 → 22/09')
  assert.equal(l.avisos.at(-1)?.tono, 'warn')
  assert.equal(leerPlanilla('', PLAZO).filas.length, 0)
  assert.equal(leerPlanilla('', PLAZO).avisos.length, 0)
})
