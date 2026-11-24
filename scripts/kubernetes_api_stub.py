#!/usr/bin/env python3
"""Small Kubernetes API stub for the MLflow kubernetes-auth runtime smoke.

The production CMD initializes the Kubernetes workspace provider synchronously.
This stub answers the two startup reads with an empty namespace list and an
absent optional MLflowConfig CRD so the real server can start without a cluster.
"""

from __future__ import annotations

import argparse
import json
import signal
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


NAMESPACE_LIST = {
    "apiVersion": "v1",
    "kind": "NamespaceList",
    "metadata": {"resourceVersion": "1"},
    "items": [],
}
NOT_FOUND = {
    "apiVersion": "v1",
    "kind": "Status",
    "status": "Failure",
    "message": "the server could not find the requested resource",
    "reason": "NotFound",
    "code": 404,
}


class Handler(BaseHTTPRequestHandler):
    server_version = "mlflow-konflux-stub/1.0"

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)

        if parsed.path == "/readyz":
            self._send_text(200, "ok\n")
            return
        if parsed.path == "/api/v1/namespaces":
            if query.get("watch", ["false"])[0].lower() in {"true", "1"}:
                time.sleep(0.5)
                self._send_text(200, "")
                return
            self._send_json(200, NAMESPACE_LIST)
            return
        if parsed.path.startswith("/api/v1/namespaces/"):
            self._send_json(404, NOT_FOUND)
            return
        if parsed.path == "/apis/mlflow.kubeflow.org/v1/mlflowconfigs":
            self._send_json(404, NOT_FOUND)
            return
        if parsed.path == "/version":
            self._send_json(
                200,
                {
                    "major": "1",
                    "minor": "31",
                    "gitVersion": "v1.31.0",
                    "platform": "linux/amd64",
                },
            )
            return
        self._send_json(404, NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        self._send_json(404, NOT_FOUND)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        sys.stderr.write(f"stub {self.address_string()} {format % args}\n")

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_text(self, status: int, body: str) -> None:
        encoded = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def write_kubeconfig(path: Path, server_host: str, port: int) -> None:
    kubeconfig = f"""apiVersion: v1
kind: Config
clusters:
- name: mlflow-konflux-stub
  cluster:
    server: http://{server_host}:{port}
contexts:
- name: mlflow-konflux-stub
  context:
    cluster: mlflow-konflux-stub
    user: mlflow-konflux-stub
current-context: mlflow-konflux-stub
users:
- name: mlflow-konflux-stub
  user: {{}}
"""
    path.write_text(kubeconfig, encoding="utf-8")
    path.chmod(0o644)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=18080)
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--server-host", default="host.docker.internal")
    parser.add_argument("--kubeconfig", type=Path, required=True)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.bind, args.port), Handler)
    server.daemon_threads = True
    write_kubeconfig(args.kubeconfig, args.server_host, args.port)

    def stop_server(_signum: int, _frame: object) -> None:
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop_server)
    signal.signal(signal.SIGINT, stop_server)

    print(
        f"READY stub listening on {args.bind}:{args.port}; "
        f"kubeconfig={args.kubeconfig}",
        flush=True,
    )
    try:
        server.serve_forever(poll_interval=0.2)
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
