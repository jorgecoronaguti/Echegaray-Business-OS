import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PASOS } from '../lib/flujo-caja-pasos.mjs'

// EL DEFECTO QUE ATRAPA (auditoría del 10/09/2026).
//
// «Proveedores» se reescribía en cada corrida y NADIE estampaba `sheet_tab_firma`: el control de
// coherencia la daba «ATRASADA hace 81 h» ocho minutos después de rehacerla. Sella el ÚLTIMO de sus
// seis pasos, porque la firma tiene que ser la de la pestaña tal como quedó.

const aca = path.dirname(fileURLToPath(import.meta.url))
const fuente = (s) => readFileSync(path.join(aca, s), 'utf8')

/** Los pasos del pipeline que escriben algún bloque de «Proveedores», en su orden real. */
const pasosDeProveedores = () => PASOS
  .map(([script], i) => ({ script, i }))
  .filter(({ script }) => /^proveedores-/.test(script))

test('el ÚLTIMO paso de «Proveedores» es el que sella la firma', () => {
  const pasos = pasosDeProveedores()
  assert.ok(pasos.length >= 5, 'siguen siendo varios bloques con dueños distintos')
  const ultimo = pasos[pasos.length - 1].script
  assert.equal(ultimo, 'proveedores-encabezado-aplicar.mjs',
    'si entra un paso de Proveedores DESPUÉS del encabezado, el sello tiene que mudarse a él: '
    + 'sellar en uno del medio registra una foto que ya no existe')
  const src = fuente(ultimo)
  assert.match(src, /sellarFirma\(google, ID, PESTAÑA\)/, 'sella la pestaña que declara como suya')
  assert.match(src, /const PESTAÑA = 'Proveedores'/)
})

test('el sello va DESPUÉS de escribir, no antes', () => {
  const src = fuente('proveedores-encabezado-aplicar.mjs')
  assert.ok(src.indexOf('spreadsheetBatchUpdate') < src.indexOf('sellarFirma'),
    'una firma tomada antes de escribir registra la pestaña vieja')
})

test('y no se sella en silencio si falla: el control seguiría mintiendo', () => {
  const src = fuente('proveedores-encabezado-aplicar.mjs')
  assert.match(src, /no pude sellar la firma/, 'el fallo del sello se dice en voz alta')
})
