// LA VISTA «QUINCENA» ES LA QUE ABRE, Y TIENE QUE SERVIR PARA CALCULAR Y PAGAR.
//
// Dueño, 11/09/2026: *«tengo que seguir usando Sheet JORNALES»*. 14/09/2026: *«no me permite editar el
// valor hora de manera fácil, está rota esa columna final que dice "planilla"… no puedo calcular nada
// de ahí que me sirva»*, *«no sé cuánto es el total que cobra cada persona»*, *«hay dias de cada persona
// … q dicen 8a 9a no se q es eso, esta mal, corregir»* y *«las columnas de hs extra quitarlas»*.
//
// ═══ POR QUÉ SE PRUEBA SOBRE EL CÓDIGO FUENTE ═══
//
// Un Server Component no se monta en `node --test` sin levantar Next, y una server action no corre sin
// Supabase. Lo que se puede probar sin base —el registro de solapas, qué columnas tiene el cuadro,
// que la vista no recalcula la cadena y cómo se escribe la tarifa— se prueba acá. Las cuentas se
// prueban en `cuadroQueSeCalcula.test.ts` y `horasPagasComoJornales.test.ts`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const INDICE = fuente('./index.ts')
const GRILLA = fuente('../GrillaEspejoQuincena.tsx')
const CELDAS = fuente('../cuadro/CeldasDelEspejo.tsx')
const TARIFA = fuente('../cuadro/CeldaTarifa.tsx')
const HISTORIAL = fuente('../cuadro/HistorialDeTarifa.tsx')
const PANEL = fuente('../cuadro/PanelDeLaPersona.tsx')
const FILTROS = fuente('../cuadro/FiltrosDelEspejo.tsx')
const VISTA = fuente('./quincena.tsx')
const ACCION = fuente('../../../services/tarifaDeLaQuincenaActions.ts')
// Las celdas de blanco + negro (14/09/2026) entran a las mismas guardas: sin base y sin recalcular.
const CELDAS_BN = fuente('../cuadro/CeldasBlancoNegro.tsx')
const COMPONENTES = [GRILLA, CELDAS, CELDAS_BN, TARIFA, HISTORIAL, PANEL, FILTROS]

/** El código sin comentarios: una cabecera que EXPLICA la regla no puede hacer pasar el test. */
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const REGISTRO = INDICE.slice(INDICE.indexOf('export const SOLAPAS'))
const claves = (): string[] =>
  [...REGISTRO.matchAll(/\{ clave: '([a-z]+)', titulo:/g)].map((m) => m[1])
const clavesDe = (desde: string, hasta: string): string[] =>
  [...GRILLA.slice(GRILLA.indexOf(desde), GRILLA.indexOf(hasta)).matchAll(/clave: '([a-zA-Z0-9]+)'/g)].map((m) => m[1])

test('«QUINCENA» ES LA PRIMERA DE LA BARRA Y LA QUE ABRE POR DEFECTO', () => {
  assert.equal(claves()[0], 'quincena')
  assert.match(fuente('./claves.ts'), /SOLAPA_POR_DEFECTO: ClaveDeSolapa = 'quincena'/)
  assert.match(REGISTRO, /clave: 'quincena'[^}]*Componente: SolapaQuincena/)
})

// CAMBIÓ EL 14/09/2026: eran siete solapas; el dueño pidió unificar lo repetido de «Más» en menos
// secciones. Lo que se protege sigue siendo que ninguna sección quede sin pantalla. Las tres de «Más» y
// sus alias se prueban en `masUnificado.test.ts`.
test('LAS SECCIONES DE LA BARRA TIENEN SU PANTALLA', () => {
  assert.deepEqual(claves(), ['quincena', 'caja', 'costo', 'cierre'])
  assert.ok(!/Componente: null/.test(REGISTRO), 'ninguna solapa quedó sin pantalla')
})

test('LA GRILLA ESCRIBE CON LAS ACCIONES QUE YA EXISTEN, NO CON UNA COPIA', () => {
  assert.match(CELDAS, /guardarHorasDeLaCelda\.bind\(null, personaId, celda\.fecha\)/)
  assert.match(CELDAS, /from '\.\.\/CeldasDeLiquidacion'/)
  assert.match(GRILLA, /CeldaRedondeo/, 'la grilla escribe el redondeo con la celda que ya existe (dueño, 16/09)')
  assert.match(GRILLA, /sumaDelRedondeo\(/)
  for (const c of COMPONENTES) {
    assert.ok(!/from '@supabase/.test(c), 'los componentes no hablan con la base: reciben filas armadas')
    assert.ok(!/\.update\(|\.insert\(|\.upsert\(/.test(c), 'ni una escritura suelta dentro de un componente')
  }
})

test('SIN COLUMNA «PLANILLA»: el cotejo va en el sello y en el panel, no en el cuadro (dueño, 14/09)', () => {
  for (const c of [GRILLA, CELDAS]) {
    const codigo = sinComentarios(c)
    assert.ok(!/clave: 'planilla'|ChipDeCotejo|rotulo: 'Planilla'/.test(codigo), 'no vuelve la columna Planilla')
  }
  assert.match(VISTA, /espejo-difieren/)
})

// CAMBIÓ EL 14/09/2026 DOS VECES: primero «$/h y después cobra total»; después blanco + negro
// («realmente no se entiende nada el cuadro de liq de hs, vamos a rehacer»). El orden se prueba entero
// en `cobraTotal.test.ts`. Lo que se protege acá: la plata antes que los días, y que el panel no pierda
// el banco editable, el 50/50 (fuera del modelo) ni el historial.
// CAMBIÓ OTRA VEZ EL 14/09/2026: el orden de JORNALES pone los días ADELANTE y la plata después, con los
// adelantos antes del total efectivo y el total quincena al final. Se sigue protegiendo el orden completo.
test('LOS DÍAS VAN PRIMERO Y DESPUÉS LA PLATA, CON PAGADO Y SALDO EN CADA LADO', () => {
  assert.deepEqual(clavesDe('const PLATA', 'const ANCHO_DE_BANDA'),
    // `presentismo` (15/09/2026) después del negro: de ahí sale el descuento. `pagado*`/`saldo*` (15/09/2026,
    // «necesito al lado de banco y negro lo que se le ha pagado efectivamente»): cada lado dice cuánto
    // corresponde, cuánto se pagó y cuánto falta, y la fila cierra con Total · Pagado · Saldo.
    ['horas', 'hsBlanco', 'horaCategoria', 'neto', 'pagadoBanco', 'saldoBanco',
      'hsNegro', 'horaNegro', 'negro', 'pagadoEfectivo', 'saldoEfectivo',
      'presentismo', 'efectivoRedondeado', 'total', 'pagado', 'saldo'])
  assert.match(GRILLA, /minmax\(var\(--liq-persona,200px\),1fr\) repeat\(\$\{nDias\},\$\{DIA\}px\) \$\{PLATA/, 'los días van antes que la plata')
  assert.match(PANEL, /campo="porBanco"/)
  assert.match(PANEL, /Acuerdo 50\/50/)
  assert.match(PANEL, /<HistorialDeTarifa/)
  assert.match(PANEL, /<CadenaBlancoNegro/)
  assert.match(GRILLA, /<PanelDeLaPersona/)
})

test('SIN COLUMNAS DE HORAS EXTRA NI «NORMALES» (dueño, 14/09: «las columnas de hs extra quitarlas»)', () => {
  const codigo = sinComentarios(GRILLA)
  // EL DEFECTO QUE ATRAPA: las tres columnas de cantidades. «Normales» sin las extras repetía a medias
  // «Hs pagas», así que sale con ellas.
  assert.ok(!/extra50|extra100|Ext\. 50|Ext\. 100|Hs norm\.|CANTIDADES/.test(codigo), 'sin columnas de extras ni normales')
  // LAS CUENTAS NO CAMBIAN: el pie sigue publicando las mismas cifras de plata y las horas pagas.
  // `totales.total` salió del cuadro el 14/09/2026 junto con la columna del importe pendiente.
  // `totales.porBanco` → `totales.netoBandas` (QA, 14/09/2026): el pie muestra el neto de las bandas, sin los
  // mensuales, para que Neto + Negro + Sueldos mensuales = Total cierre exacto. Caja sigue leyendo porBanco.
  // CAMBIÓ EL 15/09/2026: `totales.adelanto`, `totales.yaTransferido` y `totales.enEfectivo` salieron del pie
  // junto con sus columnas (un adelanto es un PAGO, no un descuento). Los reemplazan los de `totales.pago`.
  for (const t of ['totales.cobra', 'totales.horasPagas', 'totales.netoBandas', 'totales.mensuales',
    'p.pagadoBanco', 'p.saldoBanco', 'p.pagadoEfectivo', 'p.saldoEfectivo', 'p.pagado', 'p.saldoTotal',
    'p.aPagarEfectivo', 'p.aPagarBanco']) {
    assert.ok(codigo.includes(t), `el pie sigue mostrando ${t}`)
  }
})

// CAMBIÓ EL 14/09/2026 CON BLANCO + NEGRO: el banco ES el neto, así que sale la columna «Por banco» y su
// marca 50/50 (el acuerdo queda en el panel de quien sigue fuera del modelo). Lo que se protege: el neto
// y el efectivo leídos de la línea, el cierre por fila y por pie, y el pie con cada columna de plata.
test('NETO (BANCO) Y EFECTIVO DICEN CÓMO SE PAGA, SE MARCAN CUANDO LA FILA NO CIERRA, Y EL PIE LOS SUMA', () => {
  const ESTADO = fuente('../cuadro/estadoDelPago.ts')
  const BN = fuente('../cuadro/CeldasBlancoNegro.tsx')
  assert.match(BN, /pesos\(l\.porBanco\)/)
  // `pesos(l.enEfectivo)` SALIÓ el 15/09/2026 con la columna «Total efectivo». Lo que dice cuánto se entrega
  // hoy es el saldo del lado negro, con el exceso del banco ya descontado.
  assert.match(BN, /p\.saldoEfectivo/)
  assert.match(BN, /sin neto/)
  assert.match(ESTADO, /const cierre = cierreDeLaFila\(l\)/)
  assert.match(GRILLA, /const cierre = cierreDeTotales\(totales\)/)
  for (const r of ['Banco', 'Pagado banco', 'Saldo banco', 'Negro', 'Pagado efectivo', 'Saldo efectivo',
    'Efectivo redondeado', 'Total', 'Pagado', 'Saldo']) {
    assert.match(GRILLA, new RegExp(`cifra\\('${r}'`), `el pie publica ${r}`)
  }
  // Y LA LÍNEA QUE CONTESTA LA PREGUNTA DEL DÍA DE PAGO.
  assert.match(GRILLA, /A pagar hoy: /)
  assert.match(GRILLA, /totales\.negro/)
  assert.match(GRILLA, /totales\.sinNeto/)
})

test('LA VISTA NO RECALCULA LA CADENA DE PAGO NI LAS HORAS', () => {
  // Las filas llegan armadas por la lectura común (que llama a getLiquidacionDeLaQuincena y filasDelEspejo).
  assert.match(VISTA, /leerCuadroDeLaQuincena\(supabase, quincena, hoy\)/)
  const COMUN = fuente('../../../services/cuadroDeLaQuincenaService.ts')
  assert.match(COMUN, /getLiquidacionDeLaQuincena/)
  assert.match(COMUN, /filasDelEspejo/)
  for (const c of [VISTA, GRILLA, TARIFA, CELDAS, CELDAS_BN, PANEL]) {
    const codigo = sinComentarios(c)
    assert.ok(!/valorHora\s*\*|horas\s*\*/.test(codigo), 'no multiplica horas por tarifa')
    assert.ok(!/cobra\s*-|adelanto\s*-|porBanco\s*\+/.test(codigo), 'no rehace la resta de la cadena')
  }
})

test('EL HISTORIAL SALE DE LA LECTURA DE LA EXPOSICIÓN, NO DE UNA CONSULTA PROPIA', () => {
  assert.match(VISTA, /historialDeTarifa\(\s*exposicion\.tarifasPorPersona/)
  assert.ok(!/from\('persona_tarifa'\)/.test(VISTA), 'la vista no lee persona_tarifa por su cuenta')
  assert.match(PANEL, /<Drawer/)
})

test('EL $/H SE EDITA FÁCIL: clic, escribir, Enter — sin paso de confirmación y con el % al lado', () => {
  const codigo = sinComentarios(TARIFA)
  assert.ok(!/Confirmar|confirmando|tarifa-confirmar/.test(codigo), 'no hay paso de confirmación')
  assert.match(codigo, /if \(e\.key === 'Enter'\) guardar\(\)/)
  assert.match(codigo, /registrarTarifaDesdeLaQuincena\(\{/)
  assert.match(codigo, /data-testid=\{`tarifa-pct-\$\{fila\.personaId\}`\}/)
})

test('UNA SOLA ESCRITURA DE TARIFA: plan único, corrección con rastro, nunca upsert ni delete', () => {
  const codigo = sinComentarios(ACCION)
  assert.match(codigo, /export async function guardarValorHora\(/)
  assert.match(codigo, /export async function registrarTarifaDesdeLaQuincena\(/)
  assert.equal((codigo.match(/return escribirTarifa\(/g) ?? []).length, 2, 'las dos entradas delegan en la misma escritura')
  assert.match(codigo, /planDeTarifa\(\{ existentes, desde: e\.desde/)
  assert.ok(!/\.upsert\(|\.delete\(/.test(codigo), 'ni upsert ni delete')
  assert.ok(!/hoyISO/.test(codigo), '`desde` es la quincena mirada, no hoy')
  const corregir = codigo.slice(codigo.indexOf('async function corregir('))
  assert.ok(corregir.indexOf("from('persona_tarifa_correccion').select('id')") < corregir.indexOf('.update('), 'rastro verificado antes del UPDATE')
  assert.match(corregir, /\.eq\('persona_id', e\.persona_id\)\.eq\('desde', e\.desde\)/)
  assert.match(corregir, /devolví el valor anterior/)
  const escribir = codigo.slice(codigo.indexOf('async function escribirTarifa('))
  const clave = escribir.indexOf('createAdminClient()')
  for (const antes of ['permisoDeLiquidacion(', "=== 'cerrada'", 'formaEditable(e.grupo) !== e.forma', "plan.accion === 'rechazar'"]) {
    const i = escribir.indexOf(antes)
    assert.ok(i > 0 && i < clave, `${antes} va antes de createAdminClient()`)
  }
  // `CadenaDePago.tsx` se borró el 14/09/2026 con el panel de «Horas», su único usuario.
  for (const f of ['../CeldasDeLiquidacion.tsx']) {
    assert.match(fuente(f), /import \{ guardarValorHora \} from '\.\.\/\.\.\/services\/tarifaDeLaQuincenaActions'/, `${f} usa la escritura única`)
  }
})

// CAMBIÓ EL 14/09/2026 DOS VECES: primero «8a» pasó a «·» con «no se pagan»; después el dueño decidió que
// los días completados por la app CUENTAN. Lo que se sigue protegiendo: nada de «8a», y ningún texto que
// diga que esas horas no se pagan.
test('UN DÍA COMPLETADO POR LA APP SE VE CON SU NÚMERO: sin «8a», sin «·» especial, sin «no se pagan»', () => {
  const codigo = sinComentarios(CELDAS)
  assert.ok(!/\}a`|fontStyle: automatica|'italic'/.test(codigo), 'sin sufijo «a», sin cursiva')
  for (const c of [CELDAS, PANEL, GRILLA]) {
    const cod = sinComentarios(c)
    assert.ok(!/no se pagan|automatica|panel-automaticas/.test(cod), 'ningún aviso de horas que no se pagan')
  }
})

test('EL RECORTE PREGUNTA CÓMO COBRA: por quincena o mensual (dueño, 14/09/2026)', () => {
  // EL RECORTE SE MUDÓ A UN MÓDULO COMPARTIDO con Recibos (14/09/2026): el cuadro lo importa.
  const RECORTE = fuente('../../../services/recorteDeLiquidacion.ts')
  assert.match(RECORTE, /clave: 'obreros', texto: 'Por quincena'/)
  assert.match(RECORTE, /clave: 'oficina', texto: 'Mensuales'/)
  assert.match(RECORTE, /clave: 'final', texto: 'Liq\. finales'/)
  assert.match(VISTA, /import \{ RECORTES, normalizar \} from '\.\.\/\.\.\/\.\.\/services\/recorteDeLiquidacion'/)
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

test('EL MENÚ «MÁS» QUEDA QUIETO: lista siempre todas y marca la abierta (dueño, 14/09/2026)', () => {
  const BARRA = fuente('./BarraSolapas.tsx')
  assert.ok(!/resto\.filter\(/.test(BARRA), 'la sección abierta no se saca de la lista')
  assert.match(BARRA, /\{resto\.map\(\(s\) =>/)
  assert.match(BARRA, /aria-current=\{esLaAbierta \? 'page' : undefined\}/)
  assert.ok(!/data-testid=\{`solapa-\$\{otra\.clave\}`\}/.test(BARRA), 'un solo nodo por testid de sección')
})

test('LA MARCA «BAJO EL BÁSICO UOCRA» SALE DE LA EXPOSICIÓN AL CONVENIO, NO DE UNA CUENTA NUEVA', () => {
  // DESDE BLANCO + NEGRO LA EXPOSICIÓN LA LEE LA LIQUIDACIÓN (el $/h de categoría sale de ahí) y la vista
  // la reusa: una segunda llamada serían dos fotos de la escala en el mismo render.
  assert.match(fuente('../../../services/liquidacionQuincenaService.ts'), /getExposicionDeLaQuincena\(supabase, q\)/)
  assert.match(VISTA, /const exposicion = liquidacion\.exposicion/)
  assert.ok(!/getExposicionDeLaQuincena\(/.test(sinComentarios(VISTA)), 'la vista no vuelve a leer la exposición')
  assert.ok(!/basico_hora|uocra_escala|convenio_escala/.test(VISTA), 'la vista no lee escalas por su cuenta')
  // CAMBIÓ EL 14/09/2026: la marca comparaba el $/h NEGRO con el básico. Sale de la celda del $/h negro
  // y va en la del $/h de categoría, con `marcaDeCategoria` (recibo real contra el piso).
  assert.ok(!/bajoElPiso|espejo-bajo-piso|MarcaDePiso/.test(sinComentarios(VISTA) + sinComentarios(TARIFA) + sinComentarios(GRILLA)),
    'el $/h negro no se compara contra el básico')
  assert.match(CELDAS_BN, /const bajo = marcaDeCategoria\(s\)/)
})

test('EL SELLO DICE «SIN LEER» CUANDO NO HAY ESPEJO: un control que no mira no dice que está bien', () => {
  assert.match(VISTA, /espejo-sin-leer/)
  assert.match(VISTA, /sin leer para esta quincena/)
  assert.match(VISTA, /jornales-espejo-bloques\.mjs/)
})
