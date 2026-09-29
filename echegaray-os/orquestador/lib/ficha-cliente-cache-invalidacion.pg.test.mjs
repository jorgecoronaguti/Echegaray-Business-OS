// LA CACHÉ DE LA FICHA CONTRA UNA BASE REAL — sólo una RAMA de Supabase con 20260928T2330 aplicada.
//
// ═══ POR QUÉ YA NO APLICA LA MIGRACIÓN DENTRO DE UN ROLLBACK ═══
//
// La versión anterior corría la migración en BEGIN … ROLLBACK sobre la base compartida. Dos motivos
// para no volver a eso: el 28/09 a las 19:08 esa corrida contra la viva trabó 39 tablas y tiró el
// login 25 minutos; y el cron ahora es un PROCEDURE con COMMIT por fila, que dentro de un BEGIN no
// corre. Los ensayos viven en `ficha-cache-ensayo.mjs` y los comparte el script
// `orquestador/scripts/ensayar-ficha-cache.mjs`, que se niega ante la URL de producción.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1a · QUE EL CRON NO CORRA COMO LO LLAMA pg_cron (`call` en autocommit), o que deje tomado su
//       candado de sesión y la corrida siguiente ceda para siempre.
//  1b · QUE UNA ESCRITURA DE LA APP ESPERE AL CRON (el rechazo de 7b0c045b: lock_timeout de 8 s o
//       40P01). Una transacción abierta escribe `liquidacion_linea` antes y durante el call; se mira
//       pg_locks cada 50 ms y cualquier `granted = false` de los dos es rojo. También, que la marca
//       «*» de esa transacción abierta desaparezca cuando el call consume la «*» confirmada.
//  1c · QUE LA LECTURA SIRVA UNA FILA MARCADA, o que el call no consuma la marca y la fila no vuelva.
//
//     ORQ_FICHA_ENSAYO_URL='<url de la rama>' node --test orquestador/lib/ficha-cliente-cache-invalidacion.pg.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { ensayar } from '../scripts/ensayar-ficha-cache.mjs'

const URL_ENSAYO = process.env.ORQ_FICHA_ENSAYO_URL

test('en una rama con la migración: el call corre, no hace esperar a la app y la lectura respeta la marca',
  { skip: !URL_ENSAYO && 'sólo contra una rama de Supabase: ORQ_FICHA_ENSAYO_URL=<url>' }, async () => {
    const { codigo, texto } = await ensayar(URL_ENSAYO)
    assert.equal(codigo, 0, texto)
  })
