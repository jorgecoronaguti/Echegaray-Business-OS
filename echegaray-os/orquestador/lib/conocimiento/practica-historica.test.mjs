// «ASÍ SE VENÍA COTIZANDO» NO PUEDE CONVERTIRSE EN «ASÍ HAY QUE COTIZAR».
//
// La mitad de este archivo prueba que el ascenso está RECHAZADO y no sólo desaconsejado: no alcanza
// con que `ascensoProhibido()` devuelva `true` si después la puerta al disco lo deja pasar igual.
// La prueba que importa es la que intenta guardarlo y comprueba que la biblioteca lo tira.
//
// La otra mitad prueba los ocho campos del registro histórico armándolos por la ruta de producción:
// bytes → estudio → prácticas → registro. Un registro construido a mano no probaría que la
// frecuencia, el período y los clientes salen de donde tienen que salir.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { estudiar, libro } from './cotizacion-fixture.mjs'
import { ESTADO, PROCEDENCIA, ascensoProhibido, conocimiento, incorporar } from './biblioteca.mjs'
import { indiceDeCotizaciones } from './estudio-cotizaciones.mjs'
import { practicas } from './practica-cotizacion.mjs'
import {
  ADVERTENCIA, AREA, AREA_ANTERIOR, INSUFICIENCIA_METALICA, aConocimientoHistorico,
  aConocimientoInsuficienciaMetalica, archivoDeLaUbicacion, clienteDeLaObra, partidasDelCasoMetalico,
  practicasSuperadas, registroHistorico, registrosHistoricos, retirarPracticasSuperadas,
} from './practica-historica.mjs'

const RUTA = (cliente, obra, archivo) => `administracion/PRESUPUESTOS - CLIENTES/${cliente}/${obra}/${archivo}`

/**
 * EL ARTEFACTO CONTRA EL QUE SE CRUZA EL CASO METÁLICO.
 *
 * Es el dataset que produjo el estudio de las 237 cotizaciones, versionado en el repo. Se lee de
 * disco a propósito: un test que afirme sobre la constante `INSUFICIENCIA_METALICA` está mirándose
 * al espejo —si alguien cambia el 4 por 40, la constante y la afirmación cambian juntas y nada se
 * pone rojo—. Lo único que puede desmentir al 4 es el archivo del que salió.
 */
const DATASET = new URL('../../datos/conocimiento/dataset-hallazgos.json', import.meta.url)
const ARCHIVO_DEL_CASO = 'Cotizacion Interna - Instalacion Electrica.xlsm'

const filaDelCasoMetalico = () => {
  const d = JSON.parse(readFileSync(DATASET, 'utf8'))
  return d.filas.find((f) => f.archivo === ARCHIVO_DEL_CASO && f.tipo_anomalia === 'COEFICIENTE_AJUSTE_IMPLAUSIBLE')
}

/** El coeficiente que la cita del artefacto declara para una partida: «T1180 «…» × 4» → 4. */
const coeficienteDeLaCita = (cita) => Number(/×\s*([\d.,]+)\s*$/.exec(String(cita))?.[1]?.replace(',', '.'))

const VACIA = Object.freeze({ version: 0, documentos: [], conocimientos: [], huecos: [] })

/** Arma los registros históricos por el circuito entero, igual que el comando. */
async function historicos(libros) {
  const r = await estudiar(libros)
  const p = practicas(r.cotizaciones)
  return {
    registros: registrosHistoricos(p, { porCotizacion: indiceDeCotizaciones(r.cotizaciones), totalCotizaciones: r.cotizaciones.length }),
    estudio: r,
  }
}

const dosClientes = () => [
  { ...libro('a.xlsx', RUTA('FIMA SA', 'GALPON', 'a.xlsx')), modificado: '2021-03-04' },
  { ...libro('b.xlsx', RUTA('COLEGIO INGLES', 'AULAS', 'b.xlsx')), modificado: '2024-11-20' },
]

// ═══════════════════ EL ASCENSO ESTÁ RECHAZADO, NO DESACONSEJADO ═══════════════════

test('los cuatro ascensos de una práctica histórica están declarados prohibidos', () => {
  for (const a of [PROCEDENCIA.NORMA, PROCEDENCIA.BASE_MAESTRA, PROCEDENCIA.EXPERIENCIA_ECSAS, PROCEDENCIA.HECHO_PROYECTO]) {
    assert.equal(ascensoProhibido(PROCEDENCIA.PRACTICA_HISTORICA_ECSAS, a), true, `falta prohibir PRACTICA_HISTORICA_ECSAS → ${a}`)
  }
})

test('la biblioteca RECHAZA guardar la misma clave como NORMA: no la desaconseja, la tira', async () => {
  const { registros } = await historicos(dosClientes())
  const historico = aConocimientoHistorico(registros[0], { fecha: '2026-08-28' })
  const bib = incorporar(VACIA, { conocimientos: [historico] })
  assert.equal(bib.conocimientos.length, 1)

  const comoNorma = conocimiento({
    clave: historico.clave,
    afirmacion: 'el beneficio de ECSAS es 17 %',
    procedencia: PROCEDENCIA.NORMA,
    evidencia: { textoLiteral: 'inventado para la prueba' },
  })
  assert.throws(() => incorporar(bib, { conocimientos: [comoNorma] }), /ascenso prohibido/)
})

test('tampoco asciende a BASE_MAESTRA ni a EXPERIENCIA_ECSAS: se cotizó así, no se midió así', async () => {
  const { registros } = await historicos(dosClientes())
  const bib = incorporar(VACIA, { conocimientos: [aConocimientoHistorico(registros[0])] })
  for (const procedencia of [PROCEDENCIA.BASE_MAESTRA, PROCEDENCIA.EXPERIENCIA_ECSAS]) {
    const k = conocimiento({
      clave: registros[0].clave, afirmacion: 'x', procedencia,
      evidencia: { tarea: 'T1001', obras: ['GALPON'], casos: 2 },
    })
    assert.throws(() => incorporar(bib, { conocimientos: [k] }), /ascenso prohibido/, `${procedencia} entró igual`)
  }
})

test('una práctica histórica sin evidencia no se puede ni construir', () => {
  assert.throws(
    () => conocimiento({ clave: 'x', afirmacion: 'y', procedencia: PROCEDENCIA.PRACTICA_HISTORICA_ECSAS }),
    /no trae con qué verificarlo/,
  )
})

test('todo lo que sale del estudio entra CANDIDATO: ninguna práctica nace validada', async () => {
  const { estudio } = await historicos(dosClientes())
  assert.ok(estudio.conocimientos.length > 0)
  for (const k of estudio.conocimientos) assert.equal(k.estado, ESTADO.CANDIDATO)
})

// ═══════════════════ LOS OCHO CAMPOS, POR LA RUTA DE PRODUCCIÓN ═══════════════════

test('el registro trae los ocho campos: práctica, frecuencia, cotizaciones, período, archivos, clientes, variabilidad y confianza', async () => {
  const { registros } = await historicos(dosClientes())
  const r = registros.find((x) => x.clave === 'cotizacion.precio.beneficio.total')
  assert.ok(r, 'no salió la práctica del beneficio')
  assert.ok(r.practica.length > 0)
  assert.equal(r.frecuencia, 1)
  assert.equal(r.cantidadDeCotizaciones, 2)
  assert.equal(r.universoEstudiado, 2)
  assert.deepEqual(r.periodo, { desde: '2021-03-04', hasta: '2024-11-20' })
  assert.deepEqual(r.archivosDeEvidencia.sort(), ['a.xlsx', 'b.xlsx'])
  assert.deepEqual(r.clientes.sort(), ['COLEGIO INGLES', 'FIMA SA'])
  assert.equal(r.variabilidad.n, 2)
  assert.ok(['ALTA', 'MEDIA', 'BAJA'].includes(r.confianzaDescriptiva))
  assert.equal(r.procedencia, PROCEDENCIA.PRACTICA_HISTORICA_ECSAS)
})

test('la frecuencia es sobre el universo estudiado: 2 de 4 no se publica como 2 de 2', async () => {
  const { registros } = await historicos([...dosClientes(),
    { ...libro('c.xlsx', RUTA('ARCOR - SAN JUAN', 'NUEVA CALLE', 'c.xlsx')), modificado: '2023-01-01' },
    { ...libro('d.xlsx', RUTA('ARCOR - SAN JUAN', 'SENDAS', 'd.xlsx')), modificado: '2023-02-01' },
  ])
  const r = registros.find((x) => x.clave === 'cotizacion.precio.beneficio.total')
  assert.equal(r.universoEstudiado, 4)
  assert.equal(r.frecuencia, 1)
  assert.equal(r.clientes.length, 3)
})

test('la variabilidad viaja con el valor: un coeficiente que va de 0,006 a 0,06 no se publica como su media a secas', async () => {
  const { registros } = await historicos([
    { ...libro('a.xlsx', RUTA('CLI', 'A', 'a.xlsx'), { coeficienteGG: 0.006 }), modificado: '2021-01-01' },
    { ...libro('b.xlsx', RUTA('CLI', 'B', 'b.xlsx'), { coeficienteGG: 0.03 }), modificado: '2022-01-01' },
    { ...libro('c.xlsx', RUTA('CLI', 'C', 'c.xlsx'), { coeficienteGG: 0.06 }), modificado: '2023-01-01' },
  ])
  const r = registros.find((x) => x.clave.startsWith('cotizacion.indirectos.gastos_contables'))
  assert.ok(r, 'no salió la práctica del concepto de GG')
  assert.equal(r.variabilidad.min, 0.006)
  assert.equal(r.variabilidad.max, 0.06)
  assert.ok(r.variabilidad.dispersion > 0, 'la dispersión salió nula: el valor se leería como estable')
  assert.equal(r.confianzaDescriptiva, 'BAJA', 'con esa dispersión la confianza descriptiva no puede ser alta')
})

test('toda práctica lleva la advertencia de que no es una norma, también dentro del conocimiento', async () => {
  const { registros } = await historicos(dosClientes())
  for (const r of registros) {
    assert.match(r.noEsUnaNorma, /NO que sea correcto/)
    const k = aConocimientoHistorico(r)
    assert.match(k.condicion, /NO que sea correcto/)
    assert.equal(k.area, AREA)
  }
})

test('el cliente y el archivo se parten por el separador que puso el propio circuito', () => {
  assert.equal(clienteDeLaObra('ARCOR - SAN JUAN · NUEVA CALLE'), 'ARCOR - SAN JUAN')
  assert.equal(clienteDeLaObra('FIMA SA'), 'FIMA SA')
  assert.equal(clienteDeLaObra(''), null)
  assert.equal(archivoDeLaUbicacion('x.xlsm · hoja GG · B54'), 'x.xlsm')
})

test('sin índice de cotizaciones el registro no explota: saca lo que puede de la evidencia', async () => {
  const r = await estudiar(dosClientes())
  const sinIndice = registrosHistoricos(practicas(r.cotizaciones), { totalCotizaciones: 2 })
  const uno = sinIndice.find((x) => x.clave === 'cotizacion.precio.beneficio.total')
  assert.deepEqual(uno.archivosDeEvidencia.sort(), ['a.xlsx', 'b.xlsx'])
  assert.equal(uno.periodo, null, 'sin índice no hay fecha, y eso se declara con null en vez de inventarse')
})

test('registroHistorico sobre una práctica sin casos devuelve huecos, no una excepción', () => {
  const r = registroHistorico({ clave: 'x', afirmacion: 'y', casos: [], estadistica: {}, obras: [] })
  assert.equal(r.cantidadDeCotizaciones, 0)
  assert.equal(r.periodo, null)
  assert.deepEqual(r.clientes, [])
})

// ═══════════════════ EL CASO METÁLICO: LO QUE SE PUEDE Y LO QUE NO ═══════════════════

test('el caso JAVIER SANCHEZ se registra como posible insuficiencia, NUNCA como el coeficiente correcto', () => {
  const k = aConocimientoInsuficienciaMetalica({ fecha: '2026-08-28' })
  assert.equal(k.procedencia, PROCEDENCIA.INFERIDO)
  assert.equal(k.estado, ESTADO.CANDIDATO)
  // Lo que NO tiene es lo que importa: sin valor no hay nada que un motor de cotización pueda tomar.
  assert.equal(k.valor, null, 'el registro trae un valor: alguien podría cotizar con «×1,45»')
  assert.match(k.afirmacion, /POSIBLE insuficiencia/)
  assert.match(k.afirmacion, /no de que esos coeficientes sean correctos/)
  assert.match(k.condicion, /convertiría un parche en método/)
  assert.match(k.evidencia.textoLiteral, /ESCALERA METÁLICA × 1\.5/)
  assert.match(k.evidencia.textoLiteral, /ENTREPISO × 1\.4/)
})

test('lo que NO se pudo cruzar contra el artefacto sale marcado sin verificar, con su motivo', () => {
  const k = aConocimientoInsuficienciaMetalica()
  assert.equal(k.evidencia.verificados, 1, 'debería haber exactamente un caso con archivo, hoja y fila')
  assert.equal(k.evidencia.sinVerificar.length, 1)
  assert.match(k.evidencia.sinVerificar[0].obra, /Entrepiso/)
  assert.match(k.evidencia.sinVerificar[0].porQue, /no está entre las 237 estudiadas/)
  // Y el que sí se verificó cita el archivo y las filas: es la diferencia entre un dato y un dicho.
  const verificado = INSUFICIENCIA_METALICA.casos.find((c) => c.verificadoEn)
  assert.match(verificado.verificadoEn, /Instalacion Electrica\.xlsm · hoja Presupuesto · filas/)
})

test('T1180 —una de las partidas metálicas nuevas— ya viene con un multiplicador en el histórico', () => {
  const t1180 = partidasDelCasoMetalico().find((p) => p.tarea.startsWith('T1180'))
  assert.ok(t1180, 'se perdió el caso de T1180, que es el que se puede citar')
  assert.equal(t1180.coeficiente, 4)
  assert.ok(t1180.verificadoEn, 'el caso de T1180 tiene que ser el verificado')
})

test('el ×4 de T1180 se cruza contra el dataset, no contra la constante que lo declara', () => {
  const fila = filaDelCasoMetalico()
  assert.ok(fila, `el artefacto ya no tiene la fila de ${ARCHIVO_DEL_CASO}: el caso metálico se quedó sin fuente`)
  const cita = fila.evidencia.find((e) => e.cita.startsWith('T1180'))
  assert.ok(cita, 'la evidencia del artefacto ya no cita T1180')
  const declarado = partidasDelCasoMetalico().find((p) => p.tarea.startsWith('T1180'))
  assert.equal(coeficienteDeLaCita(cita.cita), declarado.coeficiente, 'el coeficiente que dice el código no es el que dice el artefacto')
  // Y la ubicación que publica el conocimiento tiene que ser la del artefacto, no una parecida.
  const caso = INSUFICIENCIA_METALICA.casos.find((c) => c.verificadoEn)
  assert.ok(caso.verificadoEn.startsWith(`${fila.archivo} · hoja ${fila.hoja}`), `la ubicación declarada no coincide con el artefacto: ${caso.verificadoEn}`)
  for (const n of ['19', '25']) assert.ok(fila.celda_o_rango.includes(`fila ${n}`), `el artefacto ya no cita la fila ${n}`)
})

test('el ×4 no es exclusivo de lo metálico, y la interpretación no puede decir que lo sea', () => {
  const fila = filaDelCasoMetalico()
  // Lo que el artefacto muestra, contado sobre el artefacto: 7 partidas ajustadas, 6 de ellas T1095
  // —una hora de cuadrilla— y las 7 con el MISMO coeficiente. Ahí no hay ninguna exclusividad.
  const citas = fila.evidencia.map((e) => e.cita)
  const horas = citas.filter((c) => c.startsWith('T1095'))
  assert.equal(citas.length, 7)
  assert.equal(horas.length, 6, 'cambió la composición del caso: hay que releer la interpretación, no ajustar el número')
  assert.equal(new Set(citas.map(coeficienteDeLaCita)).size, 1, 'las partidas ajustadas ya no llevan todas el mismo coeficiente')
  // Por eso la interpretación permitida NO puede afirmar que otras partidas no lo recibieron.
  assert.doesNotMatch(INSUFICIENCIA_METALICA.interpretacionPermitida, /que otras partidas no recibieron|que ninguna otra recibió/)
  assert.match(INSUFICIENCIA_METALICA.interpretacionPermitida, /NO se puede decir que el ajuste sea exclusivo/)
  assert.match(INSUFICIENCIA_METALICA.interpretacionPermitida, /T1095/)
  // Y el conocimiento que va a la biblioteca cuenta cuántas eran metálicas de verdad.
  const k = aConocimientoInsuficienciaMetalica()
  assert.equal(k.evidencia.metalicas, 3)
  assert.deepEqual(k.evidencia.noMetalicas, ['T1095 · COTIZACION DE HORA - 1 OF/ 1 AY'])
  assert.match(k.afirmacion, /NO metálica/)
})

test('el caso metálico dice contra qué hay que contrastarlo, y contra qué lo va a reemplazar', () => {
  assert.deepEqual(partidasDelCasoMetalico().map((p) => p.coeficiente), [1.5, 1.4, 4, 4])
  assert.match(INSUFICIENCIA_METALICA.aContrastarCon.join(' '), /T1180–T1185/)
  for (const q of ['mediciones reales', 'composiciones', 'HH imputadas', 'materiales', 'procesos']) {
    assert.ok(INSUFICIENCIA_METALICA.aContrastarCon.some((x) => x.includes(q)), `falta contrastar contra ${q}`)
  }
  assert.match(INSUFICIENCIA_METALICA.objetivo, /CÓMPUTO → COMPOSICIÓN → RECURSOS → HH → COSTO/)
})

test('el caso metálico entra a la biblioteca sólo si esa cotización está en la corrida', async () => {
  const sin = await estudiar(dosClientes())
  assert.equal(sin.conocimientos.some((k) => k.clave === INSUFICIENCIA_METALICA.clave), false)
  const con = await estudiar([{ ...libro('e.xlsx', RUTA('JAVIER SANCHEZ', 'Entrepiso', 'e.xlsx')), modificado: '2025-05-05' }])
  assert.equal(con.conocimientos.some((k) => k.clave === INSUFICIENCIA_METALICA.clave), true)
})

// ═══════════════════ LAS 190 FANTASMA: DOS ENTRADAS VIVAS BAJO LA MISMA CLAVE ═══════════════════

/** Una práctica tal como la escribía la versión anterior del circuito: EXPERIENCIA_ECSAS y el área
 *  vieja. Es lo que hay HOY en `biblioteca.json`, 190 veces. */
const practicaVieja = (clave = 'cotizacion.precio.beneficio.total') => conocimiento({
  clave,
  afirmacion: 'la cotización aplica 17 % de beneficio en 12 de 12 cotizaciones',
  procedencia: PROCEDENCIA.EXPERIENCIA_ECSAS,
  estado: ESTADO.CANDIDATO,
  valor: 0.17,
  condicion: ADVERTENCIA,
  area: AREA_ANTERIOR,
  evidencia: { casos: 12, obras: ['FIMA SA'], ubicacion: 'a.xlsx · hoja GG' },
})

test('sin retirar, la procedencia nueva NO pisa la vieja: quedan dos entradas vivas bajo la misma clave', () => {
  const vieja = practicaVieja()
  const bib = incorporar(VACIA, { conocimientos: [vieja] })
  const nueva = { ...vieja, procedencia: PROCEDENCIA.PRACTICA_HISTORICA_ECSAS, area: AREA }
  // No tira: cambiar EXPERIENCIA_ECSAS por PRACTICA_HISTORICA_ECSAS es un DESCENSO de categoría, y
  // `ascensoProhibido` sólo mira los ascensos. Por eso hacía falta retirarlas, no prohibirlas.
  const conLasDos = incorporar(bib, { conocimientos: [nueva] })
  const vivas = conLasDos.conocimientos.filter((k) => k.clave === vieja.clave && k.estado === ESTADO.CANDIDATO)
  assert.equal(vivas.length, 2, 'el escenario no reproduce el defecto que se está arreglando')
  assert.deepEqual(vivas.map((k) => k.procedencia).sort(), ['EXPERIENCIA_ECSAS', 'PRACTICA_HISTORICA_ECSAS'])

  const { biblioteca, retirados } = retirarPracticasSuperadas(conLasDos, { cuando: '2026-08-28' })
  assert.equal(retirados.length, 1)
  const quedan = biblioteca.conocimientos.filter((k) => k.clave === vieja.clave && k.estado === ESTADO.CANDIDATO)
  assert.deepEqual(quedan.map((k) => k.procedencia), ['PRACTICA_HISTORICA_ECSAS'], 'quedó viva la que dice «lo medimos ejecutando»')
  const retirada = biblioteca.conocimientos.find((k) => k.id === vieja.id)
  assert.equal(retirada.estado, ESTADO.REEMPLAZADO, 'la vieja se borró en vez de retirarse: sin ella no se explica una cotización anterior')
  assert.equal(retirada.reemplazadoPor, quedan[0].id)
  assert.equal(retirada.procedencia, PROCEDENCIA.EXPERIENCIA_ECSAS, 'se reescribió la procedencia en el lugar')
})

test('el id que la migración anticipa es EXACTAMENTE el que va a producir el estudio', async () => {
  // La entrada nueva todavía no existe —el estudio no volvió a correr—, así que el reemplazo apunta
  // a un id calculado. Que ese id sea el mismo que produce `aConocimientoHistorico()` es lo que
  // hace que apuntarlo no sea una suposición.
  const { registros } = await historicos(dosClientes())
  const r = registros.find((x) => x.clave === 'cotizacion.precio.beneficio.total')
  assert.ok(r, 'la práctica de referencia dejó de producirse: hay que elegir otra clave')
  const delEstudio = aConocimientoHistorico(r, { fecha: '2026-08-28' })
  const soloVieja = incorporar(VACIA, { conocimientos: [practicaVieja(r.clave)] })
  const [anticipado] = practicasSuperadas(soloVieja)
  assert.equal(anticipado.yaEsta, false)
  assert.equal(anticipado.nuevoId, delEstudio.id, 'el reemplazo apunta a un id que el estudio no va a usar')
})

test('retirar es idempotente y no toca lo que no es una práctica histórica vieja', () => {
  const ajena = conocimiento({
    clave: 'mano_obra.rendimiento.hormigon', afirmacion: 'x', procedencia: PROCEDENCIA.EXPERIENCIA_ECSAS,
    area: 'mano_obra', evidencia: { casos: 3, obras: ['OBRA'] },
  })
  const bib = incorporar(VACIA, { conocimientos: [practicaVieja(), ajena] })
  const una = retirarPracticasSuperadas(bib)
  assert.equal(una.retirados.length, 1, 'se retiró algo que no es una práctica de cotización')
  assert.equal(una.biblioteca.conocimientos.find((k) => k.id === ajena.id).estado, ESTADO.CANDIDATO)
  const dos = retirarPracticasSuperadas(una.biblioteca)
  assert.deepEqual(dos.retirados, [], 'correrla dos veces retira dos veces')
})
