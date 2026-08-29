// LO QUE SE PRUEBA ACÁ ES QUE EL DRIVER DE LAS TRES PROYECCIONES NO SE PUEDA VOLVER A DESLIZAR.
//
// El defecto que este módulo cierra no daba error: el factor salía del cociente de básicos publicados
// (+9,11% de julio a agosto) mientras el acuerdo firmado decía +1,9%, y ese 9,11% se aplicaba a
// sueldos de Oficina que no tienen básico de convenio. Todo plausible, todo mal.
//
// Los cuatro controles: el factor acumulado es el producto de los tramos FIRMADOS · la frontera del
// acuerdo (31/08/2026) parte el mundo en acuerdo y proyección · la réplica viva le gana a la constante
// del repo · y la escala verificada a mano puede notar que la réplica se cayó.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONVENIO_POR_CODIGO, DECISION_DUENO, ESCALA_VERIFICADA, INFERENCIA_OS, MENSUAL_VERIFICADO,
  ORIGEN_ACUERDO, ORIGEN_PROYECCION, PERIODO_VERIFICADO, PORCENTAJE_DE_AUMENTO, TRAMOS_FIRMADOS,
  ULTIMO_TRAMO, FRACCION_DE_BRECHA, tarifaConAumento, claveDeCategoria, codigosSinProcedencia, contrastarEscala, convenioDe, equivalenciaDe,
  esInferida, factorUocraEntre, jornalConAumento, lineaEquivalenciasInferidas, periodosEntre,
  rotuloConvenio, tramoDe,
} from './uocra-paritaria.mjs'
import { parsearAcuerdos } from './uocra-acuerdos.mjs'

const grupo = (rotulo, [oe, of, mo, ay, se]) => [
  [rotulo, 'Oficial Especializado', 'Hora', String(oe), '', '', String(oe), String(oe)],
  ['', 'Oficial', '', String(of)], ['', 'Medio Oficial', '', String(mo)],
  ['', 'Ayudante', '', String(ay)], ['', 'Sereno', 'Mes', String(se)],
]
/** La réplica tal como está hoy: el acuerdo de mayo con sus tres tramos, agosto arriba. */
const replica = (agosto = [7420, 6348, 5866, 5399, 980858]) => parsearAcuerdos([
  ['Acuerdo Mayo 2026'],
  ...grupo('Agosto\n+1,9%', agosto),
  ...grupo('Julio\n+2%', [6800, 5817, 5375, 4948, 898817]),
  ...grupo('Junio\n+2,1%', [6660, 5700, 5268, 4851, 880723]),
]).escalones

const casi = (a, b, tol = 1e-9) => Math.abs(a - b) < tol

test('EL FACTOR ACUMULADO ES EL PRODUCTO DE LOS TRAMOS: jun × jul × ago', () => {
  const f = factorUocraEntre('2026-05', '2026-08')
  assert.equal(f.tramos.length, 3)
  assert.ok(casi(f.factor, 1.021 * 1.020 * 1.019), `dio ${f.factor}`)
  assert.equal(f.firmado, true, 'los tres tramos están firmados: no puede rotularse como proyección')
  assert.equal(f.mesesProyectados, 0)
  // El mes base no se ajusta a sí mismo. Es lo que mata el doble conteo por construcción, no por un
  // número corregido a mano: no hay tramo que aplicar.
  assert.deepEqual(factorUocraEntre('2026-08', '2026-08'), { factor: 1, tramos: [], mesesProyectados: 0, firmado: true })
})

test('LA FRONTERA DEL ACUERDO: septiembre 2026 ya no es acuerdo, es proyección', () => {
  // El acuerdo UOCRA–Camarco–FAEC rige hasta el 31/08/2026. Después NO hay paritaria firmada, y
  // presentar el mes siguiente como si la hubiera es exactamente lo que este repositorio prohíbe.
  assert.equal(tramoDe('2026-08').origen, ORIGEN_ACUERDO)
  const sep = tramoDe('2026-09')
  assert.equal(sep.origen, ORIGEN_PROYECCION)
  assert.equal(sep.pct, ULTIMO_TRAMO, 'la proyección repite el ÚLTIMO tramo conocido, no un promedio')
  const f = factorUocraEntre('2026-08', '2026-10')
  assert.equal(f.firmado, false, 'un tramo proyectado contamina el conjunto: el rótulo no puede decir "acuerdo"')
  assert.equal(f.mesesProyectados, 2)
  assert.ok(casi(f.factor, 1.019 * 1.019))
})

test('hacia atrás el factor es el recíproco: un mes anterior VALE MENOS', () => {
  // Lo usa Dirección, cuyo importe conocido es el de hoy: un mes de retiro anterior al mes en curso no
  // puede proyectarse al valor de hoy. Sin el recíproco habría que escribir la resta a mano en la
  // fórmula, que es donde se cuelan los signos dados vuelta.
  const ida = factorUocraEntre('2026-06', '2026-08').factor
  const vuelta = factorUocraEntre('2026-08', '2026-06').factor
  assert.ok(casi(ida * vuelta, 1), `${ida} × ${vuelta}`)
  assert.ok(vuelta < 1)
})

test('LA RÉPLICA VIVA LE GANA A LA CONSTANTE DEL REPO', () => {
  // Si mañana se firma un acuerdo nuevo y alguien lo pega en _UOCRA_RAW, tiene que entrar solo. Una
  // constante escrita en el repositorio no puede ganarle a un acuerdo posterior: envejece y nadie se
  // entera hasta que el costo laboral proyectado ya se usó para decidir.
  const nuevo = parsearAcuerdos([
    ['Acuerdo Septiembre 2026'],
    ...grupo('Septiembre\n+3,4%', [7672, 6564, 6065, 5582, 1014507]),
  ]).escalones
  const t = tramoDe('2026-09', nuevo)
  assert.equal(t.pct, 0.034, 'el acuerdo nuevo no entró: la constante del repo le ganó')
  assert.equal(t.origen, ORIGEN_ACUERDO)
  // Y si la réplica se cayó, los tramos verificados siguen cubriendo el acuerdo vigente.
  assert.equal(tramoDe('2026-07', []).pct, 0.020)
  assert.equal(TRAMOS_FIRMADOS.map((x) => x.pct).join('/'), '0.021/0.02/0.019')
})

test('un rótulo SIN porcentaje cae a la proyección, no a un cero', () => {
  // "Sube 0%" y "no sé cuánto sube" son cosas distintas y sólo una es un dato. Un 0 acá congelaría el
  // costo laboral de un semestre entero sin dar un solo error.
  const sinPct = parsearAcuerdos([
    ['Acuerdo Mayo 2026'],
    ...grupo('Agosto', [7420, 6348, 5866, 5399, 980858]),
  ]).escalones
  const t = tramoDe('2026-08', sinPct)
  assert.equal(t.pct, 0.019, 'cayó a los tramos firmados, que es lo que corresponde')
  assert.notEqual(t.pct, 0)
})

test('EL CONTRASTE PUEDE NOTAR QUE LA RÉPLICA SE CAYÓ — un control no se valida contra sí mismo', () => {
  assert.deepEqual(contrastarEscala(replica()), [], 'la réplica coincide con lo verificado el 07/08')
  // La escala verificada contra dos fuentes: $/hora Zona A, agosto 2026.
  assert.equal(ESCALA_VERIFICADA.Ayudante, 5399)
  assert.equal(ESCALA_VERIFICADA['Oficial Especializado'], 7420)
  assert.equal(MENSUAL_VERIFICADO.Sereno, 980858, 'el Sereno cobra por MES: no se compara contra un jornal')
  // El IMPORTHTML devuelve la tabla del mes pasado y no da error: se ve igual de sana.
  const vieja = contrastarEscala(replica([6800, 5817, 5375, 4948, 898817]))
  assert.equal(vieja.length, 5, `no detectó el desvío: ${vieja.join(' · ')}`)
  assert.match(vieja[0], /réplica 6800 ≠ verificado 7420/)
  // Y si directamente no trae el mes verificado, lo dice en vez de callarse.
  assert.match(contrastarEscala([])[0], new RegExp(PERIODO_VERIFICADO))
})

test('la equivalencia con el convenio es la que declaró el dueño, y lo que no está NO se adivina', () => {
  // El sufijo M es obra metalúrgica (UOM Rama 17): otro gremio, y se proyecta igual por orden expresa
  // —"por más q no esten en ese gremio y convenio"—. Lo que se toma prestado es el escalón.
  assert.equal(convenioDe('OF'), 'Oficial')
  assert.equal(convenioDe('OF M'), 'Oficial')
  assert.equal(convenioDe('A'), 'Ayudante')
  assert.equal(convenioDe('A M'), 'Ayudante')
  assert.equal(convenioDe('of m'), 'Oficial', 'la planilla no es consistente con las mayúsculas')
  assert.equal(convenioDe('C'), null, 'una categoría sin equivalencia declarada no se inventa')
  assert.equal(convenioDe(''), null)
})

test('los períodos entre dos meses excluyen el base e incluyen el final', () => {
  assert.deepEqual(periodosEntre('2026-11', '2027-02'), ['2026-12', '2027-01', '2027-02'])
  assert.deepEqual(periodosEntre('2026-08', '2026-08'), [], 'el mes base no se ajusta a sí mismo')
  assert.deepEqual(periodosEntre('2026-09', '2026-08'), [], 'hacia atrás lo resuelve factorUocraEntre')
  assert.deepEqual(periodosEntre('agosto', '2026-08'), [], 'una entrada que no es un período no explota')
  assert.equal(factorUocraEntre('2026-13', '2026-08'), null, 'un mes 13 no existe: falla ruidoso')
})

// ═══ LOS DOS CÓDIGOS QUE TRAJO LA QUINCENA 17/08–31/08 (28/08/2026) ═══
//
// Sin ellos, `convenioDe` devolvía null para tres personas reales y el control de convenio se
// quedaba mudo justo con las dos que ASCENDIERON. Un null acá no es "gana cero": es "no sé cuánto le
// corresponde", y publicarlo como si fuera un piso sería inventar.
test('las categorías nuevas de la planilla tienen equivalencia, y la que se infirió está marcada', () => {
  assert.equal(convenioDe('OF E'), 'Oficial Especializado', 'Pastran y Quiroga Sebastián ascendieron')
  assert.equal(convenioDe('of e'), 'Oficial Especializado', 'la planilla no respeta mayúsculas')
  assert.equal(convenioDe('M OF'), 'Medio Oficial', 'Castillo Carlos — lectura declarada, no un hecho')
  assert.equal(convenioDe('MO'), null, 'una abreviatura parecida NO se adivina')
  assert.equal(convenioDe('OF ESP'), null, 'tampoco una variante que nadie declaró')
})

test('el aumento cierra la MITAD de la brecha hasta el piso, y nunca lo pasa', () => {
  // ═══ LA REGLA, CONFIRMADA POR EL DUEÑO (29/08) ═══
  //
  // *"Cerrar el 50% de la brecha hasta el piso de UOCRA, sin pasar nunca el piso. - ahora si"*.
  // Antes se implementaron dos lecturas distintas de la misma frase y las dos daban por ENCIMA del
  // piso; la restricción que las descarta es *"no puede dar mas el resultado por hora q el 100% del
  // piso de uocra"*.
  assert.equal(jornalConAumento(5600, 6348), 5974, 'Oficial que hoy cobra 5.600: brecha 748, +374')
  assert.equal(jornalConAumento(4500, 5399), 4949.5, 'Ayudante que hoy cobra 4.500: brecha 899, +449,50')
  assert.equal(jornalConAumento(6200, 7420), 6810, 'Of. Especializado que cobra 6.200: brecha 1.220, +610')
  assert.equal(jornalConAumento(5600, 5866), 5733, 'Medio Oficial que cobra 5.600: brecha 266, +133')

  // EL AUMENTO ES POR PERSONA, NO POR CATEGORÍA: dos Oficiales con jornales distintos tienen brechas
  // distintas contra el mismo piso, así que reciben montos distintos y terminan en horas distintas.
  // Es lo contrario de la lectura anterior, donde los dos sumaban lo mismo.
  assert.notEqual(jornalConAumento(6200, 6348) - 6200, jornalConAumento(5300, 6348) - 5300)
  assert.equal(jornalConAumento(6200, 6348) - 6200, 74)
  assert.equal(jornalConAumento(5300, 6348) - 5300, 524)

  // LAS DOS LECTURAS DESCARTADAS, POR NÚMERO: si alguna reaparece, este test la nombra.
  assert.notEqual(jornalConAumento(5600, 6348), 5600 + 6348 * 0.5, 'volvió `hoy + 50% × básico` ($8.774)')
  assert.notEqual(jornalConAumento(5600, 6348), 6348 * 1.5, 'volvió `1,5 × básico` ($9.522)')
  assert.notEqual(jornalConAumento(5600, 6348), 6348, 'volvió el piso entero')

  // NULL NO ES CERO: sin básico la respuesta es "no sé", no "$0" — un cero se publicaría como jornal.
  assert.equal(jornalConAumento(5600, null), null)
  assert.equal(jornalConAumento(5600, 'no es un número'), null)
  assert.equal(FRACCION_DE_BRECHA, 0.5)
})

// ═══ LOS DOS INVARIANTES DUROS DE LA REGLA ═══
//
// No son casos de borde: son las dos mitades de la frase del dueño. El tope («sin pasar nunca el
// piso») y el suelo («nadie baja»). Los dos se barren sobre un rango de jornales, no sobre tres
// valores elegidos a mano, porque un invariante probado en tres puntos es una anécdota.
test('INVARIANTE · el resultado nunca pasa el piso de convenio', () => {
  for (const piso of [5399, 5866, 6348, 7420]) {
    for (let hoy = 0; hoy <= piso; hoy += 97) {
      const t = jornalConAumento(hoy, piso)
      assert.ok(t <= piso, `hoy=${hoy} contra piso=${piso} dio ${t}: pasó el piso`)
      assert.equal(t, hoy + (piso - hoy) / 2)
    }
  }
  // Y el caso que el dueño usó para frenar la lectura anterior, con su número.
  assert.ok(jornalConAumento(5600, 6348) <= 6348)
})

test('INVARIANTE · nadie baja: quien ya cobra el piso o más conserva su hora', () => {
  for (const hoy of [6348, 6349, 8000, 12000, 99999]) {
    assert.equal(jornalConAumento(hoy, 6348), hoy, `hoy=${hoy}: la hora cambió, alguien bajó`)
    assert.equal(tarifaConAumento(hoy, 6348).aumento, 0)
    assert.equal(tarifaConAumento(hoy, 6348).sobreElPiso, true)
  }
  // Sin jornal cargado la brecha es el piso entero y se cierra la mitad — no se le imputa el piso.
  assert.equal(jornalConAumento(0, 5399), 2699.5)
  assert.equal(jornalConAumento(null, 6348), 3174, 'sin jornal cargado, media brecha desde cero')
})

// ═══ EL TEST NEGATIVO: ESTE CONTROL PUEDE DAR ROJO ═══
//
// Un porcentaje que no describe un acuerdo salarial —negativo, texto, infinito— tiene que ROMPER.
// Si degradara a 0 en vez de tirar, la pestaña publicaría "aumento aplicado" con aumento cero y el
// cuadro seguiría cuadrando.
test('un aumento que no describe ningún acuerdo salarial rompe en vez de publicar un jornal falso', () => {
  for (const malo of [-1, -0.5, 'mitad', null, NaN, Infinity]) {
    assert.throws(() => jornalConAumento(5600, 6348, malo), TypeError,
      `un aumento de ${String(malo)} tendría que ser rechazado, no convertido en un jornal`)
  }
})


// ═══ LA PROCEDENCIA DE CADA EQUIVALENCIA ES UN DATO, NO UN COMENTARIO (28/08/2026) ═══
//
// Agregar `'M OF' → 'Medio Oficial'` apagó el ÚNICO control que hacía visible un código desconocido:
// `sinConvenio`, en la pestaña «Nómina», que sólo dispara cuando `convenioDe` devuelve null. Castillo
// Carlos pasó de figurar como «sin equivalencia declarada» a dibujarse igual que el `OF → Oficial`
// que declaró el dueño, y la inferencia se volvió un hecho silencioso que define su piso.
//
// La mutación de estos tests: si alguien agrega un código con el atajo viejo (`'X': 'Oficial'`) o le
// escribe un origen inventado, `codigosSinProcedencia` lo nombra y `convenioDe` devuelve null.
test('ninguna equivalencia puede existir sin decir de dónde salió', () => {
  assert.deepEqual(codigosSinProcedencia(CONVENIO_POR_CODIGO), [],
    'una fila sin procedencia se dibuja igual que una decisión del dueño')
  for (const [cod, e] of Object.entries(CONVENIO_POR_CODIGO)) {
    assert.ok([DECISION_DUENO, INFERENCIA_OS].includes(e.origen), `${cod} no declara un origen conocido`)
    assert.match(e.decididoEn, /^\d{4}-\d{2}-\d{2}$/, `${cod} no dice cuándo se decidió`)
    assert.ok(String(e.decididoPor).trim(), `${cod} no dice quién lo decidió`)
  }
})

test('un código agregado sin procedencia NO se cuela como declarado: cae en «sin equivalencia»', () => {
  // El atajo de siempre, el que había hasta hoy: una línea, `código: 'categoría'`.
  const atajo = { ...CONVENIO_POR_CODIGO, 'X OF': 'Oficial' }
  assert.deepEqual(codigosSinProcedencia(atajo), ['X OF'])
  assert.equal(convenioDe('X OF', atajo), null,
    'sin procedencia declarada la equivalencia no existe — y así el control de «sin equivalencia» la ve')
  // Y un origen inventado tampoco alcanza: la enumeración es la misma que la de `public.cliente_alias`.
  const inventado = { ...CONVENIO_POR_CODIGO, 'Y OF': { categoria: 'Oficial', origen: 'PORQUE_SI', decididoPor: 'yo', decididoEn: '2026-08-28' } }
  assert.deepEqual(codigosSinProcedencia(inventado), ['Y OF'])
  assert.equal(convenioDe('Y OF', inventado), null)
  // Faltando el quién o el cuándo, tampoco: la procedencia completa es la que se puede auditar.
  const aMedias = { ...CONVENIO_POR_CODIGO, 'Z OF': { categoria: 'Oficial', origen: INFERENCIA_OS } }
  assert.deepEqual(codigosSinProcedencia(aMedias), ['Z OF'])
})

test('la que dedujo el OS se marca en la fila; la que declaró el dueño NO lleva marca', () => {
  // El control tiene que poder encenderse Y apagarse: si dibuja siempre lo mismo, no es un control.
  assert.equal(rotuloConvenio('OF'), 'Oficial')
  assert.equal(rotuloConvenio('OF E'), 'Oficial Especializado', 'el ascenso lo declaró el dueño')
  assert.equal(rotuloConvenio('M OF'), 'Medio Oficial ▲ inferida')
  assert.equal(rotuloConvenio('ZZ'), null, 'lo que no está no se dibuja: no se inventa')
  assert.equal(esInferida('M OF'), true)
  assert.equal(esInferida('of e'), false, 'la planilla no respeta mayúsculas y la marca no puede depender de eso')
  assert.equal(equivalenciaDe('M OF').origen, INFERENCIA_OS,
    'si alguien la pasa a DECISION_DUENO sin que el dueño la declare, esto se pone rojo')
  assert.equal(equivalenciaDe('OF').origen, DECISION_DUENO)
})

test('la línea al pie nombra las inferencias que están gobernando un piso — y desaparece sola', () => {
  const conCastillo = lineaEquivalenciasInferidas([
    { nombre: 'Aguero', codigo: 'OF ' }, { nombre: 'Castillo Carlos', codigo: 'M OF' },
  ])
  assert.match(conCastillo, /Castillo Carlos \(M OF → Medio Oficial\)/)
  assert.match(conCastillo, /nadie las declaró/)
  assert.doesNotMatch(conCastillo, /Aguero/, 'la del dueño no es una inferencia')
  // Sin inferencias no hay línea: nada que apagar a mano el día que el dueño la confirme.
  assert.equal(lineaEquivalenciasInferidas([{ nombre: 'Aguero', codigo: 'OF' }]), null)
  assert.equal(lineaEquivalenciasInferidas([]), null)
})

test('la clave de una categoría se normaliza igual que TRIM en Sheets — las dos puntas o ninguna', () => {
  assert.equal(claveDeCategoria('OF '), 'OF')
  assert.equal(claveDeCategoria('  A M  '), 'A M')
  assert.equal(claveDeCategoria('OF  M'), 'OF M', 'TRIM de Sheets colapsa también los espacios internos')
  assert.equal(claveDeCategoria(null), '')
  assert.equal(convenioDe('OF '), 'Oficial', 'el espacio al final dejó 9 de 17 personas sin piso')
})
