#!/usr/bin/env python3
"""Replay the per-pawn 64-entry experience buffer from a run's audit store (post-Gate-C item 7).

Usage: attention-eviction-replay.py <ongoing-RUN.db>
Reads only the `events` audit table: native-event (with its recorded route) and the
attention cursor moves (attention-started / attention-native throughSeq). Cursor movement is
taken as recorded, so this answers "which experiences would the buffer have lost", not "what
would the pawns have thought". Prints losses as run, with intent-ordinary routed native, and
with native/considered experiences evicted first.
"""
import collections,json,sqlite3,sys
from pathlib import Path
rows=[json.loads(d) for (d,) in sqlite3.connect(Path(sys.argv[1]).resolve().as_uri()+'?mode=ro',uri=True).execute('select data from events order by seq')]
def replay(native_first,ordinary_native):
    buf=collections.defaultdict(list);cursor=collections.defaultdict(int);lost=collections.Counter();waiting=0
    for r in rows:
        if r['kind'] in('attention-started','attention-native'):cursor[r['actor']]=r['data']['throughSeq']
        if r['kind']!='native-event':continue
        e=r['data']['event'];route='native' if ordinary_native and e['kind']=='intent-ordinary' else r['data']['route']
        b=buf[e['pawn']];b.append((e['seq'],e['kind'],route));c=cursor[e['pawn']]
        if len(b)>64:
            i=next((k for k,x in enumerate(b) if x[2]=='native' or x[0]<=c),0) if native_first else 0
            seq,kind,rt=b.pop(i)
            if seq>c and rt!='native':lost[kind]+=1
        waiting=max(waiting,sum(1 for x in b if x[0]>c and x[2]!='native'))
    return {'lost':sum(lost.values()),'byKind':dict(lost),'maxWaitingPerPawn':waiting}
print(json.dumps({'asRun':replay(False,False),'ordinaryNative':replay(False,True),'bothFixes':replay(True,True)},indent=1))
