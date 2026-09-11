import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useFamilySuggestions } from "../../hooks/useFamilySuggestions";
import FamilyRecurringSuggestions from "../family/FamilyRecurringSuggestions";
import "../../styles/family.css";

export default function FamilyPlanningSuggestions({ onChanged }) {
  const { hasFamily, items, error, message, setMessage, submit } = useFamilySuggestions(onChanged);
  const { hash } = useLocation();
  const target = useRef(null);
  useEffect(() => {
    if (hasFamily && hash === "#family-suggestions") target.current?.scrollIntoView({ block: "start" });
  }, [hasFamily, hash]);
  if (!hasFamily && !error) return null;
  return <div id="family-suggestions" ref={target} className="family-planning-suggestions">
    {error && <p role="alert" className="family-error">{error}</p>}
    {message && <p role="status" className="family-success">{message}</p>}
    {hasFamily && <FamilyRecurringSuggestions recurringSuggestions={items} submit={submit} setMessage={setMessage} />}
  </div>;
}
