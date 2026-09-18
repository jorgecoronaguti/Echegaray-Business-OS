import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TIPO, VOCABULARIO, esCandidata, tipoDeCosto, planDeTipoCosto, medirContraEtiquetas, tramosDeEscritura,
  verificarRelectura, planDeReversa, planDeCorreccion, CORRECCION_ESTRUCTURA_A_DIRECTO_1809,
} from './compras-tipo-costo.mjs'
import { VIA } from './compras-obra-asignada.mjs'

// Casos REALES del espejo `compra_sheet` del 18/09/2026 (fila, proveedor, concepto), no inventados.
const LE_CEMENTO = { fila: 795, proveedor: 'Corralon Progreso', unidad_negocio: 'Civil', obra_texto: 'LA ESTRELLA', obra_celda: 'OB-0007 · LE - GALPÓN 9', destino: 'obra', obra_id: 'le-galpon-9', obra_inconsistencia: null, total: 59500, concepto: 'Cemento Holcim x 25kg (10 bolsas)' }
const SIN_OBRA_SF = { fila: 807, proveedor: 'Combustibles Barcelo', unidad_negocio: 'Civil', obra_texto: 'San Francisco', obra_celda: 'Sin obra – SAN FRANCISCO', destino: 'obra', obra_id: null, obra_inconsistencia: null, total: 80000, concepto: 'Bobcat' }
const ADM_COMBUSTIBLE = { fila: 662, proveedor: 'Combustibles Barcelo', unidad_negocio: 'Civil', obra_texto: 'Administracion', obra_celda: 'ES-ADM · Estructura – Administración', destino: 'estructura_admin', obra_id: null, obra_inconsistencia: 'Unidad «Civil» lleva una obra y la columna Obra dice estructura', total: 161627, concepto: 'TOYOTA AD119YO' }
const TALLER_EPP = { fila: 586, proveedor: 'Corralon Progreso', unidad_negocio: 'Civil', obra_texto: 'Almacen', obra_celda: 'ES-TAL · Estructura – Taller', destino: 'estructura_taller', obra_id: null, obra_inconsistencia: 'Unidad «Civil» lleva una obra y la columna Obra dice estructura', total: 18000, concepto: 'Guantes y Lentes' }
const PILON_BOBCAT = { fila: 580, proveedor: 'Combustibles Barcelo', unidad_negocio: 'Estructura', obra_texto: 'MESSINA', obra_celda: 'OB-0017 · ME - PILÓN', destino: 'obra', obra_id: 'pilon', obra_inconsistencia: 'Unidad «Estructura» no lleva obra y la columna Obra dice una', total: 40000, concepto: 'BOBCAT' }
const SUELDOS_ADM = { fila: 779, proveedor: 'Sueldos', unidad_negocio: 'Estructura', obra_texto: 'Administracion', obra_celda: 'ES-ADM · Estructura – Administración', destino: 'estructura_admin', obra_id: null, total: 3000000, concepto: 'Agosto' }
const ARCA_F931 = { fila: 424, proveedor: 'ARCA', unidad_negocio: 'Impuestos', obra_texto: 'F931', obra_celda: 'ES-ADM · Estructura – Administración', destino: 'estructura_admin', obra_id: null, total: 7110198 }
const SUELDOS_OBRA = { fila: 413, proveedor: 'Sueldos', unidad_negocio: 'Civil', obra_texto: 'LA ESTRELLA', obra_celda: 'Sin obra – LA ESTRELLA', destino: 'obra', obra_id: null, total: 0 }
const HORMISERV_SIN_L = { fila: 983, proveedor: 'Hormiserv', unidad_negocio: 'Civil', obra_texto: 'LA ESTRELLA', detalle_obra: 'Hormigón elaborado H-17', obra_celda: null, destino: null, obra_id: null, via: VIA.SIN_OBRA, total: 2456784 }
const CONTADOR = { fila: 626, proveedor: 'Robles Jose Maria', unidad_negocio: 'Estructura', obra_texto: 'Administracion', obra_celda: 'ES-ADM · Estructura – Administración', destino: 'estructura_admin', obra_id: null, total: 502110, concepto: 'MAYO' }

test('vocabulario: sólo los tres valores que el dueño ya usa', () => {
  assert.deepEqual(VOCABULARIO, ['Directo', 'Indirecto', 'Estructura'])
})

test('Directo: la L dice una obra (OB-####) o «Sin obra – cliente»', () => {
  assert.equal(tipoDeCosto(LE_CEMENTO).tipo, TIPO.DIRECTO)
  assert.match(tipoDeCosto(LE_CEMENTO).motivo, /le-galpon-9/)
  assert.equal(tipoDeCosto(SIN_OBRA_SF).tipo, TIPO.DIRECTO)
  assert.match(tipoDeCosto(SIN_OBRA_SF).motivo, /sin sub-obra/)
})

test('Indirecto: la L dice ES-ADM / ES-TAL, aunque la I diga Civil (manda la L, y queda anotado)', () => {
  const a = tipoDeCosto(ADM_COMBUSTIBLE)
  assert.equal(a.tipo, TIPO.INDIRECTO)
  assert.match(a.nota, /manda la L/)
  assert.equal(tipoDeCosto(TALLER_EPP).tipo, TIPO.INDIRECTO)
})

test('la I dice Estructura y la L una obra: Directo por la L, con la nota', () => {
  const r = tipoDeCosto(PILON_BOBCAT)
  assert.equal(r.tipo, TIPO.DIRECTO)
  assert.match(r.nota, /la I dice «Estructura»/)
})

test('Estructura: nómina, cargas, impuestos y préstamo — la convención del dueño, incluso con obra', () => {
  assert.equal(tipoDeCosto(SUELDOS_ADM).tipo, TIPO.ESTRUCTURA)
  assert.equal(tipoDeCosto(ARCA_F931).tipo, TIPO.ESTRUCTURA)
  assert.equal(tipoDeCosto(SUELDOS_OBRA).tipo, TIPO.ESTRUCTURA)
  assert.equal(tipoDeCosto({ proveedor: 'Banco', unidad_negocio: 'Financiero', destino: 'estructura_admin' }).tipo, TIPO.ESTRUCTURA)
  // El contador NO es nómina: es un proveedor de estructura → Indirecto por la L.
  assert.equal(tipoDeCosto(CONTADOR).tipo, TIPO.INDIRECTO)
})

test('sin decisión: L vacía y J/K no resuelven una obra (la fila más nueva, Hormiserv sin L)', () => {
  const r = tipoDeCosto(HORMISERV_SIN_L)
  assert.equal(r.tipo, null)
  assert.match(r.motivo, /L vacía/)
})

test('L vacía pero J/K resuelven UNA obra por el asignador del OS: Directo, con la vía', () => {
  const r = tipoDeCosto({ ...HORMISERV_SIN_L, obra_id: 'le-galpon-9', via: VIA.ALIAS })
  assert.equal(r.tipo, TIPO.DIRECTO)
  assert.match(r.motivo, /obra_por_alias/)
  // «única obra del cliente» también; «no es cliente» no.
  assert.equal(tipoDeCosto({ ...HORMISERV_SIN_L, obra_id: 'arcor', via: VIA.UNICA }).tipo, TIPO.DIRECTO)
  assert.equal(tipoDeCosto({ ...HORMISERV_SIN_L, obra_texto: 'Taller', via: VIA.NO_CLIENTE }).tipo, null)
})

test('sin decisión: L con un texto que no es del desplegable', () => {
  const r = tipoDeCosto({ ...LE_CEMENTO, obra_celda: 'Galpon 9', destino: null, obra_id: null, obra_inconsistencia: '«Galpon 9» no es una obra del desplegable' })
  assert.equal(r.tipo, null)
  assert.match(r.motivo, /no se entiende/)
})

test('contradicción: la L dice obra pero el proveedor sólo factura estructura (contador, Movistar) → no se escribe', () => {
  const r = tipoDeCosto({ ...CONTADOR, obra_celda: 'OB-0006 · LE - OFICINA', destino: 'obra', obra_id: 'le-comedor' })
  assert.equal(r.tipo, null)
  assert.match(r.motivo, /contradicción/)
  assert.equal(tipoDeCosto({ ...LE_CEMENTO, proveedor: 'Movistar' }).tipo, null)
})

test('esCandidata: anulada, ya cargada, o sin proveedor y sin plata, no', () => {
  assert.equal(esCandidata(LE_CEMENTO), true)
  assert.equal(esCandidata({ ...LE_CEMENTO, anulada: true }), false)
  assert.equal(esCandidata({ ...LE_CEMENTO, estado: 'ELIMINADO' }), false)
  assert.equal(esCandidata({ ...LE_CEMENTO, tipo_costo: 'Indirecto' }), false)
  assert.equal(esCandidata({ ...LE_CEMENTO, tipo_costo: ' ' }), true)
  assert.equal(esCandidata({ fila: 990, proveedor: '', total: 0 }), false)
  // Una nota de crédito (total negativo) sí es una fila.
  assert.equal(esCandidata({ fila: 744, proveedor: 'Corralon Progreso', total: -149756, destino: 'obra' }), true)
})

test('plan: una fila ya cargada NUNCA entra al plan, aunque la regla diga otra cosa', () => {
  const p = planDeTipoCosto([
    { ...LE_CEMENTO, tipo_costo: 'Indirecto' }, // el dueño la etiquetó al revés de la regla: se respeta
    SIN_OBRA_SF, HORMISERV_SIN_L, { ...ADM_COMBUSTIBLE, anulada: true },
  ])
  assert.equal(p.yaTenian, 1)
  assert.equal(p.fueraDeAlcance, 1)
  assert.deepEqual(p.escribir.map((e) => [e.fila, e.valor]), [[807, 'Directo']])
  assert.deepEqual(p.excepciones.map((e) => e.fila), [983])
  assert.ok(p.escribir[0].motivo && p.escribir[0].senal)
})

test('medición: aciertos, desacuerdos listados y sin decisión aparte', () => {
  const m = medirContraEtiquetas([
    { ...LE_CEMENTO, tipo_costo: 'Directo' },
    { ...LE_CEMENTO, fila: 289, tipo_costo: 'Indirecto', concepto: 'CEMENTO X 20' }, // real: Mampostería figura Indirecto
    { ...SUELDOS_OBRA, tipo_costo: 'Estructura' },
    { ...HORMISERV_SIN_L, tipo_costo: 'Directo' },
    SIN_OBRA_SF, // sin etiqueta: no cuenta
  ])
  assert.equal(m.total, 4)
  assert.equal(m.aciertos, 2)
  assert.deepEqual(m.desacuerdos.map((d) => [d.fila, d.dueno, d.regla]), [[289, 'Indirecto', 'Directo']])
  assert.deepEqual(m.sinDecision.map((d) => d.fila), [983])
  assert.deepEqual(m.porTipo.Indirecto, { n: 1, aciertos: 0, desacuerdos: 1, sinDecision: 0 })
})

test('tramos: filas contiguas van en un rango; una fila fuera del plan lo corta (nunca se manda vacía)', () => {
  const t = tramosDeEscritura([
    { fila: 10, valor: 'Directo' }, { fila: 11, valor: 'Indirecto' }, { fila: 13, valor: 'Directo' },
  ], { letra: 'Z' })
  assert.deepEqual(t, [
    { range: "'Compras'!Z10:Z11", values: [['Directo'], ['Indirecto']] },
    { range: "'Compras'!Z13:Z13", values: [['Directo']] },
  ])
  assert.throws(() => tramosDeEscritura([{ fila: 1, valor: 'Directo' }], {}), /letra/)
})

test('relectura: confirma las previstas y denuncia lo que no aterrizó o cambió fuera del plan', () => {
  const respaldo = [{ fila: 4, valor: 'Indirecto' }, { fila: 5, valor: '' }, { fila: 6, valor: '' }, { fila: 7, valor: 'Directo' }]
  const escribir = [{ fila: 5, valor: 'Directo' }, { fila: 6, valor: 'Indirecto' }]
  const ok = verificarRelectura({ respaldo, escribir, leido: new Map([[4, 'Indirecto'], [5, 'Directo'], [6, 'Indirecto'], [7, 'Directo']]) })
  assert.deepEqual(ok, { previstas: 2, confirmadas: 2, noAterrizo: [], ajenasCambiadas: [] })
  const mal = verificarRelectura({ respaldo, escribir, leido: new Map([[4, 'Indirecto'], [5, 'Directo'], [6, ''], [7, 'Estructura']]) })
  assert.equal(mal.confirmadas, 1)
  assert.deepEqual(mal.noAterrizo, [{ fila: 6, esperaba: 'Indirecto', leido: '' }])
  assert.deepEqual(mal.ajenasCambiadas, [{ fila: 7, antes: 'Directo', ahora: 'Estructura' }])
})

test('reversa: sólo vacía lo que sigue diciendo exactamente lo que escribí sobre una celda que estaba vacía', () => {
  const respaldo = [{ fila: 5, valor: '' }, { fila: 6, valor: '' }, { fila: 7, valor: '' }]
  const escribir = [{ fila: 5, valor: 'Directo' }, { fila: 6, valor: 'Indirecto' }, { fila: 7, valor: 'Directo' }]
  const r = planDeReversa({ escribir, respaldo, leido: new Map([[5, 'Directo'], [6, 'Estructura'], [7, 'Directo']]) })
  assert.deepEqual(r.vaciar.map((v) => v.fila), [5, 7])
  assert.deepEqual(r.restaurar, [])
  assert.equal(r.noSonMias.length, 1)
  assert.match(r.noSonMias[0].motivo, /Estructura/)
})

// ═══ LA CORRECCIÓN DEL DUEÑO (18/09/2026): «no son de estructura entonces, son CIVIL, cambialas» ═══
const F349 = { fila: 349, proveedor: 'FEMENIA', unidad_negocio: 'Civil', tipo_costo: 'Estructura', obra_celda: 'OB-0006 · LE - OFICINA Y FÁBRICA DE PALITOS', destino: 'obra', obra_id: 'le-comedor', total: 78000, concepto: '10 M3 - RIPIO' }
const F350 = { fila: 350, proveedor: 'Linarc', unidad_negocio: 'Estructura', tipo_costo: 'Estructura', obra_celda: 'ES-TAL · Estructura – Taller', destino: 'estructura_taller', total: 327000 }

test('corrección: son exactamente las 18 filas del pedido, y la 350 (Linarc, taller) no está', () => {
  const filas = CORRECCION_ESTRUCTURA_A_DIRECTO_1809.filas.map((x) => x.fila)
  assert.equal(filas.length, 18)
  assert.equal(new Set(filas).size, 18)
  assert.ok(!filas.includes(350))
  assert.equal(CORRECCION_ESTRUCTURA_A_DIRECTO_1809.de, 'Estructura')
  assert.equal(CORRECCION_ESTRUCTURA_A_DIRECTO_1809.a, 'Directo')
})

test('corrección: escribe sólo donde dice exactamente «Estructura», con el proveedor esperado y obra en la L', () => {
  const c = { ...CORRECCION_ESTRUCTURA_A_DIRECTO_1809, filas: [{ fila: 349, proveedor: 'FEMENIA' }, { fila: 351, proveedor: 'Diego Sosa' }, { fila: 352, proveedor: 'Metalis' }, { fila: 353, proveedor: 'Metalis' }, { fila: 354, proveedor: 'DUPEC' }] }
  const p = planDeCorreccion([
    F349,
    { ...F349, fila: 351, proveedor: 'Diego Sosa', tipo_costo: 'Directo' }, // ya la cambió alguien: no se toca
    { ...F349, fila: 352, proveedor: 'Otro' }, // la fila se movió
    { ...F349, fila: 353, proveedor: 'Metalis', destino: 'estructura_admin', obra_celda: 'ES-ADM' }, // sin obra
    F350,
  ], c)
  assert.deepEqual(p.escribir.map((e) => [e.fila, e.antes, e.valor]), [[349, 'Estructura', 'Directo']])
  assert.deepEqual(p.noSeTocan.map((x) => x.fila), [351, 352, 353, 354])
  assert.match(p.noSeTocan[0].motivo, /ya cambió/)
  assert.match(p.noSeTocan[1].motivo, /se movió/)
  assert.match(p.noSeTocan[3].motivo, /no existe/)
})

test('reversa de la corrección: devuelve «Estructura» sólo donde sigue diciendo «Directo»', () => {
  const escribir = [{ fila: 349, valor: 'Directo', antes: 'Estructura' }, { fila: 351, valor: 'Directo', antes: 'Estructura' }, { fila: 352, valor: 'Directo', antes: 'Estructura' }]
  const respaldo = [{ fila: 349, valor: 'Estructura' }, { fila: 351, valor: 'Estructura' }, { fila: 352, valor: '' }]
  const r = planDeReversa({ escribir, respaldo, leido: new Map([[349, 'Directo'], [351, 'Indirecto'], [352, 'Directo']]) })
  assert.deepEqual(r.restaurar, [{ fila: 349, valor: 'Directo', antes: 'Estructura' }])
  assert.deepEqual(r.vaciar, [])
  assert.deepEqual(r.noSonMias.map((x) => x.fila), [351, 352])
})
