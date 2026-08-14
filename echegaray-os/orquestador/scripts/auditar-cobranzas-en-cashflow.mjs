#!/usr/bin/env node
// ¿CADA COBRO DE COBRANZAS LLEGA AL CASH FLOW, Y AL MES QUE CORRESPONDE?
//
// POR QUÉ EXISTE (21/07). El dueño: "hay montos que salen en cobranzas que tienen fechas
// actualizadas y no se están viendo reflejados los cambios en cash flows y demás, revisar en
// profundidad".
//
// Comparar los TOTALES no alcanza y es engañoso: el total de las tres líneas del cash flow cuadraba
// al peso con Cobranzas, y aun así puede haber un cobro contado en el mes equivocado —dos errores
// que se compensan dan diferencia cero—. La única verificación que sirve es fila por fila: dónde
// dice Cobranzas que entra cada peso, y dónde lo pone el cuadro.
//
// LO QUE MIRA, QUE ES DONDE SE ESCONDEN LOS DESVÍOS:
//   · el cobro que no aparece en ninguna columna (queda fuera de la ventana del cuadro);
//   · el que aparece en un mes distinto al de su fecha de cobro;
//   · el que entra al control en su moneda nativa y no en pesos (los U$S de la fila 62);
//   · el que el cuadro no muestra por una razón legítima —endosado o devolución— y tiene que
//     aparecer como resta declarada del mes, no como diferencia sin explicar;
//   · el que no se puede clasificar porque le falta la unidad de negocio.
//
//   node orquestador/scripts/auditar-cobranzas-en-cashflow.mjs

// SIN `scopes`: un auditor no tiene con qué escribir. Pedía los de escritura sin usarlos nunca.
//
// LA LECTURA Y EL VEREDICTO VIVEN EN `lib/cobranzas-cuadre-vivo.mjs` desde el 14/08: los usa TAMBIÉN
// la publicación de las vistas, que aborta si el cuadre no cierra. Este script quedó como la puerta
// de mano — el mismo control, corrido a demanda.
import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { auditarCuadreCobranzas, informe } from '../lib/cobranzas-cuadre-vivo.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

async function main() {
  const google = makeGoogleClient({ config: loadConfig() })
  const r = await auditarCuadreCobranzas(google, ID)
  for (const l of informe(r)) console.log(l)

  console.log()
  if (r.noPudoUbicar) { process.exitCode = 1; return }
  if (r.ok) {
    console.log('✓ cada cobro llega al cuadro y al mes de su fecha de cobro')
  } else {
    const malos = r.porMes.filter((m) => !m.ok).length
    console.log(`⚠ ${malos} mes(es) no coinciden`)
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
