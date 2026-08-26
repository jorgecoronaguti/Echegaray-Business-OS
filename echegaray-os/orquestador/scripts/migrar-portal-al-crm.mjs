#!/usr/bin/env node
// PASAR LO QUE YA ESTÁ CARGADO EN LAS TABLAS DEL PORTAL A LAS DE LA FICHA DEL CLIENTE.
//
//   pago_programado (31 filas, 7 obras)  →  esquema_pago       (pantalla 32)
//   cliente_mail    (5 accesos)          →  cliente_acceso     (pantalla 31)
//
// El portal se construyó con tablas propias sin ver que la ficha del cliente ya administraba esos
// conceptos. El código ya lee las buenas; falta mover los datos que quedaron del otro lado.
//
//   node orquestador/scripts/migrar-portal-al-crm.mjs             (en seco: dice qué haría)
//   node orquestador/scripts/migrar-portal-al-crm.mjs --aplicar
//
// ═══ LAS CINCO REGLAS DE ESTE SCRIPT ═══
//
//  1. NO PISA NADA. Si la fila ya existe en el destino, se deja como está y se informa. El destino
//     puede haber sido editado a mano desde la ficha, y una edición de una persona le gana a
//     cualquier cosa que traiga un origen retirado.
//  2. IDEMPOTENTE, Y NO SÓLO CONTRA SÍ MISMO. Cada fila que escribe lleva su procedencia en
//     `nota_interna` (`pago_programado:<uuid>`), una columna PROPIA de la app que el sync de
//     Cobranzas no toca. Pero eso no alcanza: el 26/08/2026 a las 16:01 OTRO proceso ya había
//     migrado 19 de las 31 filas con su propio formato de nota, y una marca que sólo reconoce la
//     propia habría duplicado las 19. Por eso `yaMigrada` reconoce también la nota original y, como
//     última red, el par (concepto, monto) dentro del mismo cliente.
//  3. NO INVENTA LA OBRA. `esquema_pago.obra_id` apunta a `public.obra_canonica` (id de texto) y
//     `pago_programado.obra_id` a `public.obras` (uuid). Son dos registros distintos y con distinta
//     granularidad —`public.obras` tiene «MAMPOSTERÍA» donde `obra_canonica` tiene «Galpones,
//     Mampostería, Cancha de Padel»—. Se empareja SÓLO cuando el nombre normalizado calza exacto
//     dentro del mismo cliente. Lo que no calza entra con `obra_id = NULL`, que es un estado
//     legítimo del esquema, y el portal lo muestra en su bloque «Sin obra asignada». Adivinar la
//     obra pondría plata de una obra en el cronograma de otra, y el cliente lo ve.
//  4. LA EVIDENCIA ES EL DATO RELEÍDO DEL DESTINO. Al final vuelve a consultar `esquema_pago` y
//     `cliente_acceso` y muestra lo que HAY ahí. Que un INSERT no dé error no prueba que escribió.
//  5. NO ESCRIBE SI FALTA LA MIGRACIÓN. `esquema_pago` necesita `moneda`, `factura_numero` y
//     `recibo_numero` (migración `20260826T2100`, escrita y sin aplicar). Sin `moneda`, las cuatro
//     líneas en dólares de Quattropani entrarían como pesos y el total del cliente quedaría mal por
//     tres órdenes de magnitud, sin dar ningún error. Se niega a escribir y lo dice.

import { query, closePool } from '../lib/db.mjs'

const APLICAR = process.argv.includes('--aplicar')
const MARCA = 'pago_programado:'
const $ = (n) => (n == null ? 'sin cargar' : `$${Math.round(Number(n)).toLocaleString('es-AR')}`)

/** «PISOS INDUSTRIALES» y «Pisos Industriales» son la misma obra; «Galpón 9» y «Galpon 9» también. */
export const normalizarNombre = (s) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * `Cobranzas fila 53 · …` → 53. `Cobranzas filas 80+82 · …` → null.
 *
 * Una fila del esquema que junta DOS de Cobranzas no ES ninguna de las dos, y `cobranza_fila` es
 * exactamente esa afirmación (tiene un índice único que la trata como identidad). Se deja en null:
 * es un pago previsto sin fila propia, que la tabla contempla.
 */
export function filaDeCobranzas(nota) {
  const m = /Cobranzas fila (\d+)/i.exec(String(nota ?? ''))
  return m ? Number(m[1]) : null
}

/**
 * El estado del esquema para un pago del portal.
 *
 * `pago_programado` no tiene el estado del esquema: tiene fechas. Cobrado lo dice `fecha_pago`; el
 * fondo de reparo es `retenido` por definición de la columna; y lo demás es `a_vencer` cuando hay
 * fecha comprometida y `previsto` cuando todavía no la hay. NO se escribe `vencido`: la ficha y el
 * portal lo derivan de la fecha, y congelarlo acá dejaría en rojo pagos que después se mueven.
 */
export function estadoDelEsquema(p) {
  if (p.fecha_pago) return 'cobrado'
  if (p.tipo === 'fondo_reparo') return 'retenido'
  return p.fecha_prevista ? 'a_vencer' : 'previsto'
}

/**
 * ¿ESTE PAGO YA ESTÁ EN `esquema_pago`? Tres reconocimientos, de más fuerte a más flojo.
 *
 * No basta con buscar la marca propia. Cuando se escribió este script, `esquema_pago` ya tenía 19
 * de las 31 filas puestas por otro proceso, con la nota original de `pago_programado` y sin la
 * marca: reconocer sólo lo propio habría duplicado esas 19 y el cliente habría visto su cronograma
 * dos veces, con el doble de deuda.
 *
 * El último criterio —(concepto, monto) dentro del mismo cliente— es deliberadamente amplio. Puede
 * saltear una fila legítimamente repetida; ese error deja un pago sin migrar, que se ve y se
 * arregla. El error contrario publica plata que no se debe.
 */
export function yaMigrada(p, existentes) {
  const nota = String(p.nota ?? '').trim()
  return existentes.some((e) => {
    if (String(e.cliente_id) !== String(p.cliente_id)) return false
    const ni = String(e.nota_interna ?? '')
    if (ni.includes(`${MARCA}${p.id}`)) return true
    if (nota && ni.includes(nota)) return true
    return e.concepto === p.rotulo && Number(e.monto) === Number(p.monto)
  })
}

const iso = (v) => (v == null ? null : new Date(v).toISOString().slice(0, 10))

/** ¿Está la migración `20260826T2100` aplicada? Sin ella no se escribe. Ver regla 5. */
async function columnasDelEsquema() {
  const { rows } = await query(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name='esquema_pago'`)
  const hay = new Set(rows.map((r) => r.column_name))
  return ['moneda', 'factura_numero', 'recibo_numero'].filter((c) => !hay.has(c))
}

// ── 1 · EL CRONOGRAMA ────────────────────────────────────────────────────────────────────────

async function migrarCronograma() {
  const { rows: pagos } = await query(
    `select p.*, o.cliente_id, o.nombre as obra_nombre
       from public.pago_programado p
       join public.obras o on o.id = p.obra_id
      order by o.nombre, p.orden`)
  const { rows: canonicas } = await query(
    'select id, nombre, cliente_id from public.obra_canonica where cliente_id is not null')
  // TODO lo que ya hay en el destino, sin filtrar por quién lo escribió. Ver regla 2.
  const { rows: yaEstan } = await query(
    'select cliente_id, concepto, monto, nota_interna from public.esquema_pago')

  // Clave (cliente, nombre normalizado) → id canónico. Se arma con Map para que un nombre repetido
  // dentro del mismo cliente NO se resuelva: dos candidatos es lo mismo que ninguno.
  const porNombre = new Map()
  for (const c of canonicas) {
    const k = `${c.cliente_id}|${normalizarNombre(c.nombre)}`
    porNombre.set(k, porNombre.has(k) ? null : c.id)
  }

  const plan = []
  const sinObra = []
  let repetidas = 0
  for (const p of pagos) {
    if (yaMigrada(p, yaEstan)) { repetidas++; continue }
    if (p.monto == null) {
      // `esquema_pago.monto` es NOT NULL. Un pago sin monto no se puede migrar sin inventarle uno.
      sinObra.push(`  ⚠ SIN MONTO, no se migra: ${p.obra_nombre} · ${p.rotulo}`)
      continue
    }
    const canonica = porNombre.get(`${p.cliente_id}|${normalizarNombre(p.obra_nombre)}`) ?? null
    if (!canonica) sinObra.push(`  · sin obra canónica: «${p.obra_nombre}» → entra al bloque «Sin obra asignada»`)
    plan.push({ p, canonica })
  }

  console.log(`\n═══ CRONOGRAMA · pago_programado → esquema_pago ═══`)
  console.log(`  ${pagos.length} fila(s) en el origen · ${repetidas} ya en el destino · ${plan.length} por migrar`)
  for (const m of [...new Set(sinObra)]) console.log(m)

  if (!APLICAR || !plan.length) return

  for (const { p, canonica } of plan) {
    await query(
      `insert into public.esquema_pago
         (cliente_id, obra_id, cobranza_fila, concepto, fecha, monto, estado, visible_portal,
          publicado_at, orden, origen, moneda, factura_numero, recibo_numero, nota_interna)
       values ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,'sync_cobranzas',$10,$11,$12,$13)
       on conflict do nothing`,
      [
        p.cliente_id, canonica, filaDeCobranzas(p.nota), p.rotulo,
        iso(p.fecha_pago ?? p.fecha_prevista), p.monto, estadoDelEsquema(p),
        // PUBLICADO CUANDO SE SEMBRÓ, no ahora. Estas filas YA se le mostraron al cliente en el
        // portal desplegado: poner `now()` diría que se publicaron hoy, que es falso.
        p.created_at, p.orden, p.moneda ?? 'ARS', p.factura_numero, p.recibo_numero,
        `${MARCA}${p.id} · ${p.nota ?? ''}`.slice(0, 500),
      ])
  }
}

// ── 2 · LOS ACCESOS ──────────────────────────────────────────────────────────────────────────

async function migrarAccesos() {
  const { rows: mails } = await query(
    'select * from public.cliente_mail where activo order by mail, cliente_id')
  const { rows: accesos } = await query('select id, cliente_id, email from public.cliente_acceso')
  const porPar = new Set(accesos.map((a) => `${a.cliente_id}|${a.email}`))
  const porMail = new Set(accesos.map((a) => a.email))

  console.log(`\n═══ ACCESOS · cliente_mail → cliente_acceso ═══`)
  console.log(`  ${mails.length} acceso(s) activo(s) en el origen · ${accesos.length} fila(s) en el destino`)

  const plan = []
  for (const m of mails) {
    if (porPar.has(`${m.cliente_id}|${m.mail}`)) { console.log(`  = ya existe: ${m.mail}`); continue }
    if (m.obra_id) {
      // `cliente_acceso.obras` guarda ids de `obra_canonica`; `cliente_mail.obra_id` es un uuid de
      // `public.obras`. Traducirlo sería adivinar, y adivinar acá es publicar un permiso al revés.
      console.log(`  ⚠ acotado a una obra: ${m.mail} — NO se migra, hay que reasignarlo a mano`)
      continue
    }
    if (porMail.has(m.mail)) {
      // EL CONFLICTO DE FONDO, no un detalle: `cliente_acceso.email` es UNIQUE en toda la tabla y
      // `cliente_mail` permite un mail en varios clientes (es el caso del dueño). La salida está
      // escrita en `supabase/migrations/20260826T2120_OPCIONAL_...`, y es una decisión, no un paso.
      console.log(`  ✖ BLOQUEADO por UNIQUE(email): ${m.mail} → cliente ${m.cliente_id}`)
      continue
    }
    porMail.add(m.mail)
    plan.push(m)
  }
  console.log(`  ${plan.length} por migrar`)

  if (!APLICAR || !plan.length) return

  for (const m of plan) {
    await query(
      `insert into public.cliente_acceso
         (cliente_id, email, persona_contacto, puede_ver_obra, puede_ver_montos, puede_aprobar,
          obras, habilitado_at)
       values ($1,$2,$3,true,true,false,null,$4)
       on conflict do nothing`,
      // `obras = NULL` porque el origen alcanzaba TODAS las obras del cliente (`obra_id` nulo).
      // `puede_ver_montos = true` porque eso es lo que el acceso ya tenía: el portal le mostraba el
      // cronograma con importes. `puede_aprobar = false` porque el portal por mail no aprueba nada,
      // y darle un permiso que nunca tuvo sería ampliarlo en una migración.
      [m.cliente_id, m.mail, m.nombre, m.created_at])
  }
}

// ── 3 · LA EVIDENCIA ─────────────────────────────────────────────────────────────────────────

async function evidencia() {
  console.log('\n═══ LEÍDO DEL DESTINO (no del script) ═══')
  const { rows: esq } = await query(
    `select coalesce(obra_id,'(sin obra)') obra, count(*)::int n, sum(monto) total, moneda
       from public.esquema_pago group by 1, 4 order by 1, 4`)
  if (!esq.length) console.log('  esquema_pago: VACÍA')
  for (const r of esq) console.log(`  esquema_pago · ${String(r.obra).padEnd(24)} ${String(r.n).padStart(3)} fila(s) · ${r.moneda} ${$(r.total)}`)

  const { rows: pub } = await query(
    `select count(*)::int n from public.esquema_pago where visible_portal and publicado_at is not null`)
  console.log(`  esquema_pago · ${pub[0].n} visible(s) y publicada(s) — es lo que el portal muestra`)

  const { rows: acc } = await query(
    `select email, cliente_id, puede_ver_montos, obras, revocado_at from public.cliente_acceso order by email`)
  for (const a of acc) {
    console.log(`  cliente_acceso · ${a.email.padEnd(28)} cliente ${a.cliente_id} · montos ${a.puede_ver_montos}`
      + ` · obras ${a.obras === null ? 'TODAS (null)' : JSON.stringify(a.obras)}`
      + `${a.revocado_at ? ' · REVOCADO' : ''}`)
  }
}

async function main() {
  const faltan = await columnasDelEsquema()
  if (faltan.length && APLICAR) {
    console.error(`✖ falta aplicar supabase/migrations/20260826T2100_el_esquema_de_pago_es_el_del_portal.sql`)
    console.error(`  columnas ausentes en esquema_pago: ${faltan.join(', ')}`)
    console.error(`  sin «moneda» las líneas en dólares de Quattropani entrarían como pesos. No se escribe nada.`)
    process.exitCode = 1
    return
  }
  if (faltan.length) console.log(`⚠ migración 20260826T2100 SIN APLICAR (faltan: ${faltan.join(', ')})`)

  await migrarCronograma()
  await migrarAccesos()
  await evidencia()
  if (!APLICAR) console.log('\n(en seco: no se escribió nada — agregá --aplicar)')
}

// Sólo corre cuando se lo invoca; importado desde un test, expone sus funciones puras y no toca la base.
if (process.argv[1] && process.argv[1].endsWith('migrar-portal-al-crm.mjs')) {
  main().catch((e) => { console.error('✖', e.message); process.exitCode = 1 }).finally(() => closePool())
}
