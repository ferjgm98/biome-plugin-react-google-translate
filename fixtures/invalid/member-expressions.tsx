export function ConditionalMemberWithSibling({ enabled, user }) {
  return (
    <p>
      {enabled ? user.label : <span>empty</span>}
      <span>status</span>
    </p>
  );
}

export function AlternateMemberWithSibling({ enabled, user }) {
  return (
    <p>
      {enabled ? <span>ready</span> : user.label}
      <span>status</span>
    </p>
  );
}

export function LogicalMemberWithSibling({ enabled, user }) {
  return (
    <p>
      {enabled && user.label}
      <span>status</span>
    </p>
  );
}

export function OptionalMemberWithSibling({ enabled, user }) {
  return (
    <p>
      {enabled && user?.label}
      <span>status</span>
    </p>
  );
}

export function NonNullMemberWithSibling({ enabled, user }) {
  return (
    <p>
      {enabled ? user.label! : <span>empty</span>}
      <span>status</span>
    </p>
  );
}

export function AlternateToStringWithSibling({ enabled, value }) {
  return (
    <p>
      {enabled ? <span>ready</span> : value.toString()}
      <span>status</span>
    </p>
  );
}
