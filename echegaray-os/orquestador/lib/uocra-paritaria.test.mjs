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
  ESCALA_VERIFICADA, MENSUAL_VERIFICADO, ORIGEN_ACUERDO, ORIGEN_PROYECCION, PERIODO_VERIFICADO,
  TRAMOS_FIRMADOS, ULTIMO_TRAMO, contrastarEscala, convenioDe, factorUocraEntre, periodosEntre, tramoDe,
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
