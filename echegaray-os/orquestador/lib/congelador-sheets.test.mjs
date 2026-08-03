import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { aviso, congelado, motivoValido, _resetAviso } from './congelador-sheets.mjs'

// El módulo lee RUTA_MARCA una sola vez (al importarse), así que los tests apuntan la marca a un
// archivo temporal ANTES de importar. Se hace con un import dinámico por test.
async function conMarca(texto, fn, { desc } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'congelador-'))
  const ruta = path.join(dir, 'SHEETS-CONGELADOS')
  if (texto !== null) fs.writeFileSync(ruta, texto)
  const previoMarca = process.env.ORQ_SHEETS_MARCA
  const previoDesc = process.env.ORQ_SHEETS_DESCONGELAR
  process.env.ORQ_SHEETS_MARCA = ruta
  if (desc === undefined) delete process.env.ORQ_SHEETS_DESCONGELAR
  else process.env.ORQ_SHEETS_DESCONGELAR = desc
  try {
    const mod = await import(`./congelador-sheets.mjs?t=${Math.random()}`)
    mod._resetAviso()
    return await fn(mod)
  } finally {
    if (previoMarca === undefined) delete process.env.ORQ_SHEETS_MARCA; else process.env.ORQ_SHEETS_MARCA = previoMarca
    if (previoDesc === undefined) delete process.env.ORQ_SHEETS_DESCONGELAR; else process.env.ORQ_SHEETS_DESCONGELAR = previoDesc
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('con la marca puesta, TODA escritura se frena', async () => {
  await conMarca('congelado por pedido del dueño el 02/08', (m) => {
    const r = m.frenar('FILE', "'CAJA'!A1:Z200")
    assert.equal(r.protegido, true)
    assert.equal(r.congelado, true)
    assert.match(r.motivo, /pedido del dueño/)
  })
})

test('sin marca, no frena nada — el freno es explícito, no el estado por defecto', async () => {
  await conMarca(null, (m) => assert.equal(m.frenar('FILE', 'X'), null))
})

test('una marca vacía SIGUE congelando: el archivo existe, esa es la decisión', async () => {
  // Si alguien la vacía por accidente (un `> marca`), el efecto no puede ser descongelar.
  await conMarca('   \n  ', (m) => {
    const r = m.frenar('FILE', 'X')
    assert.ok(r, 'un archivo vacío no descongela')
    assert.match(r.motivo, /congelada por pedido del dueño/)
  })
})

test('la forma del retorno es la que los llamadores YA saben leer', async () => {
  // `{ protegido: true }` es lo que devuelve la guarda cuando descarta una escritura. Devolver lo mismo
  // significa que ningún script se rompe con el freno puesto: simplemente no escribe.
  await conMarca('x'.repeat(20), (m) => {
    const r = m.frenar('FILE', 'X')
    assert.deepEqual(Object.keys(r).sort(), ['bloqueadas', 'congelado', 'motivo', 'protegido'])
  })
})

test('el aviso sale UNA sola vez por proceso, no una por rango', async () => {
  await conMarca('motivo largo de prueba', (m) => {
    const lineas = []
    const orig = console.log
    console.log = (s) => lineas.push(s)
    try { for (let i = 0; i < 50; i++) m.frenar('FILE', `R${i}`) } finally { console.log = orig }
    assert.equal(lineas.length, 1, 'un generador con 200 rangos no puede escupir 200 avisos')
  })
})

test('ORQ_SHEETS_DESCONGELAR con motivo levanta el freno para ESA corrida', async () => {
  await conMarca('congelado', (m) => assert.equal(m.frenar('FILE', 'X'), null),
    { desc: 'restauro el formato de CAJA que pidió el dueño' })
})

test('ORQ_SHEETS_DESCONGELAR=1 NO sirve: hace falta un motivo escrito', async () => {
  // El punto entero del freno es que levantarlo cueste una decisión y quede dicha. Un "1" es un reflejo.
  for (const flojo of ['1', 'true', 'si', 'sí', 'yes', 'ok', 'x', '', '   ']) {
    await conMarca('congelado', (m) => {
      assert.throws(() => m.frenar('FILE', 'X'), /MOTIVO/, `"${flojo}" no puede alcanzar`)
    }, { desc: flojo })
  }
})

test('motivoValido exige una frase, no una palabra suelta', () => {
  assert.equal(motivoValido('restauro CAJA a pedido'), true)
  assert.equal(motivoValido('dale'), false)
  assert.equal(motivoValido(undefined), false)
})

test('el aviso dice CÓMO levantarlo: un freno sin salida documentada se saltea a martillazos', () => {
  const a = aviso('congelado el 02/08', 'FILE', "'CAJA'!A1")
  assert.match(a, /rm .*SHEETS-CONGELADOS/)
  assert.match(a, /ORQ_SHEETS_DESCONGELAR/)
  assert.match(a, /CAJA/)
})

test('congelado() no lanza si la marca no se puede leer — pero tampoco descongela por eso', async () => {
  const previo = process.env.ORQ_SHEETS_MARCA
  process.env.ORQ_SHEETS_MARCA = '/proc/self/no-existe-jamas/marca'
  try {
    const mod = await import(`./congelador-sheets.mjs?t=${Math.random()}`)
    assert.equal(mod.congelado(), null) // no existe = no congelado; es el único caso que descongela
  } finally {
    if (previo === undefined) delete process.env.ORQ_SHEETS_MARCA; else process.env.ORQ_SHEETS_MARCA = previo
  }
})

void congelado; void _resetAviso
