// LO QUE EL PANEL DEL CERTIFICADO *AFIRMA* — separado de cómo lo dibuja.
//
// Mismo motivo que `administracion/services/panelCompraSheet.ts`: `PanelCertificado.tsx` no se
// puede probar con `node --test` —el runner no carga `.tsx`— y lo que hay que proteger no es el
// JSX, son las afirmaciones. Qué falta en este certificado, con qué palabra se nombra y de qué
// color va: exactamente donde «NULL nunca es cero» se rompe sin que nadie lo note.
//
// ═══ LAS SEIS PROPIEDADES SON LAS COLUMNAS QUE LA TABLA AGREGA SOBRE EL SHEET ═══
//
// La pestaña Cobranzas tiene el número, el monto y la fecha. `public.certificado_cliente` tiene
// además el estado de aprobación del cliente, el período certificado, su avance, el fondo de
// reparo retenido y el puente al Sheet. Nada de eso se estaba mostrando, y cada uno cambia una
// decisión:
//
//   · SIN `reparo` la empresa proyecta caja que no entra en esa fecha: el cliente paga el neto y
//     el reparo se libera meses después. Un `reparo` NULL es «sin retención cargada», nunca
//     «$ 0,00 M» —que afirmaría que el contrato no retiene—.
//   · SIN período no se sabe qué trabajo cubre el certificado, y eso es trabajo pendiente: ámbar.
//   · EL ORIGEN decide si el sync puede pisar la fila. Un certificado creado en el OS no lo pisa;
//     uno que vino del Sheet vive atado a `cobranza_fila` + huella.
//
// ═══ POR QUÉ NO SE DICE «HUELLA VERIFICADA» ═══
//
// El diseño pide «huella verificada / huella sin verificar». La app NO PUEDE VERIFICARLA: la huella
// se contrasta contra la celda del Sheet, y quien habla con Google es el worker de la VM, no
// Vercel. Lo único que esta pantalla sabe es si la huella EXISTE. Decir «verificada» sería
// presentar como hecho algo que nadie comprobó, así que se escribe lo que sí se puede afirmar —que
// hay con qué verificarla, o que no la hay— y la ausencia va en ámbar, porque sin huella el worker
// va a rechazar cualquier cambio sobre esa fila.

import { diaMes, montoM } from './cobranzaFormato.ts'
import type { CertificadoCliente, EstadoCertificado } from '../types/cobranzas.ts'

/** El rótulo en castellano de cada uno de los siete estados del CHECK. No hay un octavo. */
export const ROTULO_ESTADO: Record<EstadoCertificado, string> = {
  emitido: 'emitido',
  en_revision: 'en revisión del cliente',
  aprobado: 'aprobado por el cliente',
  observado: 'observado',
  vencido: 'vencido',
  cobrado: 'cobrado',
  en_disputa: 'en disputa',
}

/**
 * EL COLOR DE CADA ESTADO. Tres familias y ninguna decorativa: azul lo que está en curso, verde lo
 * que se cerró bien, rojo lo que es un problema, ámbar lo que reclama trabajo, y grafito lo que
 * simplemente pasó (`emitido` no es una buena ni una mala noticia: es el punto de partida).
 */
export const COLOR_ESTADO: Record<EstadoCertificado, string> = {
  emitido: '#3A3A38',
  en_revision: '#175CD3',
  aprobado: '#067647',
  observado: '#B54708',
  vencido: '#B42318',
  cobrado: '#067647',
  en_disputa: '#B42318',
}

/** Los tonos que puede tomar el valor de una propiedad. El negro es «hay dato» y no está acá. */
export const COLOR_TONO = {
  /** Falta algo que BLOQUEA: sin período no se puede saber qué se certificó. */
  falta: '#B54708',
  /** Falta algo que NO bloquea, o es un metadato. */
  apagado: '#91918B',
} as const

export interface PropCertificado {
  k: string
  v: string
  /** El color literal del valor. Sale de `COLOR_ESTADO` o de `COLOR_TONO`; negro si hay dato. */
  color: string
}

const TINTA = '#1F1F1E'

/**
 * LAS SEIS PROPIEDADES DEL PANEL, en su orden. Función pura sobre el certificado.
 *
 * `montoM` escribe `—` cuando el número no existe, así que un reparo NULL nunca puede salir como
 * `$ 0,00 M`; igual no se llega a esa rama, porque el NULL se atiende antes con su palabra.
 */
export function propiedadesDelCertificado(c: CertificadoCliente): PropCertificado[] {
  const hayPeriodo = Boolean(c.periodo_desde && c.periodo_hasta)
  return [
    { k: 'Estado', v: ROTULO_ESTADO[c.estado], color: COLOR_ESTADO[c.estado] },
    {
      k: 'Período',
      v: hayPeriodo ? `${diaMes(c.periodo_desde)} → ${diaMes(c.periodo_hasta)}` : 'sin período cargado',
      color: hayPeriodo ? TINTA : COLOR_TONO.falta,
    },
    {
      k: 'Avance del período',
      v: c.avance_periodo == null ? 'sin cargar' : `${c.avance_periodo} % del contrato`,
      color: c.avance_periodo == null ? COLOR_TONO.apagado : TINTA,
    },
    {
      k: 'Fondo de reparo',
      // NUNCA «$ 0,00 M»: un reparo que nadie cargó no es un contrato que no retiene.
      v: c.reparo == null ? 'sin retención cargada' : `${montoM(c.reparo)} retenido`,
      color: c.reparo == null ? COLOR_TONO.apagado : COLOR_TONO.falta,
    },
    {
      k: 'Neto a cobrar',
      // Sin reparo el neto ES el bruto, y se dice: escribir el bruto a secas haría creer que ya se
      // le descontó la retención.
      v: c.reparo == null ? `${montoM(c.monto)} · sin retención` : montoM(c.monto - c.reparo),
      color: TINTA,
    },
    origenDe(c),
  ]
}

/**
 * DE DÓNDE SALIÓ ESTA FILA, y si el worker puede reconocerla.
 *
 * La identidad del cobro es `cobranza_fila` + huella, NO la columna A del Sheet: esa columna es
 * `=ROW()-4` y se corre entera al insertar una fila arriba. Sin huella el worker no tiene contra
 * qué comparar y rechaza el cambio, así que la ausencia va en ámbar: no es un metadato, es un
 * certificado sobre el que no se va a poder registrar el cobro.
 */
function origenDe(c: CertificadoCliente): PropCertificado {
  if (c.origen === 'os') {
    return { k: 'Origen', v: 'creado en el OS · el sync no lo pisa', color: COLOR_TONO.apagado }
  }
  if (c.cobranza_fila == null) {
    return { k: 'Origen', v: 'del sync, sin fila de Cobranzas', color: COLOR_TONO.falta }
  }
  const hayHuella = Boolean(c.huella_comprobante) || c.huella_monto != null
  return {
    k: 'Origen',
    v: `Cobranzas · fila ${c.cobranza_fila} · ${hayHuella ? 'con huella' : 'sin huella para verificar'}`,
    color: hayHuella ? COLOR_TONO.apagado : COLOR_TONO.falta,
  }
}

/**
 * QUÉ CONTESTA LA PANTALLA CUANDO EL COBRO QUEDÓ ENCOLADO.
 *
 * ═══ EL DEFECTO QUE CIERRA ═══
 *
 * El formulario pide un monto y la cola NO LO RECIBE: `registrarCobro` encola la fecha (columna Q),
 * «Cobrado» (columna O) y el medio (columna N), y nada más. Hasta acá eso era invisible — se
 * escribía «entraron 2 millones de los 5,8», la pantalla decía «Encolado» y lo que se encolaba era
 * «Cobrado» sobre la fila ENTERA. Un cobro parcial quedaba afirmado como cobro total en la fuente
 * de verdad del Flujo de Caja.
 *
 * NO SE ARREGLA ENCOLANDO EL MONTO. Pisar la columna J con el importe parcial borraría el importe
 * facturado, y partir el cobro en dos filas de Cobranzas corre la columna A —`=ROW()-4`— de todas
 * las de abajo. Las dos son decisiones del dueño, no de esta pantalla.
 *
 * Lo que sí se puede hacer es no mentir: se dice QUÉ se encoló y, cuando es parcial, qué queda sin
 * registrar y por qué. `null` en `monto` = no se escribió nada legible; el schema ya lo rechazó.
 */
export function mensajeDelCobro(monto: number | null, delCertificado: number): string {
  const base = 'Encolado. El cobro queda registrado cuando el worker escribe la fila de Cobranzas'
    + ' y la relee.'
  if (monto == null) return base
  const falta = delCertificado - monto
  if (falta <= 1) return base
  return `${base} OJO: se encoló «Cobrado» sobre la fila entera y quedan ${montoM(falta)} sin`
    + ' cobrar. El importe parcial no se escribe: la columna J sigue con lo facturado.'
}

/**
 * LO QUE SE LEE DEBAJO DEL CAMPO DE MONTO MIENTRAS ALGUIEN ESCRIBE.
 *
 * Detecta el COBRO PARCIAL, que es la mitad de los casos de esta pantalla: si entró menos de lo
 * facturado, hay que decir cuánto queda ANTES de encolar, no después. `monto` es `null` cuando
 * todavía no se escribió nada legible.
 */
export function lecturaDelMonto(monto: number | null, delCertificado: number): {
  texto: string
  color: string
  parcial: boolean
} {
  if (monto == null || monto <= 0) {
    return { texto: 'Escribí el monto que entró', color: COLOR_TONO.apagado, parcial: false }
  }
  const falta = delCertificado - monto
  // La tolerancia de un peso evita gritar «parcial» por el redondeo de un centavo del Sheet.
  if (falta > 1) {
    return {
      texto: `${montoM(monto)} · cobro parcial: quedan ${montoM(falta)}`,
      color: COLOR_TONO.falta,
      parcial: true,
    }
  }
  return { texto: montoM(monto), color: '#6B6B67', parcial: false }
}
