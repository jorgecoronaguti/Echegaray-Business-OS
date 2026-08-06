// LO QUE SE PRUEBA ACÁ ES QUE EL ESCALÓN QUE VIENE NO PUEDA VOLVER A SER DE 2025.
//
// El defecto (B3 de la auditoría): `MATCH("septiembre*")` sobre la columna de meses de `_UOCRA_RAW`
// caía en "Septiembre (1,3% s/ago)" del acuerdo de 2025 y devolvía el Ayudante a $3.687. La pestaña
// mostraba que el escalón que viene BAJA y que pagábamos 22,1% POR ENCIMA del convenio, cuando la
// verdad medida es 16,7% POR DEBAJO. `IFERROR` no disparaba: la fórmula encontraba una fila.
//
// Las fixtures reproducen la forma REAL de la réplica, leída el 06/08/2026: rótulos con salto de
// línea adentro ("Agosto\n+1,9%", "Febrero\n(1,8%\ns/Ene)"), el pie de página del acuerdo entre
// grupos, meses en orden descendente y acuerdos que cruzan el 1° de enero.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parsearAcuerdos, escalonDe, ultimoEscalon, escalonPromedio, factorEntre,
  divergenciaEntreCategorias, estadoReplica, mesDeRotulo, pctDeRotulo, cabeceraDeAcuerdo,
  CATEGORIAS, CATEGORIA_ANCLA,
} from './uocra-acuerdos.mjs'

/** Cinco filas de un grupo mensual, con el básico de cada categoría. */
const grupo = (rotulo, [oe, of, mo, ay, se]) => [
  [rotulo, 'Oficial Especializado', 'Hora', String(oe), '1', '2', String(oe), String(oe)],
  ['', 'Oficial', '', String(of), '1', '2', String(of), String(of)],
  ['', 'Medio Oficial', '', String(mo), '1', '2', String(mo), String(mo)],
  ['', 'Ayudante', '', String(ay), '1', '2', String(ay), String(ay)],
  ['', 'Sereno', 'Mes', String(se), '1', '2', String(se), String(se)],
]
const pie = ['*(más Suma No Remunerativa que varía en función a la categoría y zona -ver \nacuerdo en la pestaña "Mayo 2026")*']

/** La réplica real, resumida: dos acuerdos de 2026 y uno de 2025 que cruza el año. */
const REPLICA = [
  ['Mes', 'Categoría', 'Por', 'Básico'],
  ['', '', '', '', 'B', 'C', 'Austral', 'A'],
  ['Acuerdo Mayo 2026'], pie,
  ...grupo('Agosto\n+1,9%', [7420, 6348, 5866, 5399, 980858]),
  ...grupo('Julio\n+2%', [6800, 5817, 5375, 4948, 898817]),
  ['Acuerdo Enero 2026'], pie,
  ...grupo('Febrero\n(1,8%\ns/Ene)', [5470, 4679, 4322, 3980, 725236]),
  ...grupo('Enero\n+2%', [5374, 4597, 4247, 3910, 712491]),
  ['Acuerdo Noviembre 2025'], pie,
  ...grupo('Diciembre\n+1,3%', [5270, 4508, 4165, 3833, 698716]),
  // Septiembre 2025 — la fila que el MATCH por nombre de mes encontraba cuando buscaba sep-2026.
  ['Acuerdo Septiembre 2025'], pie,
  ...grupo('Septiembre\n(1,3% s/ago)', [5069, 4336, 4006, 3687, 672072]),
]

const { escalones, problemas } = parsearAcuerdos(REPLICA)

test('el parser no encuentra un solo problema en la forma real de la réplica', () => {
  assert.deepEqual(problemas, [])
  assert.equal(escalones.length, 6)
})

test('CADA ESCALÓN TRAE SU AÑO — el rótulo no lo dice y el acuerdo de arriba tampoco alcanza', () => {
  assert.deepEqual(escalones.map((e) => e.periodo),
    ['2026-08', '2026-07', '2026-02', '2026-01', '2025-12', '2025-09'])
  // Diciembre cuelga de "Acuerdo Noviembre 2025" y es de 2025; enero cuelga de "Acuerdo Enero 2026"
  // y es de 2026. Sólo el descenso de los meses distingue los dos casos.
  assert.equal(escalonDe(escalones, '2025-12').acuerdo, 'Acuerdo Noviembre 2025')
  assert.equal(escalonDe(escalones, '2026-01').acuerdo, 'Acuerdo Enero 2026')
})

test('EL ESCALÓN QUE VIENE NO EXISTE, Y ESO SE DICE — no se devuelve el de 2025', () => {
  // ÉSTE ES EL DEFECTO. La réplica tiene septiembre de 2025 y no tiene septiembre de 2026. El lector
  // viejo devolvía $3.687 (Ayudante, 2025) como "el escalón que viene".
  assert.equal(escalonDe(escalones, '2026-09'), null, 'sep-2026 NO está publicado: tiene que dar null')
  assert.equal(escalonDe(escalones, '2025-09').categorias[CATEGORIA_ANCLA].basico, 3687,
    'el de 2025 sí está, y por eso el MATCH por nombre lo encontraba')
})

test('el canario dice VENCIDA cuando el mes en curso no tiene acuerdo, y no muestra uno viejo', () => {
  const alDia = estadoReplica(escalones, new Date(2026, 7, 6))
  assert.equal(alDia.estado, 'al día')
  assert.match(alDia.mensaje, /Agosto \+1,9%/)
  const vencida = estadoReplica(escalones, new Date(2026, 9, 15))
  assert.equal(vencida.estado, 'vencida')
  assert.match(vencida.mensaje, /quedó vencida/)
  assert.match(vencida.mensaje, /2026-08/)
})

test('el canario dice VACÍA si el IMPORTHTML se cayó — no un cero silencioso', () => {
  const { escalones: nada, problemas: p } = parsearAcuerdos([])
  assert.equal(nada.length, 0)
  assert.equal(p.length, 1)
  const e = estadoReplica(nada, new Date(2026, 7, 6))
  assert.equal(e.estado, 'vacía')
  assert.match(e.mensaje, /IMPORTHTML/)
})

test('EL % DEL RÓTULO NO ES EL ESCALÓN: el básico sube mucho más', () => {
  // Es el hallazgo que obligó a rehacer el motor. El rótulo de agosto dice "+1,9%"; el básico de
  // Ayudante pasó de $4.948 a $5.399, que es +9,11%. Proyectar con el rótulo deja el costo corto
  // todos los meses, y era exactamente lo que iba a hacer el diseño original.
  const e = escalonDe(escalones, '2026-08')
  assert.equal(e.pctRotulo, 0.019)
  const f = factorEntre(escalones, '2026-07', '2026-08')
  assert.ok(f > 1.09 && f < 1.092, `el escalón medido es ${f}, no 1,019`)
  assert.ok(Math.abs(f - 1 - e.pctRotulo) > 0.05, 'si el rótulo coincidiera con el básico, este test sobra')
})

test('LAS CINCO CATEGORÍAS SE MUEVEN JUNTAS: por eso el motor puede anclar en el Ayudante', () => {
  const d = divergenciaEntreCategorias(escalones, '2026-07', '2026-08')
  assert.equal(d.detalle.length, CATEGORIAS.length)
  assert.ok(d.divergencia < 0.001, `las categorías divergen ${d.divergencia}: el ancla única deja de ser válida`)
})

test('el promedio propuesto para los meses sin acuerdo sale del BÁSICO, no de los rótulos', () => {
  const p = escalonPromedio(escalones, 6)
  // Sobre esta fixture: 3.687 (sep-25) → 5.399 (ago-26), pero los meses no son consecutivos, así que
  // lo que importa es que mida el cociente de básicos y no el promedio de los rótulos (~1,7%).
  assert.ok(p.pct > 0.03, `el promedio medido es ${p.pct}: está usando los rótulos`)
  assert.ok(p.pctRotulos < 0.021, 'el promedio de rótulos se informa aparte, para que el dueño compare')
  assert.equal(p.hasta, '2026-08')
})

test('un grupo incompleto se DENUNCIA, no se completa con la categoría de al lado', () => {
  const roto = [
    ['Acuerdo Mayo 2026'],
    ['Agosto\n+1,9%', 'Oficial Especializado', 'Hora', '7420'],
    ['', 'Oficial', '', '6348'],
    ['', 'Ayudante', '', '5399'],   // falta Medio Oficial: el desplazamiento fijo se desalinea
  ]
  const { problemas: p } = parsearAcuerdos(roto)
  assert.ok(p.some((x) => /Medio Oficial/.test(x)), `no denunció el grupo incompleto: ${JSON.stringify(p)}`)
})

test('los rótulos raros de la réplica se leen: saltos de línea, paréntesis, comodines', () => {
  assert.equal(mesDeRotulo('Agosto\n+1,9%'), 8)
  assert.equal(mesDeRotulo('Febrero\n(1,8%\ns/Ene)'), 2)
  assert.equal(mesDeRotulo('Mayo \n+1,8%'), 5)
  assert.equal(mesDeRotulo('Setiembre +1%'), 9, 'las actas viejas escriben "setiembre"')
  assert.equal(mesDeRotulo('*(más Suma No Remunerativa…'), null, 'el pie de página no es un mes')
  assert.equal(pctDeRotulo('Febrero\n(1,8%\ns/Ene)'), 0.018)
  assert.equal(pctDeRotulo('Enero'), null)
  assert.deepEqual(cabeceraDeAcuerdo('Acuerdo Mayo 2026'), { mes: 5, anio: 2026 })
  assert.equal(cabeceraDeAcuerdo('Agosto\n+1,9%'), null)
})

test('el último escalón es el más nuevo, no el primero de la tabla', () => {
  assert.equal(ultimoEscalon(escalones).periodo, '2026-08')
})
