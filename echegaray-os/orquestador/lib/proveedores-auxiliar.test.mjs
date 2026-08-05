import { strict as assert } from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  COL_NOTA_AUX, conGuiones, ENCABEZADOS_AUX, filasDeLaAuxiliar,
} from './proveedores-auxiliar.mjs'

const proveedores = [
  { nombre: 'Hormiserv', cuit: '30712345678' },
  { nombre: 'Alumetal', cuit: '30-71234567-9' },
  { nombre: 'Ruviño Matias Esteban', cuit: null },
]
const notas = [
  { proveedor: 'Alumetal', nota: 'no es prioridad' },
  { proveedor: 'Chatarrero', nota: 'Confirmar trueque con chatarra propia' },
  { proveedor: 'Hormiserv', nota: '   ' },
]

describe('filasDeLaAuxiliar', () => {
  it('el encabezado es el contrato: las dos fórmulas que la leen dependen del orden', () => {
    const [cab] = filasDeLaAuxiliar({ proveedores, notas })
    assert.deepEqual(cab, ['Proveedor', 'CUIT', 'Qué hacer'])
    assert.equal(cab[COL_NOTA_AUX - 1], 'Qué hacer', 'el VLOOKUP pide esta columna por número')
    assert.equal(cab.length, ENCABEZADOS_AUX.length)
  })

  it('EL DEFECTO: una nota de un proveedor que no está en `proveedores` igual llega', () => {
    // Si se cayera, la nota existiría en la base y no se vería en ningún lado — que es exactamente
    // el problema que esta capacidad vino a resolver.
    const filas = filasDeLaAuxiliar({ proveedores, notas })
    const chatarrero = filas.find((f) => f[0] === 'Chatarrero')
    assert.ok(chatarrero, 'se perdió el proveedor que sólo existe por su nota')
    assert.equal(chatarrero[2], 'Confirmar trueque con chatarra propia')
    assert.equal(chatarrero[1], '', 'sin CUIT va vacío, nunca "(falta)"')
  })

  it('un proveedor sin CUIT y sin nota entra igual, con las dos celdas vacías', () => {
    const f = filasDeLaAuxiliar({ proveedores, notas }).find((x) => x[0] === 'Ruviño Matias Esteban')
    assert.deepEqual(f, ['Ruviño Matias Esteban', '', ''])
  })

  it('una nota en blanco no ocupa una fila ni pisa la del proveedor', () => {
    const f = filasDeLaAuxiliar({ proveedores, notas }).find((x) => x[0] === 'Hormiserv')
    assert.deepEqual(f, ['Hormiserv', '30-71234567-8', ''])
  })

  it('no repite un proveedor que está en las dos tablas, y ordena en es-AR', () => {
    const nombres = filasDeLaAuxiliar({ proveedores, notas }).slice(1).map((f) => f[0])
    assert.equal(new Set(nombres).size, nombres.length)
    assert.deepEqual(nombres, ['Alumetal', 'Chatarrero', 'Hormiserv', 'Ruviño Matias Esteban'])
  })

  it('sin datos devuelve sólo el encabezado: nunca una auxiliar inventada', () => {
    assert.deepEqual(filasDeLaAuxiliar(), [[...ENCABEZADOS_AUX]])
  })
})

describe('un solo dueño de _PROVEEDORES_OS', () => {
  it('EL DEFECTO: dos scripts la rehacían entera y lo resolvía el orden de PASOS', () => {
    // `proveedores-notas-visibles.mjs` la escribía con tres columnas y `proveedores-cuenta-corriente`
    // con dos: ganaba el que corría último. Entre uno y otro la auxiliar tenía DOS columnas y el
    // VLOOKUP de la nota —que pide la tercera— devolvía vacío en toda la corrida.
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts')
    const escritores = readdirSync(dir)
      .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
      .filter((f) => {
        const src = readFileSync(join(dir, f), 'utf8')
        // Escribir la auxiliar es tocar SU sheetId: nombrarla para leerla con una fórmula no cuenta.
        return src.includes('_PROVEEDORES_OS') && /aux\.sheetId|auxiliar\.sheetId/.test(src)
      })
    assert.deepEqual(escritores, ['proveedores-cuenta-corriente.mjs'],
      'la auxiliar tiene que tener un solo escritor: el que la crea y corre primero')
  })
})

describe('conGuiones', () => {
  it('formatea once dígitos y deja lo demás como está', () => {
    assert.equal(conGuiones('30712345678'), '30-71234567-8')
    assert.equal(conGuiones('30-71234567-8'), '30-71234567-8')
    assert.equal(conGuiones('123'), '123')
    assert.equal(conGuiones(null), '')
  })
})
