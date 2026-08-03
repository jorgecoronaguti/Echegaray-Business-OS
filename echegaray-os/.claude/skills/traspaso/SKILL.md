---
name: traspaso
description: Cierra la sesión dejando por escrito el estado para retomarla horas o días después sin reconstruir contexto. Usalo antes de cerrar Claude Code con trabajo a medio hacer, cuando el contexto se está llenando y va a haber `/clear`, o cuando el dueño dice "seguimos mañana". NO lo uses para documentar una decisión permanente — eso va a una skill, a `.claude/rules/` o a la memoria.
argument-hint: "[nota opcional sobre dónde quedó]"
allowed-tools: Read, Write, Edit, Bash(git *)
---

# Traspaso de sesión

Escribí `.claude/estado/traspaso.md`. La sesión que sigue lo recibe automáticamente en su primer
mensaje, junto al estado real de git — el hook `SessionStart` ya lo inyecta.

## El estado mecánico ya está resuelto

No lo copies. El hook calcula rama, archivos sin commitear y últimos commits **en el momento de
abrir**, que es la única forma de que no mientan. Un traspaso que repite la rama de ayer es una
trampa: se lee con confianza y ya no es cierta.

Estado ahora mismo:

- rama: !`git rev-parse --abbrev-ref HEAD`
- sin commitear: !`git status --porcelain | wc -l` archivo(s)
- últimos commits: !`git log -3 --format='%h %s'`

## Lo que sí tenés que escribir

Sólo lo que ningún comando puede deducir. Cinco cosas, en este orden, y ninguna de relleno:

1. **OBJETIVO** — qué se estaba tratando de lograr, en una oración. No la tarea: el resultado.
2. **DÓNDE QUEDÓ** — qué anda ya, qué está a medio hacer y qué no se empezó. Con archivo y línea
   cuando aplique.
3. **DECISIONES** — lo que se decidió y **por qué**, incluyendo lo que se descartó. Sin el porqué,
   la sesión siguiente vuelve a discutir lo mismo y a veces lo revierte.
4. **QUÉ ESTÁ VERIFICADO Y QUÉ NO** — el comando que se corrió y qué devolvió. Lo que *parece* que
   anda pero no se probó se escribe como no probado. Esta línea es la que evita cerrar un agujero
   por segunda vez.
5. **PRÓXIMO PASO** — una acción concreta, ejecutable, la primera. No una lista de deseos.

Y si hay algo trabado: **BLOQUEO** — qué falta y de quién depende.

## Formato

Empezá el archivo con `fecha: AAAA-MM-DD` en una línea sola: el hook la muestra para que se vea de
cuándo es. Después las secciones de arriba con encabezados `##`.

## Techo

**Menos de 2.000 caracteres.** Se paga en el arranque de cada sesión siguiente, y el sistema entero
existe para bajar ese arranque. Por encima del techo el hook lo recorta y avisa dónde leer el resto
—no se pierde nada— pero un traspaso que necesita 5.000 caracteres casi siempre está contando la
historia en vez del estado. Si de verdad hace falta el detalle, va en un archivo aparte y el
traspaso lo referencia por ruta.

## Lo que NO va acá

- Conocimiento que sirve más allá de esta tarea → skill, `.claude/rules/` o memoria.
- La narración de lo que se intentó y falló, salvo que explique una decisión.
- Cifras de negocio: no son estado de la sesión y se desactualizan solas.
