import test from 'node:test'
import assert from 'node:assert/strict'
import { filasDelPlan, motivoSinPlan, prepararPlan } from './cargar-comprobantes-compras.mjs'
import { colDelCargador, contratoContra, derivar } from '../lib/comprobantes/contrato-columnas.mjs'
import { COMPRAS_2508, COMPRAS_CON_OBRA } from '../lib/encabezados-referencia.mjs'
import { indexarCompras } from '../lib/comprobantes/compras-vivas.mjs'
import { destinosDeObra } from '../lib/comprobantes/obra-y-destino.mjs'
import { avisoFueraDeCompras, porQueNoCargo } from '../comunicacion/comprobantes/escritura.mjs'
import { CATALOGOS } from '../lib/comprobantes/obra-y-destino.fixture.mjs'

// ═══ EL PLAN DE ESCRITURA DE UN FAJO, DE PUNTA A PUNTA, ANTES Y DESPUÉS DE INSERTAR «Obra» ═══
//
// `prepararPlan` es lo último que se decide antes de tocar una celda. Se corre el MISMO fajo contra el
// encabezado de hoy (sin «Obra») y contra el de después de la inserción (L «Obra», Concepto en M), y
// se mira letra por letra lo que se escribiría. Sin Google, sin Postgres, sin escribir nada.

const contratoHoy = contratoContra(COMPRAS_2508)
const contratoConObra = contratoContra(COMPRAS_CON_OBRA)
const COL_HOY = colDelCargador(contratoHoy)
const COL_CON_OBRA = colDelCargador(contratoConObra)
const destinos = destinosDeObra(CATALOGOS)

const base = { fecha: '10/09/2026', total: 121000, iva: 21000, condicion: 'Cuenta Corriente' }
const FAJO = [
  { ...base, proveedor: 'Corralón Progreso', numero: '0003-00000101', cuit: '20-12345678-6', obra: 'MESSINA', detalle: 'Planta de BSA', unidad: 'Civil', concepto: 'Cemento' },
  { ...base, proveedor: 'Gerson Castro', numero: '0001-00000202', obra: 'San Francisco', unidad: 'Civil', concepto: 'Flete' },
  { ...base, proveedor: 'Corralón Progreso', numero: '0003-00000303', obra: 'Administracion', detalle: 'Refaccion Oficina', unidad: 'Estructura', concepto: 'Pintura' },
  { ...base, proveedor: 'UOCRA', numero: '0000-00000404', concepto: 'Boleta 08/2026' },
  { ...base, proveedor: 'ARCA', numero: '0000-00000505', unidad: 'Impuestos', concepto: 'VEP Ganancias' },
]
const LISTA = ['Corralón Progreso', 'Gerson Castro', 'UOCRA', 'ARCA']
const opciones = (col, extra = {}) => ({ lista: LISTA, indiceCompras: { ok: true, ...indexarCompras([]) }, col, ...extra })
// `prepararPlan` muta los comprobantes (el historial, la fecha): cada corrida con su copia.
const fajo = () => structuredClone(FAJO)

test('SIN la columna Obra insertada, el plan escribe EXACTAMENTE lo mismo que sin catálogo de obras', async () => {
  const conCatalogo = await prepararPlan(fajo(), opciones(COL_HOY, { destinos }))
  const sinCatalogo = await prepararPlan(fajo(), opciones(COL_HOY))
  assert.deepEqual(conCatalogo.plan.map((p) => p.valores), sinCatalogo.plan.map((p) => p.valores))
  assert.equal(conCatalogo.plan[0].valores.L, 'Cemento', 'Concepto sigue en L')
  const escritos = conCatalogo.plan.flatMap((p) => Object.values(p.valores))
  assert.equal(escritos.some((v) => /^(OB-|ES-)/.test(String(v))), false, 'ninguna obra codificada cae en otra columna')
  assert.equal(filasDelPlan(conCatalogo.plan, 900)[0].obraEscrita, false, 'y el JSON no dice que se escribió')
})

test('CON la columna Obra en L: la obra decidida va a L y Concepto a M', async () => {
  const r = await prepararPlan(fajo(), opciones(COL_CON_OBRA, { destinos }))
  const [messina, sf, adm] = r.plan
  assert.equal(COL_CON_OBRA.obraFila, 'L')
  assert.equal(messina.valores.L, 'OB-0007 · ME - PLANTA DE BSA')
  assert.equal(messina.valores.M, 'Cemento')
  assert.equal(messina.valores.J, 'MESSINA', 'el texto libre de J se conserva')
  assert.equal(messina.valores.K, 'Planta de BSA', 'y el de K también')
  assert.equal(sf.valores.L, undefined, 'San Francisco sin detalle: la celda Obra queda vacía y se pregunta')
  assert.equal(adm.valores.L, 'ES-ADM · Estructura – Administración')
  // EL PORTÓN CON EL CONTRATO VIVO: nada del plan cae en una fórmula ni en una columna del dueño.
  assert.deepEqual(derivar(contratoConObra).letrasIndebidas(r.plan.flatMap((p) => Object.keys(p.valores))), [])
  const filas = filasDelPlan(r.plan, 900)
  assert.deepEqual(filas.map((f) => [f.fila, f.obraEscrita]), [[900, true], [901, false], [902, true]])
  assert.equal(filas[0].cuit, '20123456786', 'el CUIT leído del comprobante viaja con la fila')
  assert.match(filas[1].obraPorque, /SAN FRANCISCO/)
})

test('EL DEFECTO: impuestos y cargas sociales NO entran a Compras, y se dice a dónde van', async () => {
  const r = await prepararPlan(fajo(), opciones(COL_CON_OBRA, { destinos }))
  assert.equal(r.plan.length, 3)
  assert.equal(r.plan.some((p) => ['UOCRA', 'ARCA'].includes(p.proveedor)), false)
  assert.deepEqual(r.fueraDeCompras.map((f) => [f.i, f.proveedor, f.pestana]), [
    [3, 'UOCRA', 'Cargas Sociales'], [4, 'ARCA', 'Impuestos y Financieros'],
  ])
  assert.deepEqual(r.rechazos, [], 'no es un dato ilegible: se informa aparte')
  const aviso = avisoFueraDeCompras(r.fueraDeCompras)
  assert.match(aviso, /UOCRA 0000-00000404 → \*\*Cargas Sociales\*\*/)
  assert.match(aviso, /ARCA 0000-00000505 → \*\*Impuestos y Financieros\*\*/)
})

test('un fajo que es SÓLO impuestos no dice «ninguno tenía lo mínimo»: dice que no son compras', async () => {
  const r = await prepararPlan(fajo().slice(3), opciones(COL_CON_OBRA, { destinos }))
  assert.equal(r.plan.length, 0)
  const motivo = motivoSinPlan(r)
  assert.equal(motivo, 'fuera_de_compras')
  assert.match(porQueNoCargo(motivo), /van a su pestaña/)
  assert.equal(motivoSinPlan({ rechazos: [{}], fueraDeCompras: [{}] }), 'nada_cargable', 'mezclado con rechazos, manda el rechazo')
})

test('una obra elegida que no es opción del desplegable no llega a la celda', async () => {
  // Y no se «arregla» con lo que dicen J+K: la persona eligió algo distinto, y cuál de las dos
  // cosas quiso decir no se adivina. La celda queda vacía y el porqué viaja.
  const [c] = fajo()
  const r = await prepararPlan([{ ...c, obraFila: 'la de Messina' }], opciones(COL_CON_OBRA, { destinos }))
  assert.equal(r.plan[0].valores.L, undefined)
  assert.equal(Object.values(r.plan[0].valores).includes('la de Messina'), false)
  assert.match(filasDelPlan(r.plan)[0].obraPorque, /no es una obra del desplegable/)
})
