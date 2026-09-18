import { test } from 'node:test'
import assert from 'node:assert/strict'
import { frontmatter, raices, rankear } from './contexto-minimo.mjs'

test('frontmatter lee name y description de una línea, con o sin comillas', () => {
  const { meta, cuerpo } = frontmatter('---\nname: caja\ndescription: "la caja operativa"\n---\ncuerpo')
  assert.equal(meta.name, 'caja'); assert.equal(meta.description, 'la caja operativa'); assert.equal(cuerpo, 'cuerpo')
  assert.deepEqual(frontmatter('sin frontmatter').meta, {})
})

test('raíces ignoran acentos y cortan a 5 letras', () => {
  assert.ok(raices('Liquidación').has('liqui')); assert.ok(raices('liquidacion quincena').has('quinc'))
})

test('el cupo por tipo deja lugar a skills y docs aunque las memorias puntúen más', () => {
  const it = (tipo, n, v) => ({ tipo, ruta: `${tipo}/${n}.md`, titulo: n, resumen: n, v })
  const items = [...Array.from({ length: 8 }, (_, n) => it('memoria', `m${n}`, [1, 0])), it('skill', 's', [0.5, 0.5]), it('doc', 'd', [0, 1])]
  const top = rankear({ items }, [1, 0], { k: 8 })
  assert.equal(top.filter((x) => x.tipo === 'memoria').length, 5)
  assert.ok(top.some((x) => x.tipo === 'skill')); assert.ok(top.some((x) => x.tipo === 'doc'))
})

test('una coincidencia léxica sube una pieza que e5 dejaba abajo', () => {
  const items = [{ tipo: 'memoria', ruta: 'm/a.md', titulo: 'otra', resumen: 'otra cosa', v: [1, 0] },
    { tipo: 'memoria', ruta: 'm/tello.md', titulo: 'pedro-tello', resumen: 'pisos industriales', v: [0.9, 0.1] }]
  const top = rankear({ items }, [1, 0], { consulta: 'lo de Tello', k: 1, cupo: { memoria: 1 } })
  assert.equal(top[0].titulo, 'pedro-tello')
})
