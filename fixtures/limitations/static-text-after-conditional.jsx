export function StaticTextAfterConditional({ enabled }) {
  return (
    <p>
      {enabled ? <span>yes</span> : <span>no</span>}
      status
    </p>
  );
}
