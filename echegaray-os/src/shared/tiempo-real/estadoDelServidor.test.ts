import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alRecibirDelServidor, fusionarConElServidor, huellaDe, nacer } from './estadoDelServidor.ts'

test('otro usuario cambió el dato: el control adopta el valor nuevo del servidor', () => {
  // EL DEFECTO DEL 16/09/2026: «tarde» marcado en el teléfono no se veía en la compu.
  let e = nacer({ llegoTarde: false, salioAntes: false })
  const n = alRecibirDelServidor(e, { llegoTarde: true, salioAntes: false })
  assert.ok(n, 'con useState(inicial) esto era null para siempre')
  e = n!
  assert.deepEqual(e.valor, { llegoTarde: true, salioAntes: false })
})

test('el mismo valor del servidor no pisa lo que esta persona acaba de tocar', () => {
  const e = { ...nacer('quattropani'), valor: 'messina' } // cambio local todavía no releído
  assert.equal(alRecibirDelServidor(e, 'quattropani'), null)
})

test('un refresco con un arreglo nuevo pero igual no cuenta como cambio', () => {
  const e = nacer([{ persona: 'a', estado: 'presente' }])
  assert.equal(alRecibirDelServidor(e, [{ persona: 'a', estado: 'presente' }]), null)
  assert.ok(alRecibirDelServidor(e, [{ persona: 'a', estado: 'ausente' }]))
})

test('los Set tienen huella por contenido, no por identidad', () => {
  assert.equal(huellaDe(new Set(['b', 'a'])), huellaDe(new Set(['a', 'b'])))
  assert.notEqual(huellaDe(new Set(['a'])), huellaDe(new Set(['a', 'b'])))
})

test('formulario de varias filas: lo intacto adopta al otro usuario, lo tocado sin guardar se respeta', () => {
  const base = { a: { estado: null }, b: { estado: null }, c: { estado: 'presente' } }
  const local = { a: { estado: 'presente' }, b: { estado: null }, c: { estado: 'presente' } } // tocó «a»
  const nueva = { a: { estado: 'ausente' }, b: { estado: 'presente' }, c: { estado: 'licencia' }, d: { estado: null } }
  assert.deepEqual(fusionarConElServidor(local, base, nueva), {
    a: { estado: 'presente' }, // lo que esta persona está marcando no se le pisa
    b: { estado: 'presente' }, // lo marcó otro desde el teléfono
    c: { estado: 'licencia' },
    d: { estado: null }, // alguien traído a la obra
  })
})
