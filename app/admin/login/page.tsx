"use client";

import { useRouter } from "next/navigation";
import { AdminLogin, Header } from "@/app/components/ui";

export default function AdminLoginPage() {
  const router = useRouter();
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)" }}>
      <Header active="admin" />
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
        <AdminLogin onSuccess={() => router.push("/admin")} />
      </div>
    </div>
  );
}
