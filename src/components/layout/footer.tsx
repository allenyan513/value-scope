import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t py-8 mt-16 bg-card/50">
      <div className="container mx-auto px-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <div>
            <span className="font-bold text-brand">Valu</span>
            <span className="font-bold text-foreground">Scope</span>{" "}
            &copy; {new Date().getFullYear()}
          </div>
          <div className="flex gap-6">
            <Link href="/methodology" className="hover:text-foreground transition-colors">
              Methodology
            </Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="/about" className="hover:text-foreground transition-colors">
              About
            </Link>
          </div>
          <div className="text-xs">
            Not financial advice. Data may be delayed.
          </div>
        </div>
      </div>
    </footer>
  );
}
