// LA VISTA «QUINCENA» ES LA QUE ABRE, Y ESCRIBE LAS CELDAS QUE EL DUEÑO TECLEA.
//
// Dueño, 11/09/2026, tres veces: *«No me sirve la sección Liquidación en módulo Personal… tengo que
// seguir usando Sheet JORNALES»*. Y el 14/09/2026, sobre esa versión: *«demasiado resumido, no puedo
// modificar el valor hora, no tengo referencias de valores hs históricos… rehacer toda la sección»*.
//
// ═══ POR QUÉ SE PRUEBA SOBRE EL CÓDIGO FUENTE ═══
//
// Mismo criterio que `pagosEditable.test.ts`: un Server Component no se monta en `node --test` sin
// levantar Next, y una server action no corre sin Supabase. Lo que se puede probar sin base —el
// registro de solapas, que la grilla escribe con las acciones que ya existen, que la vista no
// recalcula la cadena y que el $/h se INSERTA— se prueba acá; que la celda guarde de verdad lo prueba
// el E2E contra la base.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// `index.ts` NO SE IMPORTA: arrastra los siete componentes y `node --test` no resuelve un `.tsx` sin
// extensión. Es el mismo límite que ya obligó a `pagosEditable.test.ts` a leer el fuente.
const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const INDICE = fuente('./index.ts')
const GRILLA = fuente('../GrillaEspejoQuincena.tsx')
const CELDAS = fuente('../cuadro/CeldasDelEspejo.tsx')
const TARIFA = fuente('../cuadro/CeldaTarifa.tsx')
const HISTORIAL = fuente('../cuadro/HistorialDeTarifa.tsx')
const FILTROS = fuente('../cuadro/FiltrosDelEspejo.tsx')
const VISTA = fuente('./quincena.tsx')
const ACCION = fuente('../../../services/tarifaDeLaQuincenaActions.ts')
const COMPONENTES = [GRILLA, CELDAS, TARIFA, HISTORIAL, FILTROS]

/** El código sin comentarios: una cabecera que EXPLICA la regla no puede hacer pasar el test. */
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * EL BLOQUE DEL REGISTRO, no el archivo entero: la cabecera EXPLICA qué significa `Componente: null` y
 * un `includes` sobre todo el fuente lo encontraba ahí.
 */
const REGISTRO = INDICE.slice(INDICE.indexOf('export const SOLAPAS'))

const claves = (): string[] =>
  [...REGISTRO.matchAll(/\{ clave: '([a-z]+)', titulo:/g)].map((m) => m[1])

test('«QUINCENA» ES LA PRIMERA DE LA BARRA Y LA QUE ABRE POR DEFECTO', () => {
  assert.equal(claves()[0], 'quincena')
  assert.match(INDICE, /SOLAPA_POR_DEFECTO: ClaveDeSolapa = 'quincena'/)
  assert.match(REGISTRO, /clave: 'quincena'[^}]*Componente: SolapaQuincena/)
})

test('LAS SEIS SOLAPAS ANTERIORES SIGUEN EN LA BARRA Y CON SU PANTALLA (dueño: «no quitar»)', () => {
  assert.deepEqual(claves(), ['quincena', 'horas', 'pagos', 'costo', 'convenios', 'cierre', 'recibos'])
  assert.ok(!/Componente: null/.test(REGISTRO), 'ninguna solapa quedó sin pantalla')
})

test('LA GRILLA ESCRIBE CON LAS ACCIONES QUE YA EXISTEN, NO CON UNA COPIA', () => {
  assert.match(CELDAS, /guardarHorasDeLaCelda\.bind\(null, personaId, celda\.fecha\)/)
  assert.match(CELDAS, /from '\.\.\/CeldasDeLiquidacion'/)
  assert.match(GRILLA, /CeldaRedondeo/)
  for (const c of COMPONENTES) {
    assert.ok(!/from '@supabase/.test(c), 'los componentes no hablan con la base: reciben filas armadas')
    assert.ok(!/\.update\(|\.insert\(|\.upsert\(/.test(c), 'ni una escritura suelta dentro de un componente')
  }
})

test('LAS COLUMNAS VAN EN EL ORDEN QUE ELIGIÓ EL DUEÑO', () => {
  const legajo = [...GRILLA.slice(GRILLA.indexOf('const LEGAJO'), GRILLA.indexOf('const DERECHA'))
    .matchAll(/clave: '([a-zA-Z0-9]+)'/g)].map((m) => m[1])
  const derecha = [...GRILLA.slice(GRILLA.indexOf('const DERECHA'), GRILLA.indexOf('const GAP'))
    .matchAll(/clave: '([a-zA-Z0-9]+)'/g)].map((m) => m[1])
  assert.deepEqual(legajo, ['alta', 'categoria'])
  assert.deepEqual(derecha, [
    'normales', 'extra50', 'extra100', 'totalHoras', 'valorHora',
    'cobra', 'adelanto', 'yaTransferido', 'porBanco', 'enEfectivo', 'total', 'efectivoRedondeado', 'planilla',
  ])
})

test('LA VISTA NO RECALCULA LA CADENA DE PAGO NI LAS HORAS', () => {
  assert.match(VISTA, /getLiquidacionDeLaQuincena/)
  assert.match(VISTA, /filasDelEspejo/)
  for (const c of [VISTA, GRILLA, TARIFA]) {
    const codigo = sinComentarios(c)
    assert.ok(!/valorHora\s*\*|horas\s*\*/.test(codigo), 'no multiplica horas por tarifa')
    assert.ok(!/cobra\s*-|adelanto\s*-|porBanco\s*\+/.test(codigo), 'no rehace la resta de la cadena')
  }
})

test('EL HISTORIAL SALE DE LA LECTURA DE LA EXPOSICIÓN, NO DE UNA CONSULTA PROPIA', () => {
  assert.match(VISTA, /historialDeTarifa\(\s*exposicion\.tarifasPorPersona/)
  assert.ok(!/from\('persona_tarifa'\)/.test(VISTA), 'la vista no lee persona_tarifa por su cuenta')
  assert.match(GRILLA, /<HistorialDeTarifa/)
  assert.match(HISTORIAL, /<Drawer/)
})

test('EL $/H SE ESCRIBE COMO FILA NUEVA DESDE LA QUINCENA MIRADA, NUNCA COMO UPDATE', () => {
  const codigo = sinComentarios(ACCION)
  // EL DEFECTO QUE ATRAPA: el upsert con `desde = hoy` de `guardarValorHora`, que pisa el valor
  // anterior y borra la fila al vaciar la celda. Sin fila nueva no hay historial.
  assert.match(codigo, /from\('persona_tarifa'\)\s*\.insert\(/)
  assert.ok(!/\.update\(|\.upsert\(|\.delete\(/.test(codigo), 'ni update, ni upsert, ni delete')
  assert.ok(!/hoyISO/.test(codigo), '`desde` es la quincena mirada, no hoy')
  assert.match(codigo, /const misma = filas\.find\(\(t\) => t\.desde === desde\)/)
  // LAS CERRADURAS VAN ANTES DE TOMAR LA CLAVE DE SERVICIO.
  const clave = codigo.indexOf('createAdminClient()')
  for (const antes of ['permisoDeLiquidacion(', "=== 'cerrada'", 'if (misma)', 'formaEditable(grupo) !== forma']) {
    const i = codigo.indexOf(antes)
    assert.ok(i > 0 && i < clave, `${antes} va antes de createAdminClient()`)
  }
  assert.match(TARIFA, /registrarTarifaDesdeLaQuincena\(/)
  assert.ok(!/guardarValorHora/.test(TARIFA), 'la celda nueva no usa la acción que pisa')
})

test('EL RECORTE PREGUNTA CÓMO COBRA: por quincena o mensual (dueño, 14/09/2026)', () => {
  assert.match(VISTA, /clave: 'obreros', texto: 'Por quincena'/)
  assert.match(VISTA, /clave: 'oficina', texto: 'Mensuales'/)
  assert.match(VISTA, /clave: 'final', texto: 'Liq\. finales'/)
  assert.match(FILTROS, /rotulo="Cobra"/)
})

test('EL BUSCADOR RECORTA LAS FILAS Y EL TOTAL, y conserva quincena y recorte', () => {
  assert.match(VISTA, /normalizar\(f\.nombre\)\.includes\(buscar\)/)
  assert.match(VISTA, /totalesDelEspejo\(visibles\)/)
  assert.match(VISTA, /ocultos: \{ vista: 'liquidacion', quincena: quincena\.desde/)
})

test('LA BARRA MUESTRA UNA SOLA PANTALLA Y MANDA EL RESTO A «MÁS» (dueño, 14/09/2026)', () => {
  const BARRA = fuente('./BarraSolapas.tsx')
  assert.match(BARRA, /data-testid="liquidacion-mas"/)
  assert.match(BARRA, /s\.clave !== SOLAPA_POR_DEFECTO/)
  assert.ok(!/SOLAPAS\.map\(/.test(BARRA), 'la barra no vuelve a dibujar las siete en fila')
})

test('LA MARCA «BAJO EL BÁSICO UOCRA» SALE DE LA EXPOSICIÓN AL CONVENIO, NO DE UNA CUENTA NUEVA', () => {
  assert.match(VISTA, /getExposicionDeLaQuincena\(supabase, quincena\)/)
  assert.match(VISTA, /if \(!l\.bajoElPiso \|\| l\.piso == null/)
  assert.ok(!/basico_hora|uocra_escala|convenio_escala/.test(VISTA), 'la vista no lee escalas por su cuenta')
  assert.match(TARIFA, /data-testid=\{`espejo-bajo-piso-\$\{fila\.personaId\}`\}/)
})

test('EL SELLO DICE «SIN LEER» CUANDO NO HAY ESPEJO: un control que no mira no dice que está bien', () => {
  assert.match(VISTA, /espejo-sin-leer/)
  assert.match(VISTA, /sin leer para esta quincena/)
  assert.match(VISTA, /jornales-espejo-bloques\.mjs/)
})
