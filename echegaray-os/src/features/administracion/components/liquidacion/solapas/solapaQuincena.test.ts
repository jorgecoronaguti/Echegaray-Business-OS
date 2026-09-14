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
const COMPONENTES = [GRILLA, CELDAS, TARIFA, HISTORIAL, PANEL, FILTROS]

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
  assert.match(GRILLA, /CeldaRedondeo/)
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

// CAMBIÓ EL 14/09/2026 (dueño: «quiero q la columna de valor hora este primero y dp cuanto cobra
// total»): el cuadro ya no abre con el importe pendiente. El orden se prueba entero en `cobraTotal.test.ts`.
test('LA PLATA VA PRIMERO: $/h, COBRA TOTAL, descuentos y reparto; DESPUÉS LOS DÍAS', () => {
  assert.deepEqual(clavesDe('const PLATA', 'const GAP'),
    ['valorHora', 'cobraTotal', 'adelanto', 'yaTransferido', 'porBanco', 'enEfectivo', 'efectivoRedondeado', 'horasPagas'])
  assert.match(PANEL, /campo="porBanco"/)
  assert.match(PANEL, /Acuerdo 50\/50/)
  assert.match(PANEL, /<HistorialDeTarifa/)
  assert.match(GRILLA, /<PanelDeLaPersona/)
})

test('SIN COLUMNAS DE HORAS EXTRA NI «NORMALES» (dueño, 14/09: «las columnas de hs extra quitarlas»)', () => {
  const codigo = sinComentarios(GRILLA)
  // EL DEFECTO QUE ATRAPA: las tres columnas de cantidades. «Normales» sin las extras repetía a medias
  // «Hs pagas», así que sale con ellas.
  assert.ok(!/extra50|extra100|Ext\. 50|Ext\. 100|Hs norm\.|CANTIDADES/.test(codigo), 'sin columnas de extras ni normales')
  // LAS CUENTAS NO CAMBIAN: el pie sigue publicando las mismas cifras de plata y las horas pagas.
  // `totales.total` salió del cuadro el 14/09/2026 junto con la columna del importe pendiente.
  for (const t of ['totales.cobra', 'totales.adelanto', 'totales.yaTransferido', 'totales.horasPagas', 'totales.porBanco', 'totales.enEfectivo']) {
    assert.ok(codigo.includes(t), `el pie sigue mostrando ${t}`)
  }
})

test('BANCO Y EFECTIVO DICEN CÓMO SE PAGA, CON EL 50/50, Y SE MARCAN CUANDO LA FILA NO CIERRA', () => {
  const ESTADO = fuente('../cuadro/estadoDelPago.ts')
  assert.match(CELDAS, /pesos\(l\.porBanco\)/)
  assert.match(CELDAS, /pesos\(l\.enEfectivo\)/)
  assert.match(CELDAS, /data-testid=\{`acuerdo-\$\{fila\.personaId\}`\}/)
  assert.match(ESTADO, /const sinRecibo = l\.porBanco === 0 && l\.reciboNeto == null/)
  assert.match(ESTADO, /50\/50\$\{sinRecibo \? ' sin recibo' : ''\}/)
  assert.match(ESTADO, /const cierre = cierreDeLaFila\(l\)/)
  assert.match(GRILLA, /const cierre = cierreDeTotales\(totales\)/)
  assert.match(GRILLA, /Por banco \(lote\)/)
  assert.match(GRILLA, /En efectivo \(sobres\)/)
})

test('LA VISTA NO RECALCULA LA CADENA DE PAGO NI LAS HORAS', () => {
  // Las filas llegan armadas por la lectura común (que llama a getLiquidacionDeLaQuincena y filasDelEspejo).
  assert.match(VISTA, /leerCuadroDeLaQuincena\(supabase, quincena, hoy\)/)
  const COMUN = fuente('../../../services/cuadroDeLaQuincenaService.ts')
  assert.match(COMUN, /getLiquidacionDeLaQuincena/)
  assert.match(COMUN, /filasDelEspejo/)
  for (const c of [VISTA, GRILLA, TARIFA, CELDAS, PANEL]) {
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

test('UN DÍA CON JORNADA AUTOMÁTICA SE VE COMO UN DÍA SIN HORAS: «·», sin «8a» (dueño, 14/09)', () => {
  const codigo = sinComentarios(CELDAS)
  // EL DEFECTO QUE ATRAPA: «8a», «9a» — un sufijo que el dueño no sabía leer.
  assert.ok(!/\}a`|fontStyle: automatica|'italic'/.test(codigo), 'sin sufijo «a», sin cursiva')
  assert.match(codigo, /sin horas cargadas; la app supone \$\{nHoras\(celda\.automatica\)\} h pero no se pagan hasta que se escriban/)
  // SIGUE SIN PAGARSE: la verificación de las horas vive en `cuadroQueSeCalcula.test.ts` (8 h aparte,
  // 62 h pagas) y el panel lo dice en llano.
  assert.match(PANEL, /sin horas cargadas \(no se pagan\)/)
  assert.match(GRILLA, /no se pagan/)
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
