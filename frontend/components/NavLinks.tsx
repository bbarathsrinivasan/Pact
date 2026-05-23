"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/",          label: "Personal Agent" },
  { href: "/business",  label: "Business" },
  { href: "/registry",  label: "Registry" },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-6">
      {links.map(({ href, label }) => {
        const active =
          href === "/"
            ? pathname === "/"
            : pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className="text-sm transition-colors duration-150"
            style={{ color: active ? "var(--text)" : "var(--muted)", textDecoration: "none" }}
            onMouseEnter={(e) => { if (!active) (e.target as HTMLElement).style.color = "var(--text)"; }}
            onMouseLeave={(e) => { if (!active) (e.target as HTMLElement).style.color = "var(--muted)"; }}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
