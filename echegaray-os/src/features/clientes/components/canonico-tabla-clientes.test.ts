// CANÓNICO 25 · LA CARTERA DEL CRM — lo que la tabla de Clientes tiene que decir y lo que no.
//
// Pruebas sobre la FUENTE del componente (se dibuja en el servidor y no hay DOM barato): cada regla
// del dueño queda escrita como una expresión que da rojo si alguien la deshace.
//
// ═══ LAS CINCO COLUMNAS (dueño, 11/09/2026) ═══
//
// «Mostrá OC como está ahora pero quitá esa columna; OP debe estar dentro de cada cliente como OC;
// te pedí monto contratado, materiales, mano de obra y avance de cobro con barra de progreso».

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { ObraEnCurso } from '@/features/administracion/services/homeCartera'
import { baseDelContrato, cobradoParaLaBarra, fraseDeFuente, sumaDeObras } from '../services/contratoDeObra.ts'

const leer = (f: string) => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8')
const tabla = () => leer('./TablaClientes.tsx')
const celdas = () => leer('./CeldasDeContrato.tsx')

const obra = (p: Partial<ObraEnCurso> & { obra_id: string }): ObraEnCurso => ({
  nombre: p.obra_id, avance: null, jefe: null, contratado: null, contratadoUsd: null, tipoCambio: null,
  origenContratado: null, referencia: null, nota: null, ocCivaVentana: null, ocCivaHistorico: null,
  ocNVentana: null, ocNHistorico: null, manoObra: null, manoObraUsd: null, materiales: null,
  materialesUsd: null, contratoTotal: null, contratoFuente: null, contratoFuenteDriveId: null,
  contratoFuenteNombre: null, contratoCita: null, contratoNota: null,
  certificacion: { texto: 'sin certificar', reclama: false }, cobradoTotal: null, cobradoNeto: null,
  porCobrar: null, vencido: null, proximo: null, imputacion: null, cobroDisponible: true, ...p,
})

test('las cinco columnas, en el orden del dueño, y ninguna de OC ni de OP', () => {
  const src = tabla()
  const orden = ['Cliente', 'Contratado', 'Materiales', 'Mano de obra', 'Avance de cobro']
    .map((r) => src.indexOf(`>${r}<`) === -1 ? src.indexOf(`'${r}'`) : src.indexOf(`>${r}<`))
  for (let i = 1; i < orden.length; i++) assert.ok(orden[i] > orden[i - 1] && orden[i - 1] >= 0, `columna ${i} fuera de orden`)
  assert.doesNotMatch(src, />OC c\/IVA</, 'la columna OC se fue: los totales viven en la ficha, solapa Órdenes')
  assert.doesNotMatch(src, />OP c\/IVA</)
  assert.doesNotMatch(src, /TotalDePapeles/, 'ningún total de papeles en la cartera')
  assert.match(src, /grid-cols-\[minmax\(0,2fr\)_150px_130px_140px_210px\]/)
})

test('las OC siguen debajo de cada obra, con su PDF', () => {
  assert.match(tabla(), /<OrdenesDeLaObra ordenes=\{ocDeLaObra\} veEconomia=\{veEconomia\} \/>/)
})

test('la barra es SÓLO del trabajo: la fila del cliente publica una cifra', () => {
  const src = tabla()
  assert.match(src, /<AvanceDeCobro o=\{o\} veEconomia=\{veEconomia\} \/>/)
  const fila = src.slice(src.indexOf('data-testid="fila-cliente"'), src.indexOf('data-testid="fila-obra"'))
  assert.doesNotMatch(fila, /AvanceDeCobro|progresoDeCobro|TONO\.pista/, 'ninguna barra en la fila del cliente')
  assert.match(fila, /cobrado \$\{millones\(c\.cobradoNeto\)\}/)
})

test('el avance mide NETO contra NETO, sobre el total del contrato, y dice cuánto falta', () => {
  const src = celdas()
  assert.match(src, /progresoDeCobro\(cobrado, base\)/)
  assert.match(src, /const cobradoNeto = cobradoParaLaBarra\(o\)/)
  // Con filas pendientes y ninguna cobrada, cobró CERO (la deuda está registrada); sin ninguna fila, no se sabe.
  assert.equal(cobradoParaLaBarra(obra({ obra_id: 'a', porCobrar: 10 })), 0)
  assert.equal(cobradoParaLaBarra(obra({ obra_id: 'b' })), null)
  assert.equal(cobradoParaLaBarra(obra({ obra_id: 'c', cobradoNeto: 5, imputacion: 'cliente' })), null)
  assert.doesNotMatch(src, /IVA_GENERAL|\* 1\.21/, 'nada de llevar el contrato a bruto: el cobro se compara neto')
  assert.match(src, /falta \$\{millones\(falta\)\}/)
  // Quattropani: mano de obra U$S 63.000 (≈ 95,3 M) + materiales 44,1 M → la base es 139,4 M, no 95,3.
  const q = obra({ obra_id: 'quattropani', contratado: 95_303_187, manoObra: 95_303_187, manoObraUsd: 63_000, materiales: 44_110_169.31, contratoTotal: 139_413_356.31, cobradoNeto: 89_968_327 })
  assert.equal(baseDelContrato(q), 139_413_356.31)
  assert.equal(Math.round((q.cobradoNeto! / baseDelContrato(q)!) * 100), 65, 'no 94')
  // Sin desglose, la base es el precio único de OBRAS.
  assert.equal(baseDelContrato(obra({ obra_id: 'bsa', contratado: 17_704_199 })), 17_704_199)
  assert.equal(baseDelContrato(obra({ obra_id: 'x' })), null)
  // Un total de CERO (materiales «no incluye» y mano de obra sin fijar) no es una base: manda OBRAS.
  assert.equal(baseDelContrato(obra({ obra_id: 'y', contratado: 10_000_000, contratoTotal: 0 })), 10_000_000)
  assert.equal(baseDelContrato(obra({ obra_id: 'z', contratoTotal: 0 })), null)
})

test('un componente tiene tres estados y ninguno es un hueco mudo', () => {
  const src = celdas()
  assert.match(src, /data-estado="sin-desglose"[\s\S]*?El papel no separa/)
  assert.match(src, /data-estado="no-incluye"[\s\S]*?no incluye/)
  assert.match(src, /data-estado="fijado"/)
  assert.doesNotMatch(src, /pesos\(0\)|'\$ 0'/, 'un 0 del papel se dice con palabras, no con «$ 0»')
})

test('la fuente del desglose se nombra: contrato, OC o presupuesto, con su renglón', () => {
  assert.match(fraseDeFuente(obra({ obra_id: 'q', contratoFuente: 'contrato', contratoFuenteNombre: 'CONTRATO.docx', contratoCita: 'U$S 63.000 + IVA' })),
    /Según el contrato firmado \(«CONTRATO\.docx»\): U\$S 63\.000 \+ IVA/)
  assert.match(fraseDeFuente(obra({ obra_id: 'b' })), /Ningún papel cargado separa/)
  // La nota de la fila (una INFERENCIA declarada) llega entera al `title`.
  assert.match(fraseDeFuente(obra({ obra_id: 'd', contratoFuente: 'presupuesto', contratoCita: 'SUB TOTAL 20.090.867,83', contratoNota: 'INFERENCIA: la cotización no dice «solo mano de obra»' })),
    /— INFERENCIA: la cotización no dice/)
})

test('la suma del cliente declara cuántos trabajos no tienen el dato', () => {
  const s = sumaDeObras([obra({ obra_id: 'a', contratado: 10 }), obra({ obra_id: 'b' })], baseDelContrato)
  assert.deepEqual(s, { total: 10, faltan: 1 })
  assert.deepEqual(sumaDeObras([obra({ obra_id: 'b' })], baseDelContrato), { total: null, faltan: 1 })
})

test('el jefe de obra no ve una sola cifra', () => {
  const src = tabla()
  assert.match(src, /veEconomia \? 'Contratado' : ''/)
  assert.match(src, /veEconomia \? 'Avance de cobro' : ''/)
  assert.match(celdas(), /if \(!veEconomia\) return <span className=\{SOLO_ANCHO\} \/>/)
})
