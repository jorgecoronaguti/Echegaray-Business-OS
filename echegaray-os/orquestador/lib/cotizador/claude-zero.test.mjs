// CLAUDE-ZERO (§34) Y REPRODUCIBILIDAD (§39).
//
// ═══ QUÉ PRUEBA ESTE ARCHIVO ═══
//
// Con el proveedor de razonamiento APAGADO, el camino determinístico completo tiene que seguir:
// alcance, composiciones, precios, HH, costos, indirectos, comercial, versionado, freeze, oferta,
// revisión y preparar obra. Lo generativo queda DEGRADADO, no caído.
//
// La forma de probarlo de verdad es la más aburrida y la única que sirve: correr el orquestador
// entero sobre una entrada fija, sin ningún doble de un modelo, y verificar que llega a producir
// una oferta y una preparación de obra. Si algún módulo de `cotizador/` importara un cliente de IA,
// este archivo no compilaría — y hay un test que lo comprueba leyendo los imports del directorio.
//
// El §39 se prueba corriendo DOS VECES con la misma entrada y comparando la huella y las métricas.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { correr, etapa, desdePipelineDePlano } from './orquestador.mjs'
import { ETAPA, STATUS, ORDEN_ETAPAS, ESTADO } from './contrato.mjs'
import { politicaComercial } from './comercial.mjs'
import { observacionDePrecio, TIPO_RECURSO } from './precios.mjs'
import { entradaDeAlcance, ALCANCE } from './alcance.mjs'
import { subcontrato } from './costo.mjs'
import { congelar } from './freeze.mjs'
import { ofertaDesde, paraElCliente, fugaEnLaSalida } from './oferta.mjs'
import { adjudicar, prepararObra } from './obra.mjs'
import { compararCorridas } from './metricas.mjs'

const HOY = new Date('2026-08-29T12:00:00Z')

const POLITICA = politicaComercial({
  fuente: 'Planilla para Cotizar (2).xlsm', pctGastosGenerales: 0.27, pctBeneficio: 0.22,
  pctFinanciero: 0.07, factorFinanciero: 0.5, pctIibb: 0.024, pctGanancias: 0.02,
  pctCheque: 0.012, pctIva: 0.21,
})

const OBSERVACIONES = [
  observacionDePrecio({ recursoCodigo: 'MAT-LAD', precio: 950, fuente: 'Base Maestra · lista 08/2026', observadoEn: '2026-08-01' }),
  observacionDePrecio({ recursoCodigo: 'MO-OF', precio: 4_200, fuente: 'convenio UOCRA Zona A', observadoEn: '2026-08-01' }),
  observacionDePrecio({ recursoCodigo: 'MAT-HORM', precio: 180_000, fuente: 'Hormigonera San Juan', observadoEn: '2026-08-10' }),
]

const COMP_MAMPOSTERIA = [
  { recursoCodigo: 'MAT-LAD', nombre: 'Ladrillón', tipo: TIPO_RECURSO.MATERIAL, cantidad: 45, unidad: 'un', desperdicio: 0.05 },
  { recursoCodigo: 'MO-OF', nombre: 'Oficial albañil', tipo: TIPO_RECURSO.MANO_OBRA, cantidad: 2, unidad: 'hs' },
]
const COMP_COLUMNA = [
  { recursoCodigo: 'MAT-HORM', nombre: 'Hormigón H21', tipo: TIPO_RECURSO.MATERIAL, cantidad: 1.05, unidad: 'm3' },
  { recursoCodigo: 'MO-OF', nombre: 'Oficial albañil', tipo: TIPO_RECURSO.MANO_OBRA, cantidad: 8, unidad: 'hs' },
]

/** La entrada del proyecto. Fija, sin red, sin modelo. Es lo que hace posible el CLAUDE-ZERO. */
const ENTRADA = () => ({
  documentos: [
    { hash: 'sha-plano-estructura', nombre: 'Plano de Estructura.pdf', parseado: true },
    { hash: 'sha-pliego', nombre: 'Pliego de especificaciones.pdf', parseado: true },
  ],
  elementos: [{ id: 'C1' }, { id: 'M1' }, { id: 'PINT' }, { id: 'SAN' }],
  partidas: [
    { codigo: 'T4010', descripcion: 'MAMPOSTERIA LADRILLON e=0,20', rubro: 'MAMPOSTERÍA', unidad: 'M2', cantidad: 520, tareaTipoId: 'u-4010' },
    { codigo: 'T1010', descripcion: 'COLUMNA DE CARGA H21', rubro: 'ESTRUCTURA', unidad: 'M3', cantidad: 47.2, tareaTipoId: 'u-1010' },
    { codigo: 'T9000', descripcion: 'PINTURA LATEX INTERIOR', rubro: 'TERMINACIONES', unidad: 'M2', cantidad: 900, tareaTipoId: 'u-9000' },
  ],
  composiciones: new Map([['u-4010', COMP_MAMPOSTERIA], ['u-1010', COMP_COLUMNA], ['u-9000', []]]),
  observaciones: OBSERVACIONES,
  alcance: [
    entradaDeAlcance({ patron: 'mamposteria', estado: ALCANCE.INCLUIDO, fuente: 'pliego art. 3.1' }),
    entradaDeAlcance({ patron: 'columna', estado: ALCANCE.INCLUIDO, fuente: 'pliego art. 3.1' }),
    entradaDeAlcance({ patron: 'pintura', estado: ALCANCE.EXCLUIDO, fuente: 'pliego art. 4.2', textoLiteral: 'las terminaciones no forman parte del presente' }),
  ],
  politica: POLITICA,
  // ═══ EL PROVEEDOR ESTÁ APAGADO ═══
  degradacion: { hubo: true, permitirModelo: false, intentos: 0, fallos: 2, motivos: [{ motivo: 'el proveedor de razonamiento está apagado para esta corrida', veces: 2, funciones: ['interpretar-plano'] }], laminasNoLeidas: [] },
  hoy: HOY,
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL CAMINO DETERMINÍSTICO COMPLETO, SIN MODELO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('CLAUDE-ZERO · las ONCE etapas corren con el proveedor apagado', () => {
  const r = correr(ENTRADA())
  assert.equal(r.etapas.length, 11)
  assert.equal(r.ordenCorrecto, true, `el orden salió ${r.etapas.map((e) => e.etapa).join(' → ')}`)
  assert.deepEqual(r.etapas.map((e) => e.etapa), [...ORDEN_ETAPAS])
})

test('CLAUDE-ZERO · lo generativo sale DEGRADADO, no caído — y lo dice', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `correr`, `const st = (base) => base`.
  const r = correr(ENTRADA())
  assert.equal(r.degradada, true)
  assert.equal(etapa(r, ETAPA.INTERPRET).status, STATUS.DEGRADADA)
  assert.match(etapa(r, ETAPA.INTERPRET).provenance[0], /apagado/)
  // Y lo determinístico NO se degrada: el costo es aritmética.
  assert.equal(etapa(r, ETAPA.COST).status, STATUS.OK)
  assert.equal(etapa(r, ETAPA.COMMERCIAL).status, STATUS.OK)
})

test('CLAUDE-ZERO · el alcance excluye la pintura y el costo NO la incluye', () => {
  const r = correr(ENTRADA())
  const scope = etapa(r, ETAPA.SCOPE)
  assert.equal(scope.result.excluidas, 1)
  assert.equal(r.costos.length, 2, 'se costean mampostería y columna; la pintura queda afuera')
  assert.equal(r.costos.some((c) => c.partida === 'T9000'), false)
})

test('CLAUDE-ZERO · el costo directo se calcula entero y cada cajón es trazable', () => {
  const r = correr(ENTRADA())
  // Mampostería: 520 m² × (45 × 950 × 1,05 + 2 × 4.200) = 520 × (44.887,5 + 8.400) = 27.709.500
  // Columna:    47,2 m³ × (1,05 × 180.000 + 8 × 4.200)  = 47,2 × (189.000 + 33.600) = 10.506.720
  assert.equal(r.costoDirecto.total, 38_216_220)
  assert.equal(r.costoDirecto.cajones.MATERIALS, 23_341_500 + 8_920_800)
  assert.equal(r.costoDirecto.cajones.LABOR, 4_368_000 + 1_585_920)
  assert.equal(r.costoDirecto.hh, 520 * 2 + 47.2 * 8)
})

test('CLAUDE-ZERO · la cascada da el coeficiente de la empresa, sin modelo', () => {
  const r = correr(ENTRADA())
  assert.equal(r.cascada.coeficienteSinIva, 1.681968)
  assert.equal(r.cascada.estado, ESTADO.CALCULADO)
})

test('CLAUDE-ZERO · el gate deja congelar y la oferta sale, todo sin proveedor', () => {
  const r = correr(ENTRADA())
  assert.equal(r.gate.ready, true, `bloqueos: ${JSON.stringify(r.gate.blocking_issues)}`)

  const congelada = congelar({ cotizacionId: 'q-zero', cascada: r.cascada, huella: r.huella, gate: r.gate, congeladoPor: 'jorge' })
  const partidasConCosto = r.costos.map((c) => ({ ...r.partidas.find((p) => p.codigo === c.partida), subtotal: c.subtotal, hh: c.hh }))
  const oferta = ofertaDesde({ congelada, partidas: partidasConCosto, cliente: 'Caso Ciego SA', numero: 'P-ZERO-1' })
  assert.equal(oferta.total, r.cascada.ventaSinIva)
  assert.equal(fugaEnLaSalida(paraElCliente(oferta)).limpia, true)

  const ad = adjudicar({ congelada, oferta, adjudicadaPor: 'jorge' })
  const obra = prepararObra({ adjudicacion: ad, partidas: partidasConCosto, fechaInicio: '2026-09-15' })
  assert.equal(obra.listo, true, `bloqueos: ${JSON.stringify(obra.bloqueos)}`)
  assert.equal(obra.cuadra, true)
  assert.equal(obra.tareas.length, 2)
})

test('CLAUDE-ZERO · sin precio de un recurso, el total se niega TAMBIÉN con el modelo apagado', () => {
  // La degradación no puede convertirse en excusa para publicar un total incompleto.
  const e = ENTRADA()
  const r = correr({ ...e, observaciones: e.observaciones.filter((o) => o.recursoCodigo !== 'MAT-HORM') })
  assert.equal(r.costoDirecto.total, null)
  const cost = etapa(r, ETAPA.COST)
  assert.equal(cost.status, STATUS.BLOQUEADA)
  // El status y el blocking_issue son REDUNDANTES a propósito —el contrato ya degrada a BLOQUEADA
  // cualquier etapa con bloqueos—, y las dos cosas se verifican: si sólo se mirara el status, un
  // día alguien saca el issue y la etapa sigue diciendo BLOQUEADA sin poder decir POR QUÉ.
  assert.equal(cost.blocking_issues[0].tipo, 'COSTO_NO_AFIRMABLE')
  assert.match(cost.blocking_issues[0].detalle, /NO se afirma/)
  assert.ok(cost.missing_data.some((m) => m.includes('MAT-HORM')), 'y dice qué recurso falta')
  assert.equal(r.cascada.ventaSinIva, null)
  assert.equal(r.gate.ready, false)
  assert.equal(etapa(r, ETAPA.OUTPUT).result.listoParaOfertar, false)
})

test('CLAUDE-ZERO · un subcontrato sin precio bloquea la corrida entera', () => {
  const e = ENTRADA()
  const r = correr({
    ...e,
    partidas: [...e.partidas, { codigo: 'INST-SAN', descripcion: 'INSTALACION SANITARIA', rubro: 'INSTALACIONES', unidad: 'un', cantidad: 1, tareaTipoId: 'u-san', subcontrato: subcontrato({ alcance: 'sanitaria completa' }) }],
    alcance: [...e.alcance, entradaDeAlcance({ patron: 'sanitaria', estado: ALCANCE.INCLUIDO, fuente: 'pliego art. 3.4' })],
  })
  assert.equal(r.costoDirecto.total, null)
  assert.equal(r.gate.ready, false)
  assert.ok(r.cola.bloqueantes.some((i) => i.type === 'SUBCONTRATO_SIN_PRECIO'))
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// REPRODUCIBILIDAD (§39)
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('REPRODUCIBILIDAD · RUN1 = RUN2 en huella y en métricas', () => {
  const uno = correr(ENTRADA())
  const dos = correr(ENTRADA())
  assert.equal(uno.huella.sha256, dos.huella.sha256)
  assert.deepEqual(compararCorridas(uno.metricas, dos.metricas).diferencias, [])
  assert.equal(uno.costoDirecto.total, dos.costoDirecto.total)
  assert.equal(uno.cascada.ventaSinIva, dos.cascada.ventaSinIva)
})

test('REPRODUCIBILIDAD · el ORDEN de las entradas no cambia el resultado', () => {
  const e = ENTRADA()
  const uno = correr(e)
  const dos = correr({ ...ENTRADA(), documentos: [...e.documentos].reverse(), observaciones: [...e.observaciones].reverse() })
  assert.equal(uno.huella.sha256, dos.huella.sha256)
  assert.equal(uno.costoDirecto.total, dos.costoDirecto.total)
})

test('REPRODUCIBILIDAD · una entrada distinta SÍ cambia la huella — el control puede dar rojo', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `correr`, pasarle `partidas: []` a `huellaDeEntradas`.
  //
  // Un control que no puede dar rojo no es un control: si la huella ignorara las partidas, dos
  // presupuestos con cantidades distintas tendrían la misma huella y la revisión diría que no
  // cambió nada. Se prueban las tres dimensiones que más se mueven.
  const e = ENTRADA()
  const base = correr(ENTRADA()).huella.sha256
  const otraCantidad = correr({ ...e, partidas: e.partidas.map((p) => (p.codigo === 'T4010' ? { ...p, cantidad: 525 } : p)) })
  assert.notEqual(base, otraCantidad.huella.sha256, 'cambiar una cantidad cambia la huella')
  const otroPrecio = correr({ ...e, observaciones: [...e.observaciones.slice(1), observacionDePrecio({ recursoCodigo: 'MAT-LAD', precio: 1_100, fuente: 'lista 09/2026', observadoEn: '2026-08-28' })] })
  assert.notEqual(base, otroPrecio.huella.sha256, 'cambiar un precio cambia la huella')
  const otraPolitica = correr({ ...e, politica: politicaComercial({ ...POLITICA, version: 2, pctBeneficio: 0.19, fuente: 'política nueva' }) })
  assert.notEqual(base, otraPolitica.huella.sha256, 'cambiar la política cambia la huella')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA PRUEBA ESTRUCTURAL: NINGÚN MÓDULO DEL COTIZADOR LLAMA A UN MODELO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('NINGÚN módulo de cotizador/ importa un cliente de IA (§33, §38)', () => {
  // MUTACIÓN QUE LO PONE ROJO: agregar `import { pedirTexto } from '../ia/cliente.mjs'` a
  // cualquier archivo de la carpeta.
  //
  // Es el control que impide que «el LLM entra por el command layer» se degrade en «el LLM entra
  // por donde sea» la próxima vez que a alguien le resulte más fácil. Un principio de arquitectura
  // que no tiene una prueba ejecutable dura hasta el primer apuro.
  const dir = path.dirname(new URL(import.meta.url).pathname)
  const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
  assert.ok(archivos.length >= 12, `sólo encontré ${archivos.length} módulos: ¿cambió la carpeta?`)
  const culpables = []
  for (const f of archivos) {
    const texto = fs.readFileSync(path.join(dir, f), 'utf8')
    const imports = texto.split('\n').filter((l) => /^\s*import\s/.test(l)).join('\n')
    if (/ia\/cliente|pedirTexto|anthropic|CAPACIDAD/i.test(imports)) culpables.push(f)
  }
  assert.deepEqual(culpables, [], `estos módulos llaman a un modelo: ${culpables.join(', ')}`)
})

test('el adaptador del pipeline de plano NO recalcula: sólo traduce', () => {
  const traducido = desdePipelineDePlano({
    documentos: { insumos: [{ drive_file_id: 'd1', name: 'Plano.pdf' }] },
    computo: { items: [{ id: 'C1' }] },
    mapeo: {
      mapeos: [
        { estado: 'MAPEADA', tarea: { id: 'u-1', codigo: 'T1', nombre: 'COLUMNA', unidad: 'M3' }, computo: { id: 'C1', cantidad: { valor: 2.1 } } },
        { estado: 'MAPEADA', tarea: { id: 'u-1', codigo: 'T1', nombre: 'COLUMNA', unidad: 'M3' }, computo: { id: 'C2', cantidad: { valor: 1.9 } } },
        { estado: 'AMBIGUO', tarea: null, computo: { id: 'C3', cantidad: { valor: 5 } } },
      ],
    },
  })
  assert.equal(traducido.partidas.length, 1, 'dos elementos en la misma tarea son UNA partida')
  assert.equal(traducido.partidas[0].cantidad, 4)
  assert.equal(traducido.partidas[0].lineas.length, 2, 'y cada elemento conserva su línea')
  assert.equal(traducido.documentos[0].hash, 'd1')
})
