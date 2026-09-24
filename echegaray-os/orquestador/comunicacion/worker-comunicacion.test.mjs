// CUÁNTO DUERME EL WORKER DEL BOT ANTES DE MIRAR SI ALGUIEN ESCRIBIÓ — dueño, 24/09/2026:
// «está lento todo… no manda a tiempo los mensajes… se queda clavado».
//
// Medido ese día en producción (Mattermost + comunicacion.inbox + journal del worker):
//   mensaje del dueño en #efectivo   entra al inbox   el worker lo toma   respuesta publicada
//   15:39:01 «2000 a rodrigo»        15:39:01         15:39:17            15:39:19  (18 s)
//   15:39:07 «1560983 a emiliano»    15:39:07         15:39:17            15:39:19  (12 s)
//   16:19:45 «20000 a emiliano m.»   16:19:45         16:19:57            16:19:58  (13 s)
// El trabajo real era ~1,2 s; el resto, el worker durmiendo. Con el techo ocioso en 15 s, un
// mensaje que llega después de un rato de silencio espera hasta 15 s a que el worker se despierte.
//
// Estas pruebas corren el bucle REAL (`correrBucle`) con sus valores por defecto — los mismos que
// usa el servicio — y un reloj falso que anota cada siesta.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { correrBucle } from './worker-comunicacion.mjs'

const OCIOSO = { trabajo: 0 }
const CON_TRABAJO = { trabajo: 3 }

/** Corre el bucle con una secuencia de resultados de tick y devuelve las siestas pedidas. */
async function siestas(secuencia) {
  const esperas = []
  let i = 0
  await correrBucle({
    tick: async () => {
      const r = secuencia[i++]
      if (r instanceof Error) throw r
      return r
    },
    latido: null,
    log: { info() {}, error() {} },
    dormir: async (ms) => { esperas.push(ms) },
    debeParar: () => i >= secuencia.length,
  })
  return esperas
}

test('ocioso mucho rato, el worker nunca duerme más de 3 s: un mensaje espera a lo sumo eso', async () => {
  const esperas = await siestas(Array(200).fill(OCIOSO))
  const mayor = Math.max(...esperas)
  // Antes de este cambio: 15.000. Es exactamente la demora que el dueño vio el 24/09.
  assert.ok(mayor <= 3000, `durmió ${mayor} ms seguidos con un mensaje esperando`)
  assert.equal(esperas.at(-1), 3000, 'el techo es 3 s, no menos: más seguido es gastar la base por nada')
})

test('el caso del 24/09: después de un rato de silencio, el mensaje se toma en ≤ 3 s, no en 12–16', async () => {
  // Media hora de silencio (la tarde del dueño entre mensajes) y después llega uno.
  const esperas = await siestas([...Array(600).fill(OCIOSO), CON_TRABAJO, OCIOSO])
  // La siesta en curso cuando llegó el mensaje es la anterior al tick con trabajo.
  const enCurso = esperas[599]
  assert.ok(enCurso <= 3000, `el mensaje esperó hasta ${enCurso} ms a que el worker se despertara`)
  // Y con trabajo, vuelve enseguida: una segunda pregunta de la misma persona no espera nada.
  assert.equal(esperas[600], 200)
})

test('los errores sí se espacian hasta 15 s (no hay nadie esperando esa respuesta), y el primer tick bueno vuelve a 3 s', async () => {
  const falla = new Error('el especialista explotó')
  const esperas = await siestas([...Array(8).fill(falla), OCIOSO, OCIOSO])
  const deError = esperas.slice(0, 8)
  assert.equal(Math.max(...deError), 15_000, 'un tick que falla siempre igual no llena el log cada 3 s')
  assert.ok(esperas[8] <= 3000, `después del error durmió ${esperas[8]} ms con el canal andando`)
})
