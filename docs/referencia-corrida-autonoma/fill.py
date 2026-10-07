#!/usr/bin/env python3
"""fill.py <ID> <spec.json>: escribe descripción, diagnóstico, plan y anotaciones de criterios."""
import json, re, sys, glob
tid, spec = sys.argv[1], json.load(open(sys.argv[2]))
root = '/Users/juanandrade/Desktop/ValMenTech/10-Proyectos/SaiOpenCloud'
p = glob.glob(f'{root}/docs/tickets/*/{tid}/ticket.md')[0]
s = open(p).read()
def sect(name, body, nxt):
    global s
    s = re.sub(rf'## {name}\n.*?(?=## {nxt}\n)', f'## {name}\n\n{body.strip()}\n\n', s, count=1, flags=re.S)
d = spec['desc']; g = spec['diag']
sect('Descripción funcional', "\n".join(f"- {k}: {d[k]}" for k in ['Alcance','Usuario o rol afectado','Comportamiento actual','Comportamiento esperado']), 'Diagnóstico')
sect('Diagnóstico', "\n".join(f"- {k}: {g[k]}" for k in ['Archivos y flujo investigados','Causa raíz o hipótesis','Riesgos y compatibilidad','Impactos de sync, migración, Docker o despliegue']), 'Plan')
steps = "\n".join(f"  {i+1}. {t}" for i, t in enumerate(spec['plan']))
sect('Plan', f"- Gate de plan y aprobación: {spec.get('gate','pendiente')}\n- Pasos ordenados:\n{steps}\n- Rollback: {spec['rollback']}", 'Criterios de aceptación')
for crit, how in spec['criteria'].items():
    line = re.search(rf'^- \[ \] {re.escape(crit)}:.*$', s, flags=re.M)
    if not line: continue
    note = f"      <!-- test: {how} -->" if how != 'manual' else "      <!-- verify: manual -->"
    nxt = s[line.end():line.end()+14]
    if '<!--' not in nxt: s = s[:line.end()] + "\n" + note + s[line.end():]
for k, v in spec.get('frontmatter', {}).items():
    s = re.sub(rf'^{k}: .*$', f'{k}: {v}', s, count=1, flags=re.M)
open(p, 'w').write(s)
print('ok', p)
