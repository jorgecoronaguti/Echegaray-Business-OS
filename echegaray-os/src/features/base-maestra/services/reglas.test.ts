// LAS PRUEBAS DE LA BASE MAESTRA — cada una nombra el defecto que atrapa.
//
// No acompañan al código: lo contradicen. Si se revierte cualquiera de las decisiones de
// `reglas.ts` —tratar la ausencia de análisis como «Completo», convertir un null en 0, emparejar
// las categorías por igualdad de texto— alguna de estas se pone roja.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  BANDA_DESVIO, DIAS_ACEPTABLE, DIAS_FRESCO, ETIQUETA_ANALISIS, claveDeCategoria, coincide,
  costoDeCategoria, desvioObservado, diasEntre, estadoDelAnalisis, fechaCorta, fechaLarga, filtrar,
  frescuraDePrecio, motivoDelEstado, faltaOperativa, numero, pesos, pesosCierran, porcentaje,
  sumaDeCargas, sumaDePesos,
} from './reglas.ts'

// ═══ 1 · EL ESTADO DEL ANÁLISIS ════════════════════════════════════════════════════════════════

test('una tarea SIN análisis vigente nunca es «Completo»', () => {
  // EL DEFECTO: `analisis_incompleto` sólo lista deuda, así que una tarea que nunca tuvo análisis
  // NO aparece ahí — igual que una completa. Decidir sólo por «no está en la vista» las pinta a las
  // dos de verde, y la que no tiene análisis entra al presupuesto aportando 0 HH y 0 costo.
  assert.equal(estadoDelAnalisis(false, null), 'sin_analisis')
  assert.equal(estadoDelAnalisis(false, undefined), 'sin_analisis')
})

test('un análisis vigente pero VACÍO es «Sin análisis», no «Sin revisar»', () => {
  // `n_lineas = 0` → la vista escribe 'sin análisis'. Existe la versión y no tiene una sola línea:
  // para quien cotiza es lo mismo que no tenerlo, y degradarlo a «Sin revisar» lo haría parecer
  // usable.
  assert.equal(estadoDelAnalisis(true, 'sin análisis'), 'sin_analisis')
})

test('mano de obra sin carga social es «Sin revisar» — subcostea ~100% ese componente', () => {
  assert.equal(estadoDelAnalisis(true, 'mano de obra sin carga social'), 'sin_revisar')
  assert.equal(estadoDelAnalisis(true, 'líneas con recurso sin precio'), 'sin_revisar')
  assert.equal(estadoDelAnalisis(true, 'sin rendimiento: no aporta HH'), 'sin_revisar')
})

test('sin deuda declarada y con análisis vigente, «Completo»', () => {
  assert.equal(estadoDelAnalisis(true, null), 'completo')
  assert.equal(ETIQUETA_ANALISIS.completo, 'Completo')
  assert.equal(ETIQUETA_ANALISIS.sin_analisis, 'Sin análisis')
})

test('el motivo repite lo que dijo la vista, no lo reescribe', () => {
  assert.equal(motivoDelEstado('sin_revisar', 'líneas con recurso sin precio'), 'líneas con recurso sin precio')
  assert.equal(motivoDelEstado('completo', null), null)
  assert.match(motivoDelEstado('sin_analisis', null) ?? '', /HH/)
})

test('un jefe de obra NO ve las 223 tareas como «Sin revisar» por no ver los precios', () => {
  // EL DEFECTO, y es del modelo: `analisis_incompleto` incluye `n_lineas_sin_precio > 0` entre sus
  // criterios, y ese número sale de `recurso_precio` —que la RLS le devuelve VACÍA al jefe de obra,
  // sin error—. Tomando la vista tal cual, toda la base maestra se le pintaría con deuda de carga
  // que no existe. `faltaOperativa` sólo mira lo que no depende del precio.
  const analisisSano = {
    n_lineas: 7, tiene_mano_obra: true, tiene_cargas_sociales: true, hs_unitarias: 34,
  }
  assert.equal(faltaOperativa(analisisSano), null)
  assert.equal(estadoDelAnalisis(true, faltaOperativa(analisisSano)), 'completo')
  // Y con la vista cruda, el mismo análisis se vería sucio:
  assert.equal(estadoDelAnalisis(true, 'líneas con recurso sin precio'), 'sin_revisar')
})

test('el criterio de precio NO puede tapar al de rendimiento', () => {
  // El `case` de la vista está ordenado: si hay líneas sin precio devuelve eso y nunca llega a
  // «sin rendimiento», que es operativo y sí le importa al jefe de obra.
  assert.equal(
    faltaOperativa({ n_lineas: 4, tiene_mano_obra: false, tiene_cargas_sociales: false, hs_unitarias: null }),
    'sin rendimiento: no aporta HH',
  )
  assert.equal(
    faltaOperativa({ n_lineas: 4, tiene_mano_obra: false, tiene_cargas_sociales: false, hs_unitarias: 0 }),
    'sin rendimiento: no aporta HH',
  )
})

test('faltaOperativa respeta el mismo orden de criterios que la vista', () => {
  assert.equal(
    faltaOperativa({ n_lineas: 0, tiene_mano_obra: false, tiene_cargas_sociales: false, hs_unitarias: null }),
    'sin análisis',
  )
  // Mano de obra sin carga social gana sobre el rendimiento, igual que en el `case` de Postgres.
  assert.equal(
    faltaOperativa({ n_lineas: 3, tiene_mano_obra: true, tiene_cargas_sociales: false, hs_unitarias: null }),
    'mano de obra sin carga social',
  )
})

// ═══ 2 · LA FRESCURA DEL PRECIO ════════════════════════════════════════════════════════════════

test('un precio SIN fecha no es viejo ni nuevo: es desconocido', () => {
  // EL DEFECTO: 58 recursos del Excel vinieron sin fecha. Mandarlos a «vieja» les inventa una
  // antigüedad que nadie midió; mandarlos a «nueva» los hace pasar por actuales. Tienen valor propio.
  assert.equal(frescuraDePrecio(null, '2026-08-21'), 'sin_fecha')
  assert.equal(frescuraDePrecio(undefined, '2026-08-21'), 'sin_fecha')
  assert.equal(frescuraDePrecio('', '2026-08-21'), 'sin_fecha')
})

test('los cortes de frescura caen donde se declararon, y el borde es inclusivo', () => {
  assert.equal(frescuraDePrecio('2026-08-21', '2026-08-21'), 'nueva')
  assert.equal(frescuraDePrecio('2026-06-22', '2026-08-21'), 'nueva') // 60 días exactos
  assert.equal(diasEntre('2026-06-22', '2026-08-21'), DIAS_FRESCO)
  assert.equal(frescuraDePrecio('2026-06-21', '2026-08-21'), 'ok') // 61
  assert.equal(diasEntre('2026-02-22', '2026-08-21'), DIAS_ACEPTABLE)
  assert.equal(frescuraDePrecio('2026-02-22', '2026-08-21'), 'ok') // 180 exactos
  assert.equal(frescuraDePrecio('2026-02-21', '2026-08-21'), 'vieja') // 181
  assert.equal(frescuraDePrecio('2017-05-01', '2026-08-21'), 'vieja')
})

test('una fecha de precio en el FUTURO es un dato mal cargado, no un precio fresquísimo', () => {
  assert.equal(frescuraDePrecio('2027-01-01', '2026-08-21'), 'sin_fecha')
})

test('una fecha basura no se convierte en «nueva» por accidente', () => {
  assert.equal(frescuraDePrecio('sin fecha', '2026-08-21'), 'sin_fecha')
  assert.ok(Number.isNaN(diasEntre('nada', '2026-08-21')))
})

test('diasEntre no se corre un día por huso horario', () => {
  // Un `date` de Postgres no tiene hora. Leerlo en hora local (UTC-3) lo retrasa al día anterior.
  assert.equal(diasEntre('2026-01-01', '2026-01-02'), 1)
  assert.equal(diasEntre('2026-08-21T00:00:00+00:00', '2026-08-22'), 1)
})

// ═══ 3 · LA CATEGORÍA ══════════════════════════════════════════════════════════════════════════

test('la escala del convenio empareja con la clave de categoría de obra', () => {
  // EL DEFECTO: emparejar por igualdad de texto da CERO coincidencias entre «Oficial Especializado»
  // (uocra_escala) y `oficial_especializado` (categoria_obra / personas.categoria). La pantalla
  // mostraría las cuatro categorías sin capacidad y sin personas: se lee como «no hay nadie».
  assert.equal(claveDeCategoria('Oficial Especializado'), 'oficial_especializado')
  assert.equal(claveDeCategoria('Oficial'), 'oficial')
  assert.equal(claveDeCategoria('Medio Oficial'), 'medio_oficial')
  assert.equal(claveDeCategoria('Ayudante'), 'ayudante')
})

test('«Sereno (mensual)» normaliza sin el paréntesis y no empareja con ninguna categoría de obra', () => {
  const clave = claveDeCategoria('Sereno (mensual)')
  assert.equal(clave, 'sereno')
  const deObra = ['oficial_especializado', 'oficial', 'medio_oficial', 'ayudante']
  assert.equal(deObra.includes(clave), false)
})

test('los acentos no rompen el emparejamiento', () => {
  assert.equal(claveDeCategoria('Ofícial Especializádo'), 'oficial_especializado')
})

// ═══ 4 · EL COSTO EMPRESA ══════════════════════════════════════════════════════════════════════

test('el costo empresa se DERIVA del básico y de las cargas', () => {
  // Oficial, escala vigente 01/08/2026, Zona A: básico hora 6.348. Cargas vigentes: 51,78%.
  const c = costoDeCategoria(6348, 0.5178)
  assert.equal(c.valorHora, 6348)
  assert.equal(c.jornal, 6348 * 8) // la jornada multiplica; el básico YA es por hora
  assert.ok(Math.abs((c.cargasHora ?? 0) - 3286.9944) < 0.0001)
  assert.ok(Math.abs((c.costoEmpresaHora ?? 0) - 9634.9944) < 0.0001)
})

test('sin cargas cargadas el costo empresa es NULL, nunca el básico pelado', () => {
  // EL DEFECTO QUE ESTE MODELO VINO A CORREGIR: 33 tareas del Excel tenían mano de obra y ninguna
  // carga social. Publicar el básico como «costo empresa» subcostea la hora en más de la mitad.
  const c = costoDeCategoria(6348, null)
  assert.equal(c.valorHora, 6348)
  assert.equal(c.cargasHora, null)
  assert.equal(c.costoEmpresaHora, null)
})

test('el sereno no tiene básico HORA y su valor hora no es cero', () => {
  // Se paga por mes: `basico_hora` es NULL. Un 0 acá lo haría costar $0 la hora en cualquier
  // análisis que lo use.
  const c = costoDeCategoria(null, 0.5178)
  assert.deepEqual(c, { valorHora: null, jornal: null, cargasHora: null, costoEmpresaHora: null })
})

test('la jornada es un parámetro, no un 8 escrito adentro', () => {
  assert.equal(costoDeCategoria(1000, 0.5).jornal, 8000)
  assert.equal(costoDeCategoria(1000, 0.5, 6).jornal, 6000)
  // La jornada NO cambia el costo por hora: sólo el jornal diario.
  assert.equal(costoDeCategoria(1000, 0.5, 6).costoEmpresaHora, 1500)
})

test('sin ningún concepto de carga la suma es NULL, no 0 %', () => {
  assert.equal(sumaDeCargas([]), null)
  assert.equal(sumaDeCargas([{ porcentaje: null }]), null)
})

test('la suma de cargas reproduce el 51,78 % de la escala vigente', () => {
  const vigentes = [0.1077, 0.05, 0.0159, 0.0094, 0.047, 0.06, 0.103, 0.12, 0.0048]
  const total = sumaDeCargas(vigentes.map((porcentaje) => ({ porcentaje })))
  assert.ok(total != null && Math.abs(total - 0.5178) < 1e-9, `dio ${total}`)
})

// ═══ 5 · LOS PESOS DE LA PLANTILLA ═════════════════════════════════════════════════════════════

test('los pesos de las plantillas sembradas cierran en 100', () => {
  const hormigonVertical = [10, 30, 25, 25, 10].map((peso) => ({ peso }))
  assert.equal(sumaDePesos(hormigonVertical), 100)
  assert.equal(pesosCierran(hormigonVertical), true)
})

test('una plantilla que NO cierra se detecta — si no, marcar todo daría 96 %', () => {
  const rota = [10, 30, 25, 25, 6].map((peso) => ({ peso }))
  assert.equal(pesosCierran(rota), false)
  assert.equal(sumaDePesos(rota), 96)
})

test('un peso nulo no rompe la suma ni la hace pasar por buena', () => {
  assert.equal(sumaDePesos([{ peso: 50 }, { peso: null }]), 50)
  assert.equal(pesosCierran([{ peso: 50 }, { peso: null }]), false)
})

// ═══ 6 · BUSCAR ════════════════════════════════════════════════════════════════════════════════

test('buscar «hormigon» encuentra «Hormigón»', () => {
  assert.equal(coincide(['Hormigón de limpieza'], 'hormigon'), true)
  assert.equal(coincide(['Hormigón de limpieza'], 'HORMIGÓN'), true)
})

test('todos los términos tienen que aparecer, en cualquier orden y en cualquier campo', () => {
  const campos = ['HA-140', 'Columna de encadenado H17', 'Hormigón armado']
  assert.equal(coincide(campos, 'ha 140'), true)
  assert.equal(coincide(campos, '140 ha'), true)
  assert.equal(coincide(campos, 'ha-140 columna'), true)
  assert.equal(coincide(campos, 'ha-140 losa'), false)
})

test('una consulta vacía no filtra nada', () => {
  assert.equal(coincide(['lo que sea'], ''), true)
  assert.equal(coincide(['lo que sea'], '   '), true)
  const filas = [{ n: 'uno' }, { n: 'dos' }]
  assert.equal(filtrar(filas, '', (f) => [f.n]).length, 2)
  assert.equal(filtrar(filas, 'uno', (f) => [f.n]).length, 1)
})

test('un campo nulo no hace coincidir todo', () => {
  assert.equal(coincide([null, undefined, 'Acero'], 'acero'), true)
  assert.equal(coincide([null, undefined, 'Acero'], 'cemento'), false)
})

// ═══ 7 · FORMATO ═══════════════════════════════════════════════════════════════════════════════

test('NULL nunca se formatea como cero', () => {
  // EL DEFECTO: un `?? 0` acá se vería idéntico a un dato real. «$ 0» afirma que algo sale cero;
  // null dice que nadie lo cargó. Quien pinta escribe la ausencia por su nombre.
  assert.equal(numero(null), null)
  assert.equal(numero(undefined), null)
  assert.equal(pesos(null), null)
  assert.equal(porcentaje(null), null)
  assert.equal(fechaCorta(null), null)
  assert.equal(fechaLarga(null), null)
  // Y un cero REAL sí se formatea: son cosas distintas.
  assert.equal(pesos(0), '$ 0')
  assert.equal(numero(0, 2), '0,00')
})

test('formato es-AR: coma decimal, punto de miles, espacio antes del signo', () => {
  assert.equal(numero(34, 2), '34,00')
  assert.equal(numero(1842.5, 2), '1.842,50')
  assert.equal(pesos(165526633), '$ 165.526.633')
  assert.equal(porcentaje(0.5178, 2), '51,78 %')
  assert.equal(porcentaje(0.05, 0), '5 %')
})

test('un NaN o un Infinity no se publican como número', () => {
  assert.equal(numero(Number.NaN), null)
  assert.equal(numero(Number.POSITIVE_INFINITY), null)
  assert.equal(porcentaje(Number.NaN), null)
})

test('la fecha se lee en UTC y no se corre un día', () => {
  assert.equal(fechaCorta('2026-08-01'), '01/08/26')
  assert.equal(fechaLarga('2026-08-01'), '01/08/2026')
  assert.equal(fechaCorta('2026-02-22T00:00:00+00:00'), '22/02/26')
  assert.equal(fechaCorta('no es una fecha'), null)
})

// ═══ 8 · LA BASE CONTRA LO QUE PASÓ EN OBRA ════════════════════════════════════════════════════

test('el cociente se lee al derecho: más horas que la base es PEOR, no mejor', () => {
  // EL DEFECTO QUE ATRAPA: las dos puntas son hs/unidad —esfuerzo—, así que 44,88 contra 34,00 es
  // un 32 % MÁS de mano de obra. Leerlo como «rendimiento» invierte el signo y pinta de verde la
  // tarea que se está yendo de costo, que es el número con el que se cotiza.
  const peor = desvioObservado(34, 44.88)
  assert.equal(peor?.direccion, 'peor')
  assert.ok(peor && peor.ratio > 1)

  const mejor = desvioObservado(34, 24)
  assert.equal(mejor?.direccion, 'mejor')
  assert.ok(mejor && mejor.ratio < 1)
})

test('la banda es simétrica: 8 % para cualquier lado NO es desvío', () => {
  // Con la banda asimétrica del mockup (1,10 / 0,95) un 6 % mejor se declaraba desvío favorable y
  // un 6 % peor no se declaraba nada: la mitad de evidencia para la buena noticia que para la mala.
  assert.equal(desvioObservado(100, 108)?.direccion, 'igual')
  assert.equal(desvioObservado(100, 92)?.direccion, 'igual')
  assert.equal(desvioObservado(100, 100 * (1 + BANDA_DESVIO))?.direccion, 'igual')
  assert.equal(desvioObservado(100, 100 * (1 - BANDA_DESVIO))?.direccion, 'igual')
  assert.equal(desvioObservado(100, 111)?.direccion, 'peor')
  assert.equal(desvioObservado(100, 89)?.direccion, 'mejor')
})

test('sin una de las dos puntas NO hay desvío: no se inventa un 1,00', () => {
  // Devolver `{ratio: 1, direccion: 'igual'}` cuando falta el dato pintaría «la obra confirma la
  // base» sobre una tarea que nunca se midió — que es lo contrario de lo que pasó.
  assert.equal(desvioObservado(null, 12), null)
  assert.equal(desvioObservado(12, null), null)
  assert.equal(desvioObservado(undefined, undefined), null)
  // Y una base en 0 no se divide: el infinito saldría formateado como si fuera un dato.
  assert.equal(desvioObservado(0, 12), null)
  assert.equal(desvioObservado(Number.NaN, 12), null)
})
