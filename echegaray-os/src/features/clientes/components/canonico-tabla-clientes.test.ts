// CANÓNICO 25 · LA CARTERA DEL CRM — lo que la tabla de Clientes tiene que decir y lo que no.
//
// Pruebas sobre la FUENTE del componente (se dibuja en el servidor y no hay DOM barato): cada regla
// del dueño queda escrita como una expresión que da rojo si alguien la deshace.
//
// ═══ LAS CINCO COLUMNAS (dueño, 11/09/2026) ═══
//
// «Mostrá OC como está ahora pero quitá esa columna; OP debe estar dentro de cada cliente como OC;
// te pedí monto contratado, materiales, mano de obra y avance de cobro con barra de progreso».

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { ObraEnCurso } from '@/features/administracion/services/homeCartera'
import { baseDelContrato, cobradoParaLaBarra, fraseDeFuente, sumaDeObras } from '../services/contratoDeObra.ts'
import {
  armarCostosPorObra, armarGastosSinObra, textoTotalManoObra, textoTotalMateriales, totalesDelCliente,
} from '../services/costosDeObra.ts'

const leer = (f: string) => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8')
const tabla = () => leer('./TablaClientes.tsx')
const celdas = () => leer('./CeldasDeContrato.tsx')

const obra = (p: Partial<ObraEnCurso> & { obra_id: string }): ObraEnCurso => ({
  nombre: p.obra_id, avance: null, jefe: null, contratado: null, contratadoUsd: null, tipoCambio: null,
  origenContratado: null, referencia: null, nota: null, ocCivaVentana: null, ocCivaHistorico: null,
  ocNVentana: null, ocNHistorico: null, manoObra: null, manoObraUsd: null, materiales: null,
  materialesUsd: null, contratoTotal: null, contratoFuente: null, contratoFuenteDriveId: null,
  contratoFuenteNombre: null, contratoCita: null, contratoNota: null,
  certificacion: { texto: 'sin certificar', reclama: false }, cobradoTotal: null, cobradoNeto: null,
  porCobrar: null, vencido: null, proximo: null, imputacion: null, cobroDisponible: true, ...p,
})

test('las cinco columnas, en el orden del dueño, y ninguna de OC ni de OP', () => {
  const src = tabla()
  const posicion = (r: string) =>
    [`>${r}<`, `'${r}'`, `texto="${r}"`].map((p) => src.indexOf(p)).find((i) => i !== -1) ?? -1
  const orden = ['Cliente', 'Contratado', 'Materiales', 'Mano de obra', 'Avance de cobro'].map(posicion)
  for (let i = 1; i < orden.length; i++) assert.ok(orden[i] > orden[i - 1] && orden[i - 1] >= 0, `columna ${i} fuera de orden`)
  assert.doesNotMatch(src, />OC c\/IVA</, 'la columna OC se fue: los totales viven en la ficha, solapa Órdenes')
  assert.doesNotMatch(src, />OP c\/IVA</)
  assert.doesNotMatch(src, /TotalDePapeles/, 'ningún total de papeles en la cartera')
  // Seis pistas más el nombre desde el 18/09/2026: Contratado · Materiales · Subcontratos · Otros · Mano de obra · Avance.
  assert.match(src, /grid-cols-\[minmax\(0,2fr\)_150px_130px_130px_130px_140px_210px\]/)
})

test('las OC siguen debajo de cada obra, con su PDF', () => {
  assert.match(tabla(), /<OrdenesDeLaObra ordenes=\{ocDeLaObra\} veEconomia=\{veEconomia\} \/>/)
})

test('la barra es SÓLO del trabajo: la fila del cliente publica una cifra', () => {
  const src = tabla()
  assert.match(src, /<AvanceDeCobro o=\{o\} veEconomia=\{veEconomia\} \/>/)
  const fila = src.slice(src.indexOf('data-testid="fila-cliente"'), src.indexOf('data-testid="fila-obra"'))
  assert.doesNotMatch(fila, /AvanceDeCobro|progresoDeCobro|TONO\.pista/, 'ninguna barra en la fila del cliente')
  assert.match(fila, /cobrado \$\{millones\(c\.cobradoNeto\)\}/)
})

test('el avance mide NETO contra NETO, sobre el total del contrato, y dice cuánto falta', () => {
  const src = celdas()
  assert.match(src, /progresoDeCobro\(cobrado, base\)/)
  assert.match(src, /const cobradoNeto = cobradoParaLaBarra\(o\)/)
  // Con filas pendientes y ninguna cobrada, cobró CERO (la deuda está registrada); sin ninguna fila, no se sabe.
  assert.equal(cobradoParaLaBarra(obra({ obra_id: 'a', porCobrar: 10 })), 0)
  assert.equal(cobradoParaLaBarra(obra({ obra_id: 'b' })), null)
  assert.equal(cobradoParaLaBarra(obra({ obra_id: 'c', cobradoNeto: 5, imputacion: 'cliente' })), null)
  assert.doesNotMatch(src, /IVA_GENERAL|\* 1\.21/, 'nada de llevar el contrato a bruto: el cobro se compara neto')
  assert.match(src, /falta \$\{millones\(falta\)\}/)
  // Quattropani: mano de obra U$S 63.000 (≈ 95,3 M) + materiales 44,1 M → la base es 139,4 M, no 95,3.
  const q = obra({ obra_id: 'quattropani', contratado: 95_303_187, manoObra: 95_303_187, manoObraUsd: 63_000, materiales: 44_110_169.31, contratoTotal: 139_413_356.31, cobradoNeto: 89_968_327 })
  assert.equal(baseDelContrato(q), 139_413_356.31)
  assert.equal(Math.round((q.cobradoNeto! / baseDelContrato(q)!) * 100), 65, 'no 94')
  // Sin desglose, la base es el precio único de OBRAS.
  assert.equal(baseDelContrato(obra({ obra_id: 'bsa', contratado: 17_704_199 })), 17_704_199)
  assert.equal(baseDelContrato(obra({ obra_id: 'x' })), null)
  // Un total de CERO (materiales «no incluye» y mano de obra sin fijar) no es una base: manda OBRAS.
  assert.equal(baseDelContrato(obra({ obra_id: 'y', contratado: 10_000_000, contratoTotal: 0 })), 10_000_000)
  assert.equal(baseDelContrato(obra({ obra_id: 'z', contratoTotal: 0 })), null)
})

// ═══ MATERIALES Y MANO DE OBRA SON LO GASTADO A LA FECHA (dueño, 13/09/2026) ═══
//
// «Que muestren los costos hasta el momento sumados de cada una de cada obra de cada cliente, no lo
// presupuestado.» Si alguien vuelve a dibujar el desglose del contrato en la cartera, esto da rojo.
test('la cartera NO lee el desglose presupuestado: materiales y mano de obra salen de costo_obra', () => {
  const src = tabla()
  const costo = leer('./CeldasDeCosto.tsx')
  for (const [nombre, fuente] of [['TablaClientes', src], ['CeldasDeContrato', celdas()], ['CeldasDeCosto', costo]] as const) {
    assert.doesNotMatch(fuente, /\bo\.(materiales|manoObra|materialesUsd)\b/, `${nombre} volvió a leer lo contratado`)
    assert.doesNotMatch(fuente, /<ComponenteDelContrato|function ComponenteDelContrato/,`${nombre} volvió a dibujar el componente del contrato`)
  }
  assert.doesNotMatch(src, /sumaDeObras\(c\.enCurso, \(o\) => o\.(materiales|manoObra)\)/)
  // Las filas dibujan el costo del trabajo y el cliente su total, con la MISMA suma que la ficha.
  assert.match(src, /<CostoDeLaObra costos=\{costos\} obraId=\{o\.obra_id\}/)
  assert.match(src, /<CostoDelCliente costos=\{costos\} sinObra=\{gastosSinObra\} clienteId=\{c\.cliente_id\}/)
  assert.match(costo, /totalesDelCliente\(costos, obraIds, sinObra\?\.get\(clienteId\) \?\? null\)/)
  assert.match(costo, /textoManoObra\(c\)[\s\S]*textoMateriales\(c\)/)
  // El rótulo dice «a la fecha», como la ficha.
  assert.match(src, /<RotuloACorte texto="Materiales"/)
  assert.match(src, /<RotuloACorte texto="Mano de obra"/)
  const pagina = leer('../../../app/(main)/clientes/page.tsx')
  assert.match(pagina, /costos=\{costosPorObra\}/)
  assert.match(pagina, /gastosSinObra=\{gastosSinObra\}/)
})

// ═══ EN EL TELÉFONO EL COSTO SE VE (QA de tercero, 13/09/2026) ═══
//
// A 390px la cartera quedaba en Cliente y Contratado: las columnas de costo se escondían en el mismo
// corte y nada las reemplazaba. Esto da rojo si la línea angosta se va, si nace en otro corte que
// el que esconde las columnas, o si alguna de las dos filas deja de dibujarla.
test('debajo de 1250px el costo a la fecha pasa a una línea: nunca se esconde sin alternativa', () => {
  const cartera = leer('./CeldasDeCartera.tsx')
  const costo = leer('./CeldasDeCosto.tsx')
  const src = tabla()
  const corte = (re: RegExp) => Number(cartera.match(re)?.[1])
  const escondeHasta = corte(/SOLO_ANCHO = 'max-\[(\d+)px\]:hidden'/)
  const apareceDesde = corte(/SOLO_ANGOSTO = 'min-\[(\d+)px\]:hidden'/)
  assert.ok(Number.isFinite(escondeHasta) && Number.isFinite(apareceDesde), 'faltan los dos cortes')
  assert.equal(apareceDesde, escondeHasta + 1, 'la línea angosta tiene que nacer justo donde se van las columnas')
  // La línea es a lo ancho y sólo existe en angosto; dice «no pude leer» donde la celda calla.
  const linea = costo.slice(costo.indexOf('function LineaAngosta'), costo.indexOf('export function CostoDeLaObra'))
  assert.match(linea, /col-span-full[^`]*\$\{SOLO_ANGOSTO\}/)
  assert.doesNotMatch(linea, /SOLO_ANCHO/, 'la alternativa no puede esconderse en el mismo corte')
  assert.match(linea, /texto === '' \? 'no pude leer' : texto/)
  // Las dos filas la dibujan, con los MISMOS valores que las celdas.
  const filaCliente = src.slice(src.indexOf('data-testid="fila-cliente"'), src.indexOf('data-testid="fila-obra"'))
  const filaObra = src.slice(src.indexOf('data-testid="fila-obra"'), src.indexOf('data-testid="obras-sin-leer"'))
  assert.match(filaCliente, /<CostoDelClienteAngosto costos=\{costos\} sinObra=\{gastosSinObra\} clienteId=\{c\.cliente_id\}/)
  assert.match(filaObra, /<CostoDeLaObraAngosto costos=\{costos\} obraId=\{o\.obra_id\}/)
  assert.match(costo, /<Celdas f=\{costoDeObra\(costos, obraId\)\}[\s\S]*<LineaAngosta f=\{costoDeObra\(costos, obraId\)\}/)
  assert.match(costo, /<Celdas f=\{costoDelCliente\(costos, sinObra, clienteId, obraIds\)\}[\s\S]*<LineaAngosta f=\{costoDelCliente\(costos, sinObra, clienteId, obraIds\)\}/)
})

test('el total del cliente: «no pude leer» calla, «no hay» dice «—», y lo sin obra entra', () => {
  const costos = armarCostosPorObra([
    { obra_id: 'a', materiales: 1000, mano_obra: 500, horas_valorizadas: 10, horas_sin_tarifa: 0 },
    { obra_id: 'b', materiales: 200, mano_obra: null, horas_valorizadas: 0, horas_sin_tarifa: 8 },
  ])
  const sinObra = armarGastosSinObra([{ cliente_id: 'c', materiales: 300, subcontratos: null, n_comprobantes: 1 }])
  const t = totalesDelCliente(costos, ['a', 'b'], sinObra?.get('c') ?? null)
  assert.equal(t.materiales, 1500, 'Σ obras + sin obra')
  assert.match(textoTotalMateriales(t), /1\.500/)
  assert.equal(textoTotalManoObra(t).parcial, true, 'le faltan 8 h: ámbar')
  assert.match(textoTotalManoObra(t).texto, /500/)
  // No se pudo leer → vacío, NUNCA «—» ni «$ 0».
  const ciego = totalesDelCliente(null, ['a'])
  assert.equal(textoTotalMateriales(ciego), '')
  // `estimado` es parte de la celda desde 20260915T0800 (la mano de obra sin recibo todavía se marca).
  assert.deepEqual(textoTotalManoObra(ciego), { texto: '', parcial: false, estimado: false })
  // Se leyó y no hay nada → «—».
  const nada = totalesDelCliente(new Map(), ['a'])
  assert.equal(textoTotalMateriales(nada), '—')
  assert.deepEqual(textoTotalManoObra(nada), { texto: '—', parcial: false, estimado: false })
})

test('la fuente del desglose se nombra: contrato, OC o presupuesto, con su renglón', () => {
  assert.match(fraseDeFuente(obra({ obra_id: 'q', contratoFuente: 'contrato', contratoFuenteNombre: 'CONTRATO.docx', contratoCita: 'U$S 63.000 + IVA' })),
    /Según el contrato firmado \(«CONTRATO\.docx»\): U\$S 63\.000 \+ IVA/)
  assert.match(fraseDeFuente(obra({ obra_id: 'b' })), /Ningún papel cargado separa/)
  // La nota de la fila (una INFERENCIA declarada) llega entera al `title`.
  assert.match(fraseDeFuente(obra({ obra_id: 'd', contratoFuente: 'presupuesto', contratoCita: 'SUB TOTAL 20.090.867,83', contratoNota: 'INFERENCIA: la cotización no dice «solo mano de obra»' })),
    /— INFERENCIA: la cotización no dice/)
})

test('la suma del cliente declara cuántos trabajos no tienen el dato', () => {
  const s = sumaDeObras([obra({ obra_id: 'a', contratado: 10 }), obra({ obra_id: 'b' })], baseDelContrato)
  assert.deepEqual(s, { total: 10, faltan: 1 })
  assert.deepEqual(sumaDeObras([obra({ obra_id: 'b' })], baseDelContrato), { total: null, faltan: 1 })
})

test('el subtítulo de /clientes y el panel lateral suman la MISMA base que la columna', () => {
  // Auditor 11/09/2026: tres superficies del módulo publicaban tres «contratado en curso» distintos
  // ($ 350,4 M / $ 394,5 M / $ 95,3 M). La regla es una función y las tres la llaman.
  const pagina = leer('../../../app/(main)/clientes/page.tsx')
  assert.match(pagina, /sumaDeObras\(c\.enCurso, baseDelContrato\)/)
  assert.doesNotMatch(pagina, /c\.contratado !== null|\(c\.contratado \?\? 0\)/, 'nadie vuelve a sumar cliente_economia.contratado_en_curso')
  assert.match(pagina, /trabajosSinBase \? ` · suma incompleta/)
  assert.match(pagina, /contratadoEnCurso=\{\(\(\) => \{[\s\S]*?sumaDeObras\(fila\.enCurso, baseDelContrato\)/)
  const panel = leer('./PanelCliente.tsx')
  assert.doesNotMatch(panel, /economia\?\.contratado_en_curso/, 'el panel dejó de leer cliente_economia para el contratado')
})

test('la suma viva se marca y la discrepancia declarada se dice (auditor final, 11/09/2026)', () => {
  const src = celdas()
  assert.match(src, /const viva = o\.contratoTotal === null && o\.origenContratado === ORIGEN_SUMA_VIVA/)
  // LA FRASE DE LA SUMA VIVA VIVE EN `fraseDeOrigenContratado` (18/09/2026), no acá adentro: Analíticas
  // la necesita también y una frase escrita a mano en dos archivos se desalinea sola. `celdas()` sólo
  // tiene que seguir LLAMANDO a la función única; el texto lo prueba economiaObras.test/contratadoFormulario.test.
  assert.match(src, /const frase = fraseDeOrigenContratado\(o\.origenContratado\)/)
  assert.match(src, /Discrepancia declarada por la vista: \$\{o\.nota\}/)
  assert.match(src, /data-origen=\{viva \? 'suma-viva' : undefined\}/)
})

test('el jefe de obra no ve una sola cifra', () => {
  const src = tabla()
  assert.match(src, /veEconomia \? 'Contratado' : ''/)
  assert.match(src, /veEconomia \? 'Avance de cobro' : ''/)
  // Cuatro pistas vacías, una por rubro (Materiales · Subcontratos · Otros · Mano de obra).
  assert.match(leer('./CeldasDeCosto.tsx'), /if \(!veEconomia\) return <><span className=\{SOLO_ANCHO\} \/><span className=\{SOLO_ANCHO\} \/><span className=\{SOLO_ANCHO\} \/><span className=\{SOLO_ANCHO\} \/><\/>/)
})

test('el costo a la fecha del cliente suma TODAS sus obras, también las cerradas (QA 14/09/2026)', () => {
  // ARCOR mostraba «—» y La Estrella sólo lo sin obra: la cartera pedía y sumaba únicamente las obras
  // activas. Una obra cerrada gastó igual y la identidad «obras + sin obra = Compras» dejaba de cerrar.
  const src = tabla()
  assert.doesNotMatch(src, /obraIds=\{c\.enCurso/, 'el total del cliente no se arma sólo con lo que está en curso')
  assert.match(src, /obraIds=\{idsDeTodasSusObras\(obrasPorCliente, c\)\}/)
  assert.match(leer('../../../app/(main)/clientes/page.tsx'), /obrasPorCliente=\{todasLasObras\}/)
  const sql = leer('../../../../supabase/migrations/20260914T0100_cartera_costo_de_todas_las_obras.sql')
  assert.match(sql, /costo_de_obras_a_la_fecha\(array\(select o\.obra_id from obras o\)\)/)
  assert.doesNotMatch(sql, /costo_de_obras_a_la_fecha\(array\(select o\.obra_id from obras o where/)
})
