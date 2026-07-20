#!/usr/bin/env node
// Test del clasificador de directivas → dominio (lib/classify-directive.mjs). Hermético, 0 API.
// Fija el ruteo de pedidos realistas del dueño para que una expansión futura de keywords no
// rompa el comportamiento. exit 0 = OK, 1 = falla.
import { classifyDirective, classifyDirectiveMulti } from './classify-directive.mjs'
import { skillsForCapability } from './skill-map.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n} → dio ${JSON.stringify(c)}`) } }
const eq = (dir, cap) => { const r = classifyDirective(dir); if (r === cap) ok++; else { fail++; console.error(`FALLA: "${dir}" → esperaba ${cap}, dio ${r}`) } }

// Ruteo a dominio (top-1)
eq('cuánto tengo en caja hoy', 'advise.finance')
eq('qué deuda tenemos con proveedores y su vencimiento', 'advise.finance')
eq('revisá el iva de junio', 'advise.tax')
eq('tengo que facturar la obra', 'advise.tax')
eq('conviene aceptar la obra del hospital', 'advise.commercial')
eq('hago go/no-go de la licitación', 'advise.commercial')
eq('comprá 10 bolsas de cemento', 'advise.procurement')
eq('hay una fisura en la columna', 'advise.civil')
eq('el camión necesita mantenimiento', 'advise.equipment')
eq('armá el presupuesto de la obra', 'advise.estimating')
eq('cuánto le pagamos de aguinaldo al personal', 'advise.hr')
eq('hubo un accidente, activá el protocolo de ART', 'advise.safety')

// General legítimo (saludo / meta) → sin skill, es correcto
eq('hola', 'general')
eq('gracias', 'general')
eq('', 'general')

// Multi-dominio: un pedido que cruza
{
  const m = classifyDirectiveMulti('cotizá la obra con su costo y el contrato')
  check('multi: cotizar cruza estimating', m.includes('advise.estimating'))
  check('multi: acotado a 3', m.length <= 3)
}

// Toda capability emitida por el clasificador tiene skills mapeadas (ningún ruteo huérfano)
for (const dir of ['caja', 'iva', 'contrato', 'uocra', 'accidente', 'comprar', 'presupuesto', 'cronograma', 'hormigon', 'calidad', 'camion', 'obra', 'conviene aceptar']) {
  const cap = classifyDirective(dir)
  if (cap !== 'general') check(`${dir} → ${cap} tiene skills`, skillsForCapability(cap).length > 0)
}

// REGRESIÓN: keyword corta NO debe matchear dentro de una palabra (bug real: "iva" matcheaba
// "act·iva·s" y mandaba "comprar retroexcavadora para obras activas" a impuestos).
{
  const m = classifyDirectiveMulti('conviene comprar o alquilar una retroexcavadora para las obras activas?')
  check('substring: "activas" NO cuenta como iva → sin advise.tax', !m.includes('advise.tax'))
  check('substring: retroexcavadora → advise.equipment', m.includes('advise.equipment'))
  check('IVA real sí cuenta', classifyDirectiveMulti('cuánto pago de iva este mes').includes('advise.tax'))
  check('operario en blanco → advise.hr', classifyDirective('registrar operario en blanco') === 'advise.hr')
}

// ARCHIVISTA (advise.admin): pedidos de ORDEN DOCUMENTAL del data room ahora son alcanzables.
{
  check('organizar el drive → advise.admin', classifyDirective('ayudame a organizar el drive') === 'advise.admin')
  check('carpeta nueva en el drive → advise.admin', classifyDirective('hacé una carpeta nueva en el drive') === 'advise.admin')
  check('renombrar → advise.admin', classifyDirective('renombrar los archivos con una nomenclatura clara') === 'advise.admin')
  check('orden documental → advise.admin', classifyDirective('quiero orden documental del data room') === 'advise.admin')
  check('advise.admin tiene skills (orden-documental-dataroom)', skillsForCapability('advise.admin').includes('orden-documental-dataroom'))
  // No secuestra un pedido financiero con "ordenar" genérico: "ordená la caja" pesa más finanzas.
  check('"ordená la caja" NO va a admin', classifyDirective('ordená la caja de hoy') !== 'advise.admin')
}

// ÁREA ADMIN Y FINANZAS (foco declarado del dueño). Auditoría 2026-07-19: estas preguntas REALES
// caían a 'general' → el chat contestaba sin una sola línea de criterio financiero. Regresión cara.
{
  check('"cash flow" → advise.finance', classifyDirective('esta bien armado mi cash flow?') === 'advise.finance')
  check('"forecast" → advise.finance', classifyDirective('armame un forecast de 13 semanas') === 'advise.finance')
  check('"conciliar el banco" → advise.finance', classifyDirective('como concilio el banco con el sheet') === 'advise.finance')
  check('"dso" → advise.finance', classifyDirective('cual es mi dso') === 'advise.finance')
  check('"working capital" → advise.finance', classifyDirective('como mejoro el working capital') === 'advise.finance')
  check('"administracion" (proceso) → advise.admin', classifyDirective('como deberia organizar la administracion') === 'advise.admin')
  check('"circuito administrativo" → advise.admin', classifyDirective('armame el circuito administrativo de pagos') === 'advise.admin')
  check('"estado de resultados" → advise.accounting', classifyDirective('mostrame el estado de resultados') === 'advise.accounting')
  // ANTI-CONTAMINACIÓN: una palabra incidental de otro dominio no debe arrastrarlo ni desplazar
  // a las skills reales dentro del tope de 4 del chat.
  const caps = classifyDirectiveMulti('que estructura deberia tener el flujo de fondos')
  check('"estructura" no arrastra ingeniería civil a una pregunta financiera', !caps.includes('advise.civil'))
  check('la pregunta financiera queda en finanzas', caps[0] === 'advise.finance')
  // Una pregunta de Sheet financiero debe recibir el criterio de Sheets DENTRO del tope de 4.
  const skFin = [...new Set(classifyDirectiveMulti('mejorame la pestaña de cobranzas del sheet').flatMap((c) => skillsForCapability(c)))].slice(0, 4)
  check('Sheet financiero incluye google-sheets-business-systems en el top 4', skFin.includes('google-sheets-business-systems'))
  check('Sheet financiero incluye también finanzas', skFin.includes('finanzas-tesoreria-construccion'))
}

console.log(`\nclassify-directive.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
