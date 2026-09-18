// CUADRO ECONÓMICO — tests en frío, sin Postgres. Se intercepta `db.mjs` (como google-aterrizaje.test.mjs)
// y la base falsa responde por fuente: padrón (`obra_canonica`), contratado + presupuesto por rubro
// (`obra_economia_rubros`), consumido por rubro (`costo_de_obras_por_rubro`) y `obra_economia`.
//
// Lo que se prueba es el CONTRATO con el dueño (18/09/2026): lee de las mismas fuentes que la app,
// dice de dónde sale cada número, y nunca llama precio a una suma viva ni fabrica un cero.
import test from 'node:test'
import assert from 'node:assert/strict'

const { registerHooks } = await import('node:module')
registerHooks({
  load(url, context, next) {
    if (!url.endsWith('/orquestador/lib/db.mjs')) return next(url, context)
    return { format: 'module', shortCircuit: true, source: 'export const query = (...a) => globalThis.__dbObraEconomics(...a)' }
  },
})

// ── LA BASE FALSA: tres obras, tres situaciones ──────────────────────────────────────────────────
const OBRAS = [
  { id: 'quattropani', nombre: 'QP - SALÓN COMERCIAL', estado: 'activa', cliente_texto: 'Quattropani' },
  { id: 'galpones', nombre: 'Galpones', estado: 'cerrada', cliente_texto: 'La Estrella' },
  { id: 'messina-bsa', nombre: 'ME - BSA', estado: 'activa', cliente_texto: 'MESSINA' },
  { id: 'prueba-e2e', nombre: '[PRUEBA E2E] Obra de pruebas', estado: 'cerrada', cliente_texto: null },
]
const RUBROS_VISTA = {
  quattropani: {
    obra_canonica_id: 'quattropani', nombre: 'QP - SALÓN COMERCIAL', estado: 'activa',
    contratado: '139240232.31', contratado_usd: '63000', contratado_origen: 'contrato', contratado_referencia: null,
    contrato_mano_obra: '95130063', contrato_materiales: '44110169.31', contrato_total: '139240232.31',
    contrato_fuente_nombre: 'CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA.docx', contrato_cita: 'Precio de mano de obra: U$S 63.000 + IVA', tipo_cambio: '1510.001',
    presupuesto_estado: 'leido', presupuesto_motivo: null, presupuestado_total: '83690841.56', presupuesto_moneda: 'ARS', presupuesto_estimado: false,
    presupuesto_fuente_nombre: 'Cotizacion Final.xlsm', presupuesto_fecha: new Date(2026, 6, 27), presupuesto_hh: null,
    presupuestado_mano_obra: '39353557.25', presupuestado_materiales: '44110169.31', presupuestado_subcontratistas: '0', presupuestado_otros: '227115',
    presupuesto_rubros: {
      mano_obra: { monto: 39353557.25, motivo: null, estimado: false, detalle: [] },
      materiales: { monto: 44110169.31, motivo: null, estimado: false, detalle: [] },
      subcontratistas: { monto: 0, motivo: 'la cotización no prevé subcontratos', estimado: false, detalle: [] },
      otros: { monto: 227115, motivo: null, estimado: false, detalle: [] },
    },
  },
  galpones: {
    obra_canonica_id: 'galpones', nombre: 'Galpones', estado: 'cerrada',
    contratado: null, contratado_usd: null, contratado_origen: null,
    presupuesto_estado: 'sin_presupuesto', presupuesto_motivo: 'el presupuesto aprobado viene del Sheet legacy sin partidas: no hay desglose por rubro',
    presupuestado_total: null, presupuesto_rubros: {},
  },
  'messina-bsa': {
    obra_canonica_id: 'messina-bsa', nombre: 'ME - BSA', estado: 'activa',
    contratado: '17704199.40', contratado_usd: null, contratado_origen: 'suma-viva', contratado_referencia: null,
    presupuesto_estado: 'leido', presupuesto_motivo: null, presupuestado_total: '10000000', presupuesto_moneda: 'ARS', presupuesto_estimado: false,
    presupuesto_fuente_nombre: 'BSA.xlsm', presupuesto_fecha: new Date(2026, 4, 2), presupuesto_hh: '800',
    presupuestado_mano_obra: '6000000', presupuestado_materiales: '3000000', presupuestado_subcontratistas: '0', presupuestado_otros: '1000000',
    presupuesto_rubros: {
      mano_obra: { monto: 6000000, motivo: null, estimado: false, detalle: [] },
      materiales: { monto: 3000000, motivo: null, estimado: false, detalle: [] },
      subcontratistas: { monto: 0, motivo: null, estimado: false, detalle: [] },
      otros: { monto: 1000000, motivo: null, estimado: false, detalle: [] },
    },
  },
}
const CONSUMO = [
  { obra_id: 'quattropani', rubro: 'mano_obra', monto: '12000000', monto_estimado: '2000000', n: 3, detalle: [{ grupo: '16/08 a 31/08/26', n: 5, monto: 4000000, estimado: false }] },
  { obra_id: 'quattropani', rubro: 'materiales', monto: '30890980.27', monto_estimado: null, n: 12, detalle: [
    { grupo: 'Electricidad', n: 1, monto: 124830.51 }, { grupo: 'Chapa, perfiles y estructura metálica', n: 3, monto: 26300583.38 },
    { grupo: 'SIN CLASIFICAR', n: 2, monto: 3166528.93 }, { grupo: 'Revoques, pintura y terminación', n: 2, monto: 1102425.89 }] },
  { obra_id: 'quattropani', rubro: 'subcontratistas', monto: '3161385.02', monto_estimado: null, n: 6, detalle: [{ grupo: 'Pedro Fredes', n: 5, monto: 3120000 }] },
  { obra_id: 'quattropani', rubro: 'otros', monto: '203911.62', monto_estimado: null, n: 2, detalle: [{ grupo: 'Combustible de obra', n: 2, monto: 203911.62 }] },
  { obra_id: 'messina-bsa', rubro: 'mano_obra', monto: '7000000', monto_estimado: null, n: 2, detalle: [] },
  { obra_id: 'messina-bsa', rubro: 'materiales', monto: '4405102', monto_estimado: null, n: 4, detalle: [{ grupo: 'Cemento, cal y áridos', n: 4, monto: 4405102 }] },
  { obra_id: 'messina-bsa', rubro: 'subcontratistas', monto: '5984000', monto_estimado: null, n: 3, detalle: [{ grupo: 'Fredes', n: 3, monto: 5984000 }] },
]
const ECON = {
  quattropani: { obra_id: 'quattropani', adicionales_aprobados: null, n_adicionales_aprobados: 0, certificado: null, facturado: null, cobrado: null, n_cobranzas: 0 },
  'messina-bsa': { obra_id: 'messina-bsa', adicionales_aprobados: '500000', n_adicionales_aprobados: 1, certificado: null, facturado: '17704199.40', cobrado: '17704199.40', n_cobranzas: 3 },
}

const sinAcento = (s) => String(s || '').toLowerCase().replace(/[áéíóúñ]/g, (c) => 'aeioun'['áéíóúñ'.indexOf(c)])
const consultas = []
globalThis.__dbObraEconomics = async (sql, params = []) => {
  const s = String(sql)
  consultas.push(s)
  if (/from public\.obra_canonica/.test(s)) {
    // El filtro de pruebas y el ilike los aplica la base: acá se imitan para que el test mire el mismo padrón.
    let rows = OBRAS.filter((o) => !/^\[PRUEBA|^ZZ-/i.test(o.nombre))
    const like = params[0]
    if (like && like !== '%%') {
      const re = new RegExp(`^${sinAcento(like).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`)
      rows = rows.filter((o) => re.test(sinAcento(o.nombre)) || re.test(sinAcento(o.id)) || re.test(sinAcento(o.cliente_texto)))
    }
    return { rows }
  }
  if (/obra_economia_rubros/.test(s)) return { rows: params[0].map((id) => RUBROS_VISTA[id]).filter(Boolean) }
  if (/costo_de_obras_por_rubro/.test(s)) return { rows: CONSUMO.filter((c) => params[0].includes(c.obra_id)) }
  if (/from public\.obra_economia where/.test(s)) return { rows: params[0].map((id) => ECON[id]).filter(Boolean) }
  throw new Error(`consulta no prevista por la base falsa: ${s.slice(0, 80)}`)
}

const { cuadroEconomico: cuadroCrudo, desviosObras: desviosCrudos, findObras } = await import('./obra-economics.mjs')
const { DEFINICION_RUBRO } = await import('./presupuesto-rubros.mjs')
// Intl es-AR separa «$» del número con un espacio duro (U+00A0): se normaliza para poder leer los asserts.
const sinNbsp = (s) => String(s).replace(/\u00a0/g, ' ')
const cuadroEconomico = async (n) => sinNbsp(await cuadroCrudo(n))
const desviosObras = async (o) => (await desviosCrudos(o)).map(sinNbsp)

test('findObras lee obra_canonica sin pruebas y matchea por id, nombre sin acentos y cliente', async () => {
  assert.deepEqual((await findObras('quattropani')).map((o) => o.id), ['quattropani'])
  assert.deepEqual((await findObras('salon comercial')).map((o) => o.id), ['quattropani'])
  assert.deepEqual((await findObras('messina')).map((o) => o.id), ['messina-bsa'])
  assert.equal((await findObras('prueba')).length, 0, 'las obras de prueba no existen para el chat')
  assert.equal((await findObras('')).length, 3)
})

test('obra con las dos patas: contratado en U$S según contrato, presupuesto por rubro con documento y fecha, consumido por rubro con queda/excedido', async () => {
  const c = await cuadroEconomico('quattropani')
  assert.match(c, /Contratado: \*\*U\$S 63\.000\*\* = \$ 139\.240\.232 a TC 1\.510 · según contrato «CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA\.docx»\s+_\(DATO\)_/)
  assert.match(c, /Presupuestado \(costo directo\): \*\*\$ 83\.690\.842\*\* · «Cotizacion Final\.xlsm» del 27\/07\/2026\s+_\(DATO\)_/)
  assert.match(c, /– Mano de obra: \$ 39\.353\.557\n/)
  assert.match(c, /– Subcontratistas: \$ 0 \(la cotización no prevé subcontratos\)/)
  // Consumido: mano de obra con quincenas y su parte estimada rotulada INFERENCIA.
  assert.match(c, /Consumido a la fecha \(neto de IVA\): \*\*\$ 46\.256\.277\*\*\s+_\(DATO\)_/)
  assert.match(c, /– Mano de obra: \$ 12\.000\.000 · 3 quincenas · de las cuales \$ 2\.000\.000 estimadas _\(INFERENCIA\)_ → queda \$ 27\.353\.557 \(69\.5%\) _\(CÁLCULO\)_/)
  // Materiales: n comprobantes y los TRES grupos mayores, ordenados por monto (Electricidad queda afuera).
  assert.match(c, /– Materiales: \$ 30\.890\.980 · 12 comprobantes · Chapa, perfiles y estructura metálica \$ 26\.300\.583, SIN CLASIFICAR \$ 3\.166\.529, Revoques, pintura y terminación \$ 1\.102\.426 → queda \$ 13\.219\.189 \(30\.0%\)/)
  assert.doesNotMatch(c, /Electricidad/)
  assert.match(c, /– Subcontratistas: \$ 3\.161\.385 · 6 comprobantes · Pedro Fredes \$ 3\.120\.000 → \*\*excedido \$ 3\.161\.385\*\* \(presupuesto \$ 0\)/)
  assert.match(c, /– Otros: \$ 203\.912 · 2 comprobantes · Combustible de obra \$ 203\.912 → queda \$ 23\.203 \(10\.2%\)/)
  // Cálculos con las dos patas completas (hay mano de obra).
  assert.match(c, /Margen cotizado: \*\*\$ 55\.549\.391\*\* \(39\.9%\)\s+_\(CÁLCULO = contratado − presupuestado\)_/)
  assert.match(c, /Del presupuesto queda \$ 37\.434\.565 \(44\.7%\)\s+_\(CÁLCULO\)_/)
  assert.match(c, /Margen a la fecha \(parcial\): \*\*\$ 92\.983\.955\*\* \(66\.8%\)\s+_\(CÁLCULO = contratado − consumido\)_/)
  assert.match(c, /Adicionales \/ certificado \/ cobrado: sin registros ligados a esta obra _\(DESCONOCIDO\)_/)
  // Las definiciones son las de presupuesto-rubros.mjs, no una copia.
  assert.ok(c.includes(DEFINICION_RUBRO.mano_obra) && c.includes(DEFINICION_RUBRO.otros))
})

test('obra sin presupuesto: se dice el motivo, no un cero, y no hay margen cotizado', async () => {
  const c = await cuadroEconomico('galpones')
  assert.match(c, /Contratado: \*\*sin dato\*\* _\(DESCONOCIDO/)
  assert.match(c, /Presupuesto: \*\*sin presupuesto\*\* _\(DESCONOCIDO\)_ — el presupuesto aprobado viene del Sheet legacy sin partidas: no hay desglose por rubro/)
  assert.match(c, /Consumido a la fecha: \*\*sin comprobantes ni quincenas imputados a esta obra\*\* _\(DESCONOCIDO\)_/)
  assert.doesNotMatch(c, /Margen cotizado/)
  assert.doesNotMatch(c, /\$ 0\*\*/)
  assert.match(c, /Falta presupuesto por rubro y mano de obra consumida/)
})

test('contratado suma-viva: se dice que no es precio y no se calcula margen; lo facturado nunca se suma como precio', async () => {
  const c = await cuadroEconomico('ME - BSA')
  assert.match(c, /Contratado: \*\*\$ 17\.704\.199\*\* · suma viva de Cobranzas, no es precio\s+_\(DATO — no es precio: no sirve para margen\)_ ⚠️/)
  assert.doesNotMatch(c, /Margen cotizado/)
  assert.doesNotMatch(c, /Margen a la fecha/)
  assert.match(c, /Sin margen: lo contratado es una suma viva de Cobranzas, no un precio/)
  // El presupuesto sí compara rubro a rubro; «otros» sin comprobantes es $ 0 real, no desconocido.
  assert.match(c, /– Mano de obra: \$ 6\.000\.000 \(800 HH\)/)
  assert.match(c, /– Subcontratistas: \$ 5\.984\.000 · 3 comprobantes · Fredes \$ 5\.984\.000 → \*\*excedido \$ 5\.984\.000\*\* \(presupuesto \$ 0\)/)
  assert.match(c, /– Otros: sin comprobantes imputados _\(DATO: \$ 0\)_/)
  assert.match(c, /Presupuesto \*\*excedido en \$ 7\.389\.102\*\* \(73\.9%\)/)
  assert.match(c, /adicionales aprobados \$ 500\.000 \(1\) · facturado \$ 17\.704\.199 · cobrado \$ 17\.704\.199 \(3 cobranzas\)\s+_\(DATO — lo facturado no es precio\)_/)
})

test('desambiguación y lista de todas con las mismas fuentes', async () => {
  assert.match(await cuadroEconomico('a'), /Hay varias obras que coinciden con "a"/)
  const todas = await cuadroEconomico(null)
  assert.match(todas, /\*\*QP - SALÓN COMERCIAL\*\* \(activa\): contratado U\$S 63\.000 · presup\. \$ 83\.690\.842 · consumido \$ 46\.256\.277/)
  assert.match(todas, /\*\*Galpones\*\* \(cerrada\): sin contratado · sin presup\. · sin consumo/)
  assert.match(todas, /\*\*ME - BSA\*\* \(activa\): contratado \$ 17\.704\.199 \(suma viva, no es precio\)/)
  assert.match(await cuadroEconomico('no-existe'), /No encontré ninguna obra/)
})

test('desviosObras compara rubro a rubro y nunca usa una suma viva como precio', async () => {
  const d = (await desviosObras()).sort()
  assert.equal(d.length, 2, d.join('\n'))
  assert.match(d[0], /^ME - BSA \(activa, en curso→parcial\): mano de obra excedido 16\.7% \(consumido \$ 7\.000\.000 vs presup \$ 6\.000\.000\); materiales excedido 46\.8%.*; subcontratistas sin presupuesto: consumido \$ 5\.984\.000; sobre-costo total 73\.9%/)
  assert.doesNotMatch(d[0], /margen/, 'suma viva: sin margen; y en curso tampoco')
  assert.match(d[1], /^QP - SALÓN COMERCIAL \(activa, en curso→parcial\): subcontratistas sin presupuesto: consumido \$ 3\.161\.385$/)
  assert.deepEqual(await desviosObras({ soloCerradas: true }), [], 'Galpones está cerrada pero sin presupuesto ni consumo: nada que comparar')
  // Forma que consume interactive-server para dedup: el nombre antes de « (».
  assert.equal(d[1].split(' (')[0], 'QP - SALÓN COMERCIAL')
})

test('ninguna consulta toca las tablas legacy', () => {
  for (const s of consultas) assert.doesNotMatch(s, /public\.obras\b|costos_reales|presupuestos\b|movimientos_caja|adicionales\b/)
})
