"use client";

import { useState } from "react";
import { SlidersHorizontal, Activity, BarChart3, Radio } from "lucide-react";
import { PageHeader } from "@/components/admin/ui";
import ConfigPanel from "./ConfigPanel";
import EventsPanel from "./EventsPanel";
import DashboardPanel from "./DashboardPanel";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "events", label: "Live Events", icon: Activity },
  { id: "config", label: "Configuration", icon: SlidersHorizontal },
];

export default function TrackingClient() {
  const [tab, setTab] = useState("dashboard");

  return (
    <div>
      <PageHeader
        icon={Radio}
        title="Tracking & Conversions"
        subtitle="First-party, server-side event forwarding to Meta CAPI & GA4 — config, live monitoring and health."
      />

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-brand-terracotta text-brand-terracotta"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <DashboardPanel />}
      {tab === "events" && <EventsPanel />}
      {tab === "config" && <ConfigPanel />}
    </div>
  );
}
