import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dondeSeFirmo, esEstado, estaFirmado, lecturaDelCiclo, personaPuedeObservar, sePuedeArchivar,
  sePuedeFirmar, trazoDibujable, type CicloDelRecibo,
} from './ciclo.ts'
import { svgDeFirma } from '../firma/firma.ts'

const base: CicloDelRecibo = {
  estado: 'emitido', trazo: null, firmadoEn: null, firmadoDesde: null,
  papelSubidoEn: null, enviadoEn: null, archivadoEn: null, observacion: null,
}
const con = (x: Partial<CicloDelRecibo>): CicloDelRecibo => ({ ...base, ...x })

test('un recibo emitido y sin firmar se dice que falta firmarlo, no que está listo', () => {
  assert.deepEqual(lecturaDelCiclo(base), { rotulo: 'Emitido, sin firmar', tono: 'warn' })
  assert.deepEqual(lecturaDelCiclo(con({ estado: 'enviado', enviadoEn: '2026-09-22T12:00:00Z' })),
    { rotulo: 'Enviado a firmar, sin firmar', tono: 'warn' })
})

test('las dos formas de firma conviven y las dos cuentan como firmado', () => {
  const dedo = con({ estado: 'firmado_telefono', firmadoEn: '2026-09-22T21:42:00Z', trazo: '<svg/>' })
  const papel = con({ estado: 'firmado_papel', papelSubidoEn: '2026-09-22T22:20:00Z' })
  assert.equal(estaFirmado(dedo), true)
  assert.equal(estaFirmado(papel), true)
  assert.equal(lecturaDelCiclo(dedo).rotulo, 'Firmado en el teléfono')
  assert.equal(lecturaDelCiclo(papel).rotulo, 'Firmado en papel · cargado')
  // El papel sobre una firma con el dedo NO borra la firma: se dicen las dos.
  assert.equal(lecturaDelCiclo({ ...dedo, papelSubidoEn: '2026-09-22T22:20:00Z' }).rotulo,
    'Firmado · con el papel cargado')
})

test('no se archiva lo que nadie firmó, ni se archiva dos veces', () => {
  assert.equal(sePuedeArchivar(base), false)
  assert.equal(sePuedeArchivar(con({ estado: 'enviado' })), false)
  assert.equal(sePuedeArchivar(con({ estado: 'firmado_papel', papelSubidoEn: '2026-09-22T22:20:00Z' })), true)
  assert.equal(sePuedeArchivar(con({ estado: 'archivado', archivadoEn: '2026-09-23T10:00:00Z', firmadoEn: '2026-09-22T21:42:00Z' })), false)
})

test('la persona reclama antes de firmar; después ya no, y firmar dos veces tampoco', () => {
  assert.equal(personaPuedeObservar(base), true)
  assert.equal(sePuedeFirmar(base), true)
  const firmado = con({ estado: 'firmado_telefono', firmadoEn: '2026-09-22T21:42:00Z' })
  assert.equal(personaPuedeObservar(firmado), false)
  assert.equal(sePuedeFirmar(firmado), false)
})

test('el lugar de la firma no se inventa cuando no hay registro de obra', () => {
  assert.equal(dondeSeFirmo({ firmadoEn: '2026-09-22T21:42:00Z', firmadoDesde: null }),
    '22/09 · 18:42 · desde el teléfono')
  assert.equal(dondeSeFirmo({ firmadoEn: '2026-09-22T21:42:00Z', firmadoDesde: 'Galpón 8' }),
    '22/09 · 18:42 · desde el teléfono, en Galpón 8')
  // SIN FIRMA CON EL DEDO NO SE AFIRMA NADA: el papel no dice desde dónde se firmó.
  assert.equal(dondeSeFirmo({ firmadoEn: null, firmadoDesde: null }), null)
})

test('un estado que la base no conoce no se hace pasar por emitido', () => {
  assert.equal(esEstado('archivado'), true)
  assert.equal(esEstado('firmado'), false)
  assert.equal(esEstado(null), false)
})

test('la firma que guarda el teléfono es la misma que el legajo sabe dibujar', () => {
  // El SVG lo arma el lienzo del teléfono (`svgDeFirma`); la base lo acepta con esa forma exacta y la
  // pantalla lo vuelve a abrir acá. Si alguna de las tres se corre, este test se pone rojo.
  const puntos = Array.from({ length: 20 }, (_, i) => ({ x: i * 6, y: 40 + (i % 3) * 9 }))
  const svg = svgDeFirma([puntos], 300, 120)
  assert.ok(svg)
  const t = trazoDibujable(svg)
  assert.deepEqual({ ancho: t?.ancho, alto: t?.alto }, { ancho: 300, alto: 120 })
  assert.match(t?.d ?? '', /^M0 40L/)
})

test('lo que no tiene forma de firma no se dibuja como firma', () => {
  assert.equal(trazoDibujable(null), null)
  assert.equal(trazoDibujable('<svg onload="alert(1)"><path d="M0 0"/></svg>'), null)
  assert.equal(trazoDibujable('cualquier cosa'), null)
})

test('un recibo observado se ve como observado aunque después se firme la versión nueva', () => {
  const obs = con({ estado: 'observado', observacion: 'las horas no son las que trabajé' })
  assert.deepEqual(lecturaDelCiclo(obs), { rotulo: 'Observado: no coincide', tono: 'neg' })
})
