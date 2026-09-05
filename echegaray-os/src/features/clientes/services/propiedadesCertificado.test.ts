import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COLOR_ESTADO, COLOR_TONO, ROTULO_ESTADO, lecturaDelMonto, mensajeDelCobro,
  propiedadesDelCertificado,
} from './propiedadesCertificado.ts'
import type { CertificadoCliente, EstadoCertificado } from '../types/cobranzas.ts'

// ═══ QUÉ DEFECTOS ATRAPA ═══
//
// 1. Que un `reparo` NULL vuelva a dibujarse como «$ 0,00 M». Un contrato que no retiene y un
//    contrato cuya retención nadie cargó son dos cosas distintas, y la segunda significa que la
//    empresa está proyectando caja que no va a entrar en esa fecha.
// 2. Que el NETO se escriba a secas cuando no hay retención: quien lo lea va a creer que ya se
//    descontó el fondo de reparo.
// 3. Que la pantalla afirme «huella verificada» sobre algo que la app no puede verificar.
// 4. Que un cobro parcial se encole sin decir cuánto queda.
// 5. Que aparezca un octavo estado, o que dos estados compartan color y dejen de distinguirse.

const HOY_CERT = (p: Partial<CertificadoCliente> = {}): CertificadoCliente => ({
  id: 'c1', cliente_id: 'cli', obra_id: null, obra_nombre: null, numero: 'Certificado 4',
  factura: null, periodo_desde: null, periodo_hasta: null, avance_periodo: null,
  monto: 5_800_000, reparo: null, emitido_at: null, vence: null, estado: 'emitido',
  observacion: null, cobranza_fila: null, detalle_rubros: null,
  huella_comprobante: null, huella_monto: null, origen: 'sync_cobranzas', ...p,
})

const prop = (c: CertificadoCliente, k: string) => propiedadesDelCertificado(c).find((p) => p.k === k)!

// ── LOS SIETE ESTADOS ───────────────────────────────────────────────────────────────────────────

test('los siete estados del CHECK tienen rótulo y color, y no hay un octavo', () => {
  const siete: EstadoCertificado[] = [
    'emitido', 'en_revision', 'aprobado', 'observado', 'vencido', 'cobrado', 'en_disputa',
  ]
  assert.deepEqual(Object.keys(ROTULO_ESTADO).sort(), [...siete].sort())
  assert.deepEqual(Object.keys(COLOR_ESTADO).sort(), [...siete].sort())
})

test('lo que la tabla agrega sobre el Sheet se distingue: la aprobación del cliente no es «emitido»', () => {
  // Es lo ÚNICO que `certificado_cliente` sabe y la pestaña Cobranzas no. Si `en_revision` y
  // `aprobado` se pintan como `emitido`, ese dato deja de existir para quien mira.
  assert.notEqual(COLOR_ESTADO.en_revision, COLOR_ESTADO.emitido)
  assert.notEqual(COLOR_ESTADO.aprobado, COLOR_ESTADO.en_revision)
  // Y el rótulo nombra a QUIÉN aprueba: «aprobado» a secas se lee como aprobado adentro.
  assert.match(ROTULO_ESTADO.en_revision, /\bcliente\b/)
  assert.match(ROTULO_ESTADO.aprobado, /\bcliente\b/)
})

// ── FONDO DE REPARO Y NETO ──────────────────────────────────────────────────────────────────────

test('un reparo NULL nunca es «$ 0,00 M»', () => {
  const p = prop(HOY_CERT({ reparo: null }), 'Fondo de reparo')
  assert.equal(p.v, 'sin retención cargada')
  assert.equal(p.color, COLOR_TONO.apagado)
  assert.doesNotMatch(p.v, /0,00/)
})

test('el neto sin retención lo DICE, en vez de repetir el bruto y callarse', () => {
  assert.equal(prop(HOY_CERT({ monto: 5_800_000, reparo: null }), 'Neto a cobrar').v, '$ 5,80 M · sin retención')
  assert.equal(prop(HOY_CERT({ monto: 5_800_000, reparo: 290_000 }), 'Neto a cobrar').v, '$ 5,51 M')
})

test('un reparo cargado va en ámbar: es plata que NO entra en la fecha del certificado', () => {
  assert.equal(prop(HOY_CERT({ reparo: 290_000 }), 'Fondo de reparo').color, COLOR_TONO.falta)
})

// ── PERÍODO Y AVANCE ────────────────────────────────────────────────────────────────────────────

test('sin período es ÁMBAR —es trabajo pendiente— y sin avance es apagado', () => {
  assert.equal(prop(HOY_CERT(), 'Período').v, 'sin período cargado')
  assert.equal(prop(HOY_CERT(), 'Período').color, COLOR_TONO.falta)
  assert.equal(prop(HOY_CERT(), 'Avance del período').color, COLOR_TONO.apagado)
})

test('con período cargado se escribe el tramo, no una fecha suelta', () => {
  const c = HOY_CERT({ periodo_desde: '2026-06-01', periodo_hasta: '2026-06-30', avance_periodo: 19 })
  assert.equal(prop(c, 'Período').v, '01/06 → 30/06')
  assert.equal(prop(c, 'Avance del período').v, '19 % del contrato')
})

test('un avance de 0 % es un dato leído y no se dibuja como ausencia', () => {
  // El certificado de un mes sin avance existe: decir «sin cargar» ahí sería inventar una falta.
  assert.equal(prop(HOY_CERT({ avance_periodo: 0 }), 'Avance del período').v, '0 % del contrato')
})

// ── EL PUENTE AL SHEET ──────────────────────────────────────────────────────────────────────────

test('la app NO afirma que la huella verifica: dice si la hay', () => {
  // Verificar la huella es contrastarla contra la celda del Sheet, y quien habla con Google es el
  // worker, no esta pantalla. «Verificada» sería un hecho que nadie comprobó.
  const con = prop(HOY_CERT({ cobranza_fila: 611, huella_comprobante: 'FA 0004-00012902' }), 'Origen')
  assert.equal(con.v, 'Cobranzas · fila 611 · con huella')
  assert.doesNotMatch(con.v, /verificada/)
})

test('sin huella va en ÁMBAR: el worker va a rechazar cualquier cambio sobre esa fila', () => {
  const sin = prop(HOY_CERT({ cobranza_fila: 611 }), 'Origen')
  assert.equal(sin.v, 'Cobranzas · fila 611 · sin huella para verificar')
  assert.equal(sin.color, COLOR_TONO.falta)
})

test('la huella puede ser el MONTO y eso alcanza', () => {
  const c = HOY_CERT({ cobranza_fila: 611, huella_monto: 5_800_000 })
  assert.match(prop(c, 'Origen').v, /con huella/)
})

test('un certificado creado en el OS dice que el sync no lo pisa', () => {
  const c = HOY_CERT({ origen: 'os', cobranza_fila: null })
  assert.equal(prop(c, 'Origen').v, 'creado en el OS · el sync no lo pisa')
  assert.equal(prop(c, 'Origen').color, COLOR_TONO.apagado)
})

test('una fila del sync SIN fila de Cobranzas es un problema y se dice', () => {
  // Es el estado que hoy materializa el sync cuando no pudo atar la fila. Sin esto se lee como un
  // certificado normal, y «Registrar cobro» falla recién al apretar.
  const c = HOY_CERT({ origen: 'sync_cobranzas', cobranza_fila: null })
  assert.equal(prop(c, 'Origen').color, COLOR_TONO.falta)
})

// ── EL COBRO PARCIAL ────────────────────────────────────────────────────────────────────────────

test('un cobro parcial se dice ANTES de encolar, con cuánto queda', () => {
  const l = lecturaDelMonto(2_000_000, 5_800_000)
  assert.equal(l.parcial, true)
  assert.equal(l.texto, '$ 2,00 M · cobro parcial: quedan $ 3,80 M')
  assert.equal(l.color, COLOR_TONO.falta)
})

test('el cobro completo no grita, y el campo vacío pide el dato en vez de afirmar nada', () => {
  assert.equal(lecturaDelMonto(5_800_000, 5_800_000).parcial, false)
  assert.equal(lecturaDelMonto(null, 5_800_000).texto, 'Escribí el monto que entró')
  assert.equal(lecturaDelMonto(0, 5_800_000).parcial, false)
})

test('un peso de diferencia NO es un cobro parcial: es el redondeo del Sheet', () => {
  assert.equal(lecturaDelMonto(5_799_999.5, 5_800_000).parcial, false)
})

test('cobrar de MÁS que lo facturado no se dibuja como parcial', () => {
  assert.equal(lecturaDelMonto(6_000_000, 5_800_000).parcial, false)
})

// ── EL MENSAJE DE LO QUE DE VERDAD SE ENCOLÓ ────────────────────────────────────────────────────

test('nunca se dice «cobrado»: se dice ENCOLADO, y quién lo confirma', () => {
  // El cobro es un hecho cuando el worker escribe la fila de Cobranzas y la relee. Si esta palabra
  // vuelve a ser «cobrado», la pantalla está afirmando algo que todavía no pasó.
  const m = mensajeDelCobro(5_800_000, 5_800_000)
  assert.match(m, /^Encolado\./)
  assert.match(m, /worker/)
  assert.doesNotMatch(m, /^Cobrado/)
})

test('un cobro PARCIAL no se despide con un «Encolado» a secas', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // La cola escribe fecha, «Cobrado» y medio. El MONTO no viaja. Así que escribir 2 M sobre un
  // certificado de 5,8 M encolaba «Cobrado» sobre la fila entera y contestaba «Encolado»: un cobro
  // parcial afirmado como cobro total en la fuente de verdad del Flujo de Caja.
  const m = mensajeDelCobro(2_000_000, 5_800_000)
  assert.match(m, /Encolado\./)
  assert.match(m, /fila entera/)
  assert.match(m, /\$ 3,80 M/)
  assert.match(m, /columna J/)
})

test('un peso de diferencia no dispara el aviso de parcial', () => {
  assert.equal(mensajeDelCobro(5_799_999.5, 5_800_000), mensajeDelCobro(5_800_000, 5_800_000))
})
