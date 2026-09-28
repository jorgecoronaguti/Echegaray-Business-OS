// El recorrido del control del grafo (`verificar-grafo-ficha-cache.mjs`), sobre un catálogo armado a
// mano. Lo que prueba es lo que el script afirma: que una tabla leída sin trigger ni declaración
// sale como faltante (código 1), y que los falsos positivos por nombre suelto no entran.

import test from 'node:test'
import assert from 'node:assert/strict'
import { faltantes, recorrerGrafo } from './ficha-cache-grafo.mjs'

const catalogo = () => ({
  relaciones: new Map([
    ['clientes', 'r'], ['analisis', 'r'], ['obras', 'r'], ['activo', 'r'], ['certificado_cliente', 'r'],
    ['v_economia', 'v'], ['huerfana', 'r'],
  ]),
  funciones: new Map([
    ['pantalla_cliente_en_vivo', `
      select k.activo from public.clientes k   -- activo es columna, no tabla
      join lateral (select * from (((analisis a on true)))) x on true
      where public.ayuda(k.id)`],
    ['ayuda', 'select 1 from v_economia'],
    ['hh_de_obra_en_vivo', 'select 1 from certificado_cliente'],
    ['sin_llamar', 'select * from huerfana'],
  ]),
  // `obras` como CTE de la vista: pg_depend no la registra, así que no entra.
  dependencias: new Map([['r:v_economia', new Set(['r:clientes'])]]),
})

test('recorre funciones por texto y vistas por pg_depend, sin falsos positivos por nombre', () => {
  const { tablas } = recorrerGrafo(catalogo())
  assert.deepEqual([...tablas].sort(), ['analisis', 'certificado_cliente', 'clientes'])
})

test('una tabla leída sin trigger ni declaración es faltante; con cualquiera de los dos, no', () => {
  const tablas = new Set(['clientes', 'analisis', 'certificado_cliente'])
  const migracion = (extra) => `
-- ═══ LO QUE QUEDA CUBIERTO SÓLO POR EL VENCIMIENTO ═══
--   · \`analisis\`
-- ═══ OTRA ═══
create or replace trigger trg_ficha_inv after insert on public.clientes
  for each row execute function public.tr_ficha_inv_fila('cliente', 'id');
${extra}`
  assert.deepEqual(faltantes(tablas, migracion('')), ['certificado_cliente'])
  // En una sola línea: si el comentario no se quitara, el patrón la tomaría como trigger.
  const comentado = "-- create or replace trigger trg_ficha_inv after insert on public.certificado_cliente for each row execute function public.tr_ficha_inv_fila('todo');"
  assert.deepEqual(faltantes(tablas, migracion(comentado)), ['certificado_cliente'])
  const real = comentado.slice(3)
  assert.deepEqual(faltantes(tablas, migracion(real)), [])
})
