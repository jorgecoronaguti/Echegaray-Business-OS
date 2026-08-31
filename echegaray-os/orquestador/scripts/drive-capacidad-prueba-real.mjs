#!/usr/bin/env node
// PRUEBA REAL DE LA CAPACIDAD DE DRIVE — contra Drive de verdad, no contra un doble.
//
// Crea SU PROPIA carpeta temporal, hace ahí adentro el ciclo completo (crear · subir · leer ·
// buscar · renombrar · copiar · mover · exportar · descargar · revisiones · idempotencia),
// corre los negativos que tienen que dar rojo, y al final manda la carpeta a la papelera.
//
// NO TOCA NADA DE PRODUCCIÓN. No lee ni escribe el «Flujo de Caja - Cash Flow» ni ninguna
// pestaña existente: todo lo que toca lo creó esta misma corrida.
//
//   node orquestador/scripts/drive-capacidad-prueba-real.mjs [--conservar]
//
// `--conservar` deja la carpeta sin archivar, para poder mirarla en Drive con los ojos.

import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { operadorEmail, getTokenFor } from '../lib/google-oauth.mjs'
import { crearCapacidadDrive, CODIGO, crearAuditorEnMemoria, crearLectura, crearEscritura } from '../lib/drive/index.mjs'

const CONSERVAR = process.argv.includes('--conservar')
const sello = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const RAIZ = `_XSAS-PRUEBA-DRIVE-${sello}`

let pasos = 0, fallas = 0
const p = (t, extra = '') => { pasos++; console.log(`  ${String(pasos).padStart(2)}. ${t}${extra ? ' → ' + extra : ''}`) }
const mal = (t) => { fallas++; console.error(`  ✖ ${t}`) }

/** Un negativo sólo cuenta si DA ROJO por el motivo esperado. */
async function debeFallar(titulo, codigoEsperado, fn) {
  try {
    const r = await fn()
    mal(`${titulo}: NO falló (devolvió ${JSON.stringify(r).slice(0, 120)}) — el control no puede dar rojo`)
  } catch (e) {
    if (e?.codigo === codigoEsperado) p(`${titulo}`, `${e.codigo} ✓`)
    else mal(`${titulo}: falló con ${e?.codigo ?? e?.message} y se esperaba ${codigoEsperado}`)
  }
}

async function main() {
  // LA IDENTIDAD TIENE QUE SER UNA SOLA. `google.mjs` crea/copia/renombra/mueve/archiva con
  // `ownerToken()` (la cuenta operadora, que sí tiene cuota) y LEE con `accessToken()`. Con el
  // cliente institucional (service account) eso significa crear en el Drive del dueño y después
  // no poder releerlo: la verificación es imposible por construcción. Se arma el cliente COMO LA
  // CUENTA OPERADORA —el mismo patrón que usa handlers/operation_execute.mjs para lo aprobado—
  // y ahí las dos puntas son la misma persona.
  const operador = await operadorEmail()
  if (!operador) { console.error('sin cuenta operadora autorizada: no se puede probar la escritura'); process.exit(1) }
  console.log(`identidad de la corrida: ${operador}`)
  const google = makeGoogleClient({ config: loadConfig(), scopes: WORKSPACE_SCOPES, getToken: getTokenFor(operador) })
  const auditor = crearAuditorEnMemoria({ actor: 'script:prueba-real' })
  // Sin `db`: la migración de orq.drive_audit todavía no está aplicada. El auditor en memoria
  // prueba que la capacidad AUDITA; que la fila llegue a Postgres se prueba aparte.
  const drive = crearCapacidadDrive({ google, auditor, actor: 'script:prueba-real', actorTipo: 'sistema' })

  console.log(`\n═══ CREATE ═══`)
  const raiz = await drive.crearCarpeta({ nombre: RAIZ })
  p('crear carpeta raíz', `${raiz.referencia.file_id} "${raiz.referencia.name}"`)
  const sub = await drive.crearCarpeta({ nombre: 'subcarpeta', padre: raiz.referencia.file_id })
  p('crear subcarpeta', `${sub.referencia.file_id} parents=${JSON.stringify(sub.referencia.parents)}`)
  const doc = await drive.crearNativo({ nombre: 'informe', tipo: 'doc', padre: raiz.referencia.file_id })
  p('crear Doc nativo', `${doc.referencia.file_id} mime=${doc.referencia.mime_type}`)
  const hoja = await drive.crearNativo({ nombre: 'planilla-de-prueba', tipo: 'sheet', padre: raiz.referencia.file_id })
  p('crear Sheet nativo VACÍO (propio, no de producción)', hoja.referencia.file_id)

  const contenido = Buffer.from('remito de prueba de la capacidad de Drive\n', 'utf8')
  const subido = await drive.subir({
    nombre: 'remito.txt', contenido_base64: contenido.toString('base64'),
    mime_type: 'text/plain', padre: raiz.referencia.file_id,
  })
  p('subir archivo', `${subido.referencia.file_id} size=${subido.referencia.size_bytes} hash=${subido.referencia.hash}`)

  console.log(`\n═══ READ ═══`)
  const ref = await drive.referencia(subido.referencia.file_id)
  p('metadata por ID', `parents=${JSON.stringify(ref.parents)} trashed=${ref.trashed} rev=${ref.revision_id}`)
  if (!ref.parents.includes(raiz.referencia.file_id)) mal('el parents leído no es el esperado')
  if (ref.hash == null) mal('un archivo subido tiene que tener hash')

  const listado = await drive.listarCarpeta(raiz.referencia.file_id)
  p('listar carpeta', `${listado.count} items: ${listado.items.map((i) => i.name).join(', ')}`)

  const porNombre = await drive.buscarPorNombre('remito.txt', { enCarpeta: raiz.referencia.file_id })
  p('buscar por nombre dentro de la carpeta', `${porNombre.length} → ${porNombre[0]?.file_id}`)

  const porMeta = await drive.buscarPorMetadata({ enCarpeta: raiz.referencia.file_id, mimeType: 'text/plain' })
  p('buscar por metadata (mime + carpeta)', `${porMeta.length} → ${porMeta.map((f) => f.name).join(', ')}`)

  const revs = await drive.revisiones(subido.referencia.file_id)
  p('revisiones', `${revs.length} (última ${revs[revs.length - 1]?.modifiedTime ?? '—'})`)

  const bajado = await drive.descargar(subido.referencia.file_id)
  p('descargar bytes', `${bajado.bytes.length} bytes, iguales al original: ${bajado.bytes.equals(contenido)}`)
  if (!bajado.bytes.equals(contenido)) mal('lo descargado no es lo subido')

  const pdfMem = await drive.exportar(doc.referencia.file_id, 'pdf')
  p('exportar Doc a PDF en memoria', `${pdfMem.bytes.length} bytes, empieza con %PDF: ${pdfMem.bytes.subarray(0, 4).toString() === '%PDF'}`)

  console.log(`\n═══ MANAGEMENT ═══`)
  const renombrado = await drive.renombrar({ file_id: subido.referencia.file_id, nombre: 'remito-0001.txt' })
  p('renombrar (verificado releyendo)', `"${renombrado.antes.name}" → "${renombrado.referencia.name}"`)

  const copia = await drive.copiar({ file_id: subido.referencia.file_id, nombre: 'remito-0001 (copia).txt', destino: sub.referencia.file_id })
  p('copiar a la subcarpeta', `${copia.referencia.file_id} parents=${JSON.stringify(copia.referencia.parents)}`)

  const movido = await drive.mover({ file_id: subido.referencia.file_id, destino: sub.referencia.file_id })
  p('mover (verificado releyendo parents)', `${JSON.stringify(movido.antes.parents)} → ${JSON.stringify(movido.referencia.parents)}`)

  const pdfDrive = await drive.exportarADrive({ file_id: doc.referencia.file_id, formato: 'pdf', destino: raiz.referencia.file_id })
  p('exportar a PDF y dejarlo en Drive', `${pdfDrive.referencia.file_id} "${pdfDrive.referencia.name}"`)

  console.log(`\n═══ IDEMPOTENCIA (retry duplicado) ═══`)
  const clave = `prueba-idem-${sello}`
  const i1 = await drive.crearNativo({ nombre: 'Informe agosto', tipo: 'doc', padre: raiz.referencia.file_id, clave_idempotencia: clave })
  const i2 = await drive.crearNativo({ nombre: 'Informe agosto', tipo: 'doc', padre: raiz.referencia.file_id, clave_idempotencia: clave })
  p('crear dos veces con la misma clave', `${i1.referencia.file_id} vs ${i2.referencia.file_id} · idempotente=${i2.idempotente}`)
  if (i1.referencia.file_id !== i2.referencia.file_id) mal('EL RETRY DUPLICÓ: dos archivos distintos con la misma clave')
  const conEseNombre = await drive.buscarPorMetadata({ enCarpeta: raiz.referencia.file_id, nombreExacto: 'Informe agosto' })
  p('cuántos "Informe agosto" quedaron en la carpeta', String(conEseNombre.length))
  if (conEseNombre.length !== 1) mal(`quedaron ${conEseNombre.length} — la idempotencia no sirvió`)

  const copiaSinClave = await drive.copiar({ file_id: i1.referencia.file_id, nombre: 'Informe agosto (duplicado a mano)', destino: raiz.referencia.file_id })
  p('la copia NO hereda la clave del original', `idempotency_key de la copia = ${JSON.stringify(copiaSinClave.referencia.idempotency_key)}`)
  if (copiaSinClave.referencia.idempotency_key != null) mal('la copia heredó la clave: fingiría ser esa operación')

  console.log(`\n═══ NEGATIVOS — cada uno tiene que DAR ROJO ═══`)
  await debeFallar('file inexistente', CODIGO.NOT_FOUND, () => drive.referencia('1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'))
  await debeFallar('file_id incorrecto (id de otra cosa, mal copiado)', CODIGO.NOT_FOUND,
    () => drive.renombrar({ file_id: 'no-es-un-id', nombre: 'x' }))
  await debeFallar('destino equivocado: mover a un ARCHIVO, no a una carpeta', CODIGO.INVALID_ARGUMENT,
    () => drive.mover({ file_id: copia.referencia.file_id, destino: doc.referencia.file_id }))
  await debeFallar('formato no soportado: exportar un .txt', CODIGO.UNSUPPORTED_OPERATION,
    () => drive.exportar(copia.referencia.file_id, 'pdf'))
  await debeFallar('formato no soportado: guardar en Drive como xlsx', CODIGO.UNSUPPORTED_OPERATION,
    () => drive.exportarADrive({ file_id: hoja.referencia.file_id, formato: 'xlsx' }))
  await debeFallar('borrado definitivo (Nivel F)', CODIGO.FORBIDDEN, () => drive.borrarDefinitivo({ file_id: doc.referencia.file_id }))

  // CARPETA EN LA PAPELERA: el defecto histórico es que se lee VACÍA y sin error.
  const papelera = await drive.crearCarpeta({ nombre: 'carpeta-que-va-a-la-papelera', padre: raiz.referencia.file_id })
  await drive.crearNativo({ nombre: 'adentro', tipo: 'doc', padre: papelera.referencia.file_id })
  const crudo = await google.listFolder(papelera.referencia.file_id)
  p('ANTES de archivarla, google.listFolder ve', `${crudo.length} archivo(s)`)
  await drive.archivar({ file_id: papelera.referencia.file_id })
  const crudoDespues = await google.listFolder(papelera.referencia.file_id)
  // MEDIDO en dos corridas seguidas: la primera devolvió 1 y la segunda 0. Drive propaga la
  // papelera a los hijos de forma diferida, así que el listado crudo de una carpeta archivada es
  // NO DETERMINÍSTICO — y en los dos casos contesta 200 sin decir nada. Sobre eso no se puede
  // afirmar "no hay archivos": hay que mirar la carpeta, que es lo que hace la capacidad.
  p('DESPUÉS de archivarla, google.listFolder crudo ve', `${crudoDespues.length} archivo(s), sin error — el listado crudo no distingue viva de archivada`)
  await debeFallar('la capacidad, en cambio, dice que está en la papelera', CODIGO.TRASHED,
    () => drive.listarCarpeta(papelera.referencia.file_id))
  await debeFallar('y no deja crear adentro de una carpeta archivada', CODIGO.TRASHED,
    () => drive.crearNativo({ nombre: 'no', tipo: 'doc', padre: papelera.referencia.file_id }))

  // LA VERIFICACIÓN TIENE QUE PODER DAR ROJO CONTRA DRIVE DE VERDAD, no sólo contra un doble.
  // Un control que en producción siempre da verde no es un control: este repo ya encontró uno que
  // era literalmente una constante y escondía $4,1 M.
  const escrituraCruda = crearEscritura({ google, lectura: crearLectura({ google }), esperaVerificacionMs: 300 })
  await debeFallar('la verificación contra Drive real DA ROJO cuando lo leído no coincide', CODIGO.VERIFY_FAILED,
    () => escrituraCruda._verificar(doc.referencia.file_id, { name: 'un nombre que este archivo no tiene' }, ['name']))
  try {
    const verde = await escrituraCruda._verificar(doc.referencia.file_id, { name: doc.referencia.name }, ['name'])
    p('...y DA VERDE con el nombre real (si no, el rojo de arriba no probaría nada)', `"${verde.name}"`)
  } catch (e) { mal(`la verificación da rojo hasta con el valor correcto: ${e.message}`) }

  // PERMISSION DENIED, contra Google de verdad: un token inválido tiene que salir clasificado
  // como "falta autorizar", no como "Drive está caído" ni como un Error crudo.
  const conTokenMuerto = crearCapacidadDrive({
    google: makeGoogleClient({ config: loadConfig(), scopes: WORKSPACE_SCOPES, getToken: async () => 'ya29.token-invalido-a-proposito' }),
    actor: 'script:prueba-real',
  })
  await debeFallar('credencial inválida contra Google real', CODIGO.PERMISSION_REQUIRED,
    () => conTokenMuerto.referencia(doc.referencia.file_id))

  // REVISIÓN VIEJA / INEXISTENTE: pedir una revisión que no existe no puede devolver la actual.
  try {
    await google.exportarRevision(doc.referencia.file_id, 'revision-que-no-existe')
    mal('revisión inexistente: devolvió algo en vez de fallar')
  } catch (e) { p('revisión inexistente', `falla: ${String(e.message).slice(0, 70)}`) }

  console.log(`\n═══ AUDITORÍA ═══`)
  console.log(`  ${auditor.filas.length} filas registradas. Últimas tres:`)
  for (const f of auditor.filas.slice(-3)) {
    const corto = (x) => (x == null ? 'null' : JSON.stringify({ name: x.name, parents: x.parents, trashed: x.trashed }))
    console.log(`    ${f.ocurrido_en} · ${f.operacion} · ${f.referencia.file_id}`)
    console.log(`       verificó ${JSON.stringify(f.verificado_campos)} · antes=${corto(f.antes)} · después=${corto(f.despues)}`)
  }

  console.log(`\n═══ LIMPIEZA ═══`)
  if (CONSERVAR) {
    console.log(`  --conservar: la carpeta queda viva → https://drive.google.com/drive/folders/${raiz.referencia.file_id}`)
  } else {
    const baja = await drive.archivar({ file_id: raiz.referencia.file_id })
    p('carpeta de prueba a la papelera (verificado)', `trashed=${baja.referencia.trashed}`)
    const releida = await drive.referencia(raiz.referencia.file_id)
    if (!releida.trashed) mal('la carpeta de prueba NO quedó archivada')
  }

  console.log(`\n${fallas === 0 ? '✔' : '✖'} ${pasos} pasos, ${fallas} fallas\n`)
  process.exit(fallas === 0 ? 0 : 1)
}

main().catch((e) => { console.error('\n✖ la corrida murió:', e?.codigo ?? '', e?.message ?? e); process.exit(1) })
