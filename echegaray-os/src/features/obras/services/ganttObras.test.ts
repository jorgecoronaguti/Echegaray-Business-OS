// EL GANTT GLOBAL ES DE OBRAS — LO QUE SE PUEDE PROBAR SIN NAVEGADOR.
//
// Acá viven los tres defectos que este archivo tiene que atrapar y que ninguna otra prueba ve:
//
//   1. Que una obra SIN fechas de plan reciba barra igual. Es el defecto silencioso: la pantalla
//      abre, la fila está, y la obra parece empezar y terminar el mismo día. Nadie lo mira dos
//      veces porque no hay error en ningún lado.
//   2. Que se dibuje media línea base. Con `inicio_base` cargado y `fin_base` vacío, una marca
//      debajo de la barra se lee como una línea base sellada — y hoy hay CERO actividades con
//      línea base en toda la empresa (medido el 18/08/2026 contra `obra_actividad`: 0 de 344).
//   3. Que la ventana de tiempo deje a HOY fuera de la pantalla. Una cartera cuyo plan venció el
//      mes pasado dibujaría un Gantt sin la línea de hoy, que es justo el caso donde el atraso es
//      lo único que importa.
//
// Lo que NO se prueba acá: que la fuente sea `obra_plan_vs_real` y no una segunda agregación. Eso
// es una lectura contra la base y se mide en `tests/obras-gantt-global.spec.ts`, en el navegador.

import test from 'node:test'
import assert from 'node:assert/strict'
import { filasDeObras, ventana, COLUMNAS_PLAZO, UMBRAL_ATRASO, type PlazoObra } from './ganttObras.ts'

const HOY = '2026-08-18'

const obra = (p: Partial<PlazoObra> & { obra_id: string, nombre: string }): PlazoObra => ({
  cliente_nombre: null,
  etapa: null,
  estado: 'activa',
  inicio_plan: null,
  fin_plan: null,
  inicio_base: null,
  fin_base: null,
  avance_pct: null,
  desvio_plazo_dias: null,
  n_actividades: 0,
  inicio_real: null, fin_real: null, forecast_fin: null, actividades_sin_fecha: 0,
  ...p,
})

test('una obra sin fechas de plan no tiene barra, y dice por qué', () => {
  const filas = filasDeObras([
    obra({ obra_id: 'arcor', nombre: 'ARCOR' }),
    obra({ obra_id: 'la-estrella', nombre: 'La Estrella', n_actividades: 12 }),
  ], HOY)

  const arcor = filas.find((f) => f.obraId === 'arcor')!
  assert.equal(arcor.barra, null, 'una obra sin cronograma no puede tener barra')
  assert.equal(arcor.motivo, 'sin cronograma cargado')

  const estrella = filas.find((f) => f.obraId === 'la-estrella')!
  assert.equal(estrella.barra, null, 'actividades sin fecha no producen una barra')
  assert.equal(estrella.motivo, 'sin fechas de plan')
})

test('la obra con fechas tiene barra con sus dos puntas y su avance', () => {
  const [fila] = filasDeObras([obra({
    obra_id: 'san-francisco', nombre: 'San Francisco',
    inicio_plan: '2026-06-22', fin_plan: '2026-08-27', avance_pct: 47, n_actividades: 89,
  })], HOY)

  assert.deepEqual(fila.barra?.inicio, '2026-06-22')
  assert.deepEqual(fila.barra?.fin, '2026-08-27')
  assert.equal(fila.barra?.avancePct, 47)
  assert.equal(fila.motivo, null, 'una obra con barra no explica una ausencia que no existe')
})

test('la línea base se dibuja sólo con las dos puntas — hoy no hay ninguna sellada', () => {
  const filas = filasDeObras([
    obra({ obra_id: 'a', nombre: 'A', inicio_plan: '2026-07-01', fin_plan: '2026-08-01', n_actividades: 3 }),
    obra({ obra_id: 'b', nombre: 'B', inicio_plan: '2026-07-01', fin_plan: '2026-08-01', inicio_base: '2026-06-15', n_actividades: 3 }),
    obra({ obra_id: 'c', nombre: 'C', inicio_plan: '2026-07-01', fin_plan: '2026-08-01', inicio_base: '2026-06-15', fin_base: '2026-07-20', n_actividades: 3 }),
  ], HOY)

  assert.equal(filas.find((f) => f.obraId === 'a')!.barra!.base, null, 'sin línea base no se dibuja nada')
  assert.equal(filas.find((f) => f.obraId === 'b')!.barra!.base, null, 'media línea base no es una línea base')
  assert.deepEqual(filas.find((f) => f.obraId === 'c')!.barra!.base, { inicio: '2026-06-15', fin: '2026-07-20' })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL SEMÁFORO — el defecto que atrapa es «todo rojo», que no rompe nada y arruina la pantalla
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// La versión anterior de estas pruebas medía `vencida`: `fin < hoy && avance < 100`. Pasaban en
// verde y la pantalla estaba mal — cuatro de cinco barras rojas, incluidas dos obras que estaban
// cerrando bien. Un test puede confirmar exactamente la regla equivocada; lo que cambió no es la
// prueba sino el criterio, y por eso los casos de acá abajo son OBRAS REALES con sus números
// reales del 18/08/2026, no fixtures inventados: si la regla vuelve a pintar de rojo a Comedor,
// esto se pone colorado antes de que nadie abra el navegador.

test('el 100% está al día aunque su fin haya pasado — terminar tarde no es estar atrasado', () => {
  const [f] = filasDeObras([obra({
    obra_id: 'lista', nombre: 'Lista', inicio_plan: '2026-06-01', fin_plan: '2026-08-04',
    avance_pct: 100, n_actividades: 35,
  })], HOY)
  assert.equal(f.barra!.desvio.semaforo, 'al_dia')
})

test('Comedor y Galpón 9 dejan de ser rojos: pasaron su fin, pero les falta muy poco', () => {
  const filas = filasDeObras([
    // Reales: Comedor 09/07→04/08 al 93%; Galpón 9 13/07→05/08 al 96%. Las dos vencidas.
    obra({ obra_id: 'comedor', nombre: 'Comedor', inicio_plan: '2026-07-09', fin_plan: '2026-08-04', avance_pct: 93, n_actividades: 35 }),
    obra({ obra_id: 'galpon-9', nombre: 'Galpón 9', inicio_plan: '2026-07-13', fin_plan: '2026-08-05', avance_pct: 96, n_actividades: 29 }),
  ], HOY)
  for (const f of filas) {
    assert.equal(f.barra!.desvio.semaforo, 'al_dia',
      `${f.nombre} sigue en rojo: el color volvió a mirar el calendario en vez del trabajo pendiente`)
    assert.ok(f.barra!.desvio.atrasoDias! <= UMBRAL_ATRASO.menorDias)
  }
})

test('las tres que sí requieren atención salen críticas, y por su brecha', () => {
  const filas = filasDeObras([
    // Reales: San Francisco 22/06→27/08 al 47% (debería ir por 86); Messina 06/07→14/08 al 67%;
    // Salón Comercial 03/08→22/08 al 0% con tres cuartas partes del plazo consumido.
    obra({ obra_id: 'sf', nombre: 'San Francisco', inicio_plan: '2026-06-22', fin_plan: '2026-08-27', avance_pct: 47, n_actividades: 89 }),
    obra({ obra_id: 'messina', nombre: 'Messina', inicio_plan: '2026-07-06', fin_plan: '2026-08-14', avance_pct: 67, n_actividades: 31 }),
    obra({ obra_id: 'salon', nombre: 'Salón Comercial', inicio_plan: '2026-08-03', fin_plan: '2026-08-22', avance_pct: 0, n_actividades: 7 }),
  ], HOY)
  for (const f of filas) {
    assert.equal(f.barra!.desvio.semaforo, 'atraso_critico', `${f.nombre} dejó de pedir atención`)
    assert.ok(f.barra!.desvio.brechaPuntos! > UMBRAL_ATRASO.criticoPuntos)
  }
  assert.equal(filas.find((f) => f.obraId === 'sf')!.barra!.desvio.avanceEsperadoPct, 86)
})

test('ir adelantado no es un desvío, y una obra que todavía no arrancó tampoco', () => {
  const filas = filasDeObras([
    obra({ obra_id: 'adelantada', nombre: 'Adelantada', inicio_plan: '2026-08-01', fin_plan: '2026-12-31', avance_pct: 80, n_actividades: 10 }),
    obra({ obra_id: 'futura', nombre: 'Futura', inicio_plan: '2026-09-01', fin_plan: '2026-12-31', avance_pct: 0, n_actividades: 10 }),
  ], HOY)
  for (const f of filas) {
    assert.equal(f.barra!.desvio.semaforo, 'al_dia')
    assert.equal(f.barra!.desvio.brechaPuntos, 0, 'la brecha nunca es negativa')
  }
})

test('las dos unidades hacen falta: cada una es ciega donde la otra ve', () => {
  // OBRA LARGA, BRECHA CHICA: 8 puntos sobre dos años son 58 días de trabajo perdidos. Con puntos
  // solos pasaría por «al día».
  const [larga] = filasDeObras([obra({
    obra_id: 'larga', nombre: 'Larga', inicio_plan: '2025-08-18', fin_plan: '2027-08-18', avance_pct: 42, n_actividades: 200,
  })], HOY)
  assert.equal(larga.barra!.desvio.brechaPuntos, 8)
  assert.equal(larga.barra!.desvio.semaforo, 'atraso_critico', '58 días de atraso no son «al día»')

  // OBRA CORTA, POCOS DÍAS: 40 puntos sobre 19 días son apenas 8 días. Con días solos pasaría por
  // «al día», y es casi la mitad de la obra.
  const [corta] = filasDeObras([obra({
    obra_id: 'corta', nombre: 'Corta', inicio_plan: '2026-08-03', fin_plan: '2026-08-22', avance_pct: 39, n_actividades: 7,
  })], HOY)
  assert.ok(corta.barra!.desvio.atrasoDias! <= UMBRAL_ATRASO.menorDias)
  assert.equal(corta.barra!.desvio.semaforo, 'atraso_critico', 'la brecha en puntos tiene que mandar en las obras cortas')
})

test('sin avance publicado NO se pinta de verde: se pinta de gris', () => {
  // Es la mentira más cara de las cuatro. Una obra de la que no se sabe nada dibujada como «al
  // día» desaparece de la lista de las que hay que ir a mirar.
  const [f] = filasDeObras([obra({
    obra_id: 'muda', nombre: 'Muda', inicio_plan: '2026-06-01', fin_plan: '2026-12-01', avance_pct: null, n_actividades: 12,
  })], HOY)
  assert.equal(f.barra!.desvio.semaforo, 'sin_datos')
  assert.equal(f.barra!.desvio.brechaPuntos, null, 'no se publica un número que no se puede calcular')
})

test('la regla es pura: el mismo dato en dos días distintos da dos estados distintos', () => {
  const laObra = obra({
    obra_id: 'x', nombre: 'X', inicio_plan: '2026-08-01', fin_plan: '2026-08-31', avance_pct: 50, n_actividades: 10,
  })
  // Al día 15 de 30 le corresponde 50%: exactamente lo que lleva.
  assert.equal(filasDeObras([laObra], '2026-08-16')[0].barra!.desvio.semaforo, 'al_dia')
  // Doce días después el calendario pide 90% y sigue en 50: el estado cambió sin tocar la base.
  assert.equal(filasDeObras([laObra], '2026-08-28')[0].barra!.desvio.semaforo, 'atraso_critico')
})

test('la etapa y el cliente llegan a la fila tal cual vienen de la vista', () => {
  // EL DEFECTO QUE ATRAPA es el que el dueño prohibió explícitamente: *"NO crear una segunda
  // definición de etapa"*. Si alguien derivara la etapa acá —del avance, de las fechas, de un
  // default— el Gantt diría una etapa y el Resumen otra, y las dos parecerían correctas.
  const filas = filasDeObras([
    obra({ obra_id: 'comedor', nombre: 'Comedor', cliente_nombre: 'La Estrella', etapa: 'terminacion', inicio_plan: '2026-07-09', fin_plan: '2026-08-04', avance_pct: 93, n_actividades: 35 }),
    obra({ obra_id: 'arcor', nombre: 'ARCOR', cliente_nombre: 'ARCOR' }),
  ], HOY)

  const comedor = filas.find((f) => f.obraId === 'comedor')!
  assert.equal(comedor.etapa, 'terminacion')
  assert.equal(comedor.clienteNombre, 'La Estrella')

  // Sin etapa NO se inventa una: `null` sube tal cual y la pantalla escribe «etapa sin declarar».
  const arcor = filas.find((f) => f.obraId === 'arcor')!
  assert.equal(arcor.etapa, null, 'una obra sin etapa declarada no puede recibir una por defecto')
})

test('la lectura pide la etapa canónica, no la deduce', () => {
  const pedidas = COLUMNAS_PLAZO.split(',')
  for (const c of ['etapa', 'cliente_nombre']) {
    assert.ok(pedidas.includes(c), `${c} tiene que venir de la vista, no calcularse en el navegador`)
  }
})

test('las archivadas quedan afuera salvo que se las pida', () => {
  const cartera = [
    obra({ obra_id: 'galpones', nombre: 'Galpones', estado: 'cerrada' }),
    obra({ obra_id: 'messina', nombre: 'Messina', inicio_plan: '2026-07-06', fin_plan: '2026-08-14', n_actividades: 31 }),
  ]
  assert.deepEqual(filasDeObras(cartera, HOY).map((f) => f.obraId), ['messina'])
  assert.equal(filasDeObras(cartera, HOY, true).length, 2)
})

test('las obras se ordenan por arranque y las que no tienen plan caen al final', () => {
  const filas = filasDeObras([
    obra({ obra_id: 'sin', nombre: 'Sin plan', n_actividades: 4 }),
    obra({ obra_id: 'sf', nombre: 'San Francisco', inicio_plan: '2026-06-22', fin_plan: '2026-08-27', n_actividades: 89 }),
    obra({ obra_id: 'quattropani', nombre: 'Salón Comercial', inicio_plan: '2026-08-03', fin_plan: '2026-08-22', n_actividades: 7 }),
    obra({ obra_id: 'messina', nombre: 'Messina', inicio_plan: '2026-07-06', fin_plan: '2026-08-14', n_actividades: 31 }),
  ], HOY)
  assert.deepEqual(filas.map((f) => f.obraId), ['sf', 'messina', 'quattropani', 'sin'])
})

test('la ventana incluye HOY aunque la cartera entera haya vencido', () => {
  const filas = filasDeObras([obra({
    obra_id: 'vieja', nombre: 'Vieja', inicio_plan: '2026-01-10', fin_plan: '2026-02-10', n_actividades: 5,
  })], HOY)
  const v = ventana(filas, HOY)!
  assert.ok(v.desde < new Date('2026-01-10T00:00:00Z'), 'la ventana tiene que abrir antes del arranque')
  assert.ok(v.hasta > new Date('2026-08-18T00:00:00Z'), 'hoy tiene que caer adentro del eje')
})

test('sin ninguna obra con fechas no hay eje que dibujar', () => {
  const filas = filasDeObras([obra({ obra_id: 'arcor', nombre: 'ARCOR' })], HOY)
  assert.equal(ventana(filas, HOY), null)
})

test('la lectura no pide una sola columna de plata', () => {
  // El Gantt no habla de dinero. Si alguien agrega `monto_contratado` o `monto_presupuestado` a la
  // lectura "porque ya que estamos", esto se pone rojo antes de que el importe viaje al navegador
  // de todos los que abran la pantalla.
  for (const prohibida of ['monto_contratado', 'monto_presupuestado', 'costo_real', 'margen_actual',
    'margen_esperado', 'costo_presupuestado', 'certificado', 'facturado', 'cobrado']) {
    assert.ok(!COLUMNAS_PLAZO.split(',').includes(prohibida), `${prohibida} no puede viajar al Gantt`)
  }
})
