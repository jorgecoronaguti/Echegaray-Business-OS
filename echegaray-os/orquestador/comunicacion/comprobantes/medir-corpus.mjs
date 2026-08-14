#!/usr/bin/env node
// CUÁNTOS COMPROBANTES DE UNA TANDA REAL ENTRAN — la medida, no la opinión.
//
// ═══ POR QUÉ EXISTE ═══
//
// «me tiene q poder cargar todas las filas porque no puedo estar revisando cada comprobante». Esa
// frase sólo se puede contestar con un número, y el número tiene que salir de comprobantes REALES:
// los tests con dobles prueban que cada regla hace lo que dice, no que una tanda entre completa.
//
// Corpus: los ítems que Postgres guardó de las tandas del dueño (`comunicacion.comprobante_fajos`),
// tal cual quedaron. Se vuelcan a un JSON con:
//
//   node -e "import('./orquestador/lib/db.mjs').then(async (db) => {
//     const f = await db.query(\`select id, estado, items, creado_at, error
//                                 from comunicacion.comprobante_fajos order by creado_at\`)
//     require('fs').writeFileSync('fajos.json', JSON.stringify(f.rows)); process.exit(0) })"
//
// y se mide contra DOS árboles —el de antes y el de ahora— para poder decir cuántos entraban y
// cuántos entran. Medido el 14/08 sobre las 7 fotos de la última tanda (21 lecturas):
//
//                          ANTES        DESPUÉS
//   papeles que entran      5 de 8       8 de 8
//   preguntas al dueño      7 de 12      1 de 9
//   identificables          0 de 8       8 de 8
//
// Uso:  node medir-corpus.mjs <ruta-del-repo> [ruta-del-fajos.json]
//
// NO TOCA NADA: lee un JSON y llama a las funciones puras del módulo. Cero red, cero escritura.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const RAIZ = process.argv[2]
const { colapsarRepetidos, faltantesDelChat, estaCompleto } = await import(resolve(RAIZ, 'orquestador/lib/comprobantes/fajo.mjs'))
const { numeroCanonico, claveComprobante } = await import(resolve(RAIZ, 'orquestador/lib/comprobantes/lectura.mjs'))
const { aplicarArca } = await import(resolve(RAIZ, 'orquestador/lib/comprobantes/arca.mjs'))
const { identificar } = await import(resolve(RAIZ, 'orquestador/lib/comprobantes/identidad.mjs')).catch(() => ({ identificar: null }))
const { mismoCorrelativo } = await import(resolve(RAIZ, 'orquestador/lib/comprobantes/compras-vivas.mjs')).catch(() => ({ mismoCorrelativo: null }))

const AHORA = new Date('2026-08-14T12:00:00Z')
const fajos = JSON.parse(readFileSync(process.argv[3] ?? new URL('./fajos.json', import.meta.url)))
const fajo = fajos.find((f) => String(f.id).startsWith('00774873'))
const previo = fajos.find((f) => String(f.id).startsWith('ac0dae6d'))

// El corpus: todos los ítems de las dos tandas, tal como Postgres los tiene.
const crudos = [...previo.items, ...fajo.items]

// Se re-canoniza el número igual que lo haría `normalizar_lectura` con el código de hoy: lo guardado
// en la base salió del canonizador de ayer, y medir contra eso mediría el pasado.
const items = crudos.map((it) => {
  const c = { ...it.comprobante, numero: numeroCanonico(it.comprobante.numero) }
  const copia = { ...it, comprobante: c, leidoEn: it.leidoEn ?? AHORA.toISOString() }
  // Se vuelve a aplicar la conciliación con ARCA que ya está guardada en el ítem: el bloque trae el
  // total, el IVA y el neto que devolvió el padrón.
  if (it.arca?.estado === 'coincide') {
    aplicarArca(c, {
      estado: 'coincide', via: it.arca.via, numeroArca: it.arca.numero,
      total: it.arca.total, iva: it.arca.iva, neto: it.arca.neto, cae: it.arca.cae,
      emisorCuit: it.arca.emisorCuit, emisorNombre: it.arca.emisorNombre, fila: {},
    })
  }
  // El `posibleDuplicado` guardado lo calculó `buscarEnCompras` de AYER. Con el código de hoy, una
  // candidata que coincide en proveedor, fecha, importe Y correlativo deja de ser una pregunta: es la
  // misma fila. Se reevalúa con la MISMA función del módulo, nunca con una regla escrita acá.
  const d = it.posibleDuplicado
  if (d && mismoCorrelativo && numeroCanonico(c.numero) && d.numero
      && mismoCorrelativo(numeroCanonico(c.numero), numeroCanonico(d.numero))
      && d.fecha === c.fecha && Math.abs((d.total ?? 0) - (c.total ?? 0)) <= 0.5) {
    copia.yaCargado = { fila: d.fila, hoja: 'Compras', fuente: 'Compras', via: 'proveedor+fecha+importe+correlativo' }
    delete copia.posibleDuplicado
  }
  copia.clave = claveComprobante(c)?.clave ?? null
  return copia
})

const { items: unicos } = colapsarRepetidos(items, { ahora: AHORA })

// Un PAPEL = un nombre de archivo base. Es la unidad que le importa al dueño: cuántos de los siete
// papeles que sacó de la carpeta terminaron adentro.
const base = (n) => String(n ?? '').toLowerCase().replace(/\.[a-z0-9]+$/, '')
const papeles = new Map()
for (const it of unicos) {
  const nombres = new Set([base(it.origen?.nombre), ...(it.copias ?? []).map((c) => base(c.nombre))].filter(Boolean))
  const clave = [...nombres].sort()[0]
  const falta = faltantesDelChat(it, { ahora: AHORA })
  const entra = it.yaCargado ? 'YA ESTABA' : (estaCompleto(it, { ahora: AHORA }) ? 'ENTRA' : 'QUEDA AFUERA')
  const ya = papeles.get(clave)
  // Si un papel produjo más de una línea, la mejor manda para el conteo.
  const orden = { 'YA ESTABA': 2, ENTRA: 2, 'QUEDA AFUERA': 1 }
  if (!ya || orden[entra] > orden[ya.entra]) papeles.set(clave, { it, entra, falta })
}

console.log(`PAPELES DISTINTOS: ${papeles.size}   ·   líneas después de colapsar: ${unicos.length} (de ${items.length} lecturas)\n`)
let entran = 0; let identificables = 0
for (const [nombre, { it, entra, falta }] of [...papeles].sort()) {
  if (entra !== 'QUEDA AFUERA') entran++
  const id = identificar ? identificar(it).texto : null
  if (id) identificables++
  console.log(`${nombre.padEnd(10)} ${entra.padEnd(12)} ${(falta.map((f) => f.codigo).join(',') || '—').padEnd(22)} ${id ?? '(sin identificar)'}`)
}
console.log(`\nENTRAN: ${entran}/${papeles.size}   ·   IDENTIFICABLES en el mensaje: ${identificables}/${papeles.size}`)

// Y el otro número que importa: cuántas LÍNEAS quedan trabadas esperando una respuesta. Una línea
// trabada es un mensaje con una pregunta, y cada pregunta es trabajo manual del dueño.
const trabadas = unicos.filter((x) => !x.yaCargado && !estaCompleto(x, { ahora: AHORA }))
console.log(`LÍNEAS TRABADAS (preguntas al dueño): ${trabadas.length} de ${unicos.length}`)
for (const t of trabadas) {
  console.log(`   · ${identificar ? (identificar(t).texto ?? '(sin identificar)') : '(sin identificar)'} — ${faltantesDelChat(t, { ahora: AHORA }).map((f) => f.codigo).join(',')}`)
}
