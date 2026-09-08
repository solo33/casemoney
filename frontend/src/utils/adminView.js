

export const PAGE = 50;

export function uniqueUsers(items = []) {
  const seen = new Set();
  return items.filter(item => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export const th = {
  padding: "10px 12px", textAlign: "left",
};

export const td = {
  padding: "8px 12px",
};

export const flashBox = {
  padding: "6px 10px", borderRadius: 6, fontSize: 12, marginBottom: 10,
};

export const adminBadge = {
  marginLeft: 6, fontSize: 9, padding: "1px 6px",
  background: "#1b2531", color: "#fff",
  borderRadius: 4, fontWeight: 700, letterSpacing: 0.5,
  verticalAlign: "middle",
};
