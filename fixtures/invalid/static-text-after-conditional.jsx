export function StaticTextAfterConditional({ enabled }) {
  return (
    <p>
      {enabled ? <span>yes</span> : <span>no</span>}
      status
    </p>
  );
}

export function StaticTextAfterLogical({ enabled }) {
  return (
    <p>
      {enabled && <span>yes</span>}
      status
    </p>
  );
}
