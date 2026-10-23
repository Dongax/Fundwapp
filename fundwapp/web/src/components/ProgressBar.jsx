export default function ProgressBar({ percent }) {
  const pct = Math.min(100, Math.max(0, percent));
  return (
    <div style={{ background: '#eee', borderRadius: 8, height: 12, width: '100%' }}>
      <div style={{
        width: `${pct}%`, background: '#2f7d32', height: '100%',
        borderRadius: 8, transition: 'width 0.4s ease',
      }} />
    </div>
  );
}
