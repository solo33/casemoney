"""Explicitly capture missing legacy rates using the currently available rates.

Run from backend: python scripts/repair_exchange_snapshots.py [--user-id ID]
Existing saved rates are preserved. Re-run after provider recovery for missing rates.
"""
import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user-id", type=int)
    args = parser.parse_args()
    import app.main  # Register all SQLAlchemy models.
    from app.database import SessionLocal
    from app.operations.exchange.repair import repair_snapshot_batch

    after_id = examined = changed = 0
    with SessionLocal() as db:
        while True:
            result = repair_snapshot_batch(db, after_id=after_id, user_id=args.user_id)
            examined += result["examined"]
            changed += result["changed"]
            if not result["examined"]:
                break
            after_id = result["last_id"]
    print(f"Examined: {examined}; updated: {changed}. Unavailable rates remain missing.")


if __name__ == "__main__":
    main()
