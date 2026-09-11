// LA VISTA «QUINCENA» ES LA QUE ABRE, Y ESCRIBE LAS CELDAS QUE EL DUEÑO TECLEA.
//
// Dueño, 11/09/2026, tres veces: *«No me sirve la sección Liquidación en módulo Personal… tengo que
// seguir usando Sheet JORNALES»*. El defecto no era un número: era que la pantalla que él abre no
// existía, y las dos mitades de su planilla —los días y la plata— vivían en dos solapas distintas.
//
// ═══ POR QUÉ SE PRUEBA SOBRE EL CÓDIGO FUENTE ═══
//
// Mismo criterio que `pagosEditable.test.ts`: un Server Component no se monta en `node --test` sin
// levantar Next. Lo que se puede probar sin base —el registro de solapas, el default, y que la grilla
// escribe con las acciones que ya existen en vez de copiarlas— se prueba acá; que la celda guarde de
// verdad lo prueba el E2E contra la base. La MUTACIÓN que pone esto rojo es devolver
// `SOLAPA_POR_DEFECTO` a `'horas'`, sacar `quincena` del registro, o reemplazar `guardarHorasDeLaCelda`
// por un `update` escrito a mano dentro del componente.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// `index.ts` NO SE IMPORTA: arrastra los siete componentes y `node --test` no resuelve un `.tsx` sin
// extensión. Es el mismo límite que ya obligó a `pagosEditable.test.ts` a leer el fuente.
const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const INDICE = fuente('./index.ts')
const GRILLA = fuente('../GrillaEspejoQuincena.tsx')
const VISTA = fuente('./quincena.tsx')

/**
 * EL BLOQUE DEL REGISTRO, no el archivo entero: la cabecera EXPLICA qué significa `Componente: null` y
 * un `includes` sobre todo el fuente lo encontraba ahí. Un test que lee el comentario en vez del
 * código da rojo por la documentación y verde por el defecto.
 */
const REGISTRO = INDICE.slice(INDICE.indexOf('export const SOLAPAS'))

/** Las claves del registro, en el orden en que están escritas. El orden de la lista ES el de la barra. */
const claves = (): string[] =>
  [...REGISTRO.matchAll(/\{ clave: '([a-z]+)', titulo:/g)].map((m) => m[1])

test('«QUINCENA» ES LA PRIMERA DE LA BARRA Y LA QUE ABRE POR DEFECTO', () => {
  assert.equal(claves()[0], 'quincena')
  assert.match(INDICE, /SOLAPA_POR_DEFECTO: ClaveDeSolapa = 'quincena'/)
  // Tiene componente: una solapa sin pantalla se dibuja apagada, y ésta es la que abre.
  assert.match(REGISTRO, /clave: 'quincena'[^}]*Componente: SolapaQuincena/)
})

test('LAS SEIS SOLAPAS ANTERIORES SIGUEN EN LA BARRA Y CON SU PANTALLA', () => {
  // EL DEFECTO QUE ATRAPA: «arreglar» Liquidación borrando lo que ya funcionaba. Cambiar el default
  // no es sacar una pantalla.
  assert.deepEqual(claves(), ['quincena', 'horas', 'pagos', 'costo', 'convenios', 'cierre', 'recibos'])
  assert.ok(!/Componente: null/.test(REGISTRO), 'ninguna solapa quedó sin pantalla')
})

test('LA GRILLA ESCRIBE CON LAS ACCIONES QUE YA EXISTEN, NO CON UNA COPIA', () => {
  // Dos definiciones de «corregir un jornal» son dos historiales, y el que se lee es el de la otra.
  assert.match(GRILLA, /guardarHorasDeLaCelda\.bind\(null, personaId, celda\.fecha\)/)
  assert.match(GRILLA, /from '\.\/CeldasDeLiquidacion'/)
  assert.ok(!/from '@supabase/.test(GRILLA), 'la grilla no habla con la base: recibe filas armadas')
  assert.ok(!/\.update\(|\.insert\(/.test(GRILLA), 'ni una escritura suelta dentro del componente')
})

test('LA VISTA NO RECALCULA LA CADENA DE PAGO NI LAS HORAS', () => {
  // EL DEFECTO QUE ATRAPA: una tercera definición de la quincena. Si esta pantalla multiplicara horas
  // por tarifa, el dueño tendría tres números para la misma persona.
  assert.match(VISTA, /getLiquidacionDeLaQuincena/)
  assert.match(VISTA, /filasDelEspejo/)
  assert.ok(!/valorHora\s*\*/.test(VISTA), 'la vista no multiplica horas por tarifa')
  assert.ok(!/cobra\s*-\s*/.test(VISTA), 'la vista no rehace la resta de la cadena')
})

test('EL SELLO DICE «SIN LEER» CUANDO NO HAY ESPEJO: un control que no mira no dice que está bien', () => {
  assert.match(VISTA, /espejo-sin-leer/)
  assert.match(VISTA, /sin leer para esta quincena/)
  // Y nombra cómo se llena, porque un estado sin salida obliga a preguntar.
  assert.match(VISTA, /jornales-espejo-bloques\.mjs/)
})
