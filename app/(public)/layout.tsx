export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'absolute', inset: 0 }}>{children}</div>;
}
