import json
import re
import sys
from pathlib import Path

def base_exercise(title: str) -> str:
    t = str(title or "").strip()
    # strip common suffixes: " - Hypertrophy - Week 7", etc.
    t = re.sub(r"\s*-\s*Hypertrophy\b.*$", "", t, flags=re.I)
    t = re.sub(r"\s*-\s*Week\s*\d+\b.*$", "", t, flags=re.I)
    t = re.sub(r"\s*-\s*WEEK\s*\d+\b.*$", "", t, flags=re.I)
    t = re.sub(r"\s*-\s*Session\s*\d+\b.*$", "", t, flags=re.I)
    return t.strip()

def normalize_rep_expr(x: str) -> str:
    x = str(x or "")
    x = x.replace("–", "-")
    x = re.sub(r"\s*-\s*", "-", x)
    return x.strip()

def parse_reps_from_notes(notes) -> str | None:
    if not notes:
        return None
    text = " ".join(str(n) for n in notes if n is not None)

    patterns = [
        # "5 sets of 5", "3 sets of 8-12"
        re.compile(r"(\d+)\s*sets?\s*of\s*([0-9]+(?:\s*[-–]\s*[0-9]+)?)", re.I),
        # "3x5", "4 x 8-12"
        re.compile(r"(\d+)\s*(?:x|\*)\s*([0-9]+(?:\s*[-–]\s*[0-9]+)?)", re.I),
        # "ascending sets of 3" (no leading set count needed)
        re.compile(r"sets?\s+of\s+([0-9]+(?:\s*[-–]\s*[0-9]+)?)", re.I),
        # "1 rep", "8 reps"
        re.compile(r"([0-9]+(?:\s*[-–]\s*[0-9]+)?)\s*reps?\b", re.I),
    ]

    for pat in patterns:
        m = pat.search(text)
        if not m:
            continue
        reps = m.group(m.lastindex)
        reps = normalize_rep_expr(reps)
        if re.search(r"\d", reps):
            return reps

    return None

def fix_file(path: Path) -> list[tuple[str, str, str, str]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    changes = []

    for sess in raw.get("sessions", []):
        sess_name = sess.get("session", "")
        for w in sess.get("workouts", []):
            reps = str(w.get("reps", "")).strip()
            title = str(w.get("title", "")).strip()
            base = base_exercise(title)

            # only fix the obvious broken case: reps is literally the exercise name
            if reps and base and reps.lower() == base.lower():
                inferred = parse_reps_from_notes(w.get("notes", []))
                if inferred and inferred != reps:
                    changes.append((sess_name, title, reps, inferred))
                    w["reps"] = inferred

    if changes:
        bak = path.with_suffix(path.suffix + ".bak")
        if not bak.exists():
            bak.write_text(json.dumps(raw, indent=2), encoding="utf-8")  # backup of *pre-save* structure
        # IMPORTANT: write the fixed file
        path.write_text(json.dumps(raw, indent=2), encoding="utf-8")

    return changes

def main():
    if len(sys.argv) != 2:
        print("Usage: python fix_program_json.py <folder_with_json_files>")
        sys.exit(1)

    folder = Path(sys.argv[1]).expanduser().resolve()
    if not folder.exists() or not folder.is_dir():
        print(f"Not a folder: {folder}")
        sys.exit(1)

    all_changes = 0
    for f in sorted(folder.glob("*.json")):
        changes = fix_file(f)
        if changes:
            print(f"\n== {f.name} ==")
            for sess, title, old, new in changes:
                print(f"- {sess} | {title}: reps '{old}' -> '{new}'")
            all_changes += len(changes)

    print(f"\nDone. Total fixes: {all_changes}")

if __name__ == "__main__":
    main()
