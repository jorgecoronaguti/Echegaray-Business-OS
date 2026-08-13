// EL CATÁLOGO DE UTILITARIOS DEL MERCADO — cada test acá abajo atrapa un defecto que ya habría
// llegado a un informe de compra, no acompaña al código que lo produjo.
//
// LOS DOS MODOS DE FALLA QUE ESTE ARCHIVO EXISTE PARA IMPEDIR:
//
// 1. QUE ALGUIEN PISE UN PRECIO CON UN LITERAL PLAUSIBLE. Nadie escribe $999.999.999: escriben
//    $28.000.000 en vez de $28.027.500, o el precio de la Plus en la fila de la básica. Eso pasa
//    cualquier validación de forma. Contra eso está el bloque 0, que es la SEGUNDA copia
//    independiente de lo que dice cada fuente — para que las dos mientan igual hay que equivocarse
//    dos veces del mismo modo.
// 2. QUE UN PRECIO PIERDA SU FUENTE. Un número sin URL ni fecha es indistinguible de un número
//    inventado tres meses después. El bloque 1 lo hace imposible: sin `url` y `leidoEl` el test se
//    pone rojo, y un modelo sin precio tiene que declarar DÓNDE se buscó.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MODELOS_MERCADO, FECHA_RELEVAMIENTO, CARROCERIAS_ELEGIBLES_FONDEFIN, CARROCERIAS_NO_ELEGIBLES_FONDEFIN,
  calificaFondefin, motivoNoFondefin, pesosCierran, conPrecio, sinPrecio, ordenadosParaDecidir,
  loQueFaltaDelMercado, TIPO_CAMBIO_OFICIAL,
} from './utilitarios-mercado.mjs'
import { PRESUPUESTOS_RODADOS } from './rodados-datos.mjs'
import { C31 as C31_PLAN } from './rodados-plan-datos.mjs'

const modelo = (clave) => MODELOS_MERCADO.find((m) => m.clave === clave)

// ── 0 · LOS NÚMEROS DE CADA FUENTE, TRANSCRIPTOS UNA SEGUNDA VEZ ─────────────────────────────────

test('el C32 del catálogo es EL MISMO presupuesto de rodados-datos, no una copia', () => {
  // DEFECTO QUE ATRAPA: que alguien "actualice" el precio acá y deje el presupuesto viejo en
  // rodados-datos (o al revés). El plan de caja lee uno y el informe lee el otro: dos verdades del
  // mismo auto. La única defensa es que sea el MISMO objeto, y eso se prueba por identidad.
  const enPresupuestos = PRESUPUESTOS_RODADOS.find((p) => p.clave === 'dfsk-c32-doble-cabina-lepont')
  assert.equal(modelo('dfsk-c32-doble-cabina').presupuestoOrigen, enPresupuestos)
  assert.equal(modelo('dfsk-c32-doble-cabina').precio.ars, enPresupuestos.total)
})

test('el Zanella toma tara y PBT de la ficha del dueño — esos dos NO están en disputa', () => {
  const z = PRESUPUESTOS_RODADOS.find((p) => p.clave === 'zanella-z-truck')
  const cd = z.fichaTecnica.versiones.find((v) => v.codigo === 'CD')
  const cs = z.fichaTecnica.versiones.find((v) => v.codigo === 'CS')
  assert.equal(modelo('zanella-z-truck-cd').pesosKg.pesoBrutoTotal, cd.pesoBrutoTotalKg)
  assert.equal(modelo('zanella-z-truck-cd').pesosKg.ordenDeMarcha, cd.pesoOrdenDeMarchaKg)
  assert.equal(modelo('zanella-z-truck-cs').pesosKg.ordenDeMarcha, cs.pesoOrdenDeMarchaKg)
  assert.equal(modelo('zanella-z-truck-cs').pesosKg.pesoBrutoTotal, cs.pesoBrutoTotalKg)
})

test('la carga del Zanella usa la ficha OFICIAL (690 kg) y conserva el valor del adjunto del dueño', () => {
  // DEFECTO QUE ATRAPA: que alguien "unifique" las dos fuentes borrando una. El adjunto del dueño
  // dice 1.010/1.000 kg y la ficha oficial de CVN dice 690 en las dos versiones. Se usa la oficial
  // —cierra contra el PBT y la confirman dos medios— pero el otro número NO se borra: si mañana el
  // concesionario dice 1.010, el conflicto tiene que seguir escrito para poder discutirlo.
  for (const clave of ['zanella-z-truck-cs', 'zanella-z-truck-cd']) {
    const m = modelo(clave)
    assert.equal(m.pesosKg.cargaLegalDeclarada, 690, `${clave}: la carga oficial son 690 kg`)
    const c = m.datosEnConflicto.find((x) => x.dato === 'carga legal')
    assert.ok(c, `${clave}: se perdió el registro del conflicto`)
    assert.equal(c.valorUsado, 690)
    assert.ok(c.valorAlternativo > 690, `${clave}: el valor del adjunto del dueño tiene que seguir guardado`)
    assert.ok(c.porQueSeEligio, `${clave}: elegir una fuente sobre otra sin decir por qué es tirar una moneda`)
  }
})

test('el C31 del catálogo y el del plan de tres rodados son el MISMO precio', () => {
  // DEFECTO QUE ATRAPA: que el informe de compra diga $29,4M y el plan de caja calcule las cuotas
  // de FONDEFIN sobre otro número. El C31 es la unidad que se compra DOS veces en ese plan: un
  // desfase de un millón se multiplica por dos y corre por 48 cuotas.
  assert.equal(modelo('dfsk-c31-cabina-simple').precio.ars, C31_PLAN.precioLista)
})

test('el sobreprecio del presupuesto de Le Pont contra su propia lista queda medido, no contado', () => {
  // EL HALLAZGO QUE MÁS PLATA MUEVE. Le Pont cotizó la unidad a $33.400.000 y publica $31.200.000
  // en su propio sitio. Si alguien "actualiza" cualquiera de los dos números sin tocar el otro, la
  // diferencia desaparece de la vista y con ella la única negociación que no requiere cambiar de
  // modelo ni de banco. Acá la diferencia se RECALCULA: no está guardada como literal en ningún lado.
  const c32 = modelo('dfsk-c32-doble-cabina')
  const lista = c32.preciosEnConflicto.find((p) => /Le Pont/.test(p.fuente))
  assert.ok(lista, 'se perdió la lista publicada por el propio vendedor')
  assert.equal(lista.valor, 31_200_000)
  const cotizado = c32.presupuestoOrigen.precioUnidad
  assert.equal(cotizado, 33_400_000)
  assert.equal(cotizado - lista.valor, 2_200_000, 'el sobreprecio contra la lista del propio vendedor')
})

test('el tipo de cambio con el que se pesifican los precios en dólares es el oficial del día, con fuente', () => {
  // DEFECTO QUE ATRAPA: pesificar con el blue, con el de ayer, o con un número redondo inventado.
  // Un USD 18.500 vale $28,0M al oficial y $33,3M al blue: la misma camioneta, otra decisión.
  assert.equal(TIPO_CAMBIO_OFICIAL.valor, 1515, 'BNA venta 13/08/2026')
  assert.equal(TIPO_CAMBIO_OFICIAL.fecha, '2026-08-13')
  assert.equal(TIPO_CAMBIO_OFICIAL.tipo, 'oficial-bna-venta')
  assert.ok(TIPO_CAMBIO_OFICIAL.url?.startsWith('http'), 'el TC también lleva fuente')
})

// ── 1 · NINGÚN NÚMERO SIN FUENTE, NINGÚN HUECO SIN NOMBRE ────────────────────────────────────────

test('todo precio del catálogo lleva URL y fecha de lectura', () => {
  // Ésta es la regla que hace que el catálogo sirva para un informe de compra: un precio que no se
  // puede ir a verificar es una afirmación, no un dato.
  for (const m of conPrecio()) {
    assert.ok(m.precio.url?.startsWith('http'), `${m.clave}: precio sin URL`)
    assert.match(m.precio.leidoEl, /^\d{4}-\d{2}-\d{2}$/, `${m.clave}: precio sin fecha de lectura`)
    assert.ok(m.precio.origen, `${m.clave}: precio sin origen (lista oficial / concesionario / guía / portal)`)
    assert.ok(
      ['lista-oficial', 'concesionario', 'guia-cca', 'portal', 'presupuesto'].includes(m.precio.origen),
      `${m.clave}: origen "${m.precio.origen}" no es uno de los cinco válidos`,
    )
  }
})

test('el precio en pesos de una fuente en dólares es exactamente el producto por el TC declarado', () => {
  // DEFECTO QUE ATRAPA: que alguien actualice el TC y deje el peso viejo, o al revés. La conversión
  // no se guarda como número suelto: tiene que reconstruirse.
  for (const m of conPrecio()) {
    if (m.precio.usd == null) continue
    const esperado = Math.round(m.precio.usd * m.precio.tipoCambio)
    assert.equal(m.precio.ars, esperado, `${m.clave}: ${m.precio.usd} USD × ${m.precio.tipoCambio} ≠ ${m.precio.ars}`)
  }
})

test('un modelo SIN precio declara dónde se buscó — no alcanza con decir que no hay', () => {
  // "No tiene precio publicado" es un dato válido y útil SÓLO si viene con la lista de lugares donde
  // se miró. Sin eso es indistinguible de "no busqué".
  for (const m of sinPrecio()) {
    assert.ok(m.precioNoPublicado, `${m.clave}: sin precio y sin explicación`)
    assert.ok(
      (m.precioNoPublicado.buscadoEn ?? []).length >= 3,
      `${m.clave}: hay que declarar al menos 3 fuentes consultadas, hay ${(m.precioNoPublicado.buscadoEn ?? []).length}`,
    )
    assert.ok(m.precioNoPublicado.motivo, `${m.clave}: sin motivo`)
  }
})

test('ningún dato de ficha viene sin fuente: todo modelo declara de dónde salió', () => {
  for (const m of MODELOS_MERCADO) {
    assert.ok((m.fuentes ?? []).length > 0, `${m.clave}: no declara ninguna fuente`)
    for (const f of m.fuentes) {
      assert.ok(f.dato, `${m.clave}: una fuente sin decir qué dato respalda`)
      assert.ok(f.url?.startsWith('http') || f.adjunto, `${m.clave}/${f.dato}: fuente sin URL ni adjunto del dueño`)
      assert.match(f.leidoEl, /^\d{4}-\d{2}-\d{2}$/, `${m.clave}/${f.dato}: fuente sin fecha de lectura`)
    }
  }
})

test('ninguna fecha de lectura es posterior al relevamiento', () => {
  // Una fecha futura es la firma de un dato inventado o de un copiar-pegar de otra fila.
  for (const m of MODELOS_MERCADO) {
    for (const f of m.fuentes ?? []) {
      assert.ok(f.leidoEl <= FECHA_RELEVAMIENTO, `${m.clave}/${f.dato}: leído el ${f.leidoEl}, después del relevamiento`)
    }
  }
})

// ── 2 · LA CARROCERÍA DECIDE CON QUÉ PLATA SE COMPRA ─────────────────────────────────────────────

test('toda carrocería del catálogo está clasificada, y ninguna queda en el limbo', () => {
  const conocidas = [...CARROCERIAS_ELEGIBLES_FONDEFIN, ...Object.keys(CARROCERIAS_NO_ELEGIBLES_FONDEFIN)]
  for (const m of MODELOS_MERCADO) {
    assert.ok(conocidas.includes(m.carroceria), `${m.clave}: carrocería "${m.carroceria}" sin clasificar para FONDEFIN`)
  }
})

test('una doble cabina NUNCA califica para FONDEFIN, y el motivo cita el ROP', () => {
  // DEFECTO QUE ATRAPA: el error de $3,4 millones de costo financiero. FONDEFIN es la única línea con
  // tasa real negativa; si el catálogo marcara elegible una doble cabina, el informe recomendaría
  // financiarla con una línea que la va a rechazar.
  for (const m of MODELOS_MERCADO.filter((x) => x.carroceria === 'doble-cabina')) {
    assert.equal(calificaFondefin(m), false, `${m.clave}: doble cabina marcada como elegible`)
    assert.match(motivoNoFondefin(m), /cabina simple/i)
  }
  assert.equal(motivoNoFondefin(MODELOS_MERCADO.find(calificaFondefin)), null, 'lo elegible no lleva motivo de rechazo')
})

test('la tabla se ordena por lo que decide: primero FONDEFIN, después precio', () => {
  const orden = ordenadosParaDecidir()
  const primerNoElegible = orden.findIndex((m) => !calificaFondefin(m))
  if (primerNoElegible >= 0) {
    assert.ok(
      orden.slice(primerNoElegible).every((m) => !calificaFondefin(m)),
      'un elegible quedó después de un no elegible: el orden no refleja la decisión',
    )
  }
  // Y dentro de cada grupo, precio ascendente con los sin precio al final.
  for (const grupo of [orden.filter(calificaFondefin), orden.filter((m) => !calificaFondefin(m))]) {
    const precios = grupo.map((m) => m.precio?.ars ?? Number.POSITIVE_INFINITY)
    for (let i = 1; i < precios.length; i++) {
      assert.ok(precios[i] >= precios[i - 1], `${grupo[i].clave} ($${precios[i]}) quedó después de uno más caro`)
    }
  }
})

// ── 3 · LA CUENTA QUE NADIE HACE: ¿PUEDE CARGAR LO QUE DICE EL FOLLETO? ──────────────────────────

test('el Zanella cabina doble no puede cargar ni lo que declara su ficha oficial: son 635 kg', () => {
  // Es el hallazgo que motivó este chequeo, y sobrevivió a la corrección de la fuente. Con el dato
  // del adjunto del dueño (1.000 kg) la CD se pasaba 365 kg del PBT; con el dato OFICIAL (690 kg)
  // se sigue pasando 55 — que son exactamente lo que la cabina doble pesa de más que la simple.
  // Cualquiera sea la fuente, la unidad carga 635 kg. Comprarla creyendo los 1.000 kg del folleto
  // que llegó por el chat es comprarla creyendo que carga un 57% más de lo que carga.
  const r = pesosCierran(modelo('zanella-z-truck-cd'))
  assert.equal(r.cierran, false)
  assert.equal(r.cargaRealDentroDelPbt, 635)
  assert.equal(r.excedenteKg, 55, '1.260 + 690 = 1.950 contra 1.895 de PBT')

  // La cabina SIMPLE, con el dato oficial, cierra exacto: 1.205 + 690 = 1.895. Que cierre exacto es
  // la prueba de que 690 es el número bueno y 1.010 el importado de otra ficha.
  const cs = pesosCierran(modelo('zanella-z-truck-cs'))
  assert.equal(cs.cierran, true)
  assert.equal(cs.cargaRealDentroDelPbt, 690)
  assert.equal(cs.excedenteKg, 0)
})

test('los pesos de los chinos de mayor porte cierran exacto — y eso también hay que verificarlo', () => {
  // No sólo se busca el que falla: un test que sólo mira al que ya sabemos roto no detecta que
  // mañana alguien pise la tara del Foton o del Dongfeng. Los cuatro cierran al kilo.
  for (const [clave, pbt] of [
    ['foton-aumark-tm1-cabina-simple', 2850],
    ['foton-aumark-tm1-doble-cabina', 2850],
    ['dongfeng-captain-w412-cabina-simple', 3490],
    ['dongfeng-captain-w412-doble-cabina', 3490],
  ]) {
    const m = modelo(clave)
    const r = pesosCierran(m)
    assert.equal(r.cierran, true, `${clave}: ${r.motivo}`)
    assert.equal(r.excedenteKg, 0, `${clave}: tara + carga tiene que dar el PBT exacto`)
    assert.equal(m.pesosKg.pesoBrutoTotal, pbt)
  }
})

test('un modelo al que le falta uno de los tres pesos devuelve null, no "cierra"', () => {
  // DEFECTO QUE ATRAPA: tratar el dato ausente como dato bueno. Si `pesosCierran` devolviera true
  // ante un peso faltante, todo modelo sin tara publicada pasaría el control silenciosamente.
  const sinTara = { pesosKg: { ordenDeMarcha: null, cargaLegalDeclarada: 1000, pesoBrutoTotal: 2315 } }
  assert.equal(pesosCierran(sinTara).cierran, null)
  assert.equal(pesosCierran(sinTara).cargaRealDentroDelPbt, null)
  assert.equal(pesosCierran({}).cierran, null)
})

test('todo modelo con los tres pesos publicados pasa por el chequeo, y el que no cierra está declarado', () => {
  // El chequeo no es opcional ni se hace a mano: si un modelo nuevo entra con pesos que no cierran y
  // nadie lo declaró en `desconocido`/`inconsistencias`, este test lo encuentra.
  for (const m of MODELOS_MERCADO) {
    const r = pesosCierran(m)
    if (r.cierran !== false) continue
    assert.ok(
      m.inconsistencias?.some((i) => /peso|carga|PBT/i.test(i.dato)),
      `${m.clave}: los pesos no cierran (${r.motivo}) y el modelo no lo declara en inconsistencias`,
    )
  }
})

// ── 4 · LOS HUECOS SE PUEDEN LISTAR CON UNA FUNCIÓN ──────────────────────────────────────────────

test('loQueFaltaDelMercado incluye los tres tipos de hueco y no se queda vacío', () => {
  const falta = loQueFaltaDelMercado()
  const tipos = new Set(falta.map((f) => f.tipo))
  assert.ok(tipos.has('sin_precio_publicado'), 'los modelos sin precio tienen que aparecer como trabajo pendiente')
  assert.ok(tipos.has('pesos_no_cierran'), 'el Zanella tiene que aparecer con sus pesos rotos')
  assert.ok(falta.length > 0)
  for (const f of falta.filter((x) => x.tipo === 'sin_precio_publicado')) {
    assert.ok(f.buscadoEn.length >= 3, `${f.modelo}: el hueco no dice dónde se buscó`)
  }
})

test('el equipamiento usa el vocabulario de rodados-datos y nada más', () => {
  // 'serie' · 'opcional' · null. Un `false`, un `'no'` o un `'-'` rompen `equipamientoFaltante()` en
  // silencio, y el airbag opcional es exactamente el campo por el que se descarta una unidad.
  for (const m of MODELOS_MERCADO) {
    for (const [item, estado] of Object.entries(m.equipamiento ?? {})) {
      assert.ok(
        estado === 'serie' || estado === 'opcional' || estado === null,
        `${m.clave}/${item}: estado "${estado}" fuera del vocabulario`,
      )
    }
  }
})

test('cada clave del catálogo es única', () => {
  const claves = MODELOS_MERCADO.map((m) => m.clave)
  assert.equal(new Set(claves).size, claves.length, 'hay claves repetidas: dos filas del mismo auto')
})
