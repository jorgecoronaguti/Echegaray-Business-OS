// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//   · QUE UN ERROR DE LECTURA SE DIBUJE COMO «SIN CONTACTOS». Un proveedor con tres personas cargadas
//     aparecería vacío, y alguien las volvería a cargar.
//   · QUE LA TABLA QUE FALTA SE DIGA COMO ERROR CRÍPTICO en vez de nombrar la migración pendiente.
//   · QUE UN UPDATE/DELETE FILTRADO POR RLS (204, cero filas, sin error) SE CONTESTE COMO «GUARDADO».
//   · QUE UN RECHAZO DE LA BASE SE TAPE CON «HUBO UN PROBLEMA» y se pierda el único dato útil.
//   · QUE LA MIGRACIÓN ABRA LO QUE NO DEBE: un `for all`, una policy sin `es_administracion()`, el
//     `proveedor_id` editable por GRANT, o una tabla sin RLS. Se lee el archivo: la base real no la
//     tiene todavía (la aplica el dueño) y esto fija la FORMA antes de que llegue.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  MIGRACION_CONTACTOS_PROVEEDOR, avisoSinTabla, clasificarLectura, sinFilaAfectada, traducirErrorContacto,
} from './contactosProveedor.ts'

const FILA = { id: 'c1', nombre: 'Ariel Gómez', rol: 'comercial', email: null, telefono: '+54 264 471-2200', notas: null }

test('lectura buena: las filas tal cual', () => {
  assert.deepEqual(clasificarLectura([FILA], null), { estado: 'ok', contactos: [FILA] })
  assert.deepEqual(clasificarLectura([], null), { estado: 'ok', contactos: [] })
})

test('un error de lectura NO es «sin contactos»', () => {
  const r = clasificarLectura(null, { code: '57014', message: 'canceling statement due to statement timeout' })
  assert.equal(r.estado, 'error')
  if (r.estado === 'error') assert.match(r.error, /timeout/)
})

test('la tabla que no está es su propio estado, y el aviso nombra la migración', () => {
  assert.deepEqual(clasificarLectura(null, { code: 'PGRST205', message: 'Could not find the table' }), { estado: 'sin-tabla' })
  assert.deepEqual(clasificarLectura(null, { code: '42P01', message: 'relation does not exist' }), { estado: 'sin-tabla' })
  assert.ok(avisoSinTabla().includes(MIGRACION_CONTACTOS_PROVEEDOR))
})

test('una escritura sin fila afectada no es un éxito', () => {
  assert.match(sinFilaAfectada([]) ?? '', /No guardé nada/)
  assert.match(sinFilaAfectada(null) ?? '', /No guardé nada/)
  assert.equal(sinFilaAfectada([{ id: 'c1' }]), null)
})

test('el rechazo de la base se dice por su nombre y empieza por lo que NO pasó', () => {
  assert.match(traducirErrorContacto({ code: 'PGRST205' }), new RegExp(MIGRACION_CONTACTOS_PROVEEDOR))
  assert.match(traducirErrorContacto({ code: '42501', message: 'permission denied for table proveedor_contacto' }), /permiso/)
  const otro = traducirErrorContacto({ code: '23514', message: 'violates check constraint "proveedor_contacto_nombre_check"' })
  assert.match(otro, /^No guardé nada/)
  assert.match(otro, /proveedor_contacto_nombre_check/)
})

// ── LA FORMA DE LA MIGRACIÓN ─────────────────────────────────────────────────────────────────────

const sql = readFileSync(
  fileURLToPath(new URL(`../../../../supabase/migrations/${MIGRACION_CONTACTOS_PROVEEDOR}.sql`, import.meta.url)),
  'utf8',
).replace(/--[^\n]*/g, '')

test('la migración existe con el nombre que la pantalla le dice al dueño', () => {
  assert.match(sql, /create table if not exists public\.proveedor_contacto/)
  assert.match(sql, /proveedor_id\s+uuid not null references public\.proveedores\(id\)/)
})

test('RLS encendida, cuatro policies con la puerta de la ficha y ningún `for all`', () => {
  assert.match(sql, /alter table public\.proveedor_contacto enable row level security/)
  assert.doesNotMatch(sql, /for all/i)
  for (const cmd of ['select', 'insert', 'update', 'delete']) {
    const re = new RegExp(`create policy proveedor_contacto_${cmd} on public\\.proveedor_contacto\\s+for ${cmd} to authenticated[^;]*es_administracion\\(\\)`)
    assert.match(sql, re, `falta o está abierta la policy de ${cmd}`)
  }
  assert.doesNotMatch(sql, /using \(true\)|with check \(true\)/i)
})

test('GRANT explícito, y el update no alcanza a proveedor_id', () => {
  assert.match(sql, /grant select, delete on public\.proveedor_contacto to authenticated/)
  assert.match(sql, /grant insert \(proveedor_id, nombre, rol, email, telefono, notas\) on public\.proveedor_contacto to authenticated/)
  const update = sql.match(/grant update \(([^)]*)\) on public\.proveedor_contacto to authenticated/)
  assert.ok(update, 'falta el grant de update')
  assert.doesNotMatch(update[1], /proveedor_id|creado_en|\bid\b/)
})
