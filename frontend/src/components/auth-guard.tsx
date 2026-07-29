"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, token, checkExpiry } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    checkExpiry();
  }, []);

  useEffect(() => {
    if (mounted) {
      const isAuthPage = pathname === "/auth" || pathname === "/";
      if (!isAuthenticated || !token) {
        if (!isAuthPage) {
          router.replace("/auth");
        }
      }
    }
  }, [mounted, isAuthenticated, token, pathname, router]);

  // Don't render protected content until mounted and authenticated
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isPublicPage = pathname === "/auth" || pathname === "/";

  if (!isAuthenticated && !isPublicPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
