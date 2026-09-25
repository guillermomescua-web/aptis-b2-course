"""Check the generated index before publishing the static course."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / "data" / "course.json").read_text(encoding="utf-8"))
exercises = data["exercises"]
questions = [q for ex in exercises for q in ex["questions"]]
ids = [q["id"] for q in questions]

assert len(data["pdfs"]) == 16
assert all((ROOT / "pdfs" / name).is_file() for name in data["pdfs"])
assert len(data["sessions"]) == 32
assert all(data["sessions"][f"W{w}D{d}"]["plan"] for w in range(1, 9) for d in range(1, 5))
assert len(exercises) == 201
assert len(ids) == len(set(ids)) == 972
assert set(ids) == set(data["answers"])
assert len(data["recordings"]) == 88
assert all(data["recordings"][key] for key in data["recordings"])

for ex in exercises:
    for q in ex["questions"]:
        match = re.match(r"^([A-Z])\s*[-–]", data["answers"][q["id"]])
        if match and q["options"]:
            assert match.group(1) in {o["key"] for o in q["options"]}, q["id"]

for n in range(1, 5):
    prefix = f"MOCK{n:02d}-"
    for component in ("CORE", "READ", "LIST", "WRITE", "SPEAK"):
        assert any(ex["id"].startswith(prefix + component) for ex in exercises)
    assert all(f"MOCK{n:02d}-LIST-R{recording:02d}" in data["recordings"] for recording in range(1, 21))

print("OK: 16 PDFs, 32 sesiones, 4 simulacros, 201 ejercicios, 972 preguntas/soluciones y 88 grabaciones.")
