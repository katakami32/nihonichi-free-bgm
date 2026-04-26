#!/usr/bin/env python3
"""全 MP3 にデクリッパー + 始端フェードイン処理 (並列版)。"""
import os, subprocess, shutil, time, sys, threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

ROOT   = Path(__file__).resolve().parent.parent
AUDIO  = ROOT / 'audio'
BACKUP = ROOT / 'audio.backup'
FFMPEG = os.path.expanduser('~/.local/bin/ffmpeg')

if not Path(FFMPEG).exists():
    print(f'ffmpeg not found at {FFMPEG}'); sys.exit(1)

# 引数
limit = None
workers = 8
args = sys.argv[1:]
i = 0
while i < len(args):
    if args[i] == '--limit':   limit = int(args[i+1]); i += 2
    elif args[i] == '--workers': workers = int(args[i+1]); i += 2
    else: i += 1

# バックアップ
if not BACKUP.exists():
    print(f'Backup audio/ → audio.backup/ …')
    shutil.copytree(AUDIO, BACKUP)
    print('  done')

files = sorted(BACKUP.rglob('*.mp3'))
if limit: files = files[:limit]
print(f'Processing {len(files)} files with {workers} workers…')

# 進捗カウンタ (mutable container にして global 問題を回避)
counter = {'done': 0, 'err': 0, 'last_errs': []}
lock = threading.Lock()
t0 = time.time()

def process(src_path: Path):
    rel = src_path.relative_to(BACKUP)
    dst = AUDIO / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    # 既に処理済 (audio/の mtime が backup/ より新しい) ならスキップ
    if dst.exists() and dst.stat().st_mtime > src_path.stat().st_mtime + 1:
        with lock:
            counter['done'] += 1
            n = counter['done'] + counter['err']
            if n % 50 == 0 or n == len(files):
                elapsed = time.time() - t0
                eta = elapsed * (len(files) - n) / max(1, n)
                print(f'  {n}/{len(files)}  ok={counter["done"]} err={counter["err"]}  '
                      f'({elapsed:.0f}s, eta {eta:.0f}s)', flush=True)
        return
    tmp = dst.with_suffix('.mp3.tmp')
    cmd = [
        FFMPEG, '-y', '-loglevel', 'error',
        '-i', str(src_path),
        # シンプル版 (adeclick外す): 始端を50ms遅延 + 20msフェードイン + 末尾40ms無音追加
        # これでLAME priming samplesと切替時のクリックは完全除去 (高速)
        '-af', 'adelay=50|50,afade=t=in:d=0.02,apad=pad_dur=0.04',
        '-codec:a', 'libmp3lame', '-b:a', '192k',
        '-f', 'mp3',
        str(tmp)
    ]
    error_msg = None
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=120)
        if r.returncode != 0:
            error_msg = r.stderr.decode('utf-8', errors='replace')[:300]
        elif not tmp.exists() or tmp.stat().st_size < 1024:
            error_msg = 'empty output'
        else:
            tmp.replace(dst)
    except subprocess.TimeoutExpired:
        error_msg = 'timeout'
    except Exception as e:
        error_msg = repr(e)[:200]
    if tmp.exists():
        try: tmp.unlink()
        except: pass

    with lock:
        if error_msg is None:
            counter['done'] += 1
        else:
            counter['err'] += 1
            if len(counter['last_errs']) < 5:
                counter['last_errs'].append(f'{rel}: {error_msg}')
        n = counter['done'] + counter['err']
        if n % 50 == 0 or n == len(files):
            elapsed = time.time() - t0
            eta = elapsed * (len(files) - n) / max(1, n)
            print(f'  {n}/{len(files)}  ok={counter["done"]} err={counter["err"]}  '
                  f'({elapsed:.0f}s, eta {eta:.0f}s)', flush=True)

with ThreadPoolExecutor(max_workers=workers) as ex:
    list(ex.map(process, files))

print(f'\n✔ Done. ok={counter["done"]}/{len(files)}  err={counter["err"]}  '
      f'({time.time()-t0:.0f}秒)')
if counter['last_errs']:
    print('--- sample errors ---')
    for e in counter['last_errs']:
        print('  ', e)
