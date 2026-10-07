#!/usr/bin/env python3
"""close_po.py <KEY>: desde awaiting_user_tests hasta closed con la confirmación literal del PO."""
import json, subprocess, sys, glob, re, shlex
root = '/Users/juanandrade/Desktop/ValMenTech/10-Proyectos/SaiOpenCloud'
key = sys.argv[1]
PO = ("«si confirmo» — Juan Andrade, 2026-10-06, respuesta a la pregunta «¿Confirmas el cierre con esas dos anotadas?» "
      "(R-MED-003: repetir la medición a 10 Mbps en dev; R-PREC-004: revisar a mano que el hilo principal no se bloquea). "
      "Antes había probado en la nube dev: «en cuanto a la carga super bien ya es muchisimo mas rapido» y pidió las correcciones visuales ya entregadas")
D = {
 'SNAPSHOT-PRODUCTOS': dict(pt=('Productos y códigos de barras se descargaban con imágenes en base64 y por páginas',
   'La precarga de productos transportaba el base64 de cada imagen y tardaba segundos por la paginación.',
   'Snapshot plano de productos y códigos de barras sin base64, con la imagen servida por api/product-image/.'),
   tec='Servicio snapshots.py para Products y BarCodes, endpoint api/product-image/<pk>/ con caché inmutable y pipe productImage en el carrito.',
   fun='El carrito abre mucho más rápido y los productos con imagen heredada siguen mostrándola.',
   rel='unreleased: requiere el backend con los endpoints de catálogos; sin migraciones propias.', manual_ok=['R-SNAP-007']),
 'WORKER': dict(pt=('La descarga y la escritura de catálogos ocurrían en el hilo principal',
   'Leer el JSON y escribir en IndexedDB bloqueaba la interfaz durante la carga.',
   'Un Web Worker descarga, lee y reemplaza la colección, también al Recargar.'),
   tec='precarga.worker.ts con cliente en el hilo principal, reemplazo atómico de la colección y reintentos por la cola.',
   fun='La pantalla no se congela mientras se cargan los catálogos y Recargar vuelve a traer todo.',
   rel='unreleased: solo frontend, sin migración.', manual_ok=[]),
 'RUTAS': dict(pt=('Cada pantalla cargaba todos los catálogos antes de abrir',
   'El carrito esperaba catálogos que no necesita para abrir.',
   'Cada ruta declara los catálogos para abrir y los de segundo plano.'),
   tec='route-catalogs.ts y los resolvers de rutas declaran open y background.',
   fun='Las pantallas abren con lo mínimo y el resto se carga en segundo plano.',
   rel='unreleased: solo frontend, sin migración.', manual_ok=[]),
 'ORBE': dict(pt=('No existía un orbe animado con los colores del tema',
   'La carga mostraba un indicador genérico.',
   'Componente app-orb con el motor thinking-orbs, paleta del tema, claro y oscuro, movimiento reducido.'),
   tec='OrbComponent con el motor incluido en el repositorio y perfiles para el orbe grande; después se agregó la preferencia del usuario guardada en localStorage (commit d155da54).',
   fun='La carga muestra un orbe que sigue el tema, por defecto Órbitas, y cada usuario puede elegir otro desde el detalle.',
   rel='unreleased: solo frontend, sin migración.', manual_ok=[]),
 'PANTALLA': dict(pt=('La pantalla de carga no tenía fases, barra ni fichas',
   'Un indicador genérico sin información de avance.',
   'Pantalla A con fases, barra por peso y fichas por grupo, ajustada al prototipo tras las pruebas en la nube.'),
   tec='LoadingScreenComponent y screen-model; correcciones visuales del PO en e6ffcd23 y preferencia de orbe en d155da54.',
   fun='El usuario ve qué se carga, cuánto falta y puede abrir el detalle.',
   rel='unreleased: solo frontend, sin migración.', manual_ok=[]),
 'DETALLE': dict(pt=('No había detalle de la carga ni forma de ver un error',
   'Un fallo de catálogo quedaba en silencio.',
   'Tablero de detalle con Cerrar que se abre solo ante un error, sin triple scroll, con selector de orbe.'),
   tec='LoadingDetailComponent con tablero, últimos eventos y selector de orbe como preferencia del equipo (e6ffcd23, d155da54).',
   fun='El usuario ve el estado de cada catálogo, reintenta uno fallido y elige su orbe.',
   rel='unreleased: solo frontend, sin migración.', manual_ok=[]),
 'PILDORA': dict(pt=('La carga en segundo plano no se veía una vez abierta la app',
   'Los terceros seguían cargando sin ninguna señal.',
   'Píldora con orbe, catálogo y porcentaje, y detalle de la última carga en el menú.'),
   tec='PrecargaPillComponent y pill-model; ahora el orbe sigue la preferencia del usuario (d155da54).',
   fun='El usuario sabe que algo carga en segundo plano y puede ver la última carga.',
   rel='unreleased: solo frontend, sin migración.', manual_ok=[]),
 'METAS': dict(pt=('Las metas de 5 s al iniciar y 1 s al reabrir no estaban medidas',
   'Sin medición con el stack real y volumen del cliente.',
   'Medición documentada y comando de siembra para repetirla.'),
   tec='seed_precarga_benchmark, marcas User Timing y docs/benchmarks/precarga-metas.md con el procedimiento.',
   fun='Se midió abrir el carrito en 1,16–1,66 s y reabrir en 0,52 s; quedan por repetir los 10 Mbps en dev.',
   rel='unreleased: sin migraciones propias.', manual_ok=['R-MED-004']),
}
c = D[key]
def sh(cmd, check=True):
    r = subprocess.run(cmd, shell=True, cwd=root, capture_output=True, text=True, stdin=subprocess.DEVNULL)
    out = (r.stdout + r.stderr).strip(); print(f'$ {cmd[:100]}\n{out[-300:]}')
    if check and r.returncode: sys.exit('FALLO: ' + cmd)
    return out
q = shlex.quote
def vm(*a): return sh('valmen ' + ' '.join(a))
p = [x for x in glob.glob(f'{root}/docs/tickets/2026/*PRECARGA-{key}-*/ticket.md')][0]
tid = p.split('/')[-2]
s = open(p).read()
sha = re.search(r'Commit local de la implementación: `([0-9a-f]{40})`', s).group(1)
for crit in c['manual_ok']:
    s = re.sub(rf'^- \[ \] ({crit}:.*)$', r'- [x] \1', s, flags=re.M)
pend = {'WORKER': 'R-PREC-004 queda pendiente de la revisión manual del PO (el hilo principal no se bloquea).',
        'METAS': 'R-MED-003 queda pendiente de que el PO repita la medición a 10 Mbps en dev (procedimiento en docs/benchmarks/precarga-metas.md).'}.get(key, '')
if 'Resultado del PO: «si confirmo»' not in s:
  s = s.replace('\n## QA\n', f"\n- Resultado del PO: {PO}. {pend}\n\n## QA\n", 1)
open(p, 'w').write(s)
s = open(p).read()
if '"id": "POINT-001"' not in s:
    vm('validate --id', tid)
    vm('transition --id', tid, '--entity ticket --to in_qa')
    vm('add-point --id', tid, '--title', q(c['pt'][0]), '--severity normal --actual', q(c['pt'][1]), '--expected', q(c['pt'][2]))
    for st in ('analyzed', 'in_progress', 'awaiting_retest'):
        vm('transition --id', tid, '--entity point --point-id POINT-001 --to', st)
s = open(p).read()
files = [f for f in sh(f'git show --name-only --format= {sha}').split('\n') if f and 'ticket' not in f]
if '"affected_files": []' in s:
    arr = json.dumps(files, indent=2, ensure_ascii=False).replace('\n', '\n    ')
    s = s.replace('"affected_files": []', '"affected_files": ' + arr, 1)
    open(p, 'w').write(s)
if 'EVIDENCE-001' not in open(p).read():
  vm('add-evidence --id', tid, '--kind automated-test --point-id POINT-001 --reference worktree --description', q('Suites del ticket y de common/ en verde (412 de 412 en common/ al 2026-10-06) y pruebas del PO en dev'))
if 'QA-001' not in open(p).read():
  vm('qa-start --id', tid, '--environment', q('local (Docker Compose y Karma) y nube dev, probado por el PO'), '--build-reference', 'commit:' + sh('git rev-parse HEAD').strip())
vm('add-retest --id', tid, '--point-id POINT-001 --result approved --po-confirmation', q(PO))
vm('transition --id', tid, '--entity point --point-id POINT-001 --to closed')
vm('qa-close --id', tid, '--result approved --po-confirmation', q(PO))
vm('transition --id', tid, '--entity ticket --to qa_approved')
vm('add-ai-usage --id', tid, '--source', q('manual:sesión de Claude Code que trabajó varios tickets del feature precarga-catalogos'), '--confidence medium --model anthropic/claude-sonnet-5-5 --notes', q('Sesión única para el feature completo por decisión del PO; sin agregado por ticket, el costo no se reparte para no inventar números. Costo completo en la línea de tiempo de Claude Code.'))
vm('close-attempt --id', tid, '--technical-summary', q(c['tec']), '--functional-summary', q(c['fun']), '--qa-status approved --release-impact', q(c['rel']))
vm('transition --id', tid, '--entity ticket --to closed')
vm('validate --id', tid)
print('CERRADO', tid)
