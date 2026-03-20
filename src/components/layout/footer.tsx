import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t py-8 mt-16">
      <div className="container mx-auto px-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <div>
            <span className="font-semibold text-foreground">ValuScope</span>{" "}
            &copy; {new Date().getFullYear()}. All rights reserved.
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
