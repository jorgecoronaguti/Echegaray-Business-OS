import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificar, armarContexto } from './clasificar-tarea.mjs'

// Los casos de abajo NO son inventados: son pedidos reales del dueño, copiados de los transcripts
// de sesión de este repo. Se escriben como él escribe —"q" por "que", "cdo" por "cuando", sin
// acentos, con typos— porque un clasificador probado contra español de manual acierta en el test y
// falla en la conversación.

test('el silencio es una respuesta válida y frecuente', () => {
  assert.equal(clasificar('ok'), null)
  assert.equal(clasificar('dale'), null)
  assert.equal(clasificar('gracias'), null)
  assert.equal(clasificar('seguí'), null)
  assert.equal(clasificar('perfecto'), null)
  assert.equal(clasificar(''), null)
  assert.equal(clasificar(null), null)
  assert.equal(clasificar(undefined), null)
  assert.equal(clasificar(12345), null)
})

test('un comando explícito no se clasifica: ya sabe lo que hace', () => {
  assert.equal(clasificar('/backlog agregar una tarea nueva de desarrollo'), null)
})

test('un pedido sin señal no inventa categoría', () => {
  assert.equal(clasificar('ya está, qhago ahora?'), null)
  assert.equal(clasificar('me parece bien lo que dijiste recién'), null)
})

test('OPERACIÓN: preguntas de negocio, no de código', () => {
  assert.equal(clasificar('cuanto le debemos a los proveedores hoy')?.categoria, 'OPERACION')
  assert.equal(clasificar('decime el saldo de caja y cuanto hay en el banco')?.categoria, 'OPERACION')
  assert.equal(clasificar('cuanto tengo q pagar de impuestos este mes')?.categoria, 'OPERACION')
})

test('BUG: incluye la forma en que el dueño reporta de verdad', () => {
  assert.equal(clasificar('el bot no contesta nada y tira error 500')?.categoria, 'BUG')
  assert.equal(clasificar('arreglalo vos a esto que quedó roto')?.categoria, 'BUG')
  assert.equal(clasificar('la pestaña de caja quedó mal, no muestra el total')?.categoria, 'BUG')
  assert.equal(clasificar('dejo de andar el timer del flujo')?.categoria, 'BUG')
})

test('BUG: la familia "no + verbo", que es como reporta la mitad de las fallas', () => {
  // Medido contra los 2.229 pedidos del historial: sin estas señales, BUG detectaba 52 casos.
  // Con ellas, 122. Eran quejas explícitas que quedaban clasificadas como nada.
  assert.equal(clasificar('pesimo, no sigue hilo de la conversacion. no ejecuta nunca, es lento')?.categoria, 'BUG')
  assert.equal(clasificar('no logro hacer q cambie nada de ningun archivo, no edita, no modifica')?.categoria, 'BUG')
  assert.equal(clasificar('el chat no responde y no me deja cargar el comprobante')?.categoria, 'BUG')
})

test('OPTIMIZACIÓN: pedir velocidad es pedir optimización', () => {
  assert.equal(clasificar('necesito velocidad y q sean concisas y especificas las respuestas')?.categoria, 'OPTIMIZACION')
})

test('DESARROLLO: el pedido real que originó este sistema', () => {
  const r = clasificar("agrega esta habilidad nueva del bot de mattermost a lo q responde le pregunto 'q sabes hacer'")
  assert.equal(r?.categoria, 'DESARROLLO')
})

test('DESARROLLO: capacidad nueva descrita en primera persona', () => {
  const r = clasificar('necesito q pueda ingresar a balanz y hacer el analisis de todo lo disponible cdo yo tenga ganas')
  assert.equal(r?.categoria, 'DESARROLLO')
})

test('ARQUITECTURA: rediseño y fuente de verdad', () => {
  assert.equal(clasificar('hay que rediseñar de raiz donde vive el calculo del margen')?.categoria, 'ARQUITECTURA')
  assert.equal(clasificar('cual es la fuente de verdad del saldo, el sheet o postgres')?.categoria, 'ARQUITECTURA')
})

test('MANTENIMIENTO: producción y git', () => {
  assert.equal(clasificar('desplegá esto a produccion y reinicia el servicio')?.categoria, 'MANTENIMIENTO')
  assert.equal(clasificar('fijate si el timer esta corriendo en systemd')?.categoria, 'MANTENIMIENTO')
})

test('OPTIMIZACIÓN: el pedido que abrió esta misma tarea', () => {
  const r = clasificar('quiero reducir el consumo de contexto y de creditos, gasta mucho y es caro')
  assert.equal(r?.categoria, 'OPTIMIZACION')
})

test('REFACTOR y DOCUMENTACIÓN', () => {
  assert.equal(clasificar('simplificá ese archivo y sacá la duplicacion, hay que unificar')?.categoria, 'REFACTOR')
  assert.equal(clasificar('actualizá el readme y la documentacion del runbook')?.categoria, 'DOCUMENTACION')
})

test('INVESTIGACIÓN: revisar, auditar, entender', () => {
  assert.equal(clasificar('investigá por que el numero no coincide y analiza el detalle')?.categoria, 'INVESTIGACION')
})

test('detecta la mezcla de dos tareas en un solo pedido', () => {
  const r = clasificar('arreglá el error del bot que esta roto y de paso agregá la funcionalidad nueva de reportes')
  assert.ok(r, 'debería clasificar')
  assert.ok(r.mezcla, 'debería avisar que hay dos tareas')
  assert.ok(armarContexto(r).includes('separalas'))
})

test('la confianza baja no inyecta nada: no inventa con tono de instrucción', () => {
  // Una sola señal débil y sin margen. El comportamiento correcto es callarse.
  const r = clasificar('mirá esto un segundo por favor cuando puedas')
  assert.equal(r, null)
})

test('el contexto inyectado es corto: se paga en CADA prompt', () => {
  for (const cat of ['OPERACION', 'BUG', 'DESARROLLO', 'ARQUITECTURA', 'REFACTOR',
    'MANTENIMIENTO', 'DOCUMENTACION', 'INVESTIGACION', 'OPTIMIZACION']) {
    const txt = armarContexto({ categoria: cat, confianza: 'alta', señales: [], mezcla: null })
    assert.ok(txt, `${cat} debe tener protocolo`)
    // ~3,6 chars por token en español. 800 chars ≈ 220 tokens: el techo que nos permitimos.
    assert.ok(txt.length < 800, `el protocolo de ${cat} mide ${txt.length} chars, es demasiado caro`)
  }
})

test('armarContexto sobre null no rompe', () => {
  assert.equal(armarContexto(null), null)
})

test('el hook nunca escribe nada que no sea JSON válido', async () => {
  const { execFileSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const ruta = fileURLToPath(new URL('./clasificar-tarea.mjs', import.meta.url))
  for (const prompt of ['ok', 'arreglá el error 500 del bot que está roto', '']) {
    const salida = execFileSync('node', [ruta], {
      input: JSON.stringify({ prompt, hook_event_name: 'UserPromptSubmit' }),
      encoding: 'utf8',
    })
    if (salida.trim()) {
      const j = JSON.parse(salida) // tira si no es JSON: eso es exactamente lo que queremos detectar
      assert.equal(j.hookSpecificOutput.hookEventName, 'UserPromptSubmit')
      assert.ok(typeof j.hookSpecificOutput.additionalContext === 'string')
    }
  }
})

test('entrada basura no rompe el hook ni bloquea el prompt', async () => {
  const { execFileSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const ruta = fileURLToPath(new URL('./clasificar-tarea.mjs', import.meta.url))
  const salida = execFileSync('node', [ruta], { input: 'esto no es json {{{', encoding: 'utf8' })
  assert.equal(salida.trim(), '') // silencio, y código 0 (execFileSync habría tirado si no)
})

test('una notificación del sistema NO es un pedido: no se le contesta con un protocolo', () => {
  // Se detectó sola: el hook, ya cableado, clasificó "esperando al auditor" de una notificación
  // de tarea de fondo como INVESTIGACIÓN e inyectó su protocolo. En una sesión con agentes en
  // paralelo eso son cientos de tokens contestándole al sistema.
  const notificacion = [
    '[SYSTEM NOTIFICATION - NOT USER INPUT]',
    '<task-notification><task-id>abc</task-id>',
    '<summary>Background command "esperando al auditor" completed</summary>',
  ].join('\n')
  assert.equal(clasificar(notificacion), null)
  assert.equal(clasificar('<local-command-stdout>investigá y auditá todo el repo</local-command-stdout>'), null)
  assert.equal(clasificar('<command-name>/compact</command-name> investigá el error roto'), null)
})

test('pero un pedido humano que MENCIONA una notificación se sigue clasificando', () => {
  const r = clasificar('el agente que lanzaste devolvió un error y no muestra el resultado, arreglalo')
  assert.equal(r?.categoria, 'BUG')
})

test('un problema de COBRANZA no es un bug de software', () => {
  // Lo encontró una auditoría adversarial: este pedido daba BUG con confianza ALTA, y el protocolo
  // mandaba "reproducir con un test que FALLE" para una cuestión de cobranza.
  const r = clasificar('no llega el pago del cliente, no contesta hace una semana')
  assert.notEqual(r?.categoria, 'BUG', 'una cobranza no puede rutearse como defecto de código')
})

test('pero un servicio que no contesta SÍ es un bug', () => {
  assert.equal(clasificar('el bot no responde, tira error 500 y quedó roto')?.categoria, 'BUG')
})
