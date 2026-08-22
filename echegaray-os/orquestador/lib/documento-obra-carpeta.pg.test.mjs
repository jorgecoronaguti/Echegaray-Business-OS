// EL DOCUMENTO DE LA OBRA SALE DE LA CARPETA DE DRIVE — T6500.
//
// Cada test reproduce un DEFECTO concreto; revertir la migración lo pone en rojo:
//
//   · `obra_documento` con 0 filas mientras la carpeta de Drive de la obra tiene 32 archivos
//     indexados — la obra muestra «sin documentos» teniendo el data room completo;
//   · el descenso recursivo ingenuo le regala a `san-francisco` los papeles de las tres obras cuyas
//     carpetas viven ADENTRO de la suya (medido en la base viva, no supuesto);
//   · la carpeta que declaran DOS obras (`bsa-planta` y `bsa-adicional`) usada como si identificara
//     a una;
//   · una segunda corrida duplicando o pisando lo que una persona ya había confirmado;
//   · y las subcarpetas entrando a la lista de documentos junto con sus propios archivos.
//
// Todo en UNA transacción que aplica el .sql y termina en ROLLBACK: la base viva no se toca. La
// corrida real la decide quien integra.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'
import { aplicarMigracionesDeVinculacion } from './vinculacion-migraciones.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

/** El árbol de Drive sembrado, que copia la forma REAL del data room:
 *
 *   zz-f-madre                (carpeta de la obra zz-madre)
 *     ├── zz-a1, zz-a2        archivos sueltos
 *     ├── zz-f-sub            subcarpeta común
 *     │     └── zz-a3
 *     └── zz-f-hija           ¡carpeta de OTRA obra! (como pisos-industriales dentro de san-francisco)
 *           └── zz-a4
 *   zz-f-compartida           declarada por zz-gemela-a Y zz-gemela-b
 *     └── zz-a5
 */
async function sembrarDrive(q) {
  const nodos = [
    ['zz-f-madre', 'ZZ Madre', 'zz/madre', true, null],
    ['zz-a1', 'ZZ Contrato.pdf', 'zz/madre/ZZ Contrato.pdf', false, 'zz-f-madre'],
    ['zz-a2', 'ZZ Plano.pdf', 'zz/madre/ZZ Plano.pdf', false, 'zz-f-madre'],
    ['zz-f-sub', 'ZZ Certificados', 'zz/madre/Certificados', true, 'zz-f-madre'],
    ['zz-a3', 'ZZ Cert 1.pdf', 'zz/madre/Certificados/ZZ Cert 1.pdf', false, 'zz-f-sub'],
    ['zz-f-hija', 'ZZ Hija', 'zz/madre/hija', true, 'zz-f-madre'],
    ['zz-a4', 'ZZ Presupuesto hija.pdf', 'zz/madre/hija/ZZ Presupuesto hija.pdf', false, 'zz-f-hija'],
    ['zz-f-compartida', 'ZZ Compartida', 'zz/compartida', true, null],
    ['zz-a5', 'ZZ Acta.pdf', 'zz/compartida/ZZ Acta.pdf', false, 'zz-f-compartida'],
  ]
  for (const [id, name, path, carpeta, padre] of nodos) {
    await q(`insert into drive_index (drive_file_id, name, path, is_folder, parent_id, mime_type)
             values ($1,$2,$3,$4,$5,$6)`,
    [id, name, path, carpeta, padre, carpeta ? 'application/vnd.google-apps.folder' : 'application/pdf'])
  }
  for (const [id, nombre, carpeta] of [
    ['zz-madre', 'ZZ Obra Madre', 'zz-f-madre'],
    ['zz-hija', 'ZZ Obra Hija', 'zz-f-hija'],
    ['zz-gemela-a', 'ZZ Gemela A', 'zz-f-compartida'],
    ['zz-gemela-b', 'ZZ Gemela B', 'zz-f-compartida'],
  ]) {
    await q(`insert into obra_canonica (id, nombre, estado, drive_carpeta_id)
             values ($1,$2,'activa',$3)`, [id, nombre, carpeta])
  }
}

const archivosDe = async (q, obra) => (await q(
  'select drive_file_id from obra_documento where obra_id=$1 order by drive_file_id', [obra]))
  .map((r) => r.drive_file_id)

test('documento → obra por carpeta de Drive — T6500 aplicada en transacción', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  const vincular = (obra) => uno('select * from vincular_documentos_por_carpeta($1)', [obra])
  try {
    await c.query('begin')
    await aplicarMigracionesDeVinculacion(c)
    await sembrarDrive(q)

    await t.test('T6500 · los archivos de la carpeta de la obra se vinculan, con origen declarado', async () => {
      // ÉSTE es el defecto de fondo: obra_documento con 0 filas y 32 archivos indexados.
      const r = await vincular('zz-madre')
      assert.equal(r.vinculados, 3, 'no vinculó los tres archivos que cuelgan de su carpeta')
      assert.deepEqual(await archivosDe(q, 'zz-madre'), ['zz-a1', 'zz-a2', 'zz-a3'])
      const o = await uno(`select distinct origen from obra_documento where obra_id='zz-madre'`)
      assert.equal(o.origen, 'carpeta_drive', 'el vínculo no dice de dónde salió')
    })

    await t.test('T6500 · la carpeta de otra obra CORTA el descenso', async () => {
      // Sin el corte, zz-madre se quedaría con zz-a4 —el papel de la obra de adentro— y su carpeta
      // de documentos mentiría sin dar ningún error. Es el caso real de san-francisco, que contiene
      // las carpetas de entrepiso-y-escalera, pisos-industriales e instalacion-electrica.
      assert.ok(!(await archivosDe(q, 'zz-madre')).includes('zz-a4'),
        'se llevó el documento de la obra que vive adentro de su carpeta')
      const r = await vincular('zz-hija')
      assert.equal(r.vinculados, 1)
      assert.deepEqual(await archivosDe(q, 'zz-hija'), ['zz-a4'])
    })

    await t.test('T6500 · las subcarpetas no son documentos', async () => {
      const carpetas = await q(
        `select drive_file_id from obra_documento where drive_file_id in ('zz-f-sub','zz-f-hija')`)
      assert.equal(carpetas.length, 0, 'vinculó carpetas: la lista mostraría dos veces lo mismo')
    })

    await t.test('T6500 · una carpeta que declaran dos obras NO identifica a ninguna', async () => {
      // bsa-planta y bsa-adicional comparten drive_carpeta_id en la base viva. Ahí la carpeta deja
      // de ser evidencia: se marca ambiguo y se confirma a mano.
      const r = await vincular('zz-gemela-a')
      assert.equal(r.vinculados, 0, 'vinculó con una carpeta que es de dos obras a la vez')
      assert.equal(r.ambiguos, 1)
      assert.deepEqual(await archivosDe(q, 'zz-gemela-a'), [])
      const cand = await uno(
        `select ambiguo, evidencia from obra_documento_candidato
          where obra_id='zz-gemela-a' and drive_file_id='zz-a5'`)
      assert.equal(cand.ambiguo, true, 'el candidato no queda marcado como ambiguo')
      assert.match(cand.evidencia, /dentro de la carpeta de Drive de la obra/)
    })

    await t.test('T6500 · re-ejecutable: la segunda corrida no duplica ni suma', async () => {
      const r = await vincular('zz-madre')
      assert.equal(r.vinculados, 0, 'volvió a contar como nuevos los que ya estaban')
      assert.equal(r.ya_estaban, 3)
      assert.deepEqual(await archivosDe(q, 'zz-madre'), ['zz-a1', 'zz-a2', 'zz-a3'])
    })

    await t.test('T6500 · no pisa lo que una persona ya confirmó', async () => {
      await q(`insert into obra_documento (obra_id, drive_file_id, nombre, rol, origen)
               values ('zz-hija','zz-a4','ZZ Presupuesto hija.pdf','contrato','confirmado')
               on conflict (obra_id, drive_file_id)
               do update set origen='confirmado', rol='contrato'`)
      await vincular('zz-hija')
      const d = await uno(
        `select origen, rol from obra_documento where obra_id='zz-hija' and drive_file_id='zz-a4'`)
      assert.equal(d.origen, 'confirmado', 'degradó a carpeta_drive un vínculo afirmado por una persona')
      assert.equal(d.rol, 'contrato', 'le borró el rol que había escrito una persona')
    })

    await t.test('T6500 · sobre las carpetas REALES, ningún archivo es evidencia de dos obras', async () => {
      // Esto se mide sobre el Drive real —no sembrado— y es LECTURA: la vista no escribe.
      //
      // El invariante es el que hace que la evidencia signifique algo: un archivo puede ser
      // candidato de una sola obra, salvo que la carpeta esté compartida, y en ese caso las dos
      // filas van marcadas `ambiguo`. Si alguien saca el corte de la recursión, los archivos de
      // pisos-industriales pasan a ser candidatos NO ambiguos de san-francisco también, y esta
      // aserción se pone roja con nombre y apellido.
      const choques = await q(`
        select drive_file_id, count(distinct obra_id) as obras
          from obra_documento_candidato
         where not ambiguo
         group by drive_file_id
        having count(distinct obra_id) > 1
         limit 5`)
      assert.deepEqual(choques, [],
        `hay archivos reclamados por dos obras sin declararse ambiguos: ${JSON.stringify(choques)}`)
    })
  } finally {
    await c.query('rollback')
    c.release()
  }
})
