"""Start each homework variant, run the acceptance suite against it, write results/acceptance.json."""
import argparse
import json
import os
import signal
import socket
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import httpx

BENCH = Path(__file__).resolve().parent
VARIANTS_DIR = BENCH.parent / "variants"
RESULTS = BENCH / "results"
VARIANTS = {"codex": (3001, 5101), "opus": (3002, 5102), "synergy": (3003, 5103)}
STARTUP_TIMEOUT_S = 120
PORT_FREE_TIMEOUT_S = 20


def port_open(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def free_ports(*ports: int) -> None:
    """Kill any listener left on our benchmark ports (apps may daemonize out of our group)."""
    deadline = time.monotonic() + PORT_FREE_TIMEOUT_S
    while time.monotonic() < deadline:
        busy = [p for p in ports if port_open(p)]
        if not busy:
            return
        for p in busy:
            pids = subprocess.run(["lsof", "-ti", f"tcp:{p}", "-sTCP:LISTEN"], capture_output=True, text=True).stdout.split()
            for pid in pids:
                try:
                    os.kill(int(pid), signal.SIGKILL)
                except ProcessLookupError:
                    pass
        time.sleep(1)
    raise RuntimeError(f"ports still busy: {[p for p in ports if port_open(p)]}")


def wait_http(url: str, proc: subprocess.Popen) -> bool:
    deadline = time.monotonic() + STARTUP_TIMEOUT_S
    while time.monotonic() < deadline:
        if proc.poll() is not None and not port_open(int(url.rsplit(":", 1)[1])):
            return False
        try:
            httpx.get(url, timeout=2)
            return True  # any HTTP response means the server is up
        except httpx.HTTPError:
            time.sleep(1)
    return False


def kill_group(proc: subprocess.Popen) -> None:
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(proc.pid, sig)
        except ProcessLookupError:
            return
        try:
            proc.wait(timeout=5)
            return
        except subprocess.TimeoutExpired:
            continue


def parse_junit(path: Path) -> dict:
    tests = []
    for case in ET.parse(path).getroot().iter("testcase"):
        if case.find("skipped") is not None:
            continue
        bad = case.find("failure")
        bad = bad if bad is not None else case.find("error")
        message = None
        if bad is not None:
            raw = bad.get("message") or (bad.text or "")
            message = raw.strip().splitlines()[0][:300] if raw.strip() else bad.tag
        name = f"{case.get('classname', '').rsplit('.', 1)[-1]}::{case.get('name')}"
        tests.append({"name": name, "passed": bad is None, "message": message})
    return {"passed": sum(t["passed"] for t in tests), "total": len(tests), "tests": tests}


def run_variant(name: str, api_port: int, ui_port: int) -> dict | None:
    script = VARIANTS_DIR / name / "run.sh"
    if not script.exists():
        print(f"[{name}] missing {script}")
        return None
    free_ports(api_port, ui_port)
    base_url = f"http://127.0.0.1:{api_port}"
    env = {**os.environ, "API_PORT": str(api_port), "UI_PORT": str(ui_port)}
    log = open(RESULTS / f"{name}.server.log", "w")
    proc = subprocess.Popen(["bash", str(script)], cwd=script.parent, env=env,
                            stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        print(f"[{name}] waiting for {base_url}")
        if not wait_http(base_url, proc):
            print(f"[{name}] unreachable, see {log.name}")
            return None
        junit = RESULTS / f"{name}.junit.xml"
        subprocess.run([sys.executable, "-m", "pytest", str(BENCH / "acceptance"), "-q", "-p", "no:cacheprovider",
                        f"--junitxml={junit}"], cwd=BENCH, env={**os.environ, "BASE_URL": base_url})
        result = parse_junit(junit)
        print(f"[{name}] {result['passed']}/{result['total']}")
        return result
    finally:
        kill_group(proc)
        log.close()
        free_ports(api_port, ui_port)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=sorted(VARIANTS))
    args = parser.parse_args()
    RESULTS.mkdir(exist_ok=True)
    out = RESULTS / "acceptance.json"
    results = json.loads(out.read_text()) if args.only and out.exists() else {}
    for name, (api_port, ui_port) in VARIANTS.items():
        if args.only and name != args.only:
            continue
        results[name] = run_variant(name, api_port, ui_port)
        out.write_text(json.dumps(results, indent=2))
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
