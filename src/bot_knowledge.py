from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "src" / "content"
ASSET = ROOT / "assets" / "bot-knowledge.js"


def topic_record(topic, unit, lesson, lesson_no, topic_no):
    return {
        "unit": unit["n"],
        "unitTitle": unit["title"],
        "lessonTitle": lesson["title"],
        "lessonNo": lesson_no,
        "topicNo": topic_no,
        "title": topic["title"],
        "definition": topic.get("definition", ""),
        "details": topic.get("details", []),
        "example": topic.get("example", ""),
        "href": f"lessons/unit-{unit['n']:02d}-lesson-{lesson_no:02d}.html#topic-{topic_no}",
        "lessonHref": f"lessons/unit-{unit['n']:02d}-lesson-{lesson_no:02d}.html",
    }


def main():
    units = []
    topics = []
    for source in sorted(CONTENT.glob("unit-*.json")):
        unit = json.loads(source.read_text(encoding="utf-8"))
        details = json.loads((CONTENT / "lesson-details" / source.name).read_text(encoding="utf-8"))["lessons"]
        lessons = []
        for lesson_no, (lesson, detail) in enumerate(zip(unit["lessons"], details), start=1):
            lesson_topics = [
                topic_record(topic, unit, lesson, lesson_no, topic_no)
                for topic_no, topic in enumerate(detail.get("topics", []), start=1)
            ]
            topics.extend(lesson_topics)
            lessons.append({
                "number": lesson_no,
                "title": lesson["title"],
                "plain": detail.get("plain", ""),
                "goals": detail.get("goals", []),
                "href": f"lessons/unit-{unit['n']:02d}-lesson-{lesson_no:02d}.html",
                "worked": detail.get("worked", {}),
                "exam": detail.get("exam", ""),
                "topics": lesson_topics,
            })
        units.append({
            "number": unit["n"],
            "title": unit["title"],
            "deck": unit["deck"],
            "href": f"units/unit-{unit['n']:02d}.html",
            "lessons": lessons,
        })

    # Extra definitions for syllabus items named in the unit-wise question handout
    # that do not yet have their own explanation card in the lesson pages.
    extras = [
        {
            "unit": 1, "lessonNo": 4, "topicNo": 0,
            "title": "Associative entity", "aliases": ["bridge entity", "intersection entity"],
            "definition": "An associative entity represents a many-to-many relationship as its own entity so the relationship can have attributes and its own key.",
            "details": ["It is formed from the participating entities' keys, with any attributes that describe the relationship.", "It is often mapped to a relation containing foreign keys to both original entity sets."],
            "example": "STUDENT and COURSE have an M:N ENROLLS relationship. Model ENROLLMENT(sid, cid, term, grade) as an associative entity because term and grade describe each student's enrollment.",
        },
        {
            "unit": 1, "lessonNo": 4, "topicNo": 0,
            "title": "Ternary relationship", "aliases": ["three way relationship", "n ary relationship"],
            "definition": "A ternary relationship connects three entity sets in one relationship instance.",
            "details": ["Its meaning may depend on the complete triple, so replacing it with three binary relationships can lose information or allow combinations that were never valid.", "The relationship degree is the number of participating entity sets; ternary means degree three."],
            "example": "SUPPLIES(supplier, part, project) records which supplier provides which part to which project. Each fact is about that three-way combination.",
        },
        {
            "unit": 1, "lessonNo": 4, "topicNo": 0,
            "title": "EER overlap and covering constraints", "aliases": ["overlapping subclasses", "disjoint and overlapping", "total and partial specialization", "covering constraint"],
            "definition": "Overlap says whether one superclass entity may belong to multiple subclasses. Covering says whether every superclass entity must belong to at least one subclass.",
            "details": ["Disjoint subclasses allow at most one subclass membership; overlapping subclasses allow more than one.", "Total specialization requires every superclass entity to appear in some subclass. Partial specialization allows superclass entities that appear in none."],
            "example": "A PERSON may be both STUDENT and EMPLOYEE, so those subclasses overlap. If every PERSON must be one of those types, the specialization is total; otherwise it is partial.",
        },
        {
            "unit": 2, "lessonNo": 2, "topicNo": 0,
            "title": "Relational algebra query optimization", "aliases": ["query trees", "selection pushdown", "projection pushdown", "join reordering", "algebra tree optimization"],
            "definition": "Relational algebra optimization rewrites a query into an equivalent plan that does less work, while preserving the same result.",
            "details": ["Push a selective selection close to its input so fewer rows reach later operations. Push projections down when safe so later steps carry fewer columns.", "Joins can often be reordered; joining smaller intermediate results first can reduce memory and I/O. A query tree makes the plan visible."],
            "example": "To find CS students enrolled in DBMS, first select CS rows from STUDENT and DBMS rows from COURSE, then join the smaller results with ENROLLMENT.",
        },
        {
            "unit": 3, "lessonNo": 3, "topicNo": 0,
            "title": "Converting 3NF to BCNF", "aliases": ["3nf to bcnf", "bcnf decomposition"],
            "definition": "A relation is in BCNF when every nontrivial functional dependency has a superkey as its determinant. A 3NF relation can still violate BCNF.",
            "details": ["Find a dependency X→Y whose left side is not a superkey. Split the relation into XY and the remaining attributes together with X.", "Check that the split is lossless. BCNF decomposition is lossless, but it may fail to preserve every original dependency."],
            "example": "If R(A,B,C) has B→C and B is not a key, R violates BCNF. Split it into R1(B,C) and R2(A,B); then check the projected dependencies and whether the split preserves them.",
        },
        {
            "unit": 5, "lessonNo": 4, "topicNo": 0,
            "title": "LSNs and ARIES recovery", "aliases": ["log sequence number", "analysis redo undo", "compensation log record", "clr"],
            "definition": "A log sequence number (LSN) identifies a log record's position in the transaction log. ARIES uses LSNs and write-ahead logging to coordinate recovery after a crash.",
            "details": ["A pageLSN records the latest log update reflected on a page; recovery compares it with log LSNs to decide whether a change must be redone.", "ARIES recovery has Analysis, Redo, and Undo phases. Undo actions are recorded with compensation log records so recovery itself can resume safely."],
            "example": "If an update's log record has LSN 120 and the pageLSN is 110 after a crash, redo can determine that the logged update has not yet reached that page.",
        },
        {
            "unit": 6, "lessonNo": 3, "topicNo": 0,
            "title": "B+ tree fill factor", "aliases": ["fillfactor", "leaf occupancy"],
            "definition": "The fill factor is the target fraction of a page's usable space filled when an index is built or reorganized.",
            "details": ["A higher fill factor uses fewer pages initially but leaves less room for inserts, which may cause more splits.", "A lower fill factor leaves room for growth but uses more pages and may increase I/O."],
            "example": "A 70% fill target leaves about 30% of each page free for future entries, trading initial space for fewer near-term splits.",
        },
        {
            "unit": 6, "lessonNo": 2, "topicNo": 0,
            "title": "ISAM insertion and deletion", "aliases": ["isam insert", "isam delete", "isam overflow pages"],
            "definition": "ISAM is a static indexed-sequential structure: its primary index remains fixed while updates are handled in the data pages and overflow chains.",
            "details": ["An insertion goes to the appropriate data page if space is available; otherwise it is placed in an overflow page linked to that page.", "Deletion removes or marks the record according to the design. Long overflow chains can slow access, so periodic reorganization rebuilds the main pages and index."],
            "example": "If the target ISAM page is full, insert the new record in its overflow chain. Searches follow the index to the main page and then scan the linked overflow pages.",
        },
    ]
    known_topics = {(topic["unit"], topic["title"].casefold()) for topic in topics}
    for extra in extras:
        key = (extra["unit"], extra["title"].casefold())
        if key in known_topics:
            continue
        unit = units[extra["unit"] - 1]
        lesson = unit["lessons"][extra["lessonNo"] - 1]
        extra.update({
            "unitTitle": unit["title"],
            "lessonTitle": lesson["title"],
            "href": f"{lesson['href']}#topic-{extra['topicNo']}" if extra["topicNo"] else lesson["href"],
            "lessonHref": lesson["href"],
            "supplemental": True,
        })
        topics.append(extra)
        known_topics.add(key)

    question_bank_path = ROOT / "knowledge" / "dbms" / "question_bank.json"
    syllabus_path = ROOT / "knowledge" / "dbms" / "syllabus.json"
    data = {"units": units, "topics": topics}
    if question_bank_path.exists():
        data["questionBank"] = json.loads(question_bank_path.read_text(encoding="utf-8"))
    if syllabus_path.exists():
        syllabus = json.loads(syllabus_path.read_text(encoding="utf-8"))
        data["officialSyllabus"] = {
            "courseTitle": syllabus.get("courseTitle", "DATABASE MANAGEMENT SYSTEMS"),
            "courseOutcomes": syllabus.get("courseOutcomes", []),
            "units": syllabus.get("units", []),
            "source": syllabus.get("source", "DBMS-1 (1).PNG"),
        }
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    ASSET.write_text(f"window.QNO_DBMS_KNOWLEDGE={payload};\n", encoding="utf-8")
    print(f"Generated bot knowledge ({len(units)} units, {sum(len(u['lessons']) for u in units)} lessons, {len(topics)} searchable topics)")


if __name__ == "__main__":
    main()
