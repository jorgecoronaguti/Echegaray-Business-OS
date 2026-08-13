// Tool: PRESUPUESTOS DE RODADOS. Contesta "¿qué presupuestos tengo para comprar una camioneta?" sin
// que nadie vuelva a abrir las fotos que mandó el dueño. 0 API.
//
// LEE EL MÓDULO DECLARADO, NO LA TABLA. `rodados-datos.mjs` es la transcripción de los adjuntos y es
// la misma fuente que materializa el sync: si el tool leyera public.rodados_presupuestos, una corrida
// pendiente del sync se vería como "no hay presupuestos" — un vacío que parece un hecho. La tabla
// existe para la Web, que no puede importar un .mjs del orquestador.
import { presupuestosAlDia, loQueFalta, CONDICION_CREDITO_RODADO } from '../rodados-datos.mjs'
import { compararFormasDePago } from '../rodados-financiacion.mjs'

export function rodadosTools() {
  return {
    'rodados.presupuestos': {
      capability: 'os.read',
      schema: {
        name: 'rodados_presupuestos',
        description:
          'PRESUPUESTOS DE RODADOS — los presupuestos que el dueño juntó para comprar una camioneta de obra, con unidad, precio, gastos, total, vigencia (dice si ya venció), formas de pago propuestas y ficha técnica (carga, potencia, airbag/ABS de serie vs opcional), más la condición del crédito asociado y la COMPARACIÓN ECONÓMICA entre pagar al contado o a plazo (recargo, TNA/TEA implícitas y veredicto contra el costo del descubierto). Usalo cuando el dueño pregunte "¿qué presupuestos tengo para rodados?", "¿cuánto sale la camioneta?", "¿qué opciones de pago me dieron?", "¿me conviene pagar al contado o con los cheques?", "¿el presupuesto sigue vigente?". Cada dato dice de qué adjunto salió, y lo que no se pudo leer se informa en "falta" — nunca se completa con un valor razonable. Sin parámetros.',
        input_schema: { type: 'object', properties: {} },
      },
      async run() {
        try {
          const presupuestos = presupuestosAlDia()
          return {
            presupuestos,
            // CONTADO CONTRA PLAZO, ya resuelto. Sin esto el modelo tendría que anualizar un recargo a
            // mano en la respuesta, que es exactamente donde inventaría una tasa.
            comparacion_formas_de_pago: compararFormasDePago(),
            condicion_financiera: {
              entidad: CONDICION_CREDITO_RODADO.entidad,
              producto: CONDICION_CREDITO_RODADO.producto,
              tna: CONDICION_CREDITO_RODADO.tna,
              tea: CONDICION_CREDITO_RODADO.tea,
              cft: CONDICION_CREDITO_RODADO.cft,
              amortizacion: CONDICION_CREDITO_RODADO.amortizacion,
              garantias: CONDICION_CREDITO_RODADO.garantias,
              vigencia_hasta: CONDICION_CREDITO_RODADO.vigencia_hasta,
              fuente: CONDICION_CREDITO_RODADO.fuente,
              observaciones: CONDICION_CREDITO_RODADO.observaciones,
              desconocido: CONDICION_CREDITO_RODADO.desconocido,
            },
            falta: loQueFalta(),
            nota:
              'La TNA 0% del crédito es NOMINAL: en un crédito UVA el costo es el ajuste del capital por CER, que el presupuesto no declara. No afirmar que el crédito es gratis ni compararlo contra el descubierto como si costara cero. El IVA de la compra está cargado como INCLUIDO en el total: si es crédito fiscal computable no está verificado y lo define el estudio contable — no contestarlo.',
          }
        } catch (e) {
          return { error: `no pude leer los presupuestos de rodados: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
  }
}
