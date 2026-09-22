// RECIBOS DE PAGO — la lógica pura: armado desde la línea, rechazos, transiciones, desactualizado, rutas.
//
// MUTACIONES QUE PONEN ESTE ARCHIVO EN ROJO:
//   · emitir con `sinTarifa` o con `cobra`/`total` en null → aparece un recibo en $ 0 (lección recibo-sin-liquidacion).
//   · tomar la cobra calculada en vez de la pisada a mano en la abierta (el test de `aplicarOverrides`).
//   · tomar el valor manual en la cerrada en vez de la foto sellada (`sinOverrides`).
//   · aceptar una composición que no cierra (bruto − adelantos ≠ total).
//   · no marcar desactualizado cuando cambia UNA sola columna de la línea, o al reabrir la quincena.
//   · dejar que otro firme por la persona, o archivar un emitido sin firma.
//   · subir la foto fuera de `<uid>/recibo/…` (la policy del bucket la rechazaría).

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  armarRecibo, carpetaDelLegajo, DESTINO, diaHora, leerTrazo, marcaDeFila, miles, motivoDesactualizado,
  motivoParaNo, nombreDelArchivo, periodoCorto, periodoDeCarpeta, periodoLargo, resumenDeQuincena, rutaDelPapel,
  type FotoDeRecibo, type LineaActual,
} from './logica.ts'
import { firmaValida, svgDeFirma } from './firma.ts'
import { aplicarOverrides, sinOverrides } from '../administracion/services/liquidacionOverrides.ts'
import { liquidarLinea, type EntradaDeLinea } from '../administracion/services/liquidacionQuincena.ts'

const entrada: EntradaDeLinea = {
  personaId: 'p1', nombre: 'AGÜERO Mario', horas: 96,
  tarifa: { valorHora: 7556.25, netoMensual: null, desde: '2026-09-01', origen: 'sheet:_J_OBREROS' },
  adelanto: 42_000, yaTransferido: 0, reciboNeto: 341_700, giroEnElLote: true,
}
const viva = liquidarLinea(entrada, 'obreros', null)

test('la línea del diseño (D12): 96 h → 725.400, adelanto 42.000, total 683.400 = banco 341.700 + efectivo 341.700', () => {
  const a = armarRecibo(viva)
  assert.equal(a.bloqueo, null)
  assert.deepEqual(a.foto, {
    horas: 96, valorHora: 7556.25, bruto: 725_400, adelanto: 42_000, yaTransferido: 0,
    total: 683_400, porBanco: 341_700, enEfectivo: 341_700,
  })
})

test('MANUAL vs CALCULADO en la abierta: la cobra pisada a mano manda, y la cadena la sigue', () => {
  const pisada = aplicarOverrides(viva, { cobra: 700_000 }, 'obreros')
  const a = armarRecibo(pisada)
  assert.equal(a.foto?.bruto, 700_000, 'el recibo muestra lo que la liquidación dice: el valor escrito a mano')
  assert.equal(a.foto?.total, 658_000)
  assert.equal(a.foto?.enEfectivo, 316_300)
})

test('MANUAL vs CALCULADO en la cerrada: manda la foto sellada, no el manual que quedó en la línea', () => {
  const sellada = sinOverrides(viva, null, { cobra: 1 })
  assert.equal(armarRecibo(sellada).foto?.bruto, 725_400)
})

test('un total pisado a mano que no cierra con la resta no se firma', () => {
  const r = armarRecibo(aplicarOverrides(viva, { total: 690_000 }, 'obreros'))
  assert.equal(r.foto, null)
  assert.match(r.bloqueo ?? '', /composición no cierra|no da el total/)
})

test('SIN TARIFA no liquida: ningún recibo, y nunca en $ 0', () => {
  const sin = liquidarLinea({ ...entrada, tarifa: null }, 'obreros', null)
  assert.equal(sin.sinTarifa, true)
  const a = armarRecibo(sin)
  assert.equal(a.foto, null)
  assert.equal(a.bloqueo, 'sin tarifa: no liquida')
})

test('importe en null, cobra cero o total cero: bloqueado con su motivo', () => {
  assert.match(armarRecibo({ ...viva, cobra: null }).bloqueo ?? '', /falta el importe/)
  assert.match(armarRecibo({ ...viva, cobra: 0, total: 0, enEfectivo: 0, porBanco: 0, adelanto: 0 }).bloqueo ?? '', /cero/)
  assert.match(armarRecibo({ ...viva, adelanto: 725_400, total: 0, porBanco: 0, enEfectivo: 0 }).bloqueo ?? '', /\$ 0/)
  assert.match(armarRecibo({ ...viva, porBanco: 400_000, enEfectivo: 341_700 }).bloqueo ?? '', /no da el total/)
})

const foto: FotoDeRecibo = {
  horas: 96, valorHora: 7556.25, bruto: 725_400, adelanto: 42_000, yaTransferido: 0,
  total: 683_400, porBanco: 341_700, enEfectivo: 341_700,
}
const actual: LineaActual = { horas: 96, cobra: 725_400, adelanto: 42_000, yaTransferido: 0, total: 683_400, porBanco: 341_700, enEfectivo: 341_700 }

test('DESACTUALIZADO: al día si la línea dice lo mismo; cualquier columna que cambie lo delata', () => {
  assert.equal(motivoDesactualizado(foto, actual, true), null)
  for (const [k, v] of Object.entries({ horas: 97, cobra: 725_500, adelanto: 41_000, yaTransferido: 1, total: 683_500, porBanco: 341_600, enEfectivo: 341_800 })) {
    assert.equal(motivoDesactualizado(foto, { ...actual, [k]: v }, true), 'la liquidación cambió después de emitir', k)
  }
})

test('DESACTUALIZADO: la quincena reabierta y la línea que ya no existe', () => {
  assert.match(motivoDesactualizado(foto, actual, false) ?? '', /reabrió/)
  assert.match(motivoDesactualizado(foto, null, true) ?? '', /ya no existe/)
})

const vigente = (estado: Parameters<typeof motivoParaNo>[1]['estado'], desactualizado: string | null = null) =>
  ({ estado, vigente: true, desactualizado })

test('TRANSICIONES: firma sólo la persona y sólo lo emitido; archiva sólo Administración y sólo lo firmado', () => {
  assert.equal(motivoParaNo('firmar', vigente('emitido'), 'persona'), null)
  assert.ok(motivoParaNo('firmar', vigente('emitido'), 'administracion'), 'nadie firma por otro')
  assert.ok(motivoParaNo('firmar', vigente('firmado_telefono'), 'persona'))
  assert.ok(motivoParaNo('archivar', vigente('emitido'), 'administracion'), 'sin firma no se archiva')
  assert.equal(motivoParaNo('archivar', vigente('firmado_telefono'), 'administracion'), null)
  assert.equal(motivoParaNo('archivar', vigente('firmado_papel'), 'administracion'), null)
  assert.ok(motivoParaNo('archivar', vigente('firmado_papel'), 'persona'))
  assert.equal(motivoParaNo('subir_papel', vigente('firmado_telefono'), 'persona'), null, 'papel y trazo conviven')
  assert.equal(motivoParaNo('subir_papel', vigente('emitido'), 'administracion'), null)
  assert.equal(motivoParaNo('reclamar', vigente('emitido'), 'persona'), null)
  assert.ok(motivoParaNo('reclamar', vigente('firmado_telefono'), 'persona'), 'después de firmar, otra vía')
  assert.ok(motivoParaNo('observar', vigente('archivado'), 'administracion'))
  assert.equal(DESTINO.firmar, 'firmado_telefono')
  assert.equal(DESTINO.subir_papel, 'firmado_papel')
  assert.equal(DESTINO.archivar, 'archivado')
})

test('TRANSICIONES: desactualizado no se firma ni se archiva, pero sí se observa y se reemite', () => {
  const d = 'la liquidación cambió después de emitir'
  assert.match(motivoParaNo('firmar', vigente('emitido', d), 'persona') ?? '', /desactualizado/)
  assert.match(motivoParaNo('archivar', vigente('firmado_papel', d), 'administracion') ?? '', /desactualizado/)
  assert.equal(motivoParaNo('observar', vigente('firmado_papel', d), 'administracion'), null)
  assert.equal(motivoParaNo('reemitir', vigente('archivado', d), 'administracion'), null)
  assert.equal(motivoParaNo('reemitir', vigente('observado'), 'administracion'), null)
  assert.ok(motivoParaNo('reemitir', vigente('emitido'), 'administracion'), 'un vigente al día no se duplica')
  assert.ok(motivoParaNo('firmar', { estado: 'emitido', vigente: false, desactualizado: null }, 'persona'), 'el reemplazado no se firma')
})

test('la columna «Recibo» de D11 y su resumen', () => {
  const m = (recibo: Parameters<typeof marcaDeFila>[0]['recibo'], bloqueo: string | null = null, cerrada = true) =>
    marcaDeFila({ recibo, bloqueo, quincenaCerrada: cerrada })
  const base = { vigente: true, desactualizado: null, firmadoEn: null, observacion: null }
  const filas = [
    m({ ...base, estado: 'emitido' }),
    m({ ...base, estado: 'firmado_telefono', firmadoEn: '2026-09-15T21:42:00Z' }),
    m({ ...base, estado: 'firmado_papel' }),
    m(null, 'sin tarifa: no liquida'),
    m(null, 'sin tarifa: no liquida'),
  ]
  assert.deepEqual(filas.map((f) => f.texto), [
    'Emitido, sin firmar', 'Firmado 15/09 18:42', 'Firmado en papel · cargado', 'Bloqueado', 'Bloqueado',
  ])
  assert.deepEqual(filas.map((f) => f.tono), ['warn', 'pos', 'pos', 'neg', 'neg'])
  assert.equal(resumenDeQuincena(filas), '5 legajos · 2 firmados · 1 sin firmar · 2 bloqueados')
  assert.equal(m(null, null, false).texto, 'Se emite al cerrar la quincena')
  assert.equal(m({ ...base, estado: 'emitido', desactualizado: 'x' }).clave, 'desactualizado')
})

test('formato y períodos', () => {
  assert.equal(miles(683_400), '683.400')
  assert.equal(miles(94_795.5), '94.795,50')
  assert.equal(periodoLargo('2026-09-16', '2026-09-30'), '16 al 30 de septiembre de 2026')
  assert.equal(periodoCorto('2026-09-16', '2026-09-30'), '16–30/09')
  assert.equal(diaHora('2026-09-15T21:42:00Z'), '15/09 18:42')
})

test('RUTA DEL PAPEL: la carpeta de quien sube y la marca «recibo»; tipo desconocido, ninguna', () => {
  assert.equal(rutaDelPapel('u1', 'r1', 'image/jpeg', 5), 'u1/recibo/r1-5.jpg')
  assert.equal(rutaDelPapel('u1', 'r1', 'application/pdf', 5), 'u1/recibo/r1-5.pdf')
  assert.equal(rutaDelPapel('u1', 'r1', 'text/html', 5), null)
  assert.equal(rutaDelPapel('', 'r1', 'image/jpeg', 5), null)
})

test('CARPETA DEL LEGAJO: Legajos / nombre / Recibos / AAAA-MM-Q', () => {
  assert.equal(periodoDeCarpeta('2026-09-16'), '2026-09-2')
  assert.equal(periodoDeCarpeta('2026-09-01'), '2026-09-1')
  assert.deepEqual(carpetaDelLegajo('CÓRDOBA LUIS ', '2026-09-16'), ['Legajos', 'CÓRDOBA LUIS', 'Recibos', '2026-09-2'])
  assert.equal(nombreDelArchivo('REC-2026-0412', 'AGÜERO/Mario', 'papel'), 'REC-2026-0412 · AGÜERO Mario · firmado en papel.pdf')
})

test('EL TRAZO: la firma del lienzo se lee; cualquier otro SVG no llega a la pantalla', () => {
  const puntos = Array.from({ length: 20 }, (_, i) => ({ x: 10 + i * 8, y: 40 + (i % 3) * 10 }))
  assert.equal(firmaValida([puntos]), true)
  assert.equal(firmaValida([puntos.slice(0, 3)]), false, 'un toque no es firma')
  const svg = svgDeFirma([puntos], 300.4, 120)
  const t = leerTrazo(svg)
  assert.equal(t?.ancho, 300)
  assert.equal(t?.alto, 120)
  assert.match(t?.d ?? '', /^M10 40L18 50/)
  assert.equal(leerTrazo('<svg onload="alert(1)"></svg>'), null)
  assert.equal(leerTrazo(svg!.replace('stroke="#1F1F1E"', 'stroke="red" onclick="x"')), null)
})
