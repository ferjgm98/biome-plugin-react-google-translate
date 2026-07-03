export function WrappedConditionalTextWithSibling({ enabled }) {
  return (
    <p>
      {enabled ? <span>yes</span> : <span>no</span>}
      <span>status</span>
    </p>
  );
}

export function WrappedLogicalTextWithSibling({ enabled }) {
  return (
    <p>
      {enabled && <span>active</span>}
      <span>status</span>
    </p>
  );
}

export function ConditionalTextWithoutSibling({ enabled }) {
  return <p>{enabled ? "yes" : "no"}</p>;
}

export function ConditionalAfterStaticText({ enabled }) {
  return (
    <p>
      status
      {enabled ? <span>yes</span> : <span>no</span>}
    </p>
  );
}

export function WrappedConditionalCalls({ enabled, value, t, formatMessage }) {
  return (
    <div>
      <p>
        {enabled ? <span>{t("yes")}</span> : <span>no</span>}
        <span>status</span>
      </p>
      <p>
        {enabled && <span>{formatMessage({ id: "status" })}</span>}
        <span>status</span>
      </p>
      <p>
        {enabled ? <span>{value.toLocaleString()}</span> : <span>empty</span>}
        <span>status</span>
      </p>
      <p>
        {enabled && <span>{value.toString()}</span>}
        <span>status</span>
      </p>
    </div>
  );
}
