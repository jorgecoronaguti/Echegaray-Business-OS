// LO QUE LA ACCIÓN QUE REGISTRA EL DOCUMENTO TIENE QUE RECHAZAR, Y EL CONTRATO CON LA BASE.
//
// La Server Action no se puede llamar desde `node --test` —necesitaría sesión, cliente de Supabase y
// la tabla—, así que sus tres controles viven en `revisarAlta`, que es pura. Y lo que la app cree
// que la base acepta se comprueba contra el archivo de migración: si las dos listas se separan, el
// rechazo deja de ser una frase y pasa a ser un error de constraint que nadie entiende.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CATEGORIAS_POR_TIPO, MAX_BYTES, revisarAlta, rutaDeObjeto } from './subidaDeDocumento.ts'

const UID = '11111111-1111-4111-8111-111111111111'
const OTRO = '99999999-9999-4999-8999-999999999999'
const AID = '22222222-2222-4222-8222-222222222222'

const ruta = (uid: string, tipo: 'obra' | 'persona' | 'cliente' | 'proveedor', id: string) =>
  rutaDeObjeto({ uid, tipo, entidadId: id, id: AID, nombre: 'p.pdf' })

test('el alta buena pasa', () => {
  const r = revisarAlta(
    { tipo: 'obra', entidadId: 'quattropani', categoria: 'plano', storagePath: ruta(UID, 'obra', 'quattropani') },
    UID,
  )
  assert.equal(r.ok, true)
})

// EL ARIETE: mandar el `storage_path` del papel de OTRA obra y verlo aparecer en la ficha propia.
test('la ruta de otra ficha no se registra en ésta', () => {
  const r = revisarAlta(
    { tipo: 'obra', entidadId: 'messina-bsa', categoria: 'plano', storagePath: ruta(UID, 'obra', 'quattropani') },
    UID,
  )
  assert.equal(r.ok, false)
  assert.match(r.error, /no corresponde/)
})

// LA MISMA PUERTA, CON EL ARCHIVO DE OTRO USUARIO: la primera carpeta del objeto es el uid, y la
// policy de Storage exige que sea el de quien sube. Sin este control, alguien podría reclamar como
// propio un objeto que subió otro.
test('el archivo subido por otro usuario no se registra', () => {
  const r = revisarAlta(
    { tipo: 'obra', entidadId: 'quattropani', categoria: 'plano', storagePath: ruta(OTRO, 'obra', 'quattropani') },
    UID,
  )
  assert.equal(r.ok, false)
})

test('una categoría de otra entidad no entra: un plano no existe en un proveedor', () => {
  const r = revisarAlta(
    { tipo: 'proveedor', entidadId: AID, categoria: 'plano', storagePath: ruta(UID, 'proveedor', AID) },
    UID,
  )
  assert.equal(r.ok, false)
  assert.match(r.error, /categor/i)
})

test('un id que no tiene la forma de la entidad se rechaza antes de escribir', () => {
  const r = revisarAlta(
    { tipo: 'persona', entidadId: 'messina-bsa', categoria: 'dni', storagePath: `${UID}/persona/messina-bsa/x.pdf` },
    UID,
  )
  assert.equal(r.ok, false)
  assert.match(r.error, /ficha de destino/)
})

// ═══ EL CONTRATO CON LA BASE ═══
//
// La app valida y la base también. Si las dos listas se separan —alguien agrega una categoría en el
// `.ts` y no en el CHECK— el alta se rompe recién en producción, con un error de constraint.
const MIGRACION = readFileSync(
  fileURLToPath(new URL('../../../../supabase/migrations/20260910T2320_entidad_documento.sql', import.meta.url)),
  'utf8',
)

test('el CHECK de la base nombra exactamente las mismas categorías que la app', () => {
  for (const [tipo, cats] of Object.entries(CATEGORIAS_POR_TIPO)) {
    const linea = MIGRACION.split('\n').find((l) => l.includes(`entidad_tipo = '${tipo}'`))
    assert.ok(linea, `la migración no tiene la rama del CHECK para «${tipo}»`)
    for (const c of cats) {
      assert.ok(linea.includes(`'${c}'`), `el CHECK de «${tipo}» no acepta «${c}»`)
    }
    // Y AL REVÉS: una categoría que la base acepta y la app no ofrece es una puerta que nadie mira.
    const enLaBase = [...linea.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).filter((v) => v !== tipo)
    assert.deepEqual(enLaBase.sort(), [...cats].sort(), `las listas de «${tipo}» no coinciden`)
  }
})

// LA COLA. Si el default fuera `copiado`, cada papel nacería diciendo que está en Drive sin que
// nadie lo haya subido: la peor forma de fallar, porque es en verde.
test('la fila nace pendiente de copiar a Drive, que es lo que la convierte en cola', () => {
  assert.match(MIGRACION, /drive_estado\s+text not null default 'pendiente'/)
  assert.match(MIGRACION, /where drive_estado = 'pendiente'/)
})

// El techo de la app y el de la base tienen que ser el mismo número: si la base aceptara más, el
// control de 25 MB quedaría sólo en el navegador, que es donde no vale.
test('el techo de tamaño es el mismo en la app y en el CHECK de la base', () => {
  assert.equal(MAX_BYTES, 26214400)
  assert.match(MIGRACION, /tamano_bytes <= 26214400/)
})

// La idempotencia por contenido. Un único sobre una columna que acepta NULL no restringe nada — ya
// vivió sobre 206 NULLs en este repo sin quejarse una vez.
test('el único por md5 es parcial, o no restringe nada', () => {
  const i = MIGRACION.indexOf('entidad_documento_md5_por_entidad_idx')
  assert.ok(i > 0)
  assert.match(MIGRACION.slice(i, i + 260), /where md5 is not null/)
})

// RLS sin GRANT es «permission denied», y la pantalla lo muestra como cero filas sin error.
test('la tabla nace con RLS y con el grant que la hace usable', () => {
  assert.match(MIGRACION, /alter table public\.entidad_documento enable row level security/)
  assert.match(MIGRACION, /grant select, insert on public\.entidad_documento to authenticated/)
})
