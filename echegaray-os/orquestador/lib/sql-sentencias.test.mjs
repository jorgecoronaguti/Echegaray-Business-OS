import { test } from 'node:test'
import assert from 'node:assert/strict'
import { partirSentencias, esErrorDeDatos, degradarAfirmacionesDeDatos } from './sql-sentencias.mjs'

test('parte por ; de nivel superior y respeta $$, comillas y comentarios', () => {
  const sql = `-- comentario; con punto y coma
create table t (a text default 'x;y'); /* otro; */
do $$ begin if 1 <> 2 then raise exception 'no; %', 1; end if; end $$;
create function f() returns void language plpgsql as $fn$ begin perform 1; end $fn$;
insert into t values ('a''b;c')`
  const s = partirSentencias(sql)
  assert.equal(s.length, 4)
  assert.match(s[0], /^create table/)
  assert.match(s[1], /^do \$\$/)
  assert.match(s[2], /^create function/)
  assert.match(s[3], /^insert/)
})

test('clasifica errores de datos y no de esquema', () => {
  assert.equal(esErrorDeDatos('23503'), true)
  assert.equal(esErrorDeDatos('P0001'), true)
  assert.equal(esErrorDeDatos('22012'), true)
  assert.equal(esErrorDeDatos('42703'), false)
  assert.equal(esErrorDeDatos('42P01'), false)
})

test('degrada raise exception sólo dentro de do-bloques', () => {
  const sql = `do $$ begin raise exception 'x'; end $$;
create function g() returns void language plpgsql as $$ begin raise exception 'y'; end $$;`
  const d = degradarAfirmacionesDeDatos(sql)
  assert.match(d, /do \$\$ begin raise warning 'x'/)
  assert.match(d, /function g\(\)[\s\S]*raise exception 'y'/)
})
