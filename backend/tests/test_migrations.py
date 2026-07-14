from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory


def test_migration_chain_has_core_schema_baseline():
    backend_dir = Path(__file__).resolve().parents[1]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    script = ScriptDirectory.from_config(config)

    assert script.get_bases() == ["000000000001"]
    assert script.get_revision("a38a30d36fcb").down_revision == "000000000001"

    baseline = script.get_revision("000000000001")
    source = Path(baseline.path).read_text(encoding="utf-8")
    for table in ("users", "categories", "accounts", "transactions"):
        assert f'"{table}"' in source
