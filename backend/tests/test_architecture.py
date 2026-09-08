"""Guard the boundaries established by the application refactor."""
import ast
import hashlib
import json
from pathlib import Path

from app.main import app

APP_ROOT = Path(__file__).resolve().parents[1] / 'app'


def test_lower_layers_do_not_import_http_routes():
    violations = []
    for layer in ('operations', 'services', 'schemas', 'models'):
        for path in (APP_ROOT / layer).rglob('*.py'):
            for node in ast.walk(ast.parse(path.read_text(encoding='utf-8-sig'))):
                modules = [node.module or ''] if isinstance(node, ast.ImportFrom) else [item.name for item in node.names] if isinstance(node, ast.Import) else []
                if any(module == 'app.api' or module.startswith('app.api.') for module in modules):
                    violations.append(f'{path.relative_to(APP_ROOT)}:{node.lineno}')
    assert not violations, violations


def test_application_operations_do_not_resolve_http_dependencies():
    violations = []
    for path in (APP_ROOT / 'operations').rglob('*.py'):
        for node in ast.walk(ast.parse(path.read_text(encoding='utf-8-sig'))):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in {'Depends', 'Query', 'Header', 'Body', 'File', 'Form'}:
                violations.append(f'{path.relative_to(APP_ROOT)}:{node.lineno}')
    assert not violations, violations


def test_refactor_preserves_public_http_contract():
    """Intentional API changes must update the versioned contract fixture."""
    expected = json.loads((Path(__file__).parent / 'fixtures' / 'openapi_contract.json').read_text(encoding='utf-8'))
    schema = app.openapi()
    actual = {f'{method.upper()} {path}': operation for path, methods in schema['paths'].items() for method, operation in methods.items()}
    actual['components'] = schema['components']
    fingerprints = {key: hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=True).encode()).hexdigest() for key, value in actual.items()}
    assert fingerprints == expected
