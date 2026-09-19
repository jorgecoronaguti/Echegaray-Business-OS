import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificarEntornoWeb, decidirAccesoWeb } from './entorno'

test('Vercel y producción por descarte pasan; next dev y worktree frenan sin declaración', () => {
  assert.equal(decidirAccesoWeb(clasificarEntornoWeb({ env: { VERCEL: '1', NODE_ENV: 'production' } })).accion, 'pasa')
  assert.equal(decidirAccesoWeb(clasificarEntornoWeb({ env: { NODE_ENV: 'production' }, cwd: '/home/jorge/echegaray-os/app/echegaray-os' })).accion, 'pasa')
  const dev = decidirAccesoWeb(clasificarEntornoWeb({ env: { NODE_ENV: 'development' } }))
  assert.equal(dev.accion, 'frena'); assert.match(dev.motivo, /ECHEGARAY_ENTORNO=produccion/)
  assert.equal(decidirAccesoWeb(clasificarEntornoWeb({ env: { NODE_ENV: 'production' }, cwd: '/home/j/app/wt-x/echegaray-os' })).accion, 'frena')
  assert.equal(decidirAccesoWeb(clasificarEntornoWeb({ env: { NODE_ENV: 'production' }, cwd: '/home/j/app/.claude/worktrees/a/echegaray-os' })).accion, 'frena')
})

test('la declaración explícita abre la puerta, y queda dicho', () => {
  const c = clasificarEntornoWeb({ env: { NODE_ENV: 'development', ECHEGARAY_ENTORNO: 'produccion' } })
  assert.equal(c.declarado, true)
  assert.equal(decidirAccesoWeb(c).accion, 'pasa')
})
