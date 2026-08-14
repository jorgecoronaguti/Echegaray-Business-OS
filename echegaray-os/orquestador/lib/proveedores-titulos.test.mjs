import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { nSeccion } from './proveedores-frontera.mjs'
import {
  aEscribir, planDeSiembra, SECCIONES_DINAMICAS, tituloCompleto, tituloDeSeccion,
} from './proveedores-titulos.mjs'

/**
 * LA PESTAÑA COMO ESTÁ EN EL ARCHIVO (05/08), en las filas que importan:
 *
 *   13 ✓ el aging y el medio de pago dan el mismo total   ← lo último del encabezado
 *   14 1 · QUÉ SE DEBE Y CUÁNDO
 *   15 (aire)   16 el aviso de desfasaje   17 rótulos   18.. cuerpo de la dinámica
 *   35 2 · CUENTA CORRIENTE POR PROVEEDOR
 *   36 rótulos  37.. cuerpo
 */
function pestana({ sinTitulo1 = false, sinTitulo2 = false, sinRotulos2 = false, numero2 = 2 } = {}) {
  const f = Array.from({ length: 40 }, () => [''])
  f[0] = ['Proveedores']
  f[12] = ['✓ el aging y el medio de pago dan el mismo total']
  if (!sinTitulo1) f[13] = ['1 · QUÉ SE DEBE Y CUÁNDO']
  f[15] = ['⚠ el detalle no cierra con el titular: falta $19.826.655.']
  // El cuadro que abre la sección tiene una línea por PROVEEDOR: su fila de rótulos dice "Proveedor"
  // en la A y el sembrador la reconoce por el `name` del valor ("Se le debe").
  f[16] = ['Proveedor', 'Se le debe', 'Vence', 'Qué hacer']
  f[17] = ['Hormiserv', '5.995.792', '20/08/2026', 'Esperar al cobrador']
  f[30] = ['Cada operación']
  if (!sinTitulo2) f[34] = [`${numero2} · CUENTA CORRIENTE POR PROVEEDOR`]
  if (!sinRotulos2) f[35] = ['Proveedor', 'CUIT (OS)', 'Comprado 2026', 'Comprobantes']
  f[36] = ['Alumetal', '30-1', '5.174.285', '2']
  return f
}

const plan = (o) => planDeSiembra({ filas: pestana(o), numero: nSeccion })
const de = (p, clave) => p.find((x) => x.clave === clave)

describe('tituloDeSeccion', () => {
  it('el número sale del orden declarado de las secciones, no del texto', () => {
    assert.equal(tituloDeSeccion('deuda'), '1 · QUÉ SE DEBE Y CUÁNDO')
    assert.equal(tituloDeSeccion('cuentaCorriente'), '2 · CUENTA CORRIENTE POR PROVEEDOR')
    assert.equal(tituloCompleto('LO QUE SEA', 7), '7 · LO QUE SEA')
  })

  it('una clave que no es una sección dinámica no devuelve un título inventado', () => {
    assert.throws(() => tituloDeSeccion('notasCredito'), /no es una sección dinámica/)
  })
})

describe('planDeSiembra', () => {
  it('con la pestaña sana no propone escribir nada', () => {
    const p = plan()
    assert.deepEqual(p.map((x) => x.estado), ['presente', 'presente'])
    assert.deepEqual(aEscribir(p), [])
  })

  it('EL DEFECTO: si el dueño borra el título de la sección 2, se repone en SU fila', () => {
    // Ésta es la celda cuyo borrado congelaba la sección: `geometria` la busca por "^2 ·" y aborta.
    const p = de(plan({ sinTitulo2: true }), 'cuentaCorriente')
    assert.equal(p.estado, 'siembra')
    assert.equal(p.fila, 35, 'la fila de rótulos menos 1: el contrato es título · rótulos')
    assert.equal(p.texto, '2 · CUENTA CORRIENTE POR PROVEEDOR')
  })

  it('EL DEFECTO: y lo mismo con la sección 1, que tiene aire y aviso entre medio', () => {
    const p = de(plan({ sinTitulo1: true }), 'deuda')
    assert.equal(p.estado, 'siembra')
    assert.equal(p.fila, 14, 'rótulos (17) menos AVISO+1: título · aire · aviso · rótulos')
  })

  it('sin la fila de rótulos no se deduce nada: no escribe', () => {
    const p = de(plan({ sinTitulo2: true, sinRotulos2: true }), 'cuentaCorriente')
    assert.equal(p.estado, 'sin-rotulos')
    assert.equal(p.fila, 0)
    assert.deepEqual(aEscribir([p]), [])
  })

  it('si la celda donde iría tiene algo, NO escribe: la pestaña no tiene la forma esperada', () => {
    const f = pestana({ sinTitulo2: true })
    f[34] = ['una anotación del dueño']
    const p = de(planDeSiembra({ filas: f, numero: nSeccion }), 'cuentaCorriente')
    assert.equal(p.estado, 'ocupada')
    assert.deepEqual(aEscribir([p]), [])
  })

  it('el título con otro número se corrige: las dos geometrías se anclan al número', () => {
    const p = de(plan({ numero2: 7 }), 'cuentaCorriente')
    assert.equal(p.estado, 'renumerado')
    assert.equal(p.fila, 35)
    assert.equal(p.texto, '2 · CUENTA CORRIENTE POR PROVEEDOR')
  })

  it('los acentos y las mayúsculas no lo hacen escribir de nuevo sobre un título que ya está', () => {
    const f = pestana()
    f[34] = ['2 · Cuenta Corriente por Proveedor']
    assert.equal(de(planDeSiembra({ filas: f, numero: nSeccion }), 'cuentaCorriente').estado, 'presente')
  })

  it('sin la función que da el número no inventa uno', () => {
    assert.throws(() => planDeSiembra({ filas: pestana() }), /falta `numero/)
  })
})

describe('SECCIONES_DINAMICAS', () => {
  it('los valores que identifican cada sección son los que emiten los generadores', () => {
    // Si alguien renombra un valor del pivot y no lo cambia acá, el sembrador deja de reconocer la
    // fila de rótulos y el título no se repone nunca más — en silencio.
    const rot = pestana()[16]
    for (const v of SECCIONES_DINAMICAS[0].valores) assert.ok(rot.includes(v), `falta "${v}" en los rótulos`)
    const rot2 = pestana()[35]
    for (const v of SECCIONES_DINAMICAS[1].valores) assert.ok(rot2.includes(v), `falta "${v}" en los rótulos`)
  })
})
