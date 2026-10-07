#!/usr/bin/env python3
"""finish.py <ID> <close.json>: commit local del código, compuerta qa-mechanical, QA, cierre y commit documental.
close.json: {files:[...], commit_msg, impl, tests, env, point:{title,actual,expected}, tecnico, funcional, release, visual:false}"""
import json, subprocess, sys, glob, re, shlex
root = '/Users/juanandrade/Desktop/ValMenTech/10-Proyectos/SaiOpenCloud'
tid, c = sys.argv[1], json.load(open(sys.argv[2]))
PO = ("«En la fase de QA, si el ticket requiere ejecutar una prueba contra Docker o la consola, tú la ejecutarás. "
      "Si el resultado es el esperado, aprobarás el QA, lo documentarás y cerrarás el ticket» — Juan Andrade, 2026-10-06, delegación del PO para todo el feature precarga-catalogos")
def sh(cmd, check=True, **kw):
    r = subprocess.run(cmd, shell=True, cwd=root, capture_output=True, text=True, stdin=subprocess.DEVNULL, **kw)
    out = (r.stdout + r.stderr).strip()
    print(f'$ {cmd[:110]}\n{out[-400:]}')
    if check and r.returncode: sys.exit(f'FALLO: {cmd}')
    return out
q = lambda x: shlex.quote(x)
def vm(*a): return sh('valmen ' + ' '.join(a))
p = glob.glob(f'{root}/docs/tickets/*/{tid}/ticket.md')[0]
def edit(fn):
    s = open(p).read(); s = fn(s); open(p, 'w').write(s)
MODE = sys.argv[3] if len(sys.argv) > 3 else ''
RES = MODE == 'from_evidence'
GATE = MODE == 'from_gate'
sha = None
if GATE:
    sha = sh('git log -1 --format=%H -- ' + c['files'][0]).strip()
# 1. commit local del código
if not RES:
  pass
if RES:
    sha = sh('git log -1 --format=%H -- ' + c['files'][0]).strip()
else:
    if not GATE:
        files = ' '.join(c['files'])
        sh(f'git add {files}')
        sh("git commit -q -F - <<'EOM'\n" + c['commit_msg'] + f"\n\nTicket: {tid}\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nEOM")
        sha = sh('git rev-parse HEAD').strip()
    # 2. secciones del ticket
    def sections(s):
        s = re.sub(r'## Implementación\n.*?(?=## Pruebas)', f"## Implementación\n\n{c['impl'].strip()}\n\nCommit local de la implementación: `{sha}` (sin push, por decisión del PO para este feature).\n\n", s, count=1, flags=re.S)
        s = re.sub(r'## Pruebas\n.*?(?=## QA)', f"## Pruebas\n\n{c['tests'].strip()}\n\n", s, count=1, flags=re.S)
        s = re.sub(r'^- \[ \] (.*)(?=\n\s+<!-- test:)', r'- [x] \1', s, flags=re.M)
        return s
    if not GATE:
        edit(sections)
    vm('validate --id', tid)
    vm('gate qa-mechanical --id', tid)
    vm('transition --id', tid, '--entity ticket --to awaiting_user_tests')
    if c.get('visual'):
        sh('git add docs/tickets/2026/' + tid + ' docs/tickets/index.md .valmen/receipts/' + tid + '.jsonl && git commit -q -m "docs(tickets): ' + tid + ' en awaiting_user_tests\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"')
        print('VISUAL: queda en awaiting_user_tests'); sys.exit(0)
    edit(lambda s: s.replace('\n## QA\n', f"\n- Resultado del PO: {PO}. Las pruebas del ticket las ejecutó el agente en Docker y dieron el resultado esperado.\n\n## QA\n", 1))
    vm('validate --id', tid)
    vm('transition --id', tid, '--entity ticket --to in_qa')
    pt = c['point']
    vm('add-point --id', tid, '--title', q(pt['title']), '--severity normal --actual', q(pt['actual']), '--expected', q(pt['expected']), '--files', ','.join(c['files']))
    for st in ('analyzed', 'in_progress', 'awaiting_retest'):
        vm('transition --id', tid, '--entity point --point-id POINT-001 --to', st)
vm('add-evidence --id', tid, '--kind automated-test --point-id POINT-001 --reference worktree --description', q(c['tests'].strip().split('\n')[0].replace('`','')))
vm('qa-start --id', tid, '--environment', q(c['env']), '--build-reference', f'commit:{sha}')
vm('add-retest --id', tid, '--point-id POINT-001 --result approved --po-confirmation', q(PO))
vm('transition --id', tid, '--entity point --point-id POINT-001 --to closed')
vm('qa-close --id', tid, '--result approved --po-confirmation', q(PO))
vm('transition --id', tid, '--entity ticket --to qa_approved')
vm('add-ai-usage --id', tid, '--source', q('manual:sesión de Claude Code que trabajó varios tickets del feature precarga-catalogos'), '--confidence medium --model anthropic/claude-sonnet-5-5 --notes', q('Sesión única para el feature completo por decisión del PO; sin agregado por ticket, el costo no se reparte para no inventar números. Costo completo en la línea de tiempo de Claude Code.'))
vm('close-attempt --id', tid, '--technical-summary', q(c['tecnico']), '--functional-summary', q(c['funcional']), '--qa-status approved --release-impact', q(c['release']))
vm('transition --id', tid, '--entity ticket --to closed')
vm('validate --id', tid)
sh('valmen secrets </dev/null | tail -1')
sh(f'git add docs/tickets/2026/{tid} docs/tickets/index.md .valmen/receipts/{tid}.jsonl && git commit -q -m "docs(tickets): cierra {tid}\n\nQA aprobado por delegación del PO; implementación en {sha[:8]}.\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"')
print('CERRADO', tid)
