// EL MISMO DOCUMENTO DOS VECES — y qué pasa cuando las dos copias NO dicen lo mismo.
//
// ═══ POR QUÉ ESTE ARCHIVO SE REESCRIBIÓ ═══
//
// La primera versión de estos tests armaba un `Map` a mano y le preguntaba a `yaEntroEnEstaCorrida`
// si el `Map` tenía la clave. O sea: verificaba su propio Map. Era un espejo — pasaba con la
// deduplicación rota, y de hecho pasó: el contrato de Quattropani entró dos veces y los tests
// estuvieron verdes todo el tiempo.
//
// Ahora la fuente es la real: se leen dos documentos con `leerDocumentoDeProyecto`, se los compara
// con `versionPreviaDe` y —lo que faltaba— se corre el CABLEADO entero con `ingerirTanda`, mirando
// lo que de verdad va a la biblioteca. Cada control tiene su caso negativo, y la mutación que lo
// pone rojo está escrita al lado. Ninguna estructura se arma a mano para después preguntarle a la
// función si la estructura es como se armó: eso es un espejo y es como pasó B1 entero.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hashDe } from '../lib/conocimiento/leer-archivo.mjs'
import { leerDocumentoDeProyecto } from '../lib/conocimiento/documento-proyecto.mjs'
import { conocimiento, hueco } from '../lib/conocimiento/biblioteca.mjs'
import {
  SOLAPE_MISMO_DOCUMENTO, claveDeFrase, conflictosDeVersion, relacionEntreDocumentos, soloLoNuevo,
  versionPreviaDe,
} from '../lib/conocimiento/documento-version.mjs'

import { ingerirTanda, yaEntroEnEstaCorrida } from './estudiar-documentos-word.mjs'

// ═══════════════ EL PAR REAL DE QUATTROPANI, CON SU DIFERENCIA DE VERDAD ═══════════════
//
// Las dos copias existen en Drive: un Google Doc nativo que este circuito EXPORTA a .docx, y un
// .docx subido a mano. Medido sobre `biblioteca.json`: 46 frases cada una, 45 idénticas carácter
// por carácter, y UNA que difiere — y la que difiere es la del saldo en dólares.
const COMUN = `CONTRATO DE LOCACIÓN DE OBRA

2. ALCANCE

La cotización aprobada forma parte integrante del presente contrato y comprende exclusivamente la ejecución de la mano de obra necesaria para la construcción de la obra.

5. PLAZO

El plazo estimado de ejecución de la obra es de ocho (8) meses a partir del inicio efectivo de los trabajos.

7. ADICIONALES

Los adicionales deberán ser aprobados por escrito por el locatario antes de su ejecución.

8. MUROS

Los paños de muros exteriores se ejecutan en ladrillón macizo de 20 cm asentados con mortero de cemento, cal y arena, según plano.
Todos los muros serán vistos. No se contempla revoques ni pintura en los muros.
Se instalarán dos (2) tanques de reserva de polietileno tricapa con una capacidad de 600 litros cada uno.

10. PROTOCOLO DE PREVISIÓN PARA FUTURO ENTREPISO

Se ratifica que las estructuras correspondientes al entrepiso como su escalera metálica asociada, quedan completamente excluidas de los trabajos a ejecutar por la empresa constructora en esta etapa.

11. ALCANCE CONTRACTUAL

El Locador tendrá a su exclusivo cargo la gestión integral de todas las tramitaciones técnicas y administrativas necesarias para la ejecución de la obra.
Atendiendo a las directrices sísmicas para zonas de alta peligrosidad (San Juan - Zona 4), los antepechos incorporarán un encadenado de refuerzo.
La empresa constructora ejecutará el contrapiso de hormigón pobre en un espesor de 12 cm sobre suelo compactado.
El hormigón de las bases será de calidad H-21 y su curado se realizará conforme a la norma vigente.
La provisión del agua de obra y la energía eléctrica de obra quedan a cargo del comitente.
No se incluye la provisión ni la colocación de aberturas de aluminio en el presente contrato.
Las tareas de limpieza final de obra están comprendidas dentro del precio convenido.
La cubierta se ejecuta con chapa trapezoidal calibre 25 sobre estructura metálica según plano.

12. CONDICIONES GENERALES

El replanteo de ejes y niveles será verificado por la dirección técnica antes de iniciar las excavaciones.
La excavación de las bases se ejecuta hasta la cota de fundación indicada en el plano de estructura.
El relleno y la compactación del terreno se realizarán en capas de 20 cm con control de densidad.
La instalación sanitaria interna se ejecuta con caños de polipropileno termofusión de 32 mm.
La instalación eléctrica se ejecuta bajo cañería embutida con conductores de cobre según reglamento.
Los pisos interiores se entregan con carpeta de nivelación lista para recibir el solado del comitente.
El cerco de obra y la cartelería reglamentaria son provistos por la empresa constructora.
Toda modificación al proyecto deberá constar por escrito y ser firmada por ambas partes.`

const SALDO_SIN_MONTO = '\n\n6. FORMA DE PAGO\n\nSaldo: será abonado mediante certificaciones quincenales de avance de obra, conforme al avance efectivamente ejecutado.'
const SALDO_CON_MONTO = '\n\n6. FORMA DE PAGO\n\nSaldo: el monto restante es de (U$S 31500 + IVA), el mismo será abonado mediante certificaciones quincenales de avance de obra, conforme a lo ejecutado.'

/** El .docx subido a mano. */
const elDocx = () => leerDocumentoDeProyecto(COMUN + SALDO_SIN_MONTO, { documento: 'CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA.docx' })
/** El Google Doc nativo, exportado. Mismo texto salvo el saldo, y RUIDO DE EXPORTACIÓN: espacio
 *  duro, corridas de espacios y composición Unicode distinta. Nada de eso es una diferencia. */
const elDocNativo = () => leerDocumentoDeProyecto(
  // Ruido de exportación REAL: espacio duro en vez de espacio, y composición Unicode descompuesta.
  (COMUN + SALDO_CON_MONTO).replace(/ /g, ' ').normalize('NFD'),
  { documento: 'CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA - ECSAS + Quattropani' },
)

test('el ruido de exportación NO es una diferencia, y una cifra distinta SÍ lo es', () => {
  // MUTACIÓN QUE LO PONE ROJO: sacarle el `.normalize('NFC')` o el colapso de espacios a
  // `claveDeFrase` — el Doc nativo deja de emparejar con el .docx y todo vuelve a duplicarse.
  assert.equal(claveDeFrase('Saldo:  será abonado.'.normalize('NFD')), claveDeFrase('Saldo: será abonado.'))
  // MUTACIÓN QUE LO PONE ROJO: agregarle un `.replace(/\d+/g,'')` o sacar acentos «para normalizar
  // más». Ahí «U$S 31500» y «U$S 3150» colapsan y la cláusula de plata desaparece.
  assert.notEqual(claveDeFrase('el monto restante es de (U$S 31500 + IVA)'), claveDeFrase('el monto restante es de (U$S 3150 + IVA)'))
  assert.notEqual(claveDeFrase('No se contempla revoques'), claveDeFrase('No se contemplan revoques'))
})

test('el Doc nativo exportado y el .docx son EL MISMO documento, aunque el hash difiera', () => {
  // Éste es el test que la versión anterior no tenía y por eso el contrato entró dos veces. La
  // deduplicación por bytes no puede verlo: son bytes distintos con el mismo contrato.
  const a = elDocx()
  const b = elDocNativo()
  assert.notEqual(JSON.stringify(a.hallazgos), JSON.stringify(b.hallazgos), 'si fueran idénticos, este test no probaría nada')
  const r = relacionEntreDocumentos(a, b)
  assert.equal(r.mismoDocumento, true, r.porQue)
  assert.ok(r.solape > SOLAPE_MISMO_DOCUMENTO, `solape ${r.solape}`)
  const v = versionPreviaDe(b, [a])
  assert.ok(v, 'la segunda copia tiene que reconocerse como versión de la primera')
  assert.equal(v.original.documento, 'CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA.docx')
})

test('NEGATIVO: dos contratos DISTINTOS que comparten el machote no son el mismo documento', () => {
  // La contraparte, y es la que impide que esto sea «todo es una versión de todo». Sin ella, subir
  // el umbral a 0 haría pasar el test de arriba y fusionaría dos obras distintas en una.
  const otro = leerDocumentoDeProyecto(
    COMUN.replace('ocho (8) meses', 'tres (3) meses')
      .replace('ladrillón macizo de 20 cm', 'bloque de hormigón de 19 cm')
      .replace('600 litros', '1100 litros')
      .replace(/quedan completamente excluidas.*$/m, 'quedan incluidas en esta etapa.')
      .replace('un encadenado de refuerzo', 'un dintel premoldeado')
      .replace('exclusivamente la ejecución de la mano de obra', 'la provisión de materiales y la mano de obra'),
    { documento: 'CONTRATO OTRA OBRA.docx' },
  )
  const r = relacionEntreDocumentos(elDocx(), otro)
  assert.equal(r.mismoDocumento, false, `solape ${r.solape}: ${r.porQue}`)
  assert.equal(versionPreviaDe(otro, [elDocx()]), null)
})

test('NEGATIVO: con pocas frases NO se compara, aunque el solape sea 1', () => {
  // Dos carátulas de dos frases idénticas darían 100 % y no son el mismo documento. El control tiene
  // que poder decir «no sé», no inventar una respuesta.
  const a = leerDocumentoDeProyecto('El plazo de obra es de ocho (8) meses.', { documento: 'a.docx' })
  const r = relacionEntreDocumentos(a, a)
  assert.equal(r.solape, 1)
  assert.equal(r.mismoDocumento, false)
  assert.match(r.porQue, /con tan pocas, el solape no significa nada/)
})

test('NEGATIVO: un anexo corto contenido ENTERO en el contrato no es otra versión suya', () => {
  // El agujero de medir contención: un pedazo del contrato da 100 % y no es una versión — tratarlo
  // como tal declararía las 20 cláusulas restantes del contrato como «divergencias», que es ruido
  // puro. MUTACIÓN QUE LO PONE ROJO: bajar `PROPORCION_MINIMA_DE_TAMANO` a 0.
  const largo = elDocx()
  // El anexo se arma con cláusulas REALES del contrato —las mismas frases, releídas por el mismo
  // lector—, que es exactamente el caso peligroso: un pedazo, no una versión.
  const anexo = leerDocumentoDeProyecto(
    largo.hallazgos.slice(0, 9).map((h) => h.textoLiteral).join('\n'),
    { documento: 'ANEXO I - Condiciones generales.docx' },
  )
  const r = relacionEntreDocumentos(largo, anexo)
  assert.ok(r.solape >= SOLAPE_MISMO_DOCUMENTO, `el anexo SÍ está contenido (${r.solape}): por eso hace falta la guarda de tamaño`)
  assert.equal(r.mismoDocumento, false)
  assert.match(r.porQue, /puede ser un pedazo del largo/)
})

test('las 45 frases comunes entran UNA vez: eso es deduplicar', () => {
  // Éste prueba `soloLoNuevo` SOLA. La mutación del CABLEADO la atrapa el test de `ingerirTanda`.
  const a = elDocx()
  const b = elDocNativo()
  const v = versionPreviaDe(b, [a])
  const soloNuevas = soloLoNuevo(b, v.relacion)
  assert.ok(a.hallazgos.length >= 8)
  assert.ok(soloNuevas.hallazgos.length < a.hallazgos.length, 'la versión no puede volver a aportar todo')
  // Y lo único que aporta es lo que de verdad difiere: la cláusula del saldo.
  assert.ok(soloNuevas.hallazgos.every((h) => /monto restante/.test(h.textoLiteral)), soloNuevas.hallazgos.map((h) => h.textoLiteral).join(' | '))
})

test('deduplicar NO es elegir una versión: la divergencia sale como CONFLICTO del dueño', () => {
  // Éste prueba `conflictosDeVersion` SOLA — que el script la llame lo prueba el de `ingerirTanda`.
  const a = elDocx()
  const b = elDocNativo()
  const v = versionPreviaDe(b, [a])
  const c = conflictosDeVersion({ original: a, nueva: b, relacion: v.relacion, hueco })
  assert.ok(c.length > 0, 'una divergencia entre dos versiones no puede resolverse en silencio')
  assert.ok(c.every((h) => h.tipo === 'CONFLICTO'))
  assert.ok(c.every((h) => h.quienLoTiene === 'el dueño'), 'qué versión rige es una decisión contractual')
  const saldo = c.find((h) => /31500/.test(h.porQue))
  assert.ok(saldo, `la cláusula que difiere tiene que estar declarada: ${c.map((x) => x.porQue.slice(0, 60)).join(' | ')}`)
  // Y con las DOS fuentes nombradas: un conflicto sin las dos partes no se puede resolver.
  assert.deepEqual([...saldo.fuentesEnConflicto].sort(), [
    'CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA - ECSAS + Quattropani',
    'CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA.docx',
  ].sort())
})

test('la copia byte a byte se sigue atajando antes, sin leerla', () => {
  // El hash de bytes no cubre el caso de arriba, pero sí el suyo: dos rutas con el MISMO archivo.
  // Encontró uno real (`PLANTILLA PARA INFORME.docx`). Se conserva porque es más barato: ataja antes
  // de interpretar.
  //
  // El `Map` se construye como lo construye el bucle —`vistos.set(hash, nombre)` sobre el hash real
  // de los bytes— y no a mano: la versión anterior de este test armaba el Map con la clave que
  // quería y le preguntaba si estaba, o sea verificaba su propio Map.
  const bytesA = Buffer.from('PK\u0003\u0004 el contenido de la plantilla', 'utf8')
  const bytesB = Buffer.from('PK\u0003\u0004 otro contenido distinto', 'utf8')
  const vistos = new Map()
  assert.equal(yaEntroEnEstaCorrida(hashDe(bytesA), vistos), null, 'la primera vez no hay con qué comparar')
  vistos.set(hashDe(bytesA), 'PLANTILLA PARA INFORME.docx')
  // La MISMA copia bajo otra ruta: los bytes son los mismos, así que el hash es el mismo.
  assert.equal(yaEntroEnEstaCorrida(hashDe(Buffer.from(bytesA)), vistos), 'PLANTILLA PARA INFORME.docx')
  assert.equal(yaEntroEnEstaCorrida(hashDe(bytesB), vistos), null, 'contenido distinto: no se deduplica')
  assert.equal(yaEntroEnEstaCorrida(null, vistos), null, 'sin hash no se adivina')
})

test('importar este script NO corre la ingesta: la guarda de ejecución directa existe', () => {
  const fuente = readFileSync(new URL('./estudiar-documentos-word.mjs', import.meta.url), 'utf8')
  assert.match(fuente, /const ejecutadoDirecto = process\.argv\[1\] && import\.meta\.url === pathToFileURL/)
  assert.ok(!/^main\(\)/m.test(fuente), 'main() no puede invocarse en el tope del módulo')
})

// ═══════════════ EL CABLEADO, QUE ES DONDE VIVÍAN LAS MUTACIONES SOBREVIVIENTES ═══════════════
//
// Los tests de arriba ejercitan las cuatro funciones por separado y las cuatro estaban bien. Las
// tres mutaciones que reintroducen B1 ENTERO viven en cómo se las llama, y sobrevivieron con la
// suite en verde: con una de ellas la cláusula de U$S 31.500 desaparecía del artefacto.
//
// `ingerirTanda` es el cableado extraído del bucle del comando. Estos tests miran lo que de verdad
// va a la biblioteca —`candidatos` y `huecos`—, no lo que devuelven las piezas.

/** Los constructores reales de la biblioteca: si el conocimiento o el hueco no se pueden construir,
 *  tampoco entran. Usar dobles acá volvería a ser un espejo. */
const constructores = { conocimiento, hueco }

test('CABLEADO: la segunda versión no vuelve a grabar las frases comunes', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `ingerirLectura`, `const interpretacion = lectura` (o sea, pasar
  // la lectura entera en vez de `soloLoNuevo(...)`). Probado: sin este test daba verde.
  const solaA = ingerirTanda([elDocx()], constructores)
  const ambas = ingerirTanda([elDocx(), elDocNativo()], constructores)
  assert.ok(solaA.candidatos.length >= 8)
  // La segunda versión sólo puede sumar lo que ella agrega: UNA cláusula, la del saldo.
  assert.equal(ambas.candidatos.length, solaA.candidatos.length + 1,
    `la segunda versión agregó ${ambas.candidatos.length - solaA.candidatos.length} conocimiento(s) en vez de 1`)
  const delSaldo = ambas.candidatos.filter((k) => /monto restante/.test(k.afirmacion))
  assert.equal(delSaldo.length, 1)
  // Y ninguna CLAVE puede repetirse en lo que va a la biblioteca. Se mide por clave y no por
  // afirmación a propósito: una misma frase que cae en dos categorías produce dos conocimientos con
  // claves distintas, y eso es diseño —«no se contempla revoques» es exclusión Y criterio técnico—.
  const repetidas = [...ambas.candidatos.reduce((m, k) => m.set(k.clave, (m.get(k.clave) ?? 0) + 1), new Map())]
    .filter(([, n]) => n > 1)
  assert.deepEqual(repetidas.map(([c]) => c), [], `${repetidas.length} clave(s) entraron dos veces`)
  // Y la frase común no puede aparecer bajo los DOS documentos: ése era el duplicado de 46 + 46.
  const bajoDosDocs = ambas.candidatos.filter((k) => /No se contempla revoques/.test(k.afirmacion))
    .map((k) => k.clave.split('.')[1])
  assert.equal(new Set(bajoDosDocs).size, 1, `la misma frase quedó bajo ${new Set(bajoDosDocs).size} documentos`)
})

test('CABLEADO: la divergencia sale como hueco CONFLICTO, con la obra en la clave', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `ingerirLectura`, `const huecos = []`. Con ella la cláusula de
  // U$S 31.500 desaparece del artefacto y —hasta este test— la suite seguía verde.
  const r = ingerirTanda([elDocx(), elDocNativo()], constructores)
  const conflictos = r.huecos.filter((h) => h.tipo === 'CONFLICTO')
  assert.equal(conflictos.length, 2, 'las dos redacciones del saldo, una por versión')
  const saldo = conflictos.find((h) => /31500/.test(h.porQue))
  assert.ok(saldo, `la cláusula que difiere tiene que llegar al artefacto: ${conflictos.map((h) => h.porQue.slice(0, 50)).join(' | ')}`)
  assert.equal(saldo.quienLoTiene, 'el dueño')
  // La clave nombra el DOCUMENTO: dos obras con la misma cláusula divergente colisionaban.
  assert.ok(saldo.clave.includes('contrato-de-obra-y-memoria-descriptiva'), saldo.clave)
})

test('CABLEADO: sin versión previa no se inventa ni deduplicación ni conflicto', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `ingerirLectura`, `const v = vistas[0] ?? null` — o sea, tratar a
  // cualquier documento anterior como versión. La contraparte de los dos de arriba: el cableado
  // tiene que PODER no hacer nada.
  const otro = leerDocumentoDeProyecto(
    COMUN.replace('ocho (8) meses', 'tres (3) meses')
      .replace('ladrillón macizo de 20 cm', 'bloque de hormigón de 19 cm')
      .replace('600 litros', '1100 litros')
      .replace(/quedan completamente excluidas.*$/m, 'quedan incluidas en esta etapa.')
      .replace('un encadenado de refuerzo', 'un dintel premoldeado')
      .replace('exclusivamente la ejecución de la mano de obra', 'la provisión de materiales y la mano de obra')
      .replace('espesor de 12 cm', 'espesor de 15 cm')
      .replace('calidad H-21', 'calidad H-30')
      .replace('a cargo del comitente', 'a cargo de la empresa constructora')
      .replace('chapa trapezoidal calibre 25', 'losa de hormigón armado'),
    { documento: 'OTRA OBRA.docx' },
  )
  const r = ingerirTanda([elDocx(), otro], constructores)
  assert.equal(r.versiones.length, 0)
  assert.equal(r.huecos.filter((h) => h.tipo === 'CONFLICTO').length, 0)
  const sueltos = ingerirTanda([elDocx()], constructores).candidatos.length + ingerirTanda([otro], constructores).candidatos.length
  assert.equal(r.candidatos.length, sueltos, 'dos documentos distintos aportan todo lo suyo')
})

test('CABLEADO: si el defecto vuelve, vuelve por el ORDEN — y el resultado no puede depender de él', () => {
  // LÍMITE CONOCIDO, declarado acá para que no se descubra de nuevo: la deduplicación es POR
  // CORRIDA y el almacén acumula por slug del NOMBRE. Dentro de una corrida el orden no puede
  // cambiar cuántas frases entran; entre corridas, si Drive devuelve el otro archivo primero, las
  // frases entran bajo el otro slug y el duplicado vuelve. Eso NO lo resuelve este cableado.
  const ab = ingerirTanda([elDocx(), elDocNativo()], constructores)
  const ba = ingerirTanda([elDocNativo(), elDocx()], constructores)
  assert.equal(ab.candidatos.length, ba.candidatos.length, 'el orden no puede cambiar cuánto entra')
  assert.equal(ab.huecos.length, ba.huecos.length)
  // Y lo que SÍ cambia con el orden —bajo qué documento quedan las frases comunes— queda escrito:
  assert.notDeepEqual(ab.candidatos.map((k) => k.clave).sort(), ba.candidatos.map((k) => k.clave).sort())
})
