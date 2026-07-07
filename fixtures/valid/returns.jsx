export function ReturnsElement() {
  return <span>Ready</span>;
}

export function ReturnsNull({ hidden }) {
  if (hidden) {
    return null;
  }

  return <span>Ready</span>;
}

export function ReturnsString() {
  return "Ready";
}

export function ReturnsNumber() {
  return 1;
}

export function ReturnsTemplateLiteral() {
  return `Ready`;
}
