#!/usr/bin/env node
/**
 * medir-pareto.mjs — Mide DÓNDE se va el trabajo de Claude Code en este repo.
 *
 * NO inventa telemetría. Lee los transcripts reales de Claude Code
 * (~/.claude/projects/<proyecto>/**.jsonl) y cuenta hechos verificables:
 *   - llamadas a herramientas, por categoría de trabajo
 *   - bytes de tool_result devueltos (= contexto inyectado por esa categoría)
 *   - tokens facturados por turno (message.usage), atribuidos al turno que llamó
 *
 * PROXY declarado: el `usage` de un turno es el costo del turno entero
 * (todo el contexto acumulado se re-cobra en cada llamada). Atribuirlo a la
 * herramienta que ese turno invocó NO es una medición de costo marginal: es un
 * proxy de "en qué tipo de trabajo estaba el agente cuando gastó". La medición
 * limpia y no-proxy es `bytes_resultado` (contexto que esa categoría inyectó)
 * y `llamadas`. Se reportan las tres por separado, sin mezclarlas.
 *
 * Uso: node orquestador/dev-router/medir-pareto.mjs [--json] [--dir <ruta>]
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import os from 'node:os';

const CATEGORIAS = [
  'busqueda', 'lectura-contexto', 'lectura-multimedia', 'exploracion-repo', 'edicion-codigo',
  'edicion-frontend', 'edicion-docs', 'edicion-tests', 'migraciones-sql',
  'tests', 'typecheck', 'build', 'lint', 'git', 'analisis-logs',
  'ejecucion-scripts', 'delegacion-subagente', 'investigacion-externa',
  'planificacion', 'razonamiento-sin-herramienta', 'otro',
];

/** Clasifica una llamada a herramienta en una categoría de trabajo de desarrollo. */
export function clasificarLlamada(nombre, input = {}) {
  const n = String(nombre || '');
  if (n === 'Grep' || n === 'Glob') return 'busqueda';
  if (n === 'Read' || n === 'NotebookRead') return clasificarLectura(input);
  if (n === 'Task' || n === 'Agent') return 'delegacion-subagente';
  if (n === 'WebFetch' || n === 'WebSearch') return 'investigacion-externa';
  if (n === 'TodoWrite' || n === 'ExitPlanMode') return 'planificacion';
  if (n === 'Edit' || n === 'Write' || n === 'MultiEdit' || n === 'NotebookEdit') {
    return clasificarEdicion(String(input.file_path || input.notebook_path || ''));
  }
  if (n === 'Bash' || n === 'BashOutput') return clasificarBash(String(input.command || ''));
  return 'otro';
}

function clasificarLectura(input) {
  const p = String(input.file_path || '');
  // Las capturas de QA y los PDFs/DNI viven en /tmp: NO son análisis de logs.
  if (/\.(png|jpe?g|gif|webp|bmp|pdf|svg)$/i.test(p)) return 'lectura-multimedia';
  if (/\.log$/i.test(p)) return 'analisis-logs';
  return 'lectura-contexto';
}

function clasificarEdicion(p) {
  if (/supabase\/migrations|\.sql$/i.test(p)) return 'migraciones-sql';
  if (/\.(test|spec)\.(m?[jt]sx?)$/i.test(p) || /\/tests?\//.test(p)) return 'edicion-tests';
  if (/\.(md|mdx)$/i.test(p)) return 'edicion-docs';
  if (/\.(tsx|jsx|css|scss)$/i.test(p) || /tailwind/i.test(p)) return 'edicion-frontend';
  return 'edicion-codigo';
}

const REGLAS_BASH = [
  [/\bnpm run (orq:)?test|node --test|playwright test|vitest|jest\b/, 'tests'],
  [/\btypecheck\b|\btsc\b/, 'typecheck'],
  [/\bnext build\b|npm run build\b/, 'build'],
  [/\beslint\b|npm run lint\b|prettier\b/, 'lint'],
  [/\bgit\b/, 'git'],
  [/\bpsql\b|supabase db|\bSELECT\b|\bINSERT\b|\bUPDATE .* SET\b|migration/i, 'migraciones-sql'],
  [/\btail\b|\bless\b|journalctl|\.log\b|docker logs/, 'analisis-logs'],
  [/\brg\b|\bgrep\b|\bfind\b|\bfd\b|\bag\b/, 'busqueda'],
  [/\bls\b|\btree\b|\bwc -l\b|\bdu\b|\bstat\b/, 'exploracion-repo'],
  [/\bcat\b|\bhead\b|\bsed -n\b/, 'lectura-contexto'],
  [/\bnode\b|\bpython3?\b|\bnpm\b|\bbash\b|\.mjs\b|\.sh\b/, 'ejecucion-scripts'],
];

export function clasificarBash(cmd) {
  for (const [re, cat] of REGLAS_BASH) if (re.test(cmd)) return cat;
  return 'otro';
}

function vacio() {
  const o = {};
  for (const c of CATEGORIAS) o[c] = { llamadas: 0, bytes_resultado: 0, imagenes: 0, tokens_turno: 0, turnos: 0 };
  return o;
}

function tokensDe(usage) {
  if (!usage) return 0;
  return (usage.input_tokens || 0) + (usage.output_tokens || 0)
    + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
}

/**
 * Devuelve {bytes, imagenes}. Los bloques de imagen NO suman bytes: su payload es
 * base64 y dividirlo por 4 daría un número de tokens falso (una captura cuesta
 * ~1.500 tokens reales, no ~400.000). Se cuentan aparte, como unidades.
 */
function tamañoResultado(contenido) {
  let bytes = 0; let imagenes = 0;
  const uno = (b) => {
    if (typeof b === 'string') { bytes += b.length; return; }
    if (!b || typeof b !== 'object') return;
    if (b.type === 'image' || b.source?.data) { imagenes++; return; }
    if (typeof b.text === 'string') { bytes += b.text.length; return; }
    if (Array.isArray(b.content)) { for (const x of b.content) uno(x); return; }
    bytes += JSON.stringify(b).length;
  };
  if (typeof contenido === 'string') return { bytes: contenido.length, imagenes: 0 };
  if (Array.isArray(contenido)) { for (const b of contenido) uno(b); return { bytes, imagenes }; }
  uno(contenido);
  return { bytes, imagenes };
}

/** ESTIMACIÓN declarada: tokens que cuesta una imagen adjunta (captura típica). */
export const TOKENS_POR_IMAGEN = 1500;

export async function medir(dir) {
  const archivos = [];
  (function recorrer(d) {
    let entradas;
    try { entradas = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (e.name.endsWith('.jsonl')) archivos.push(p);
    }
  })(dir);

  const acc = vacio();
  const porHerramienta = new Map();
  const totales = {
    archivos: archivos.length, lineas: 0, turnos_asistente: 0,
    turnos_con_herramienta: 0, llamadas: 0, tokens_totales: 0,
    bytes_resultado_totales: 0, imagenes_totales: 0, sesiones: new Set(), sidechain_turnos: 0,
  };
  // id de llamada -> categoría, para atribuir el tool_result que llega después
  const pendientes = new Map();

  for (const f of archivos) {
    const rl = readline.createInterface({
      input: fs.createReadStream(f, { encoding: 'utf8' }), crlfDelay: Infinity,
    });
    for await (const linea of rl) {
      if (!linea) continue;
      totales.lineas++;
      let o;
      try { o = JSON.parse(linea); } catch { continue; }
      if (o.sessionId) totales.sesiones.add(o.sessionId);
      const m = o.message;
      if (!m || typeof m !== 'object') continue;

      if (o.type === 'assistant' && m.role === 'assistant') {
        totales.turnos_asistente++;
        if (o.isSidechain) totales.sidechain_turnos++;
        const tok = tokensDe(m.usage);
        totales.tokens_totales += tok;
        const bloques = Array.isArray(m.content) ? m.content : [];
        const usos = bloques.filter((b) => b && b.type === 'tool_use');
        if (usos.length === 0) {
          acc['razonamiento-sin-herramienta'].tokens_turno += tok;
          acc['razonamiento-sin-herramienta'].turnos++;
          continue;
        }
        totales.turnos_con_herramienta++;
        const parte = tok / usos.length;
        for (const u of usos) {
          const cat = clasificarLlamada(u.name, u.input || {});
          totales.llamadas++;
          acc[cat].llamadas++;
          acc[cat].tokens_turno += parte;
          acc[cat].turnos += 1 / usos.length;
          porHerramienta.set(u.name, (porHerramienta.get(u.name) || 0) + 1);
          if (u.id) pendientes.set(u.id, cat);
        }
      } else if (m.role === 'user' && Array.isArray(m.content)) {
        for (const b of m.content) {
          if (!b || b.type !== 'tool_result') continue;
          const cat = pendientes.get(b.tool_use_id) || 'otro';
          pendientes.delete(b.tool_use_id);
          const { bytes, imagenes } = tamañoResultado(b.content);
          acc[cat].bytes_resultado += bytes;
          acc[cat].imagenes += imagenes;
          totales.bytes_resultado_totales += bytes;
          totales.imagenes_totales += imagenes;
        }
      }
    }
  }
  totales.sesiones = totales.sesiones.size;
  return { acc, totales, porHerramienta };
}

const ctxDe = (f) => Math.round(f.bytes_resultado / 4) + (f.imagenes || 0) * TOKENS_POR_IMAGEN;
const ctxTotal = (t) => Math.round(t.bytes_resultado_totales / 4) + t.imagenes_totales * TOKENS_POR_IMAGEN;

function tabla(acc, totales) {
  const filas = CATEGORIAS.map((c) => ({ cat: c, ...acc[c] }))
    .filter((f) => f.llamadas > 0 || f.tokens_turno > 0)
    .sort((a, b) => ctxDe(b) - ctxDe(a));
  const fmt = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
  const pct = (n, t) => (t ? ((n / t) * 100).toFixed(1) : '0.0').padStart(5) + '%';
  const lineas = [];
  lineas.push('CATEGORÍA                    LLAMADAS   %LLAM   CTX-INYECTADO   %CTX   TOKENS-TURNO(proxy)  %TOK');
  lineas.push('─'.repeat(103));
  for (const f of filas) {
    lineas.push(
      f.cat.padEnd(28) + fmt(f.llamadas).padStart(9) + ' ' + pct(f.llamadas, totales.llamadas)
      + fmt(ctxDe(f)).padStart(15) + ' tk ' + pct(ctxDe(f), ctxTotal(totales))
      + fmt(Math.round(f.tokens_turno)).padStart(20) + ' ' + pct(f.tokens_turno, totales.tokens_totales));
  }
  lineas.push('─'.repeat(103));
  // Pareto sobre contexto inyectado (la medición no-proxy)
  let acumulado = 0; const pareto = [];
  for (const f of filas) {
    acumulado += ctxDe(f);
    pareto.push(`${f.cat} (${((acumulado / ctxTotal(totales)) * 100).toFixed(1)}% acum)`);
    if (acumulado / ctxTotal(totales) >= 0.8) break;
  }
  lineas.push('PARETO 80% del contexto inyectado: ' + pareto.join(' · '));
  return lineas.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--dir');
  const dir = i >= 0 ? argv[i + 1]
    : path.join(os.homedir(), '.claude', 'projects', '-home-jorge-echegaray-os-app-echegaray-os');
  const t0 = Date.now();
  const { acc, totales, porHerramienta } = await medir(dir);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ acc, totales, porHerramienta: Object.fromEntries(porHerramienta) }, null, 2));
  } else {
    console.log(`FUENTE: ${dir}`);
    console.log(`archivos=${totales.archivos} lineas=${totales.lineas} sesiones=${totales.sesiones}`);
    console.log(`turnos_asistente=${totales.turnos_asistente} (sidechain/subagente=${totales.sidechain_turnos}) llamadas=${totales.llamadas}`);
    console.log(`tokens_facturados_totales=${totales.tokens_totales.toLocaleString('es-AR')}`);
    console.log(`contexto_inyectado_por_resultados≈${ctxTotal(totales).toLocaleString('es-AR')} tokens = texto ${Math.round(totales.bytes_resultado_totales / 4).toLocaleString('es-AR')} (${(totales.bytes_resultado_totales / 1e6).toFixed(1)} MB) + ${totales.imagenes_totales.toLocaleString('es-AR')} imágenes × ${TOKENS_POR_IMAGEN} (ESTIMACIÓN)`);
    console.log('');
    console.log(tabla(acc, totales));
    console.log('');
    const top = [...porHerramienta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    console.log('HERRAMIENTAS MÁS LLAMADAS: ' + top.map(([k, v]) => `${k}=${v}`).join('  '));
    console.log(`\n(medido en ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
}
