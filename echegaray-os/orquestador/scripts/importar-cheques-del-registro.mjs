#!/usr/bin/env node
// CARGAR A LA BASE LOS CHEQUES EMITIDOS QUE SÓLO ESTABAN EN EL SHEET.
//
// La flecha que faltaba. `cheques-emitidos-sync.mjs` va de la base a la pestaña; ésta es la vuelta.
// Sin ella, `public.cheques` sólo se llenaba con lo que aparecía en una pantalla del banco: 23
// cheques desde el 18/06, contra los 104 del registro desde el 12/12/2025. Toda pestaña construida
// sobre la réplica publicaba los emitidos con 81 cheques menos — sin dar error, con un número menor.
//
//   node orquestador/scripts/importar-cheques-del-registro.mjs            (ensayo: no escribe)
//   node orquestador/scripts/importar-cheques-del-registro.mjs --aplicar
//
// NO ESCRIBE EL SHEET. Sólo lo lee. La pestaña es del dueño y está candada; acá se la trata como
// fuente de lectura y nada más.
//
// El criterio y las tres trampas (la clave con instrumento, el conflicto que no se fusiona, la
// columna de fecha correcta) viven en `lib/cheques-desde-registro.mjs`, con sus tests.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { planDeCarga, verificarEncabezado, clave } from '../lib/cheques-desde-registro.mjs'
import { FILA_HDR, FILA_DATO0, FILA_FIN } from '../lib/cheques-emitidos-geometria.mjs'

// LA MIGRACIÓN LA APLICA ESTE SCRIPT, como hace `importar-banco.mjs` con las suyas. Es idempotente
// y se corre siempre: una migración que está en el repo pero nadie aplicó es una columna que no
// existe, y el mensaje de esa falla es idéntico al de un bootstrap sano.
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIGRACIONES = [
  '20260821T1000_el_numero_no_identifica_un_cheque.sql',   // el instrumento entra a la clave
  '20260821T1100_el_numero_del_cheque_va_normalizado.sql', // "00000366" y "366" son el mismo cheque
  '20260821T1200_el_banco_del_cheque_propio_es_el_nuestro.sql', // un NULL en la clave es un duplicado esperando
].map((f) => join(RAIZ, 'supabase', 'migrations', f))

const FLUJO = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'Cheques Emitidos'
const APLICAR = process.argv.includes('--aplicar')
const $ = (n) => '$' + Number(n ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })

/**
 * LAS CORRECCIONES, CON SU EVIDENCIA. Es el único lugar por donde entra una decisión sobre el dato.
 *
 * El registro tiene el FISICO 316 dos veces —Diesel Rodríguez $500.000 y $510.000— y el extracto del
 * Santander dice, el 13/08: «Cheque debitado» referencia 316 por $-500.000 y referencia 317 por
 * $-510.000. El banco es la fuente de verdad del movimiento, así que el de $510.000 es el 317 y en el
 * registro hay un número mal tipeado.
 *
 * NO se corrige la pestaña: es del dueño y está candada. Se carga bien en la base y se avisa.
 */
const CORRECCIONES = {
  'FISICO|316@510000': {
    numero: '317',
    porque: 'extracto Santander 13/08/2026: «Cheque debitado» ref 316 $-500.000 y ref 317 $-510.000',
  },
}

async function main() {
  for (const m of MIGRACIONES) await query(readFileSync(m, 'utf8'))
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // ── EL REGISTRO, LEÍDO SIN FORMATO ────────────────────────────────────────────────────────────
  // UNFORMATTED_VALUE a propósito: las fechas vienen como serial y no dependen del locale. Leerlas
  // formateadas en un archivo es-AR ya vació una pestaña entera (memoria `fecha-dd-mm-yy-parser`).
  const bruto = await google.readSheetValues(FLUJO, `${PESTANA}!A${FILA_HDR}:M${FILA_FIN}`, { render: 'UNFORMATTED_VALUE' }) ?? []
  const problemas = verificarEncabezado(bruto[0] ?? [])
  if (problemas.length) {
    console.error(`✗ el encabezado del registro no es el esperado — ABORTO antes de leer una fila:`)
    for (const p of problemas) console.error(`   · ${p}`)
    console.error('  Una columna insertada corre todo lo que sigue y este importador cargaría el monto de una y la fecha de otra sin dar error.')
    process.exitCode = 1
    return
  }
  const registro = bruto.slice(1)
    .map((r, i) => ({ fila: FILA_DATO0 + i, r }))
    .filter((x) => String(x.r?.[1] ?? '').trim() !== '')

  // ── LA BASE ───────────────────────────────────────────────────────────────────────────────────
  const base = (await query(
    `select numero, instrumento, importe, fecha_pago::text as fecha_pago, estado from public.cheques where tipo='emitido'`
  )).rows

  const corte = new Date().toISOString().slice(0, 10)
  const plan = planDeCarga({ registro, base, corte, correcciones: CORRECCIONES })

  const suma = (l) => l.reduce((a, c) => a + Number(c.importe || 0), 0)
  console.log(`registro: ${registro.length} filas · base: ${base.length} emitidos\n`)
  console.log(`  nuevos      ${String(plan.nuevos.length).padStart(4)} · ${$(suma(plan.nuevos))}`)
  console.log(`  ya estaban  ${String(plan.yaEstan.length).padStart(4)} · ${$(suma(plan.yaEstan))}`)
  console.log(`  cambian     ${String(plan.cambian.length).padStart(4)} · ${$(suma(plan.cambian))}   (sólo el estado)`)
  console.log(`  discrepan   ${String(plan.discrepan.length).padStart(4)} · ${$(suma(plan.discrepan))}   (NO se pisan: se informan)`)
  console.log(`  conflictos  ${String(plan.conflictos.length).padStart(4)}`)
  console.log(`  rechazados  ${String(plan.rechazados.length).padStart(4)}`)

  for (const c of plan.cambian) console.log(`   ~ f${c.fila} ${c.instrumento} ${c.numero} ${c.contraparte}: ${c.difiere.join(' · ')}`)
  for (const c of plan.discrepan) {
    console.log(`   ≠ f${c.fila} ${c.instrumento} ${c.numero} ${c.contraparte}: ${c.choca.join(' · ')}`)
  }
  for (const c of plan.conflictos) {
    console.log(`   ✗ ${c.clave} aparece ${c.filas.length} veces y NO se carga ninguna:`)
    for (const f of c.filas) console.log(`        fila ${f.fila} · ${f.contraparte} · ${$(f.importe)}`)
  }
  for (const r of plan.rechazados) console.log(`   ⚠ fila ${r.fila}: ${r.motivo}`)
  for (const c of [...plan.nuevos, ...plan.cambian].filter((x) => x.corregido)) {
    console.log(`   ✎ f${c.fila} se carga como N° ${c.numero} — ${c.corregido}`)
  }

  if (!APLICAR) { console.log('\n(ensayo) no escribí nada. Para aplicar: --aplicar'); return }

  // ── LA ESCRITURA ──────────────────────────────────────────────────────────────────────────────
  // UPSERT sobre la identidad completa (tipo, instrumento, banco, numero). El `where` del update no
  // es decorativo: sin él, cada corrida reescribe las 104 filas y `importado_en` deja de significar
  // "cuándo cambió esto".
  // `discrepan` NO entra: la base tiene ahí el dato del banco y el registro el tipeado a mano.
  //
  // `yaEstan` SÍ entra, y no es redundante: el `where` del UPDATE no deja pasar nada salvo que algo
  // haya cambiado de verdad, así que una fila idéntica cuesta un no-op — pero es lo que permite
  // rellenar un campo que se agregó después (la cuenta) sin escribir un script aparte para eso.
  const aEscribir = [...plan.nuevos, ...plan.cambian, ...plan.yaEstan]
  // SE CUENTAN LAS FILAS QUE CAMBIARON, NO LOS INTENTOS. El `where` del UPDATE convierte casi todo
  // en un no-op, así que contar llamadas informaba "99 escrituras" con cero filas tocadas — un log
  // que felicita sin haber escrito es peor que no tenerlo: tapa el día que de verdad no escribió.
  let escritos = 0
  for (const c of aEscribir) {
    const r = await query(
      `insert into public.cheques (tipo, instrumento, numero, banco, contraparte, contraparte_cuit,
         fecha_pago, importe, estado, obra, origen, corte, cuenta)
       values ($1,$2,$3,$4,$5,$6,$7::date,$8,$9,$10,$11,$12::date,$13)
       on conflict (tipo, coalesce(instrumento,''), coalesce(banco,''), numero) do update
         set importe = excluded.importe, fecha_pago = excluded.fecha_pago, estado = excluded.estado,
             contraparte = coalesce(excluded.contraparte, public.cheques.contraparte),
             obra = coalesce(excluded.obra, public.cheques.obra),
             cuenta = coalesce(public.cheques.cuenta, excluded.cuenta),
             origen = excluded.origen, corte = excluded.corte, importado_en = now()
         where public.cheques.importe is distinct from excluded.importe
            or public.cheques.fecha_pago is distinct from excluded.fecha_pago
            or public.cheques.estado is distinct from excluded.estado
            or public.cheques.cuenta is null`,
      [c.tipo, c.instrumento, c.numero, c.banco, c.contraparte, c.contraparte_cuit,
        c.fecha_pago, c.importe, c.estado, c.obra, c.origen, c.corte, c.cuenta]
    )
    escritos += r.rowCount ?? 0
  }

  // ── LA EVIDENCIA ES DEL EFECTO: SE RELEE LA BASE ──────────────────────────────────────────────
  const despues = (await query(
    `select count(*)::int n, sum(importe)::numeric m,
            count(*) filter (where estado='Aceptado')::int pend,
            sum(importe) filter (where estado='Aceptado')::numeric mpend
       from public.cheques where tipo='emitido'`)).rows[0]
  console.log(`\n✓ ${escritos} fila(s) escritas de ${aEscribir.length} evaluadas. La base ahora: ${despues.n} emitidos · ${$(despues.m)}`)
  console.log(`  no debitados (Aceptado): ${despues.pend} · ${$(despues.mpend)}`)
  // ═══ EL CONTROL DE CIERRE: NI UNA FILA MENOS, NI UNA MÁS ═══
  //
  // Comparaba con `<` y sólo avisaba si faltaban. Las dos veces que este importador se equivocó
  // SOBRARON filas —un duplicado por el número con ceros y otro por el banco en NULL— y el control
  // se quedó callado las dos. Un control que mira para un solo lado es medio control.
  const enRegistro = registro.length - plan.conflictos.reduce((a, c) => a + c.filas.length, 0) - plan.rechazados.length
  if (despues.n !== enRegistro) {
    console.log(`  ⚠ el registro tiene ${enRegistro} cheques cargables y la base quedó con ${despues.n}: ${despues.n > enRegistro ? 'SOBRAN' : 'FALTAN'} ${Math.abs(despues.n - enRegistro)}`)
    process.exitCode = 1
  } else {
    console.log(`  ✓ la base tiene exactamente los ${enRegistro} cheques del registro`)
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => closePool())
