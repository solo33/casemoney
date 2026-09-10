"""Decimal values in calculations and PostgreSQL storage.

SQLite is only a lightweight test backend; precision verification runs on
PostgreSQL, whose unrestricted NUMERIC preserves the stored decimal value.
"""
from decimal import Decimal, InvalidOperation

from sqlalchemy import Float, Numeric, event
from sqlalchemy.orm import Mapper
from sqlalchemy.types import TypeDecorator
from pydantic_core import core_schema


def decimal(value) -> Decimal:
    try:
        result = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("Invalid monetary value") from exc
    if not result.is_finite():
        raise ValueError("A monetary value must be finite")
    return result


def format_amount(value) -> str:
    text = format(decimal(value), "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


class MoneyValue:
    """Validate without a float round-trip; keep JSON numbers at the API boundary."""
    @classmethod
    def __get_pydantic_core_schema__(cls, source_type, handler):
        return core_schema.decimal_schema(
            allow_inf_nan=False,
            serialization=core_schema.plain_serializer_function_ser_schema(
                float, return_schema=core_schema.float_schema(), when_used="json",
            ),
        )

    @classmethod
    def __get_pydantic_json_schema__(cls, schema, handler):
        constraints = {name: float(schema[name]) for name in ("gt", "ge", "lt", "le", "multiple_of") if name in schema}
        return handler(core_schema.float_schema(**constraints))


class Money(TypeDecorator):
    impl = Numeric
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(Float() if dialect.name == "sqlite" else Numeric())

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        amount = decimal(value)
        return float(amount) if dialect.name == "sqlite" else amount

    def process_result_value(self, value, dialect):
        return None if value is None else decimal(value)


def _set_decimal(target, value, oldvalue, initiator):
    return None if value is None else decimal(value)


@event.listens_for(Mapper, "mapper_configured")
def _configure_decimal_attributes(mapper, model):
    for prop in mapper.column_attrs:
        if isinstance(prop.columns[0].type, Money):
            event.listen(getattr(model, prop.key), "set", _set_decimal, retval=True)
