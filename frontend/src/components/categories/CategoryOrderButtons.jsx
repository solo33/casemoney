

export function OrderButtons({ canMoveUp, canMoveDown, onMoveUp, onMoveDown, compact = false }) {
  const buttonStyle = {
    padding: compact ? "2px 6px" : "4px 7px",
    fontSize: 12,
    lineHeight: 1,
    opacity: 1,
  };
  const stopDrag = event => event.stopPropagation();

  return (
    <span style={{ display: "inline-flex", gap: 2 }} onClick={stopDrag}>
      <button
        type="button"
        className="btn-ghost"
        style={{ ...buttonStyle, opacity: canMoveUp ? 1 : 0.3 }}
        disabled={!canMoveUp}
        onClick={onMoveUp}
        onPointerDown={stopDrag}
        title="Переместить выше"
        aria-label="Переместить выше"
      >
        ↑
      </button>
      <button
        type="button"
        className="btn-ghost"
        style={{ ...buttonStyle, opacity: canMoveDown ? 1 : 0.3 }}
        disabled={!canMoveDown}
        onClick={onMoveDown}
        onPointerDown={stopDrag}
        title="Переместить ниже"
        aria-label="Переместить ниже"
      >
        ↓
      </button>
    </span>
  );
}
