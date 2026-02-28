"use client";

import { useAppStore } from "@/stores/useAppStore";
import { ServerBar } from "./ServerBar";
import { ChannelSidebar } from "./ChannelSidebar";
import { RightPanel } from "./RightPanel";
import { ScanlineOverlay } from "@/components/shared/ScanlineOverlay";
import { TeamRoom } from "@/components/team-room/TeamRoom";
import { HangoutView } from "@/components/hangout/HangoutView";
import { SandboxView } from "@/components/sandbox/SandboxView";
import { MemoriesView } from "@/components/memories/MemoriesView";
import { DebateRoom } from "@/components/debate/DebateRoom";
import { DebriefRoom } from "@/components/debate/DebriefRoom";

function MainContent() {
  const activeChannel = useAppStore((s) => s.activeChannel);

  switch (activeChannel) {
    case "team-room":
      return <TeamRoom />;
    case "hangout":
      return <HangoutView />;
    case "debate":
      return <DebateRoom />;
    case "debrief":
      return <DebriefRoom />;
    case "sandbox":
      return <SandboxView />;
    case "memories":
      return <MemoriesView />;
    default:
      return <TeamRoom />;
  }
}

export function AppShell() {
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen);

  return (
    <>
      <div
        className="grid h-screen overflow-hidden"
        style={{
          gridTemplateColumns: rightPanelOpen
            ? "64px 220px 1fr 280px"
            : "64px 220px 1fr",
        }}
      >
        <ServerBar />
        <ChannelSidebar />
        <main className="flex flex-col h-full overflow-hidden bg-surface-2">
          <MainContent />
        </main>
        {rightPanelOpen && <RightPanel />}
      </div>
      <ScanlineOverlay />
    </>
  );
}
