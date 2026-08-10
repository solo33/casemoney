import { useEffect, useRef, useState } from "react";

function calculate(expression) {
  const source = String(expression).replace(/,/g, ".").replace(/\s+/g, "");
  if (!source || !/^[0-9.+\-*/()]+$/.test(source)) throw new Error("Некорректное выражение");

  const tokens = source.match(/\d+(?:\.\d+)?|[()+\-*/]/g) || [];
  if (tokens.join("") !== source) throw new Error("Некорректное выражение");
  let position = 0;

  const parsePrimary = () => {
    const token = tokens[position++];
    if (token === "(") {
      const value = parseExpression();
      if (tokens[position++] !== ")") throw new Error("Не закрыта скобка");
      return value;
    }
    if (token === "+") return parsePrimary();
    if (token === "-") return -parsePrimary();
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error("Некорректное число");
    return value;
  };
  const parseTerm = () => {
    let value = parsePrimary();
    while (tokens[position] === "*" || tokens[position] === "/") {
      const operator = tokens[position++];
      const next = parsePrimary();
      if (operator === "/" && next === 0) throw new Error("Деление на ноль");
      value = operator === "*" ? value * next : value / next;
    }
    return value;
  };
  const parseExpression = () => {
    let value = parseTerm();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const operator = tokens[position++];
      const next = parseTerm();
      value = operator === "+" ? value + next : value - next;
    }
    return value;
  };

  const result = parseExpression();
  if (position !== tokens.length || !Number.isFinite(result)) throw new Error("Некорректное выражение");
  return String(Math.round((result + Number.EPSILON) * 100) / 100);
}

const keys = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "(", ")", "C", "⌫", "+", "="];

export default function AmountInput({ value, onChange, inputStyle, calculatorLabel = "Открыть калькулятор", ...inputProps }) {
  const [open, setOpen] = useState(false);
  const [expression, setExpression] = useState("");
  const [error, setError] = useState("");
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const openCalculator = () => {
    setExpression(value ? String(value) : "");
    setError("");
    setOpen(current => !current);
  };
  const press = key => {
    setError("");
    if (key === "C") return setExpression("");
    if (key === "⌫") return setExpression(current => current.slice(0, -1));
    if (key === "=") {
      try {
        const result = calculate(expression);
        setExpression(result);
        onChange({ target: { value: result } });
        setOpen(false);
      } catch (calculationError) {
        setError(calculationError.message);
      }
      return;
    }
    setExpression(current => `${current}${key}`);
  };

  return (
    <div className="amount-input-with-calculator" ref={rootRef}>
      <input {...inputProps} value={value} onChange={onChange} style={inputStyle} />
      <button type="button" className="amount-calculator-trigger" onClick={openCalculator} aria-label={calculatorLabel} title="Калькулятор">🧮</button>
      {open && (
        <div className="amount-calculator" role="dialog" aria-label="Калькулятор суммы">
          <input
            autoFocus
            className="amount-calculator-display"
            value={expression}
            onChange={event => setExpression(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); press("="); } }}
            aria-label="Выражение"
          />
          {error && <small>{error}</small>}
          <div className="amount-calculator-grid">
            {keys.map(key => <button type="button" key={key} onClick={() => press(key)} className={key === "=" ? "is-result" : ""}>{key}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}
