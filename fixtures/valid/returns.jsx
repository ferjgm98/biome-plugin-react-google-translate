export function ReturnsElement() {
  return <span>Ready</span>;
}

export function ReturnsNull({ hidden }) {
  if (hidden) {
    return null;
  }

  return <span>Ready</span>;
}
