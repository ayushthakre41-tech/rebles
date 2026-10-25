export default function PageWrapper({ children }: { children: React.ReactNode }) {
  return <div className="page-padded">{children}</div>;
}
