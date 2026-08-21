// LO QUE ESTA PESTAÑA NO PUEDE HACER NUNCA.
//
// Dos reglas del dueño, y las dos son fáciles de cumplir el primer día y fáciles de romper el
// segundo: «nunca un número pegado» (regla de oro 5) y «minimalista y de clase mundial». Acá se
// miden las dos, más la trampa concreta que ya publicó una fila en $0 sin dar ningún error.
import test from 'node:test'
import assert from 'node:assert/strict'
import { construir, ANCHO } from './pestana.mjs'
import { pedidos, AZUL, VERDE } from './formato.mjs'
import { SUBCONTRATISTAS, PROFESIONALES, COMERCIOS } from './padron.mjs'

const d = construir()
const { filas, bloques } = d

test('ningún monto está pegado: las columnas de plata son todas fórmula', () => {
  for (const b of bloques) {
    for (let f = b.f0; f <= b.total; f++) {
      for (const col of [2, 3, 4, 5]) { // C..F
        const v = filas[f - 1]?.[col]
        if (v === undefined || v === '' || v === null) continue
        assert.ok(String(v).startsWith('='), `fila ${f} col ${col} tiene un valor pegado: ${v}`)
      }
    }
  }
})

test('el proveedor se compara NORMALIZADO — «AGUERO » tiene un espacio al final', () => {
  // Sin TRIM, SUMIF compara la celda entera, no encuentra la fila y publica $0 sin un solo error
  // a la vista. Es el peor modo de fallar que tiene un cuadro: el que no grita.
  const conProveedor = filas.flat().filter((c) => String(c ?? '').includes('Compras!$E$'))
  assert.ok(conProveedor.length > 0, 'ninguna fórmula mira la columna de proveedores')
  for (const f of conProveedor) {
    assert.match(String(f), /ARRAYFORMULA\(TRIM\(Compras!\$E\$4:\$E\$2000\)\)/,
      `esta fórmula compara el proveedor sin normalizar: ${String(f).slice(0, 90)}`)
  }
})

test('las fórmulas hablan es-AR y no se comen columnas enteras', () => {
  for (const fila of filas) {
    for (const c of fila) {
      const s = String(c ?? '')
      if (!s.startsWith('=')) continue
      assert.ok(!/,/.test(s.replace(/"[^"]*"/g, '')), `usa coma como separador: ${s}`)
      assert.ok(!/Compras!\$?[A-Z]+:\$?[A-Z]+/.test(s), `rango abierto: ${s}`)
    }
  }
})

test('MINIMALISMO: seis columnas y una sola línea por cuadro', () => {
  assert.equal(ANCHO, 6, 'el cuadro creció: cada columna que se agrega hay que poder defenderla')
  for (const f of filas) assert.ok(f.length <= ANCHO, `una fila se pasa de ${ANCHO} columnas: ${f.length}`)
  const p = pedidos(1, d, ANCHO)
  const sinGrilla = p.find((x) => x.updateSheetProperties?.properties?.gridProperties?.hideGridlines)
  assert.ok(sinGrilla, 'quedó la cuadrícula prendida: es el trazo que más tinta sin dato aporta')
  const conBorde = p.filter((x) => x.repeatCell?.cell?.userEnteredFormat?.borders)
  assert.equal(conBorde.length, d.totales.length, 'hay bordes fuera de la línea de los totales')
})

test('CLASE MUNDIAL: azul lo tipeado, verde lo que viene de Compras', () => {
  const p = pedidos(1, d, ANCHO)
  const pinta = (color) => p.filter((x) => {
    const c = x.repeatCell?.cell?.userEnteredFormat?.textFormat?.foregroundColor
    return c && c.red === color.red && c.green === color.green && c.blue === color.blue
  })
  assert.equal(pinta(AZUL).length, bloques.length, 'los nombres y rubros tipeados no van en azul')
  assert.equal(pinta(VERDE).length, bloques.length, 'los montos traídos de Compras no van en verde')
  // Azul sobre A:B (lo tipeado) y verde sobre C:F (lo calculado). Si se cruzan, el código miente.
  for (const r of d.azul) assert.match(r, /^A\d+:B\d+$/, `el azul cayó fuera de lo tipeado: ${r}`)
  for (const r of d.verde) assert.match(r, /^C\d+:F\d+$/, `el verde cayó fuera de lo calculado: ${r}`)
})

test('la fila TOTAL no deja ninguna celda vacía — si no, el cuadro no converge', () => {
  // Una celda vacía en la fila TOTAL la lee la fusión como «no es mía» y conserva lo que hubiera
  // debajo. Cuando el rediseño achicó el cuadro, ahí quedó el último renglón del layout anterior:
  // el cuadro publicaba «TOTAL | Asado en taller | 0» y no se limpiaba nunca.
  for (const b of bloques) {
    const total = filas[b.total - 1]
    assert.equal(total[0], 'TOTAL')
    for (const col of [1, 2, 3, 4, 5]) {
      const v = String(total[col] ?? '')
      assert.ok(v.startsWith('='), `la fila TOTAL deja la col ${col} vacía: el fantasma de abajo sobrevive`)
    }
  }
})

test('cada persona aparece UNA sola vez y con su rubro', () => {
  const todos = [...SUBCONTRATISTAS, ...PROFESIONALES, ...COMERCIOS]
  assert.equal(new Set(todos.map(([n]) => n)).size, todos.length, 'hay un nombre repetido')
  for (const [n, r] of todos) assert.ok(String(r || '').trim().length > 3, `«${n}» no tiene rubro`)
})

test('los tres bloques suman por separado — el total de subcontratistas no se infla', () => {
  const sub = bloques.find((b) => b.clave === 'sub')
  assert.equal(sub.f1 - sub.f0 + 1, SUBCONTRATISTAS.length)
  assert.equal(bloques.length, 3, 'se perdió un bloque: profesionales y comercios volverían al total')
})
