"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Target,
  Bot,
  BookOpen,
  Settings,
  Zap,
  Sparkles,
  ChevronDown,
  Bell,
  Search,
  LogOut,
  Mail,
  Globe,
  Shield,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useCompany, type Company } from "@/contexts/company-context";
import { useEvents } from "@/contexts/event-context";

const navItems = [
  { id: "chat", label: "Julian", icon: Bot, href: "/" },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { id: "campaigns", label: "Campaigns", icon: Target, href: "/campaigns" },
  { id: "inbox", label: "Inbox", icon: Mail, href: "/inbox" },
  { id: "inboxes", label: "Inboxes", icon: Globe, href: "/inboxes" },
  { id: "knowledge", label: "Knowledge Base", icon: BookOpen, href: "/knowledge" },
  { id: "skills", label: "Skills Store", icon: Sparkles, href: "/skills" },
  { id: "settings", label: "Settings", icon: Settings, href: "/settings" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { companies, selectedCompany, setSelectedCompany } = useCompany();
  const [showCompanyMenu, setShowCompanyMenu] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
    router.refresh();
  };

  const switchCompany = (company: Company) => {
    setSelectedCompany(company);
    setShowCompanyMenu(false);
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const userName = user?.user_metadata?.name || user?.email?.split("@")[0] || "User";
  const userEmail = user?.email || "";

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-info">
          <Zap className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">Blitzscale</h1>
          <p className="text-xs text-muted-foreground">GTM Engine</p>
        </div>
      </div>

      {/* Company Selector */}
      <div className="p-4 relative">
        <button
          onClick={() => setShowCompanyMenu(!showCompanyMenu)}
          className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/50 p-3 transition-colors hover:bg-muted"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <span className="text-sm font-bold text-primary">
                {selectedCompany?.name?.charAt(0) || "?"}
              </span>
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">
                {selectedCompany?.name || "No Company"}
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedCompany?.status === "active" ? "Active" : selectedCompany?.status || ""}
              </p>
            </div>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", showCompanyMenu && "rotate-180")} />
        </button>

        {/* Company Dropdown Menu */}
        {showCompanyMenu && (
          <div className="absolute left-4 right-4 top-full mt-2 z-50 rounded-xl border border-border bg-card shadow-lg">
            <div className="p-2 max-h-48 overflow-y-auto">
              {companies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => switchCompany(c)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted",
                    selectedCompany?.id === c.id && "bg-primary/10"
                  )}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <span className="text-xs font-bold text-primary">{c.name.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.status}</p>
                  </div>
                </button>
              ))}
            </div>
            <Separator className="bg-border" />
            <div className="p-2">
              <Link
                href="/onboarding"
                onClick={() => setShowCompanyMenu(false)}
                className="flex w-full items-center gap-2 rounded-lg p-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-dashed border-primary/40">
                  +
                </span>
                Add Company
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
              isActive(item.href)
                ? "bg-primary/10 text-primary border border-primary/25"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
            {item.id === "chat" && (
              <Badge className="ml-auto bg-primary/10 text-primary text-[10px]">
                AI
              </Badge>
            )}
          </Link>
        ))}
      </nav>

      <Separator className="bg-border" />

      {/* User */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 border border-border">
            <AvatarImage src="/avatar.png" />
            <AvatarFallback className="bg-primary/10 text-primary">
              {userName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {userName}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {userEmail}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  greeting?: {
    userName: string;
    companyName: string;
  };
}

export function AppHeader({ title, subtitle, actions, greeting }: HeaderProps) {
  const { unreadCount } = useEvents();
  const resolvedTitle = greeting ? `Hello, ${greeting.userName}` : title;
  const resolvedSubtitle = greeting
    ? `Here are the latest insights from ${greeting.companyName}.`
    : subtitle;

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{resolvedTitle}</h1>
        {resolvedSubtitle && (
          <p className="text-sm text-muted-foreground">{resolvedSubtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            className="h-10 w-64 rounded-lg border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring/40"
          />
        </div>

        {/* Notifications */}
        <Button variant="outline" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>

        {actions}
      </div>
    </header>
  );
}

interface AppShellProps {
  children: React.ReactNode;
  header: {
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
    greeting?: {
      userName: string;
      companyName: string;
    };
  };
  mainClassName?: string;
  hideHeader?: boolean;
}

export function AppShell({
  children,
  header,
  mainClassName,
  hideHeader = false,
}: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {!hideHeader ? <AppHeader {...header} /> : null}
        <main
          className={cn(
            "flex-1 min-h-0 overflow-auto bg-background",
            hideHeader ? "p-0" : "p-4 md:p-6 xl:p-8",
            mainClassName
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
