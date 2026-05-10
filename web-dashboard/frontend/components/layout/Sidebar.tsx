"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Brain, LayoutDashboard } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

const nav = [
  { href: "/",       label: "Dashboard", icon: LayoutDashboard },
  { href: "/memory", label: "Memory",    icon: Brain },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed left-0 top-0 h-full w-56 bg-black border-r border-[#1a1a1a] flex flex-col z-50">
      {/* Wordmark */}
      <div className="p-6 border-b border-[#1a1a1a]">
        <Link href="/" className="block">
          <div className="flex items-center">
            <Logo className="w-20 h-8" />
          </div>
          <p className="text-[#333] text-[10px] mt-1 font-mono">Studio</p>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-xs font-medium tracking-wide transition-colors",
                active
                  ? "text-white bg-[#111] border-l border-white"
                  : "text-[#555] hover:text-white hover:bg-[#0d0d0d] border-l border-transparent"
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer hint */}
      <div className="p-4 border-t border-[#1a1a1a]">
        <div className="text-[10px] text-[#333] font-mono leading-relaxed">
          <div>v0.1.0</div>
          <div className="mt-1">Main interface:</div>
          <div className="text-[#444]">VS Code extension</div>
        </div>
      </div>
    </aside>
  );
}
