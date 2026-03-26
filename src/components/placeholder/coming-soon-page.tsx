interface Props {
  title: string;
}

export function ComingSoonPage({ title }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <h2 className="text-2xl font-bold mb-2">{title}</h2>
      <p className="text-muted-foreground">
        This section is coming soon.
      </p>
    </div>
  );
}
