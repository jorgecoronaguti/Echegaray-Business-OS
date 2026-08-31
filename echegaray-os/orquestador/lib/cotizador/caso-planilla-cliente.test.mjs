// LA REGLA QUE SOSTIENE EL CASO: LO QUE CHOCA NO SE COSTEA.
//
// El artefacto es el real (`ambito-arcor-filtro-sanitario.json`). El catálogo es un recorte de la
// Base Maestra con las tareas que el ámbito toca de verdad —códigos, nombres y unidades tal cual
// están en `tarea_tipo`— para que la prueba corra sin base y siga midiendo el comportamiento real.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { armarCaso, numerosDelCaso, partidaDeMapeo } from './caso-planilla-cliente.mjs'

const ARTEFACTO = JSON.parse(fs.readFileSync(new URL('../../datos/conocimiento/ambito-arcor-filtro-sanitario.json', import.meta.url), 'utf8'))

// Las tres tareas que el ámbito cierra en la corrida real, con sus unidades reales.
const CATALOGO = [
  { id: 'u-1111', codigo: 'T1111.1', nombre: 'COLUMNAS METALICAS', unidad: 'UN' },
  { id: 'u-1028', codigo: 'T1028', nombre: 'CIELORRASO SUSPENDIDO AL YESO (DURLOCK)', unidad: 'M2' },
  { id: 'u-1064', codigo: 'T1064', nombre: 'PUERTA 1,00x2,05  c/BA', unidad: 'UN' },
]
const m = (codigo, nombre, cantidad) => ({ recursoCodigo: codigo, nombre, tipo: 'material', cantidad, desperdicio: 0 })
const COMPOSICIONES = new Map([
  ['u-1111', [{ recursoCodigo: 'MO-OF', nombre: 'OFICIAL', tipo: 'mano_obra', cantidad: 8 }, m('R-PERF', 'PERFIL "C"  240x80x15X2,5', 1), m('R-HIE', 'HIERRO LISO ø 16', 2)]],
  ['u-1028', [{ recursoCodigo: 'MO-OF', nombre: 'OFICIAL ESPECIALIZADO', tipo: 'mano_obra', cantidad: 2 }, m('R-PLA', 'PLACA DE YESO 12,5 X 2,4 X 1,2', 0.38)]],
  ['u-1064', [{ recursoCodigo: 'MO-OF', nombre: 'OFICIAL ESPECIALIZADO', tipo: 'mano_obra', cantidad: 4.5 }, m('R-PUE', 'PUERTA 1,00x2,05', 1)]],
])
const OPCIONES = { catalogo: CATALOGO, composiciones: COMPOSICIONES, cliente: 'ARCOR', costoPorRecurso: { 'R-PERF': 500000, 'R-HIE': 40000 } }

test('EL CASO ARMA SOBRE LA VERSIÓN QUE RIGE, no sobre la primera del array', () => {
  const c = armarCaso(ARTEFACTO, OPCIONES)
  assert.match(c.version.elegido.nombre, /FINAL FINAL/)
  assert.equal(c.planilla.resumen.items, 12)
  assert.equal(c.planilla.computos.length, 12)
  assert.equal(c.documentos.length, 4)
  assert.equal(c.documentos.filter((d) => d.parseado).length, 4, 'los 4 se abrieron sin modelo')
})

test('UN DOCUMENTO QUE NO SE PUDO ABRIR NO SE DECLARA LEÍDO — con su motivo al lado', () => {
  // La trampa ya pagada: `parseado` escrito `true` a mano publicaba como leídos documentos que
  // nadie pudo abrir. Un control que no puede decir «no lo miré» no puede decir «no está».
  const conCiego = {
    ...ARTEFACTO,
    documentos: [...ARTEFACTO.documentos, { hash: 'h-ciego', nombre: 'plano.pdf', formato: 'PDF', abierto: false, porQueNoSeAbrio: 'el PDF no tiene capa de texto y haría falta OCR', lectura: null }],
  }
  const c = armarCaso(conCiego, OPCIONES)
  assert.equal(c.documentos.length, 5)
  assert.equal(c.documentos.filter((d) => d.parseado).length, 4, 'siguen siendo 4 los leídos')
  const ciego = c.documentos.find((d) => d.nombre === 'plano.pdf')
  assert.equal(ciego.parseado, false)
  assert.match(ciego.porQue, /OCR/)
  // Y no aporta ni un cómputo: el ámbito sigue teniendo los 12 ítems de la planilla que rige.
  assert.equal(c.planilla.computos.length, 12)
})

test('LO QUE CHOCA NO SE COSTEA: T1111.1 compra el acero que ARCOR provee, así que no entra a partidas', () => {
  const c = armarCaso(ARTEFACTO, OPCIONES)
  const mapeadas = c.mapeos.filter((x) => x.estado === 'MAPEADA').map((x) => x.tarea.codigo).sort()
  assert.deepEqual(mapeadas, ['T1028', 'T1064', 'T1111.1'])
  assert.equal(c.suministros.conChoque.length, 1)
  assert.equal(c.suministros.conChoque[0].codigo, 'T1111.1')
  // Tres cerraron y sólo dos se costean. La que falta es la que paga dos veces el mismo material.
  assert.deepEqual(c.partidas.map((p) => p.codigo).sort(), ['T1028', 'T1064'])
  const bloq = c.issues.filter((i) => i.severity === 'BLOQUEANTE')
  assert.ok(bloq.some((i) => String(i.entity).startsWith('suministro:')))
})

test('LA PLATA DEL CHOQUE ESCALA CON LA CANTIDAD DEL CLIENTE: 15 placas, no una', () => {
  const c = armarCaso(ARTEFACTO, OPCIONES)
  // El ítem 1.2 pide 15 unidades; el unitario del material es 1×500.000 + 2×40.000.
  assert.equal(c.suministros.plataEnRiesgo, 15 * (500000 + 2 * 40000))
})

test('SIN LA REGLA DE SUMINISTRO, LAS TRES SE COSTEARÍAN — el control mueve el resultado', () => {
  // Mismo caso con un cliente que la planilla no nombra: la frase «a cargo de ARCOR» no aplica.
  const c = armarCaso(ARTEFACTO, { ...OPCIONES, cliente: 'OTRO CLIENTE SA' })
  assert.equal(c.suministros.conChoque.length, 0)
  assert.equal(c.partidas.length, 3, 'sin el control entran las tres, y una paga dos veces el acero')
})

test('EL HUECO Y EL CONFLICTO DE LA PLANILLA LLEGAN A LA COLA DEL MOTOR', () => {
  const c = armarCaso(ARTEFACTO, OPCIONES)
  const entidades = c.issues.map((i) => String(i.entity))
  assert.ok(entidades.some((e) => e.startsWith('version:')), 'las dos versiones del ámbito')
  assert.ok(entidades.some((e) => e.startsWith('duplicado:')), 'el casi-duplicado')
  assert.ok(entidades.some((e) => e.startsWith('planilla:item-repetido:1.1')), 'el ítem 1.10 guardado como 1.1')
  assert.ok(entidades.some((e) => e.includes('f19')), 'el zócalo sanitario que perdió su unidad')
})

test('LA PARTIDA LLEVA LA CITA DE DÓNDE SALIÓ LA CANTIDAD', () => {
  const p = partidaDeMapeo({
    tarea: { id: 'u-1028', codigo: 'T1028', nombre: 'CIELORRASO', unidad: 'M2' },
    computo: { nombre: 'Provisión y colocación de cielorraso', unidad: 'm2', cantidad: { valor: 35 }, evidencia: { hoja: 'Planilla de cotización', fila: 17, rubro: 'ESTRUCTURAS METALICAS' } },
  }, COMPOSICIONES)
  assert.equal(p.cantidad, 35)
  assert.equal(p.rubro, 'ESTRUCTURAS METALICAS')
  assert.match(p.nota, /Planilla de cotización f17/)
  assert.equal(p.composicion.length, 2)
})

test('SIN VERSIÓN QUE RIJA NO SE COTIZA NADA, y el conflicto igual llega a la cola', () => {
  const sinOrden = { ambito: 'X', documentos: ARTEFACTO.documentos.map((d) => ({ ...d, titulo: String(d.titulo).replace(/ARCHIVOS VIEJOS|PROYECTO FINAL/g, 'c') })) }
  const c = armarCaso(sinOrden, OPCIONES)
  assert.deepEqual(c.partidas, [])
  assert.deepEqual(c.mapeos, [])
  assert.equal(c.planilla, null)
  assert.ok(c.issues.some((i) => i.severity === 'BLOQUEANTE' && String(i.entity).startsWith('version:')))
  assert.match(c.porQue, /no hay una versión que rija/)
})

test('LOS NÚMEROS DEL CASO SON LOS QUE VAN AL CUADRO, y ninguno se inventa', () => {
  const n = numerosDelCaso(armarCaso(ARTEFACTO, OPCIONES))
  assert.equal(n.documentos, 4)
  assert.equal(n.documentosAbiertos, 4)
  assert.equal(n.itemsDelCliente, 12)
  assert.equal(n.computos, 12)
  assert.equal(n.mapeadas, 3)
  assert.equal(n.choquesDeSuministro, 1)
  assert.equal(n.partidasCosteables, 2)
  assert.equal(Math.round(n.brechaDeAlcance), 31882681)
  assert.equal(n.mapeadas + n.ambiguas + n.sinPartida, 12, 'ningún cómputo se pierde entre estados')
})

test('SIN PRECIOS DE RECURSO LA PLATA DEL CHOQUE ES null, NUNCA 0 — y el issue sigue bloqueando', () => {
  const c = armarCaso(ARTEFACTO, { ...OPCIONES, costoPorRecurso: {} })
  assert.equal(c.suministros.conChoque.length, 1)
  assert.equal(c.suministros.plataEnRiesgo, null)
  assert.equal(c.partidas.length, 2, 'no saber cuánto cuesta no lo vuelve costeable')
})
