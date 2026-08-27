import test from 'node:test'
import assert from 'node:assert/strict'
import { veredictoDe, decisionDelModelo, unidadCompatible, normalizar, UMBRAL } from './clasificar-actividades.mjs'

const c = (nombre, similitud, unidad = null, tareaTipoId = nombre) => ({ tareaTipoId, nombre, unidad, similitud })

test('nombre idéntico: se asigna sola', () => {
  const v = veredictoDe({ nombre: 'Retiro de Escombros' }, [c('RETIRO DE ESCOMBROS', 1)])
  assert.equal(v.veredicto, 'EXACTO')
  assert.equal(v.origen, 'nombre-exacto')
})

test('dos tipos con el mismo nombre: nadie decide por adivinanza', () => {
  const v = veredictoDe({ nombre: 'PISO' }, [c('PISO', 1, null, 'a'), c('PISO', 1, null, 'b')])
  assert.equal(v.veredicto, 'AMBIGUO')
})

test('el mismo nombre en plural es el mismo nombre', () => {
  // «EXCAVACION» y «EXCAVACIONES» son la misma tarea escrita distinto, y dejarla sin clasificar por
  // una S era perder la experiencia. Que la otra candidata agregue una palabra («MANUAL») no la
  // vuelve ambigua: agregar una palabra es ser OTRA tarea, y por eso queda vetada.
  const v = veredictoDe({ nombre: 'EXCAVACION' }, [c('EXCAVACIONES', 0.9), c('EXCAVACION MANUAL', 0.6)])
  assert.equal(v.veredicto, 'EXACTO')
  assert.equal(v.evidencia.candidata, 'EXCAVACIONES')
})

test('ALISADO no es PULIDO por más que se parezcan: no se asigna', () => {
  // ═══ ESTE TEST AFIRMABA LO CONTRARIO (27/08/2026, auditoría) ═══
  //
  // Decía «una sola candidata fuerte y sin competencia: se asigna con ALTA» con este mismo par. Y
  // alisado y pulido son dos terminaciones distintas: otro trabajo, otro rendimiento, otro precio.
  // El defecto estaba encodado como test, que es la forma más cara de tenerlo — el arreglo se veía
  // como una regresión.
  const v = veredictoDe({ nombre: 'PISO DE HORMIGON ALISADO' },
    [c('PISO DE HORMIGON PULIDO', 0.82), c('CONTRAPISO', 0.52)])
  assert.notEqual(v.veredicto, 'ALTA')
  assert.equal(v.tareaTipoId, undefined)
  // Y la que sobrevive es la floja (CONTRAPISO, 0,52), que no alcanza para decidir: zona gris.
  assert.equal(v.veredicto, 'ZONA GRIS')
})

test('dos candidatas que sólo cambian la terminación: ninguna se lleva la actividad', () => {
  const v = veredictoDe({ nombre: 'PISO DE HORMIGON ALISADO' },
    [c('PISO DE HORMIGON PULIDO', 0.82), c('PISO DE HORMIGON FRATAZADO', 0.80)])
  assert.notEqual(v.veredicto, 'ALTA')
  assert.equal(v.tareaTipoId, undefined)
})

test('si la ÚNICA candidata está vetada, es AMBIGUO — y no se gasta una llamada al modelo', () => {
  // No va a la zona gris: la regla ya sabe por qué no corresponde, y decirlo cuesta cero. La zona
  // gris es para cuando hay señal y NO hay certeza, no para cuando hay certeza de que no.
  const v = veredictoDe({ nombre: 'PISO DE HORMIGON ALISADO' }, [c('PISO DE HORMIGON PULIDO', 0.82)])
  assert.equal(v.veredicto, 'AMBIGUO')
  assert.equal(v.tareaTipoId, undefined)
})

test('la unidad manda sobre el parecido del nombre', () => {
  // Un trabajo medido en m² no puede ser una tarea que se cobra por hora, por más que se llamen
  // igual. Acá los nombres son idénticos: lo único que decide es la unidad.
  const v = veredictoDe({ nombre: 'BOBCAT', unidad: 'm2' }, [c('BOBCAT', 1, 'HR')])
  assert.equal(v.veredicto, 'AMBIGUO')
  assert.match(v.porQue, /se mide en/)
  // Y si la actividad no declara unidad, no bloquea: no se puede contradecir lo que no se dijo.
  assert.equal(unidadCompatible(null, 'HR'), true)
  assert.equal(unidadCompatible('M2', 'm2'), true, 'la unidad se compara normalizada')
})

test('sin ninguna candidata por encima del piso: SIN MATCH', () => {
  assert.equal(veredictoDe({ nombre: 'Calcomania de carteles' }, []).veredicto, 'SIN MATCH')
  assert.equal(veredictoDe({ nombre: 'x' }, [c('y', UMBRAL.MIRAR - 0.01)]).veredicto, 'SIN MATCH')
})

test('la zona gris no decide: junta candidatas para que las mire otro', () => {
  // Parecido real sin contención: ninguna de las dos contiene a la otra, y el parecido no alcanza.
  const v = veredictoDe({ nombre: 'PISO DE HORMIGON' }, [c('PUENTE DE HORMIGON', 0.57)])
  assert.equal(v.veredicto, 'ZONA GRIS')
  assert.equal(v.candidatas.length, 1)
  assert.equal(v.tareaTipoId, undefined, 'la zona gris no asigna nada por sí sola')
})

// ── LOS DOS CASOS QUE NO PUEDEN CLASIFICARSE NUNCA ───────────────────────────────────────────

test('«Hormigonado» NO es «HORMIGONADO A MANO», ni siquiera con el rubro a favor', () => {
  // Hormigonar a mano y hormigonar con bomba comparten la palabra y no la productividad. El rubro
  // del cronograma dice «Hormigonado» y corrobora — y aun así no alcanza: una corroboración baja el
  // umbral del parecido, nunca levanta un veto.
  const v = veredictoDe({ nombre: 'Hormigonado', seccion: 'Hormigonado', obra: 'Messina' },
    [c('HORMIGONADO A MANO', 0.63, 'M3')])
  assert.equal(v.veredicto, 'AMBIGUO')
  assert.equal(v.tareaTipoId, undefined)
  assert.match(v.porQue, /más específica/)
})

test('«Compactación» NO es «RELLENO Y COMPACTACIÓN» cuando la obra tiene «Relleno» aparte', () => {
  // La secuencia constructiva lo prueba: esta obra parte esa tarea en dos, así que la tarea entera
  // no es ninguna de las dos. El veto por hermana es el único que aporta la obra y ninguna otra
  // fuente, y acá se suma al de especificidad.
  const v = veredictoDe({
    nombre: 'Compactación', seccion: 'GALPÓN 1',
    hermanas: [{ nombre: 'Relleno', tareaTipoId: null }, { nombre: 'Tendido de malla', tareaTipoId: null }],
  }, [c('RELLENO Y COMPACTACIÓN', 0.57, 'M3')])
  assert.equal(v.veredicto, 'AMBIGUO')
  assert.equal(v.tareaTipoId, undefined)
  assert.ok(v.vetadas[0].vetos.some((x) => /Relleno/.test(x)), 'el veto por hermana quedó escrito')
})

// ── LA EVIDENCIA QUE NO ESTÁ EN EL NOMBRE ────────────────────────────────────────────────────

test('la partida cotizada decide sin mirar un nombre', () => {
  const v = veredictoDe({ nombre: 'cualquier cosa', partidaTareaTipoId: 't9', partidaCodigo: '1.2' }, [])
  assert.equal(v.veredicto, 'EXACTO')
  assert.equal(v.tareaTipoId, 't9')
  assert.equal(v.origen, 'presupuesto')
})

test('con evidencia independiente baja el umbral del parecido, pero no el de la competencia', () => {
  const contexto = { nombre: 'MURO PORTANTE', seccion: 'MURO', unidad: 'M2' }
  // 0,66 no alcanza sola (el umbral sin respaldo es 0,75); con el rubro y la unidad a favor, sí.
  const sola = veredictoDe(contexto, [c('MURO CIEGO', 0.66, 'M2')])
  assert.equal(sola.veredicto, 'ALTA')
  assert.ok(sola.evidencia.corroboraciones.length >= 1)
  // Pero con una segunda candidata pegada, las corroboraciones NO desempatan.
  const conCompetencia = veredictoDe(contexto, [c('MURO CIEGO', 0.66, 'M2'), c('MURO DOBLE', 0.64, 'M2')])
  assert.equal(conCompetencia.veredicto, 'AMBIGUO')
})

// ── EL MODELO PROPONE, NO DECIDE ─────────────────────────────────────────────────────────────

test('«se parece» no alcanza: sólo «es la misma tarea» clasifica', () => {
  const cands = [c('RELLENO Y COMPACTACIÓN', 0.57, null, 't1')]
  const v = decisionDelModelo({ tarea_tipo_id: 't1', certeza: 'parecida', motivo: 'es parte de' }, cands)
  assert.equal(v.veredicto, 'AMBIGUO')
})

test('el modelo no puede elegir un tipo que no estaba entre las candidatas', () => {
  const v = decisionDelModelo({ tarea_tipo_id: 'inventado', certeza: 'misma_tarea' }, [c('X', 0.6, null, 't1')])
  assert.equal(v.veredicto, 'SIN MATCH')
})

test('«ninguna» es una respuesta válida y esperada', () => {
  const v = decisionDelModelo({ tarea_tipo_id: 'ninguna', motivo: 'no hay equivalencia' }, [c('X', 0.6)])
  assert.equal(v.veredicto, 'SIN MATCH')
})

test('cuando el modelo sí decide, queda marcado como CANDIDATO y con su evidencia', () => {
  const cands = [c('EXCAVACIONES', 0.7, null, 't1')]
  const v = decisionDelModelo({ tarea_tipo_id: 't1', certeza: 'misma_tarea', motivo: 'es la misma' }, cands)
  assert.equal(v.veredicto, 'CANDIDATO')
  assert.equal(v.origen, 'modelo')
  assert.equal(v.evidencia.candidata, 'EXCAVACIONES')
  assert.deepEqual(v.evidencia.candidatas, ['EXCAVACIONES'])
})

test('normalizar saca acentos y colapsa espacios', () => {
  assert.equal(normalizar('  Compactación   y   nivelación '), 'COMPACTACION Y NIVELACION')
})
