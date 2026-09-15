// LA QUINCENA CERRADA NO SE REESCRIBE POR NINGUNA PUERTA DE HORAS.
//
// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//  · `guardarJornada`, `corregirJornada` y la jornada por defecto de la presencia escribían y
//    borraban `registros_hh` de una quincena cerrada: desde el 15/09/2026 bastaba vaciar una celda
//    para quitar horas pagadas (asserts de fuente: la guarda va ANTES de la primera escritura);
//  · `vaciarHorasDelDia` borraba sin preguntar — el punto por el que pasan las tres puertas
//    (test contra un cliente falso: con la guarda quitada, el delete ocurre y el test se pone rojo);
//  · un tramo de licencia que cruza a una quincena cerrada se asentaba igual (sólo se miraba la del
//    primer día);
//  · `corregirJornada` con `estado: 'vaciar'` y `obra_origen: null` vaciaba el día en TODAS las obras;
//  · la regla vivía duplicada y privada en dos `'use server'`: una segunda copia discrepa el día
//    que se toque la primera.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  mensajeDeQuincenaCerrada, MENSAJE_TRAMO_SIN_VERIFICAR, quincenasDelTramo, veredictoDeCierre,
} from './quincenaCerrada.ts'
import { quincenaCerrada } from './quincenaCerradaService.ts'
import { vaciarHorasDelDia } from './vaciadoDeHorasService.ts'
import { correccionSchema } from './planDeJornada.ts'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('EL MENSAJE NOMBRA LA QUINCENA Y EL CAMINO', () => {
  assert.equal(
    mensajeDeQuincenaCerrada({ desde: '2026-08-16', hasta: '2026-08-31' }),
    'La quincena 16/08–31/08 está cerrada: para cambiar horas hay que reabrirla en Liquidación.',
  )
})

test('UN TRAMO MIRA TODAS LAS QUINCENAS QUE CRUZA, EN CUALQUIER ORDEN, CON TOPE', () => {
  const desdes = (qs: ReturnType<typeof quincenasDelTramo>) => qs?.map((q) => q.desde)
  assert.deepEqual(desdes(quincenasDelTramo('2026-09-10')), ['2026-09-01'])
  assert.deepEqual(desdes(quincenasDelTramo('2026-08-10', '2026-09-03')), ['2026-08-01', '2026-08-16', '2026-09-01'])
  assert.deepEqual(desdes(quincenasDelTramo('2026-09-03', '2026-08-10')), ['2026-08-01', '2026-08-16', '2026-09-01'])
  assert.equal(quincenasDelTramo('2026-01-01', '2027-06-01'), null)
})

test('CERRADA ES DESDE + HASTA + ESTADO; ABIERTA U OTRA QUINCENA NO FRENAN', () => {
  const tramo = quincenasDelTramo('2026-08-10', '2026-09-03') ?? []
  const agosto2 = { desde: '2026-08-16', hasta: '2026-08-31' }
  assert.equal(veredictoDeCierre(tramo, [{ ...agosto2, estado: 'cerrada' }]), mensajeDeQuincenaCerrada(agosto2))
  assert.equal(veredictoDeCierre(tramo, [{ ...agosto2, estado: 'abierta' }]), null)
  assert.equal(veredictoDeCierre(tramo, [{ desde: '2026-07-16', hasta: '2026-07-31', estado: 'cerrada' }]), null)
  // UN GRUPO CERRADO BASTA, aunque otro grupo de la misma quincena siga abierto.
  assert.notEqual(veredictoDeCierre(tramo, [{ ...agosto2, estado: 'abierta' }, { ...agosto2, estado: 'cerrada' }]), null)
})

// Un cliente de Supabase mínimo: devuelve por tabla y anota qué se borró.
function clienteFalso(o: { cierre?: unknown[]; errorCierre?: string; horas: { id: string }[] }) {
  const borrados: string[] = []
  const cliente = {
    from(tabla: string) {
      let borra = false
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'in', 'eq', 'order']) q[m] = () => q
      q.delete = () => { borra = true; borrados.push(tabla); return q }
      q.then = (resolver: (v: unknown) => unknown) => {
        if (tabla === 'liquidacion_quincena') {
          return Promise.resolve(o.errorCierre
            ? { data: null, error: { message: o.errorCierre } }
            : { data: o.cierre ?? [], error: null }).then(resolver)
        }
        return Promise.resolve({ data: borra ? o.horas.map(({ id }) => ({ id })) : o.horas, error: null }).then(resolver)
      }
      return q
    },
  }
  return { cliente: cliente as never, borrados }
}

const jornada = { id: 'r1', persona_id: 'p', horas: 9, tipo_hora: 'normal', obra_canonica_id: 'obra-1' }

test('VACIAR EN UNA QUINCENA CERRADA NO BORRA NADA, Y EN UNA ABIERTA SÍ', async () => {
  const cerrada = clienteFalso({ cierre: [{ desde: '2026-09-01', hasta: '2026-09-15', estado: 'cerrada' }], horas: [jornada] })
  const r = await vaciarHorasDelDia(cerrada.cliente, { personas: ['p'], fecha: '2026-09-10', obra: 'obra-1' })
  assert.equal(r.error, 'La quincena 01/09–15/09 está cerrada: para cambiar horas hay que reabrirla en Liquidación.')
  assert.deepEqual(cerrada.borrados, [])

  // LA GUARDA TIENE QUE PODER DECIR QUE SÍ: un control que frena todo no distingue nada.
  const abierta = clienteFalso({ cierre: [{ desde: '2026-09-01', hasta: '2026-09-15', estado: 'abierta' }], horas: [jornada] })
  const ok = await vaciarHorasDelDia(abierta.cliente, { personas: ['p'], fecha: '2026-09-10', obra: 'obra-1' })
  assert.equal(ok.error, null)
  assert.deepEqual(abierta.borrados, ['registros_hh'])
})

test('SIN PODER LEER EL CIERRE NO SE ESCRIBE; UN TRAMO SIN TOPE TAMPOCO', async () => {
  const rota = clienteFalso({ errorCierre: 'permission denied', horas: [jornada] })
  const r = await vaciarHorasDelDia(rota.cliente, { personas: ['p'], fecha: '2026-09-10', obra: 'obra-1' })
  assert.match(r.error ?? '', /No pude verificar si la quincena está cerrada: permission denied/)
  assert.deepEqual(rota.borrados, [])
  assert.equal(await quincenaCerrada(clienteFalso({ horas: [] }).cliente, '2026-01-01', '2027-06-01'), MENSAJE_TRAMO_SIN_VERIFICAR)
})

test('VACIAR SIN OBRA SE RECHAZA EN EL SCHEMA DE LA ACCIÓN', () => {
  const base = {
    persona_id: '11111111-1111-4111-8111-111111111111', fecha: '2026-09-10',
    obra_destino: null, estado: 'vaciar', horas: null, motivo: null, hasta: null, asignar: false,
  }
  const sinObra = correccionSchema.safeParse({ ...base, obra_origen: null })
  assert.equal(sinObra.success, false)
  assert.match(sinObra.error?.issues[0].message ?? '', /sin obra borraría el día en todas/)
  assert.equal(correccionSchema.safeParse({ ...base, obra_origen: '22222222-2222-4222-8222-222222222222' }).success, true)
})

/** El cuerpo de una función exportada: desde su firma hasta la siguiente exportación. */
function cuerpo(src: string, nombre: string): string {
  const i = src.indexOf(`export async function ${nombre}(`)
  assert.ok(i >= 0, `no encontré ${nombre}`)
  const fin = src.indexOf('\nexport ', i + 1)
  return src.slice(i, fin < 0 ? undefined : fin)
}

/** La guarda existe —la lectura Y el `return` que corta— y va antes de TODA escritura del cuerpo. Sin el
 *  `return` en el mismo texto, borrar sólo `if (cierre !== null) return …` dejaba el test verde (auditor, 15/09/2026). */
function guardaAntes(src: string, nombre: string, guarda: string, escrituras: string[]) {
  const c = cuerpo(src, nombre)
  const g = c.indexOf(guarda)
  assert.ok(g >= 0, `${nombre} no pregunta si la quincena está cerrada (${guarda})`)
  for (const e of escrituras) {
    const k = c.indexOf(e)
    if (k >= 0) assert.ok(g < k, `${nombre}: «${e}» corre antes de la guarda`)
  }
}

test('CADA PUERTA DE HORAS PREGUNTA ANTES DE ESCRIBIR', () => {
  const jornadaSrc = fuente('./jornadaPorObraActions.ts')
  guardaAntes(jornadaSrc, 'guardarJornada', 'await quincenaCerrada(supabase, fecha)\n  if (cierre !== null) return { ok: false, error: cierre }',
    ['vaciarHorasDelDia(', "from('registros_hh')", 'escribirAusenciasSinObra(', 'escribirPlan('])
  guardaAntes(jornadaSrc, 'corregirJornada', 'await quincenaCerrada(supabase, c.fecha, c.hasta ?? c.fecha)\n  if (cierre !== null) return { ok: false, error: cierre }',
    ["c.estado === 'vaciar'", 'vaciarHorasDelDia(', "from('registros_hh')", 'corregirAusencia(', 'escribirPlan('])

  const presencia = fuente('./presenciaDelDiaActions.ts')
  guardaAntes(presencia, 'guardarPresencia', 'await quincenaCerrada(supabase, fecha)', ['aplicarHorasPorDefecto('])
  assert.match(cuerpo(presencia, 'guardarPresencia'), /cierre === null\s*\?\s*await aplicarHorasPorDefecto\(/)

  guardaAntes(fuente('./liquidacionDiaActions.ts'), 'corregirHorasDelDia', 'await quincenaCerrada(supabase, fila.fecha)\n  if (cierre !== null) return { ok: false, error: cierre }',
    ['vaciarHorasDelDia(', '.update('])
  guardaAntes(fuente('./horasDeLaCeldaActions.ts'), 'guardarHorasDeLaCelda', 'await quincenaCerrada(supabase, datos.data.fecha)\n  if (cierre !== null) return { ok: false, error: cierre }',
    ['crearElDia('])
})

test('LA REGLA VIVE UNA SOLA VEZ', () => {
  for (const archivo of ['./liquidacionDiaActions.ts', './horasDeLaCeldaActions.ts', './jornadaPorObraActions.ts', './presenciaDelDiaActions.ts']) {
    const src = fuente(archivo)
    assert.doesNotMatch(src, /async function quincenaCerrada\(/, `${archivo} volvió a tener su propia copia`)
    assert.match(src, /import \{ quincenaCerrada \} from '\.\/quincenaCerradaService'/)
  }
})
