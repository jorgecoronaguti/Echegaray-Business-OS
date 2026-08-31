// TRES PLANILLAS, DOS OBRAS, UNA SOLA QUE RIGE.
//
// El artefacto de estas pruebas es el real —`ambito-arcor-filtro-sanitario.json`, bajado de Drive el
// 30/08/2026— y no un fixture inventado. Si el artefacto se regenera y ARCOR cambió sus totales,
// estas pruebas lo dicen: es el único lugar donde ese cambio se ve antes de que llegue a una oferta.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  versionOperativa, huellaDeComputo, totalDeclarado, grillasDelAmbito, agruparPorComputo,
  conflictoDeAlcance, issueDeVersion, issuesDeDuplicados,
} from './ambito-planillas.mjs'

const ARTEFACTO = JSON.parse(fs.readFileSync(new URL('../../datos/conocimiento/ambito-arcor-filtro-sanitario.json', import.meta.url), 'utf8'))

const grilla = (x) => ({ nombre: 'a.xlsx', titulo: 'c/OBRA/a.xlsx', items: 3, rubros: 1, total: 100, huella: 'H1', superada: false, vigente: false, ...x })

test('EL ÁMBITO REAL: 4 documentos, 3 grillas, 2 cómputos distintos y un casi-duplicado', () => {
  const g = grillasDelAmbito(ARTEFACTO)
  assert.equal(ARTEFACTO.documentos.length, 4)
  assert.equal(g.length, 3, 'el «computo de materiales.xlsx» no es una grilla de cotización')
  assert.equal(agruparPorComputo(g).length, 2)

  const v = versionOperativa(ARTEFACTO)
  assert.equal(v.duplicados.length, 1)
  assert.deepEqual(v.duplicados[0].archivos, ['PEDIDO DE COTIZACION.xlsx', 'Cotizacion interna.xlsx'])
  assert.equal(v.duplicados[0].items, 22)
})

test('LA CARPETA DECIDE, Y SE DICE QUE DECIDIÓ: gana la de PROYECTO FINAL sobre las de ARCHIVOS VIEJOS', () => {
  const v = versionOperativa(ARTEFACTO)
  assert.match(v.elegido.nombre, /ESTRUCTURAS METALICAS - FINAL FINAL/)
  assert.equal(v.elegido.items, 12)
  assert.match(v.porQue, /PROYECTO FINAL/)
  assert.match(v.porQue, /ARCHIVOS VIEJOS/)
})

test('LA BRECHA DE ALCANCE SE MIDE EN PLATA: $ 31.882.680,59 entre las dos versiones', () => {
  const v = versionOperativa(ARTEFACTO)
  assert.equal(Math.round(v.conflicto.brecha * 100) / 100, 31882680.59)
  const i = issueDeVersion(v.conflicto, { ambito: 'FILTRO SANITARIO' })
  assert.equal(i.type, 'CONFLICTO')
  // Hay una decisión de la empresa detrás (la carpeta), así que no bloquea: avisa.
  assert.equal(i.severity, 'ALTA')
  assert.equal(Math.round(i.impact), 31882681)
})

test('SIN CARPETA QUE ORDENE, NO SE ELIGE — y el conflicto pasa a BLOQUEANTE', () => {
  const sinOrden = {
    documentos: ARTEFACTO.documentos.map((d) => ({ ...d, titulo: String(d.titulo).replace(/ARCHIVOS VIEJOS|PROYECTO FINAL/g, 'carpeta') })),
  }
  const v = versionOperativa(sinOrden)
  assert.equal(v.elegido, null, 'entre $ 13 M y $ 45 M el motor no tira una moneda')
  assert.match(v.porQue, /ninguna carpeta los ordena/)
  assert.equal(issueDeVersion(v.conflicto).severity, 'BLOQUEANTE')
  assert.match(v.conflicto.porQue, /Ninguna se puede elegir/)
})

test('EL CASI-DUPLICADO NO ES UN CONFLICTO: es BAJA y dice que son el mismo archivo dos veces', () => {
  const v = versionOperativa(ARTEFACTO)
  const [i] = issuesDeDuplicados(v.duplicados, { ambito: 'FILTRO SANITARIO' })
  assert.equal(i.severity, 'BAJA')
  assert.equal(i.type, 'AMBIGUO')
  assert.match(i.detalle, /el mismo documento guardado dos veces/)
})

test('LA HUELLA IGNORA EL PRECIO: la misma obra cotizada a otro precio sigue siendo la misma obra', () => {
  const base = { items: [{ unidad: 'kg', cantidad: 250.8, descripcion: 'Columnas C1', importe: 100, precioUnitario: 4 }] }
  const otroPrecio = { items: [{ unidad: 'kg', cantidad: 250.8, descripcion: 'columnas  c1', importe: 999999, precioUnitario: 88 }] }
  assert.equal(huellaDeComputo(base), huellaDeComputo(otroPrecio))
  // Pero una cantidad distinta SÍ la separa: ahí ya no es la misma obra.
  assert.notEqual(huellaDeComputo(base), huellaDeComputo({ items: [{ unidad: 'kg', cantidad: 251, descripcion: 'Columnas C1' }] }))
})

test('LA HUELLA NO DEPENDE DEL ORDEN DE LAS FILAS — dos corridas tienen que dar lo mismo (§39)', () => {
  const a = { items: [{ unidad: 'kg', cantidad: 1, descripcion: 'a' }, { unidad: 'm2', cantidad: 2, descripcion: 'b' }] }
  const b = { items: [{ unidad: 'm2', cantidad: 2, descripcion: 'b' }, { unidad: 'kg', cantidad: 1, descripcion: 'a' }] }
  assert.equal(huellaDeComputo(a), huellaDeComputo(b))
})

test('UNA PLANILLA SIN TOTAL DECLARADO da null, no 0 — y entonces la brecha no se puede medir', () => {
  assert.equal(totalDeclarado({ cierre: [] }), null)
  assert.equal(totalDeclarado({ cierre: [{ concepto: 'SUBTOTAL', valores: [5] }] }), null)
  assert.equal(totalDeclarado({ cierre: [{ concepto: 'TOTAL', valores: [7] }] }), 7)
  const c = conflictoDeAlcance([grilla({ total: null, huella: 'A' }), grilla({ total: null, huella: 'B' })])
  assert.equal(c.brecha, null)
  assert.match(c.porQue, /la brecha no se puede medir/)
  assert.equal(issueDeVersion(c).impact, null)
})

test('UNA SOLA GRILLA NO INVENTA UN CONFLICTO — el control puede decir que no', () => {
  const uno = { documentos: [ARTEFACTO.documentos.find((d) => /FINAL FINAL/.test(d.nombre))] }
  const v = versionOperativa(uno)
  assert.equal(v.conflicto, null)
  assert.equal(v.duplicados.length, 0)
  assert.match(v.porQue, /es la única grilla del ámbito \(12 ítems\)/)
  assert.equal(issueDeVersion(null), null)
})

test('UN ÁMBITO SIN NINGUNA GRILLA no elige nada y lo dice', () => {
  const v = versionOperativa({ documentos: [{ nombre: 'x.xlsx', lectura: { ok: false, porQue: 'sin encabezado' } }] })
  assert.equal(v.elegido, null)
  assert.equal(v.conflicto, null)
  assert.match(v.porQue, /ningún documento del ámbito trae una grilla/)
})

test('EL CASI-DUPLICADO ELIGE AL REPRESENTANTE NO SUPERADO, no al primero del array', () => {
  const doc = (nombre, titulo) => ({ hash: nombre, nombre, titulo, lectura: { ok: true, items: [{ unidad: 'kg', cantidad: 1, descripcion: 'a' }], rubros: [], cierre: [] } })
  const v = versionOperativa({ documentos: [doc('viejo.xlsx', 'c/ARCHIVOS VIEJOS/viejo.xlsx'), doc('vivo.xlsx', 'c/vivo.xlsx')] })
  assert.equal(v.elegido.nombre, 'vivo.xlsx')
  assert.equal(v.duplicados.length, 1)
})
