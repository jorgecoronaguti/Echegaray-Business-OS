// UN FAJO ABIERTO Y MUDO TIENE QUE GRITAR — sin Postgres, sin Mattermost y sin modelo.
//
// El caso: fajo `de1c9a7a`, abierto 15:20:18, con la factura 0004-00003745 de Corralón Progreso
// ($304.515,98) adentro, `aviso_post_id=null` y `error=null`. Estuvo así sin que nada avisara.

import test from 'node:test'
import assert from 'node:assert/strict'
import { barrerFajosMudos, crearVigiaDeFajosMudos, avisoDeFajo } from './vigia-mudos.mjs'
import { ESTADO } from '../../lib/comprobantes/fajo.mjs'

const ITEM_TRABADO = {
  comprobante: { proveedor: 'Corralon Progreso', cuit: '23369111574', numero: '0004-00003745', fecha: '25/08/2026', total: 304515.98 },
  posibleDuplicado: { fila: 889, numero: '0004-00003746', fecha: '25/08/2026', total: 106429.73 },
}

const FAJO_MUDO = {
  id: 'de1c9a7a-a72d-4f24-9ad5-f36fc590bd49',
  estado: ESTADO.ABIERTO,
  aviso_post_id: null,
  error: null,
  channel_id: 'c_comprobantes',
  root_post_id: 'p_ycpth5kc',
  plataforma_username: 'jorge',
  ultimo_at: new Date(Date.now() - 40 * 60_000).toISOString(),
  items: [ITEM_TRABADO],
}

/** Repositorio de mentira: sólo las dos cosas que el vigía usa. */
function repoFalso({ filas = [FAJO_MUDO], explota = false } = {}) {
  const guardados = []
  return {
    guardados,
    async fajosSinAviso() { if (explota) throw new Error('base caída (simulado)'); return filas },
    async guardarAvisoPost(_p, { id, avisoPostId }) { guardados.push({ id, avisoPostId }); return { id, aviso_post_id: avisoPostId } },
  }
}

const port = { query: async () => ({ rows: [] }) }

test('el fajo mudo recibe LA PREGUNTA que faltó, en su canal y en su hilo', async () => {
  const repo = repoFalso()
  const publicados = []
  const r = await barrerFajosMudos({
    port, repo,
    publicar: async (p) => { publicados.push(p); return { id: 'post_nuevo' } },
  })

  assert.equal(r.encontrados, 1)
  assert.equal(r.avisados, 1)
  assert.equal(publicados.length, 1)
  assert.equal(publicados[0].channelId, 'c_comprobantes')
  assert.equal(publicados[0].rootPostId, 'p_ycpth5kc', 'la respuesta va al hilo del mensaje que la originó')
  assert.match(publicados[0].texto, /fila 889/, 'tiene que decir qué se está preguntando, no «tenés algo trabado»')
  assert.match(publicados[0].texto, /es otro/, 'y con qué palabras se contesta')
  // El aviso queda guardado: sin esto el vigía repetiría el mismo mensaje cada cinco minutos.
  assert.deepEqual(repo.guardados, [{ id: FAJO_MUDO.id, avisoPostId: 'post_nuevo' }])
})

test('si NO se pudo publicar, no se marca como avisado: el próximo barrido lo reintenta', async () => {
  const repo = repoFalso()
  const r = await barrerFajosMudos({ port, repo, publicar: async () => { throw new Error('Mattermost caído') } })
  assert.equal(r.avisados, 0)
  assert.equal(r.sinAvisar, 1)
  assert.equal(repo.guardados.length, 0, 'se dio por avisado algo que nadie leyó')
})

test('si la base no contesta, NO se afirma que no hay fajos mudos', async () => {
  const r = await barrerFajosMudos({ port, repo: repoFalso({ explota: true }), publicar: async () => ({ id: 'x' }) })
  assert.deepEqual(r, { encontrados: 0, avisados: 0, sinAvisar: 0 })
})

test('un fajo abierto que YA publicó su aviso no se toca: eso no es mudo', async () => {
  const repo = repoFalso({ filas: [{ ...FAJO_MUDO, aviso_post_id: 'post_viejo' }] })
  const r = await barrerFajosMudos({ port, repo, publicar: async () => ({ id: 'x' }) })
  assert.equal(r.encontrados, 0)
})

test('el vigía respeta su intervalo: no barre en cada tick del worker', async () => {
  const repo = repoFalso()
  let t = 0
  let barridos = 0
  const vigilar = crearVigiaDeFajosMudos({
    port, repo, intervaloMs: 300_000, ahora: () => t,
    publicar: async () => { barridos++; return { id: `p${barridos}` } },
  })
  await vigilar()                    // primer tick: barre
  await vigilar(); await vigilar()   // mismos milisegundos: no
  assert.equal(barridos, 1)
  t = 300_001
  repo.guardados.length = 0
  await vigilar()                    // pasado el intervalo: vuelve a barrer
  assert.equal(barridos, 2)
})

test('sin nada que preguntar el aviso igual dice qué quedó adentro, nunca se calla', () => {
  const texto = avisoDeFajo({ items: [{ comprobante: { proveedor: 'X', total: 100, numero: '1', fecha: '25/08/2026' } }] },
    { minutos: 30, comprobantes: 1 })
  assert.match(texto, /30 minutos/)
  assert.match(texto, /descartalo/)
})
