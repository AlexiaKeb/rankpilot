export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <p className="font-data mb-2 text-xs uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
      <h1 className="font-display text-4xl font-extrabold">{title}</h1>
      {children && <p className="mt-2 max-w-2xl text-muted-foreground">{children}</p>}
    </div>
  );
}
