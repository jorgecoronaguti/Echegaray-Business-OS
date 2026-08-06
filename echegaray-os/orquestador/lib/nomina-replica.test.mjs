// LA RÉPLICA LEE EL LAYOUT DE HOY, NO EL DE JULIO.
//
// Este archivo probaba el layout de DIEZ columnas (Desde·Hasta·Días·Personas·Hs·Hs·Banco·Adelanto·
// Recibo·Total). El rediseño del 23/07 intercaló "Se paga el" y agregó "Pagado el": el registro pasó
// a catorce columnas y el TOTAL de la J a la K. La réplica siguió leyendo la J —"Total recibo"— y el
// test siguió en verde, porque probaba el layout viejo contra un lector del layout viejo. Un control
// que se valida contra su propia foto no controla nada.
//
// Ahora las fixtures tienen la forma REAL del registro y los índices salen de COL_REGISTRO, que es
// el mismo contrato que usa el generador para escribirlo.
import assert from 'node:assert/strict'
import { fechaSheet, num, mapearQuincenas, mapearEscala, formatReplica } from './nomina-replica.mjs'
import { COL_REGISTRO, COL_PROYECCION } from './nomina-sync.mjs'
import { parsearAcuerdos } from './uocra-acuerdos.mjs'

// Fechas: el Sheet devuelve serial O texto dd/mm/yyyy, según la celda. Las dos tienen que entrar.
assert.equal(fechaSheet('5/1/2026'), '2026-01-05')
assert.equal(fechaSheet('16/07/2026'), '2026-07-16')
assert.equal(fechaSheet(46027), '2026-01-05', 'serial real leído del Sheet')
assert.equal(fechaSheet(46024), '2026-01-02')
assert.equal(fechaSheet(''), null)
assert.equal(fechaSheet('TOTAL AÑO'), null, 'una etiqueta no es una fecha')

assert.equal(num('$ 8.157.588'), 8157588)
assert.equal(num('1.631,65'), 1631.65)
assert.equal(num('-'), 0)
assert.equal(num(1234.5), 1234.5)

// Estado: lo que ya terminó es dato; lo que sigue abierto va a SEGUIR subiendo.
{
  const hoy = new Date('2026-07-20')
  // El registro de HOY: Quincena·Hasta·Se paga el·Días·Personas·Hs previstas·Hs reales·Banco·
  // Adelanto·Total recibo·TOTAL·Σ $/hora·Estado·Pagado el
  const reg = (desde, hasta, dias, personas, prev, reales, banco, adel, recibo, total) => {
    const f = Array(14).fill('')
    f[COL_REGISTRO.desde] = desde; f[COL_REGISTRO.hasta] = hasta; f[COL_REGISTRO.pago] = ''
    f[COL_REGISTRO.dias] = dias; f[COL_REGISTRO.personas] = personas
    f[COL_REGISTRO.hs_previstas] = prev; f[COL_REGISTRO.hs_reales] = reales
    f[COL_REGISTRO.banco] = banco; f[COL_REGISTRO.adelanto] = adel
    f[COL_REGISTRO.total_recibo] = recibo; f[COL_REGISTRO.total] = total
    return f
  }
  const pro = (desde, hasta, dias, personas, total) => {
    const f = Array(8).fill('')
    f[COL_PROYECCION.desde] = desde; f[COL_PROYECCION.hasta] = hasta
    f[COL_PROYECCION.dias] = dias; f[COL_PROYECCION.personas] = personas
    f[COL_PROYECCION.total] = total
    return f
  }
  const filas = [
    reg('5/1/2026', '15/01/2026', '10', '15', '1350', '959', '1380275', '20000', '3487800', '4888075'),
    reg('16/7/2026', '30/07/2026', '13', '16', '1872', '338', '0', '0', '7786971', '7786971'),
    ['⇒ Total pagado en el año', '', '', '', '', '', '', '', '', '', '99999999'],
  ]
  const proy = [
    pro('16/07/2026', '31/07/2026', '12', '19', '8157588'),   // misma quincena en curso
    pro('01/08/2026', '15/08/2026', '10', '19', '6797990'),
  ]
  // "Desde" sin año, como lo trae el archivo JORNALES: el año se toma de "Hasta".
  const sinAnio = mapearQuincenas([reg('5/1', '15/01/2026', '10', '15', '1350', '959', '0', '0', '0', '4888075')], { hoy })
  if (sinAnio[0].desde !== '2026-01-05') throw new Error('desde sin año: ' + sinAnio[0].desde)
  const q = mapearQuincenas(filas, { hoy, proyectadas: proy })
  assert.equal(q.length, 3, 'dos reales + una proyectada; la fila TOTAL no entra')
  assert.equal(q[0].estado, 'cerrada')
  assert.equal(q[1].estado, 'en_curso', 'la quincena que todavía no terminó no es un dato cerrado')
  assert.equal(q[2].estado, 'proyectada')
  assert.equal(q[2].desde, '2026-08-01')
  // La quincena en curso NO se duplica con su propia proyección: sería contar la misma plata dos veces.
  assert.equal(q.filter((x) => x.desde === '2026-07-16').length, 1)
  // EL DEFECTO CONCRETO: si el lector vuelve a usar los índices del layout viejo, el TOTAL sale de la
  // columna "Total recibo" y devuelve $3.487.800 en vez de $4.888.075 — un número plausible, más
  // chico, y sin un solo error. La réplica alimenta la web: ese es el número que la web mostraría.
  assert.equal(q[0].total, 4888075)
  assert.notEqual(q[0].total, 3487800, 'está leyendo "Total recibo" como si fuera el TOTAL: índices del layout viejo')
  assert.equal(q[0].banco, 1380275)
  assert.equal(q[2].hs_reales, null, 'una quincena proyectada no tiene horas reales')
  assert.equal(q[2].total, 6797990, 'la proyección tiene el total en la columna "Proyectado", no en la 6ª')
  // Una fila de TOTAL con el prefijo del patrón ("⇒") tampoco entra: si entrara, sumaría el año dos veces.
  assert.ok(!q.some((x) => x.total === 99999999), 'la fila de total del cuadro se coló como si fuera una quincena')
}

// ═══ LA ESCALA DEL CONVENIO: CADA MES CON SU VIGENCIA REAL ═══
//
// El lector viejo escribía `vigencia_desde = '2026-07-01'` a fuego para TODAS las filas, y buscaba un
// encabezado ("Básico $/hora") que no existe desde el 23/07: la réplica quedaba vacía y, cuando algo
// entraba, entraba con una vigencia inventada. Un dato replicado con la vigencia equivocada es peor
// que no replicarlo: no da error y contesta mal.
{
  const raw = [
    ['Mes', 'Categoría', 'Por', 'Básico'],
    ['Acuerdo Mayo 2026'],
    ['Agosto\n+1,9%', 'Oficial Especializado', 'Hora', '7420', '816', '3971', '7420', '7420'],
    ['', 'Oficial', '', '6348', '702', '4333', '6348', '6348'],
    ['', 'Medio Oficial', '', '5866', '636', '4440', '5866', '5866'],
    ['', 'Ayudante', '', '5399', '621', '4608', '5399', '5399'],
    ['', 'Sereno', 'Mes', '980858', '111861', '658924', '980858', '980858'],
    ['Julio\n+2%', 'Oficial Especializado', 'Hora', '6800', '748', '3639', '6800', '6800'],
    ['', 'Oficial', '', '5817'], ['', 'Medio Oficial', '', '5375'],
    ['', 'Ayudante', '', '4948'], ['', 'Sereno', 'Mes', '898817'],
  ]
  const { escalones } = parsearAcuerdos(raw)
  const escala = mapearEscala(escalones)
  const ayuAgo = escala.find((e) => e.categoria === 'Ayudante' && e.vigencia_desde === '2026-08-01')
  const ayuJul = escala.find((e) => e.categoria === 'Ayudante' && e.vigencia_desde === '2026-07-01')
  assert.equal(ayuAgo.basico_hora, 5399)
  assert.equal(ayuJul.basico_hora, 4948, 'julio y agosto no pueden compartir vigencia')
  const sereno = escala.find((e) => e.categoria === 'Sereno' && e.vigencia_desde === '2026-08-01')
  assert.equal(sereno.basico_hora, null, 'el Sereno cobra por MES: $980.858 en la columna de $/hora es un disparate')
  assert.equal(sereno.mensual, 980858)
  // La suma no remunerativa NO está en la réplica: null (no se sabe), nunca 0 (no hay).
  assert.equal(ayuAgo.no_remunerativo_mensual, null)
  assert.match(ayuAgo.fuente, /Acuerdo Mayo 2026/)
}

// El resumen nunca mezcla dato con estimación en un solo número.
{
  const t = formatReplica({ quincenas: 25, quincenas_proyectadas: 10, total_jornales: 114371743, cargas: 36, total_cargas: 44776342, uocra: 5 })
  assert.match(t, /10 proyectadas/)
  assert.match(t, /114\.371\.743/)
}

console.log('nomina-replica.test.mjs OK')
