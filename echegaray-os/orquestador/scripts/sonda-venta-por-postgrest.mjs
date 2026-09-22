// SONDA POR POSTGREST: qué plata de VENTA devuelve la base con el token de un jefe de obra.
//
//   node orquestador/scripts/sonda-venta-por-postgrest.mjs [jefe|campo|direccion]
//
// ═══ POR QUÉ NO ALCANZA CON MIRAR LA PANTALLA ═══
//
// UNA PANTALLA NO ES UNA CERRADURA. La ficha del cliente ya escondía las solapas económicas al jefe
// de obra desde el 19/08 (`ECONOMICAS` en `solapasCliente.ts`) y, aun así, el 22/09/2026 este mismo
// script le sacó a la base, con el token de un jefe, el cobrado total de cada cliente, la facturación
// entera, los certificados, el esquema de pago y los recibos. Lo que prueba una cerradura es lo que
// contesta PostgREST al token que cualquiera copia de las devtools, no lo que dibuja el navegador.
//
// Es SÓLO LECTURA: entra con una identidad de prueba y hace GETs. No escribe nada.
//
// Las tres identidades son las de `tests/util/identidades.ts`. `qa.jefe.obra@ecsas.com.ar` es un
// perfil `jefe_obra` de prueba: la RLS económica no mira `es_prueba`, mira `current_rol()`, así que
// mide lo mismo que `ingenieria@ecsas.com.ar` o `hys@ecsas.com.ar`, que son los jefes reales.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
for (const l of readFileSync(new URL('../../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m&&!process.env[m[1]]) process.env[m[1]]=m[2].replace(/^"([\s\S]*)"$/,'$1')
}
const URLS=process.env.NEXT_PUBLIC_SUPABASE_URL, ANON=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
async function entrar(email,password){
  const sb=createClient(URLS,ANON,{auth:{persistSession:false}})
  const {data,error}=await sb.auth.signInWithPassword({email,password})
  if(error) throw new Error(email+': '+error.message)
  return data.session.access_token
}
const CONSULTAS = [
  ['CRM · cuenta corriente del cliente', 'cliente_cuenta_corriente?select=nombre_comercial,saldo,cobrado_total,facturado_90d&limit=3'],
  ['CRM · cobranzas (facturación al cliente)', 'cobranzas?select=cliente_id,obra_id,estado,monto_neto,total_bruto&total_bruto=not.is.null&limit=3'],
  ['CRM · certificados al cliente', 'certificado_cliente?select=obra_id,numero,monto,reparo&monto=not.is.null&limit=3'],
  ['CRM · esquema de pago del contrato', 'esquema_pago?select=obra_id,concepto,monto&limit=3'],
  ['CRM · recibos de cobro', 'recibo_cliente?select=numero,monto&monto=not.is.null&limit=3'],
  ['CRM · orden de compra del cliente (el contrato en papel)', 'cliente_orden?select=cliente_id,obra_id,numero,importe&importe=not.is.null&limit=3'],
  ['CRM · cobranza (tabla legado del Sheet)', 'cobranza?select=cliente_texto,concepto,total&limit=3'],
  ['CRM · pago informado por el cliente', 'pago_informado?select=monto,fecha&limit=3'],
  ['CRM · economía del cliente (contratado)', 'cliente_economia?select=nombre_comercial,contratado,contratado_en_curso,cobrado_total&limit=3'],
  ['OBRAS · economía de la obra', 'obra_economia?select=obra_id,venta_contratada,venta_total,margen_cotizado,cobrado&limit=3'],
  ['OBRAS · cartera', 'obra_economia_cartera?select=obra_canonica_id,contratado,contrato_total,margen&limit=3'],
  ['OBRAS · plan vs real', 'obra_plan_vs_real?select=obra_id,monto_contratado,monto_presupuestado,margen_esperado&limit=3'],
  ['OBRAS · panel', 'obra_panel?select=obra_id,monto_contratado&limit=3'],
  ['OBRAS · obra_canonica.monto_contratado', 'obra_canonica?select=id,monto_contratado&limit=3'],
  ['COTIZACIÓN · cotizaciones', 'cotizaciones?select=id,monto_venta,margen_pct&limit=3'],
  ['CAJA · movimientos_caja', 'movimientos_caja?select=tipo,concepto,monto,cliente_id&limit=3'],
  ['CAJA · aplicaciones_pago', 'aplicaciones_pago?select=monto_aplicado&limit=3'],
  ['CAJA · acciones', 'acciones?select=monto&limit=3'],
  ['CAJA · obligaciones', 'obligaciones?select=concepto,monto_total&limit=3'],
  ['PORTAL · cliente_actividad_portal', 'cliente_actividad_portal?select=tipo,monto&limit=3'],
  ['AUDITORÍA · cobranza_cambio', 'cobranza_cambio?select=campo,valor_anterior,valor_nuevo&limit=3'],
  ['OPERATIVO (debe seguir viendo) · compras', 'compra_sheet?select=proveedor,importe,total&limit=2'],
  ['OPERATIVO (debe seguir viendo) · comprobantes ARCA', 'comprobantes_arca?select=emisor_nombre,imp_total&limit=2'],
  ['OPERATIVO (debe seguir viendo) · obras', 'obra_canonica?select=id,nombre,estado&limit=2'],
  ['OPERATIVO (debe seguir viendo) · personas', 'personas?select=nombre_completo,puesto&limit=2'],
]
const quien = process.argv[2] ?? 'jefe'
const cred = quien==='jefe' ? ['qa.jefe.obra@ecsas.com.ar','TestJefe123!']
          : quien==='campo' ? ['qa.campo@ecsas.com.ar','TestCampo123!']
          : ['jorge.o.corona+direccion-test-1783513222134@gmail.com','TestPassword123!']
const token = await entrar(...cred)
console.log(`═══ TOKEN DE ${cred[0]} (rol ${quien}) · ${new Date().toISOString()} ═══\n`)
for (const [titulo, q] of CONSULTAS) {
  const r = await fetch(`${URLS}/rest/v1/${q}`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } })
  const t = await r.text()
  console.log(`── ${titulo}\n   GET /rest/v1/${q}\n   ${r.status} ${t.slice(0,600)}\n`)
}
