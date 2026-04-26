#!/usr/bin/env python3
"""
Parallel downloader. Reads data/downloads.tsv (URL<TAB>local_path) and writes
each resource to its destination. Skips files already downloaded (resume-safe).
Logs progress and failures to data/download_log.txt / data/download_failed.tsv.
"""
import os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TSV  = os.path.join(ROOT, "data", "downloads.tsv")
LOG  = os.path.join(ROOT, "data", "download_log.txt")
FAIL = os.path.join(ROOT, "data", "download_failed.tsv")

CONCURRENCY = int(os.environ.get("CONCURRENCY", "8"))
TIMEOUT     = int(os.environ.get("TIMEOUT", "60"))
MIN_BYTES   = 1024   # treat smaller as failure

def load_tasks():
    tasks = []
    with open(TSV) as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            url, dst = line.split("\t", 1)
            tasks.append((url, os.path.join(ROOT, dst)))
    return tasks

def download_one(url, dst):
    if os.path.exists(dst) and os.path.getsize(dst) >= MIN_BYTES:
        return ("skip", url, dst, None)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp = dst + ".part"
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; BGM-archiver/1.0)"
        })
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r, open(tmp, "wb") as f:
            while True:
                chunk = r.read(65536)
                if not chunk: break
                f.write(chunk)
        if os.path.getsize(tmp) < MIN_BYTES:
            os.remove(tmp)
            return ("fail", url, dst, f"too small")
        os.rename(tmp, dst)
        return ("ok", url, dst, None)
    except Exception as e:
        try: os.remove(tmp)
        except OSError: pass
        return ("fail", url, dst, str(e))

def main():
    tasks = load_tasks()
    print(f"tasks: {len(tasks)}  concurrency: {CONCURRENCY}")
    ok = skip = fail = 0
    failures = []
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex, \
         open(LOG, "a") as log_f:
        futs = [ex.submit(download_one, u, d) for u, d in tasks]
        for i, fut in enumerate(as_completed(futs), 1):
            status, url, dst, err = fut.result()
            if status == "ok":   ok += 1
            elif status == "skip": skip += 1
            else:
                fail += 1
                failures.append((url, dst, err or ""))
            if i % 50 == 0 or i == len(tasks):
                rate = i / max(1, time.time() - t0)
                eta_s = (len(tasks) - i) / max(rate, 0.01)
                msg = (f"[{i}/{len(tasks)}] ok={ok} skip={skip} fail={fail} "
                       f"rate={rate:.1f}/s eta={eta_s/60:.1f}min")
                print(msg, flush=True)
                log_f.write(msg + "\n"); log_f.flush()
    # Write failures for retry
    if failures:
        with open(FAIL, "w") as f:
            for u, d, e in failures:
                f.write(f"{u}\t{d}\t{e}\n")
    print(f"DONE ok={ok} skip={skip} fail={fail} elapsed={time.time()-t0:.1f}s")

if __name__ == "__main__":
    main()
