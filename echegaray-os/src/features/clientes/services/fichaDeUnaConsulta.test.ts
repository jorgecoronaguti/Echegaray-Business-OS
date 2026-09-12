// LA FICHA PIDE LA CARA QUE VA A DIBUJAR, Y NO CUENTA CON LO QUE YA NO LE MANDAN.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// Desde 20260911T1200 `pantalla_cliente()` recorta: `documentos` y `drive` viajan sólo en las caras
// Documentos y Actividad (94 KB de 199 en el cliente más pesado). Ese recorte tiene DOS mitades en
// TypeScript y las dos se rompen en silencio:
//
//   1 · si la página deja de mandar `p_solapa`, la RPC vuelve a traer la ficha entera y el ahorro
//       desaparece sin que nada falle — el defecto más caro, porque se ve exactamente igual;
//   2 · si el conteo de la barra vuelve a salir del `.length` de `documentos`, las siete caras que
//       ya no reciben la lista escribirían «Documentos · 0» sobre un cliente con 208 papeles, que
//       es un dato FALSO a cambio de ancho de banda.
//
// ═══ POR QUÉ LEE EL ARCHIVO Y NO LLAMA A LA FUNCIÓN ═══
//
// `fichaDeUnaConsulta.ts` importa por alias (`@/features/presupuestos/…`) y `node --test` —que es
// el runner que produce la evidencia de cierre acá— no resuelve el alias: importarla tira
// ERR_MODULE_NOT_FOUND antes de correr nada. Un control que no se puede correr no es un control.
// Se lee el TEXTO, que es lo que hace el test hermano de las RPC
// (`src/shared/definiciones/rpc-de-pantalla-lee-lo-canonico.test.ts`). Lo que este barrido NO puede
// ver es si el valor que viaja es el correcto: eso lo mide contra la base real
// `orquestador/lib/pantalla-cliente-rpc.pg.test.mjs`.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../../../../', import.meta.url))
const lector = readFileSync(RAIZ + 'src/features/clientes/services/fichaDeUnaConsulta.ts', 'utf8')
const pagina = readFileSync(RAIZ + 'src/app/(main)/clientes/[cliente]/page.tsx', 'utf8')

test('la lectura de la ficha le manda a la RPC la cara que se va a dibujar', () => {
  assert.match(lector, /supabase\.rpc\('pantalla_cliente',\s*\{\s*p_slug:\s*slug,\s*p_solapa:\s*solapa\s*\}\)/,
    'la RPC dejó de recibir p_solapa: vuelve a viajar la ficha entera en las nueve caras')
  assert.match(lector, /solapa:\s*string/, 'la firma dejó de pedir la solapa')
})

test('la página resuelve la solapa ANTES de leer, y se la pasa', () => {
  const iSolapa = pagina.indexOf('const solapa = solapaDe(')
  const iLectura = pagina.indexOf('leerFichaDeUnaConsulta(supabase, slug')
  assert.ok(iSolapa > 0, 'la página no resuelve la solapa')
  assert.ok(iLectura > 0, 'la página no lee la ficha')
  assert.ok(iSolapa < iLectura, 'la solapa se resuelve DESPUÉS de leer: la RPC no puede recortar')
  // ═══ LA CARA QUE SE LE PIDE A LA RPC NO SIEMPRE ES LA QUE SE DIBUJA (12/09/2026) ═══
  //
  // Desde que «Actividad» dejó de ser una solapa, la línea de tiempo COMPLETA se abre dentro de
  // Trabajos con `?actividad=todo` — y necesita `documentos` + `drive`, que son 49 KB de los 90 que
  // pesa Messina y que la cara Trabajos no arrastra. Se le pide a la RPC la cara `actividad` sólo
  // cuando alguien la abre; el resto del tiempo, la que se dibuja.
  assert.match(pagina, /const caraDeLaRPC = q\.actividad === 'todo' \? 'actividad' : solapa/,
    'la cara que se le pide a la RPC dejó de decidirse en un lugar')
  assert.match(pagina, /leerFichaDeUnaConsulta\(supabase,\s*slug,\s*caraDeLaRPC\)/)
})

test('la barra de solapas cuenta con n_documentos y no con el largo de la lista recortada', () => {
  assert.match(lector, /nDocumentos:\s*j\.n_documentos\s*\?\?\s*0/,
    'el lector dejó de transportar n_documentos')
  // `+ nPapeles` SE FUE EL 11/09/2026 17:50. Sumaba los papeles del OS al conteo de la RPC y contaba
  // DOS VECES los que además están en Drive; y la RPC contaba sólo los vínculos manuales, que en San
  // Francisco son cero con 63 archivos abajo — «Documentos · 0», que es lo que el dueño mandó
  // arreglar. Ahora el número sale entero de `n_documentos` (20260911T2200 lo cuenta sobre las
  // MISMAS cuatro fuentes que dibuja la cara) y lo compara con TypeScript
  // `orquestador/lib/cara-documentos.pg.test.mjs`. Lo que este test sigue cuidando es lo de siempre:
  // que la barra NO cuente el largo de un array recortado.
  assert.match(pagina, /documentos:\s*ficha\.nDocumentos\b/,
    'la barra volvió a contar el array: escribiría «Documentos · 0» en las siete caras recortadas')
  assert.doesNotMatch(pagina, /documentos:\s*cara\.total/,
    'la barra volvió a contar lo que dibuja ESTA cara: el mismo cliente mostraría un número distinto '
    + 'en cada solapa, porque los papeles de obra sólo viajan en Documentos')
  // Y AL REVÉS: que no quede ningún `.length` de `documentos` alimentando ese conteo.
  assert.doesNotMatch(pagina, /documentos:\s*lector\.leer\(documentos,\s*\[\]\)\.length/,
    'volvió el conteo por `.length` sobre una lista que no siempre viaja')
})
