"""Extract only the DBMS Important Questions PDF and the official syllabus image.

Run with `py src/build_dbms_index.py` on Windows or `python3 src/build_dbms_index.py` elsewhere.
The original PDF and image are read-only; all generated files go to knowledge/dbms/.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "knowledge" / "dbms"
QUESTION_SOURCE = "DBMS IMPORTANT QUESTIONS-UNI TWISE(1-6).pdf"
SYLLABUS_SOURCE = "DBMS-1 (1).PNG"
ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6}


def clean_text(value: str) -> str:
    value = value.replace("\x00", " ").replace("\ufffd", "")
    return re.sub(r"[ \t]+", " ", value).strip()


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def unit_number(value: str) -> int | None:
    key = value.upper().strip().rstrip(".")
    return int(key) if key.isdigit() else ROMAN.get(key)


def extract_questions(path: Path):
    pdf = pymupdf.open(path)
    pages = [{"page": number, "text": clean_text(page.get_text("text"))} for number, page in enumerate(pdf, start=1)]
    questions = []
    active_unit = None
    active_part = None
    current = None

    def finish():
        if not current or not current["text"].strip() or not current["unit"]:
            return
        questions.append({
            "id": f"u{current['unit']}-{current['part'].lower()}-{current['number']}-{len(questions) + 1}",
            "unit": current["unit"],
            "part": current["part"],
            "number": current["number"],
            "text": clean_text(current["text"]),
            "marks": None,
            "source": path.name,
            "page": current["page"],
        })

    for page in pages:
        for raw_line in page["text"].splitlines():
            line = clean_text(raw_line)
            if not line:
                continue
            unit_match = re.search(r"\bUNIT\s+(VI|IV|III|II|V|I|[1-6])\b", line, re.I)
            if unit_match:
                finish()
                current = None
                active_unit = unit_number(unit_match.group(1))
                active_part = None
                continue
            part_match = re.match(r"^PART\s*[- ]?\s*([AB])\b", line, re.I)
            if part_match:
                finish()
                current = None
                active_part = part_match.group(1).upper()
                continue
            number_match = re.match(r"^(\d{1,2})[.)]\s*(.*)$", line)
            if number_match and active_unit and active_part:
                finish()
                current = {
                    "unit": active_unit,
                    "part": active_part,
                    "number": int(number_match.group(1)),
                    "page": page["page"],
                    "text": number_match.group(2),
                }
            elif current:
                current["text"] += " " + line
    finish()
    return pages, questions


def extract_syllabus_image(path: Path, engine):
    import numpy as np
    from PIL import Image

    result, _ = engine(np.asarray(Image.open(path).convert("RGB")))
    text = "\n".join(str(item[1]) for item in (result or []) if len(item) > 1 and item[1])
    return clean_text(text)


def parse_syllabus(text: str, source: str):
    lines = [clean_text(line) for line in text.splitlines() if clean_text(line)]
    course_title = next((line for line in lines if "DATABASE MANAGEMENT SYSTEMS" in line.upper()), "DATABASE MANAGEMENT SYSTEMS")
    outcomes = []
    active_outcomes = False
    unit_sections = []
    current = None
    for line in lines:
        if re.search(r"COURSE OUTCOMES?", line, re.I):
            active_outcomes = True
            current = None
            continue
        unit_match = re.search(r"\bUNIT\s*(VI|IV|III|II|V|I|[1-6])\b", line, re.I)
        if unit_match:
            active_outcomes = False
            if current:
                unit_sections.append(current)
            current = {"number": unit_number(unit_match.group(1)), "label": f"Unit {unit_number(unit_match.group(1))}", "text": []}
            continue
        if active_outcomes:
            if re.match(r"^\d+[.)]\s*", line):
                outcomes.append(re.sub(r"^\d+[.)]\s*", "", line))
            continue
        if current:
            current["text"].append(line)
    if current:
        unit_sections.append(current)
    units = [{**section, "text": clean_text(" ".join(section["text"])), "source": source} for section in unit_sections]
    return {"courseTitle": course_title, "courseOutcomes": outcomes, "units": units, "rawText": text, "source": source}


def main(skip_ocr=False):
    question_path = ROOT / QUESTION_SOURCE
    syllabus_path = ROOT / SYLLABUS_SOURCE
    for source_path in (question_path, syllabus_path):
        if not source_path.exists():
            raise FileNotFoundError(f"Required source file not found: {source_path.name}")

    if skip_ocr:
        raise RuntimeError("The official syllabus is an image; OCR cannot be skipped for this two-file index.")
    from rapidocr_onnxruntime import RapidOCR

    engine = RapidOCR(use_angle_cls=False)
    question_pages, questions = extract_questions(question_path)
    syllabus_text = extract_syllabus_image(syllabus_path, engine)
    syllabus = parse_syllabus(syllabus_text, syllabus_path.name)

    grouped = []
    for unit in syllabus["units"]:
        unit_number_value = unit["number"]
        unit_questions = [question for question in questions if question["unit"] == unit_number_value]
        grouped.append({**unit, "questionCount": len(unit_questions), "questions": unit_questions})

    segments = []
    for question in questions:
        segments.append({
            "id": question["id"], "unit": question["unit"], "type": "important-question",
            "part": question["part"], "number": question["number"], "text": question["text"],
            "source": question["source"], "page": question["page"],
        })
    for unit in grouped:
        if unit["text"]:
            segments.append({"id": f"syllabus-unit-{unit['number']}", "unit": unit["number"], "type": "official-syllabus", "text": unit["text"], "source": syllabus_path.name})

    manifest = [
        {"source": question_path.name, "type": "important question bank", "sha256": digest(question_path), "bytes": question_path.stat().st_size, "pages": len(question_pages), "textChars": sum(len(page["text"]) for page in question_pages), "processed": True},
        {"source": syllabus_path.name, "type": "official syllabus image", "sha256": digest(syllabus_path), "bytes": syllabus_path.stat().st_size, "ocrChars": len(syllabus_text), "processed": True},
    ]
    summary = {
        "sourceDocuments": len(manifest),
        "indexedSources": [QUESTION_SOURCE, SYLLABUS_SOURCE],
        "importantQuestionCount": len(questions),
        "syllabusUnitCount": len(syllabus["units"]),
        "ocrSources": 1,
        "searchSegments": len(segments),
        "scope": "Only the Important Questions PDF and DBMS-1 syllabus image are indexed. Lecture notes and previous-paper PDFs are excluded.",
        "units": [{"unit": unit["number"], "importantQuestions": unit["questionCount"], "syllabusCharacters": len(unit["text"])} for unit in grouped],
    }

    OUT.mkdir(parents=True, exist_ok=True)
    for stale in [OUT / "previous_year_questions.json", *OUT.glob("unit_[0-9]*.json")]:
        stale.unlink(missing_ok=True)
    (OUT / "syllabus.json").write_text(json.dumps(syllabus, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "question_bank.json").write_text(json.dumps({"source": question_path.name, "items": questions}, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "search_index.json").write_text(json.dumps({"segments": segments}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT / "document_manifest.json").write_text(json.dumps({"documents": manifest, "documentCount": len(manifest), "generatedFrom": summary["scope"]}, ensure_ascii=False, indent=2), encoding="utf-8")
    for unit in grouped:
        (OUT / f"unit_{unit['number']}.json").write_text(json.dumps(unit, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "index_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-ocr", action="store_true")
    main(skip_ocr=parser.parse_args().skip_ocr)
