"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function SSEProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const eventSource = new EventSource("/api/events");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "ACCESS_REVOKED") {
          toast.warning("Your access to a resource was just revoked.");
          router.refresh(); // Automatically updates all Server Components on the screen
        }
        
        if (data.type === "SECRET_DELETED" || data.type === "PROJECT_CREATED") {
          router.refresh();
        }
      } catch (err) {
        console.error("Failed to parse SSE message", err);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE Error:", error);
      eventSource.close(); // Stop retrying aggressively on auth failure
    };

    return () => {
      eventSource.close();
    };
  }, [router]);

  return <>{children}</>;
}