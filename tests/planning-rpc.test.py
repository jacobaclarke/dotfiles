"""Smoke-test the package in real Pi without provider calls or user settings."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]

with tempfile.TemporaryDirectory(prefix="pi-planning-test-") as temp:
    process = subprocess.Popen(
        ["pi", "--offline", "--no-extensions", "--extension", str(ROOT),
         "--no-skills", "--no-prompt-templates", "--no-context-files",
         "--mode", "rpc", "--no-session"],
        cwd=temp,
        env={**os.environ, "PI_CODING_AGENT_DIR": temp, "PI_TELEMETRY": "0"},
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    deadline = threading.Timer(30, process.kill)
    deadline.start()
    events = []
    counter = 0

    def rpc(kind, **kwargs):
        global counter
        counter += 1
        request_id = str(counter)
        process.stdin.write(json.dumps({"id": request_id, "type": kind, **kwargs}).encode() + b"\n")
        process.stdin.flush()
        while line := process.stdout.readline():
            record = json.loads(line)
            events.append(record)
            if record.get("id") == request_id and record.get("type") == "response":
                assert record["success"], record
                return record.get("data", {})
        raise AssertionError("Pi exited before responding: " + process.stderr.read().decode())

    try:
        commands = {item["name"] for item in rpc("get_commands")["commands"]}
        assert {"goal", "plan", "plan-status", "execute"} <= commands, commands
        assert rpc("prompt", message="/plan")["disposition"] == "handled"
        blocked = rpc("bash", command="printf should-not-run")
        assert blocked["exitCode"] == 1, blocked
        assert "disabled during planning" in blocked["output"], blocked
        entries = rpc("get_entries")["entries"]
        saved = [entry["data"] for entry in entries if entry.get("customType") == "jacob-planning-v1"]
        assert saved[-1]["mode"] == "planning", saved
        rpc("prompt", message="/plan off")
        allowed = rpc("bash", command="printf restored")
        assert allowed["exitCode"] == 0 and allowed["output"] == "restored", allowed
        rpc("prompt", message="/goal Verify package loading")
        rpc("prompt", message="/plan-status")
        entries = rpc("get_entries")["entries"]
        saved = [entry["data"] for entry in entries if entry.get("customType") == "jacob-planning-v1"]
        assert saved[-1]["goal"] == "Verify package loading", saved
        assert rpc("get_session_stats")["assistantMessages"] == 0
        assert not any(event.get("type") == "agent_start" for event in events)
        print("PASS: real Pi loads commands, saves goals, blocks planning shells, and restores execution; no model calls")
    finally:
        process.stdin.close()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        deadline.cancel()
        stderr = process.stderr.read().decode()
        assert process.returncode == 0, stderr
        assert "Extension error" not in stderr, stderr
