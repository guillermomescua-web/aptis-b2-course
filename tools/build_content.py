"""Build the static course data directly from the frozen course PDFs.

Run from the repository root: python tools/build_content.py
Requires pypdf. The PDFs remain the source of truth; this script only indexes them.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PDFS = ROOT / "pdfs"
OUT = ROOT / "data" / "course.json"
HEADER = re.compile(r"^APTIS ESOL GENERAL \| B2 PERFORMANCE COURSE\n\d+\n", re.M)
SECTION = re.compile(
    r"^(W[1-8]D[1-4]-E\d{2}|W1D1-DIAG-E\d{2}|MOCK\d{2}-[A-Z]+(?:-(?!Q\d{2}\b)[A-Z0-9]+)?|MB[WVS]-E\d{2})\s*\|\s*(.+)$",
    re.M,
)
QUESTION = re.compile(r"((?:W[1-8]D[1-4]-(?:DIAG-)?E\d{2}|MOCK\d{2}-[A-Z]+(?:-[A-Z0-9]+)?|MB[WVS]-E\d{2})-Q\d{2})")
ANSWER = re.compile(r"^((?:W[1-8]D[1-4]-(?:DIAG-)?E\d{2}|MOCK\d{2}-[A-Z]+(?:-[A-Z0-9]+)?|MB[WVS]-E\d{2})-Q\d{2}):\s*(.+)$", re.M)
RECORDING = re.compile(r"^((?:W[1-8]D[1-4]-(?:DIAG-)?E\d{2}|MOCK\d{2}-LIST)-R\d{2})(?:\s+(.+))?$", re.M)
OPTION = re.compile(r"(?:^|\s)([A-H])\.\s+", re.M)
DAY = re.compile(r"^(W[1-8]D[1-4]) - DAY [1-4] \| 60 MIN\s*$", re.M)


def pdf_text(name: str) -> str:
    reader = PdfReader(PDFS / name)
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    text = HEADER.sub("", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def parse_options(raw: str) -> tuple[str, list[dict]]:
    matches = list(OPTION.finditer(raw))
    if len(matches) < 2:
        return raw, []
    # An objective question's choices follow its prompt. Reading headings and
    # matching banks remain in the exercise context, where they are fully visible.
    prompt = raw[: matches[0].start()].strip()
    opts = []
    for i, match in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(raw)
        opts.append({"key": match.group(1), "text": clean(raw[match.end() : end])})
    return prompt, opts


def parse_exercises(text: str, source: str) -> list[dict]:
    heads = list(SECTION.finditer(text))
    result = []
    for i, head in enumerate(heads):
        body = text[head.end() : heads[i + 1].start() if i + 1 < len(heads) else len(text)]
        # Correction-period instructions sit after the last exercise in a day.
        body = re.split(r"(?m)^Use the remaining \d+ minutes:", body)[0]
        body = re.split(r"(?m)^W[1-8]D[1-4] - DAY \d+ \|", body)[0]
        body = re.split(r"(?m)^MOCK\d{2} \| (?:CORE|READING|LISTENING|WRITING|SPEAKING) \|", body)[0]
        qmatches = list(QUESTION.finditer(body))
        if not qmatches:
            continue
        context = body[: qmatches[0].start()].strip()
        questions = []
        pending_intro = ""
        for j, q in enumerate(qmatches):
            qraw = body[q.end() : qmatches[j + 1].start() if j + 1 < len(qmatches) else len(body)]
            qraw = qraw.lstrip(" :|\n").strip()
            qraw = re.sub(r"(?m)^Answer: _+\s*$", "", qraw).strip()
            qraw = re.sub(r"\s*\|\s*$", "", qraw)
            next_intro = ""
            if head.group(1).endswith("-CORE-V"):
                group_start = re.search(r"\nSet [2-5]:", qraw)
                if group_start:
                    next_intro = qraw[group_start.start() + 1 :].strip()
                    qraw = qraw[: group_start.start()].strip()
            word_range = re.match(r"^(\d+-\d+) words\s*\n?", qraw, re.I)
            if word_range:
                qraw = qraw[word_range.end() :].strip()
            part = re.match(r"^(Part [1-4])\s*\n?", qraw, re.I)
            if part:
                qraw = qraw[part.end() :].strip()
            prompt, options = parse_options(qraw)
            questions.append(
                {
                    "id": q.group(1),
                    "prompt": prompt.strip(),
                    "options": options,
                    "wordRange": word_range.group(1) if word_range else None,
                    "part": part.group(1) if part else None,
                    "intro": pending_intro,
                }
            )
            pending_intro = next_intro
        title = head.group(2).strip()
        duration = re.search(r"\|\s*(\d+) min\s*$", title, re.I)
        if duration:
            title = title[: duration.start()].strip()
        result.append(
            {
                "id": head.group(1),
                "title": title,
                "minutes": int(duration.group(1)) if duration else None,
                "context": context,
                "questions": questions,
                "source": source,
            }
        )
    return result


def parse_answers(text: str) -> dict[str, str]:
    matches = list(ANSWER.finditer(text))
    answers = {}
    for i, m in enumerate(matches):
        following = text[m.end() : matches[i + 1].start() if i + 1 < len(matches) else len(text)]
        # Preserve wrapped explanation lines, stopping at the next section.
        extra = []
        for line in following.splitlines():
            if not line.strip():
                break
            if re.match(r"^(?:W[1-8]D[1-4]|MOCK\d{2}|WEEK \d+|DIAGNOSTIC|MASTERBOOK)", line):
                break
            if line.startswith("APTIS ESOL GENERAL"):
                break
            extra.append(line.strip())
        answers[m.group(1)] = clean(m.group(2) + " " + " ".join(extra))
    return answers


def parse_recordings(text: str) -> dict[str, str]:
    matches = list(RECORDING.finditer(text))
    recordings = {}
    for i, m in enumerate(matches):
        following = text[m.end() : matches[i + 1].start() if i + 1 < len(matches) else len(text)]
        lines = []
        for line in following.splitlines():
            if re.match(r"^(?:MOCK\d{2}(?: \||$)|W[1-8]D[1-4](?:-|$)|APTIS ESOL GENERAL|MASTERBOOK MINI-DRILLS)", line):
                break
            if line.strip().isdigit():
                continue
            lines.append(line)
        value = clean((m.group(2) or "") + " " + " ".join(lines))
        if value:
            recordings[m.group(1)] = value
    return recordings


def parse_sessions(text: str) -> dict[str, dict[str, str]]:
    days = list(DAY.finditer(text))
    result = {}
    for i, day in enumerate(days):
        body = text[day.end() : days[i + 1].start() if i + 1 < len(days) else len(text)]
        first_ex = SECTION.search(body)
        intro = body[: first_ex.start()].strip() if first_ex else ""
        correction = re.search(r"(?ms)^Use the remaining \d+ minutes:.+\Z", body)
        result[day.group(1)] = {
            "plan": intro,
            "correction": correction.group(0).strip() if correction else "",
        }
    return result


def main() -> None:
    names = sorted(p.name for p in PDFS.glob("*.pdf"))
    texts = {n: pdf_text(n) for n in names}
    answer_text = texts["14_COMPLETE_ANSWER_BOOK.pdf"]
    exercises = []
    sessions = {}
    for name in names:
        if name.startswith(("01_", "02_", "03_", "04_", "05_", "06_", "07_", "08_", "09_", "10_", "11_", "12_", "13_")):
            exercises.extend(parse_exercises(texts[name], name))
        if re.match(r"0[2-9]_WEEK_", name):
            sessions.update(parse_sessions(texts[name]))
    content = {
        "title": "APTIS ESOL GENERAL — B2 PERFORMANCE COURSE",
        "pdfs": names,
        "exercises": exercises,
        "sessions": sessions,
        "answers": parse_answers(answer_text),
        "recordings": parse_recordings(answer_text),
        "books": {n: texts[n] for n in names if n.startswith(("00_", "10_", "11_", "12_", "15_"))},
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(content, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    question_ids = {q["id"] for e in exercises for q in e["questions"]}
    answer_ids = set(content["answers"])
    print(f"{len(exercises)} exercises, {len(question_ids)} questions, {len(answer_ids)} keyed answers, {len(content['recordings'])} recordings")
    print(f"Missing from key: {len(question_ids - answer_ids)}; key not indexed: {len(answer_ids - question_ids)}")
    print("Examples missing from key:", sorted(question_ids - answer_ids)[:12])


if __name__ == "__main__":
    main()
