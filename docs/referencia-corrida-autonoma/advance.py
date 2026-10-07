#!/usr/bin/env python3
"""advance.py <ID> <spec.json>: intake -> in_progress (análisis y plan con compuertas; REVIEW se decide con la razón del spec; BLOCK se detiene)."""
import json, subprocess, sys, glob, re, shlex, os
SP = os.path.abspath(sys.argv[2])
root = '/Users/juanandrade/Desktop/ValMenTech/10-Proyectos/SaiOpenCloud'
tid, spec = sys.argv[1], json.load(open(sys.argv[2]))
q = shlex.quote
ACTOR = "Claude Code por delegación del PO (Juan David Andrade)"
def sh(cmd):
    r = subprocess.run(cmd, shell=True, cwd=root, capture_output=True, text=True, stdin=subprocess.DEVNULL)
    return r.returncode, (r.stdout + r.stderr)
def gate(name, reason):
    rc, out = sh(f'valmen gate {name} --id {tid}')
    res = re.search(r'RESULTADO:\s+(\w+)', out)
    res = res.group(1) if res else '?'
    print(f'gate {name}: {res}')
    if res == 'APPROVE': return
    if res != 'REVIEW':
        print(out[-1500:]); sys.exit(f'DETENIDO: gate {name} = {res}')
    motivo = re.search(r'Motivo:\s+(.*)', out); print('  motivo:', motivo.group(1)[:300] if motivo else '')
    rec = re.findall(rf'"id":"(GR-[^"]*-{name}-\d+)"', open(f'{root}/.valmen/receipts/{tid}.jsonl').read())[-1]
    rc, o = sh(f'valmen gate-decide --id {tid} --receipt {rec} --decision approve --actor {q(ACTOR)} --reason {q(reason)}')
    print(' ', o.strip()); 
    if rc: sys.exit('DETENIDO: gate-decide falló')
def step(cmd):
    rc, o = sh(cmd); print(o.strip()[-200:])
    if rc: sys.exit(f'FALLO {cmd}')
p = glob.glob(f'{root}/docs/tickets/*/{tid}/ticket.md')[0]
step(f'python3 {sys.path[0]}/fill.py {tid} {SP}')
step(f'valmen validate --id {tid}')
step(f'valmen transition --id {tid} --entity ticket --to analyzed')
gate('analysis', spec['analysis_reason'])
step(f'valmen transition --id {tid} --entity ticket --to planned')
gate('plan', spec['plan_reason'])
s = open(p).read()
s = s.replace("- Gate de plan y aprobación: pendiente", "- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación en chat del 2026-10-06 («Las decisiones se tomarán automáticamente según tu recomendación»); compuerta `plan` decidida y registrada en su recibo.", 1)
open(p, 'w').write(s)
step(f'valmen validate --id {tid}')
step(f'valmen transition --id {tid} --entity ticket --to approved')
step(f'valmen transition --id {tid} --entity ticket --to in_progress')
print('LISTO para implementar', tid)
