export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section-block mb-2 first:border-t-0 first:pt-0">
      <h2 className="font-serif text-lg text-ink">{title}</h2>
      {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="rounded border border-dashed border-line py-8 text-center text-sm text-ink-faint">{message}</p>;
}
