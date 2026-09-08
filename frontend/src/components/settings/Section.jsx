export const muted = { color: '#7a8590', fontSize: 13, margin: 0 };

export default function Section({ title, tone, children }) {
  return <section className={`settings-section${tone === 'danger' ? ' settings-section--danger' : ''}`}>
    <h3>{title}</h3>{children}
  </section>;
}
