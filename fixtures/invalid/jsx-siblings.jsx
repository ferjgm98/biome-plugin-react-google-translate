export function ConditionalTextWithSibling({ enabled }) {
  return (
    <p>
      {enabled ? "yes" : "no"}
      <span>status</span>
    </p>
  );
}

export function LogicalTextWithSibling({ enabled }) {
  return (
    <p>
      {enabled && "active"}
      <span>status</span>
    </p>
  );
}

export function ConditionalCallWithSibling({
  enabled,
  value,
  t,
  formatMessage,
}) {
  return (
    <div>
      <p>
        {enabled ? t("yes") : <span>no</span>}
        <span>status</span>
      </p>
      <p>
        {enabled && formatMessage({ id: "status" })}
        <span>status</span>
      </p>
      <p>
        {enabled ? value.toLocaleString() : <span>empty</span>}
        <span>status</span>
      </p>
      <p>
        {enabled && value.toString()}
        <span>status</span>
      </p>
    </div>
  );
}
