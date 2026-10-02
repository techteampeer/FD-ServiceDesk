import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Loader2,
  MapPin,
  MessageSquarePlus,
  Mic,
  Paperclip,
  Send,
  Signal,
  Ticket,
  User,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/fdny/Navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PriorityBadge, StatusBadge } from "@/components/fdny/StatusBadge";
import { DeviceMap, type DeviceMapProps } from "@/components/fdny/DeviceMap";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { currentUser } from "@/lib/mock-data";
import {
  reportTicket,
  resetDevice,
  getMyTickets,
  runAgentAction,
  sendAgentMessage,
  startAgentSession,
  type AgentTurn,
  type GlpiDevice,
  type ReportTicketResult,
  type ResetResult,
} from "@/lib/api";
import { displayNameOf, getSessionUser } from "@/lib/auth";
import { useLiveDevices } from "@/lib/use-live-devices";
import { useRequireSession } from "@/lib/session";
import { bumpTickets } from "@/lib/ticket-events";
import { memberNav } from "@/lib/nav";

export const Route = createFileRoute("/report-ticket")({
  head: () => ({
    meta: [
      { title: "AI Service Assistant — Fire Department IT Service Portal" },
      {
        name: "description",
        content:
          "Chat with a simulated IT service assistant to troubleshoot field tablets, cellular connectivity, and equipment tags, then create a service ticket.",
      },
      { property: "og:title", content: "AI Service Assistant — Fire Department IT Service Portal" },
      {
        property: "og:description",
        content: "Simulated AI troubleshooting and ticket creation for field technology issues.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportTicketPage,
});

/** Action ids come from the agent; "create-ticket" still opens the review screen. */
type ActionKind = string;

interface ChatMessage {
  id: string;
  role: "ai" | "user";
  text: string;
  at: string;
  actions?: { label: string; kind: ActionKind; icon?: typeof Volume2 }[];
  detail?: { label: string; value: string }[];
  /** Last-known position, plotted at the asset's GLPI coordinates. */
  map?: DeviceMapProps;
}

const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const uid = () => Math.random().toString(36).slice(2);

const greeting: ChatMessage = {
  id: "greet",
  role: "ai",
  at: "07:40",
  text: "Hi! I'm the Fire Department IT Service Assistant. Tell me what technology issue you're experiencing. I can help troubleshoot your device, connectivity, or equipment issue and create a service ticket when needed.",
};

const prompts = [
  "My field tablet is missing",
  "My FirstNet connection isn't working",
  "My eSIM needs to be refreshed",
  "My equipment tag isn't recognized",
  "I need to report another issue",
];

type Topic = "device" | "connectivity" | "inventory" | "general";

function classify(text: string): Topic {
  const t = text.toLowerCase();
  if (/(tablet|epcr|missing|lost|left at|device recovery|ping)/.test(t)) return "device";
  if (/(firstnet|verizon|esim|sim|connect|signal|data|cellular)/.test(t)) return "connectivity";
  if (/(tag|asset|inventory|cmdb|equipment id)/.test(t)) return "inventory";
  return "general";
}

/**
 * Reply used only when the assistant session could not be opened.
 *
 * It deliberately states nothing about the member's equipment: without the
 * backend there is no GLPI data, and inventing a device, a location or a
 * carrier diagnosis would put fabricated facts in front of the member. The
 * real ticket path stays available, because that runs against GLPI directly.
 */
function offlineReply(): ChatMessage[] {
  return [
    {
      id: uid(),
      role: "ai",
      at: now(),
      text: "I can't reach the service assistant right now, so I can't look up your equipment or run a diagnostic. I've kept what you typed - you can still open a service ticket and the IT Service Desk will pick it up.",
      actions: [{ label: "Create service ticket", kind: "create-ticket", icon: Ticket }],
    },
  ];
}

const ticketDrafts: Record<Topic, Record<string, string>> = {
  device: {
    "Issue Type": "Device Recovery — misplaced field tablet",
    "Device ID": "Tablet-EPCR-2391",
    Location: "Bellevue Hospital ED, Manhattan",
    Description: "ePCR tablet misplaced after a run; located against its assigned station.",
    Priority: "High",
    "Suggested Resolution": "Sweep the last known station; no technician dispatch required",
  },
  connectivity: {
    "Issue Type": "Connectivity — FirstNet data loss",
    "Device ID": "MDT-L9-0771",
    Location: "Great Jones St, Manhattan",
    Description: "No cellular data; eSIM profile suspended following carrier maintenance.",
    Priority: "Critical",
    "Suggested Resolution": "Automated eSIM refresh, escalate to carrier liaison if unresolved",
  },
  inventory: {
    "Issue Type": "Inventory — invalid equipment tag",
    "Device ID": "RSC-1-THRM-114",
    Location: "Rescue 1 Quarters, Manhattan",
    Description: "Submitted tag rejected by inventory form; CMDB match proposed.",
    Priority: "Low",
    "Suggested Resolution": "Apply suggested CMDB correction to asset record",
  },
  general: {
    "Issue Type": "General IT support request",
    "Device ID": "Not specified",
    Location: "Engine Company 23, Manhattan",
    Description: "Issue reported via AI Service Assistant.",
    Priority: "Medium",
    "Suggested Resolution": "Triage by Tier 1 service desk",
  },
};

// GLPI urgency is 1 (very low) to 5 (very high).
const URGENCY_BY_PRIORITY: Record<string, number> = {
  Critical: 5,
  High: 4,
  Medium: 3,
  Low: 2,
};

function ReportTicketPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([greeting]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [topic, setTopic] = useState<Topic>("general");
  const [stage, setStage] = useState<"chat" | "summary" | "success">("chat");
  const [submitting, setSubmitting] = useState(false);
  const [activeConversation, setActiveConversation] = useState("c1");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Live GLPI: signed-in member and the Phone assets actually assigned to them.
  const { navUser } = useRequireSession();
  // Read in the effect below, never in the initializer: the server renders
  // without localStorage, so an initializer here breaks hydration.
  const [member, setMember] = useState<ReturnType<typeof getSessionUser>>(null);
  const { devices, state: devicesState, error: devicesError } = useLiveDevices();
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [created, setCreated] = useState<ReportTicketResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  /** The member's real recent tickets, replacing the sample conversation list. */
  const [recentTickets, setRecentTickets] = useState<{ id: number; reference: string; name: string; statusLabel: string }[]>([]);
  // Simulated agent session: carries user, device, location and history so the
  // conversation never re-asks for them.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  // A ref, not state: several clicks in one tick all read the same stale state
  // value, so a state flag does not actually prevent duplicate submissions.
  const busyRef = useRef(false);

  useEffect(() => setMember(getSessionUser()), []);
  useEffect(() => {
    if (!member) return;
    let cancelled = false;
    getMyTickets(member.id, 6)
      .then((t) => !cancelled && setRecentTickets(t.slice(0, 6)))
      .catch(() => {
        /* the panel simply stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, [member]);
  // Identity of the current device set. When the signed-in member changes, this
  // changes too, and any device selected for the previous member is dropped -
  // otherwise a stale id could keep an old asset (and its coordinates) on screen.
  const deviceSetKey = devices.map((d) => `${d.itemType}:${d.id}`).join(",");
  useEffect(() => {
    const first = devices[0];
    if (!first) {
      setSelectedDeviceId(null);
      return;
    }
    if (!devices.some((d) => d.id === selectedDeviceId)) setSelectedDeviceId(first.id);
    // selectedDeviceId is intentionally not a dependency: this only re-runs when
    // the device set itself changes, so it never fights a deliberate selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceSetKey]);

  // Only ever a device from the CURRENT list, so the map, the agent and the
  // ticket all describe the same asset.
  const selectedDevice: GlpiDevice | null =
    devices.find((d) => d.id === selectedDeviceId) ?? devices[0] ?? null;

  // Open the agent session as soon as the member (and ideally a device) is known.
  useEffect(() => {
    // Wait until the device list has settled, so the opening turn already knows
    // which asset the conversation is about.
    if (!member || sessionId || devicesState === "loading" || devicesState === "idle") return;
    let cancelled = false;
    startAgentSession({
      userId: member.id,
      user: member,
      deviceId: selectedDevice?.id ?? null,
      itemType: selectedDevice?.itemType ?? null,
    })
      .then((turn) => {
        if (cancelled) return;
        setSessionId(turn.sessionId);
        setMessages([{ id: "greet", role: "ai", at: now(), text: turn.message }]);
      })
      .catch(() => {
        /* keep the static greeting if the agent is unreachable */
      });
    return () => {
      cancelled = true;
    };
  }, [member, selectedDevice, sessionId, devicesState]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const push = (m: ChatMessage) => setMessages((prev) => [...prev, m]);

  /** Renders an agent turn using the existing chat message shape. */
  const pushTurn = (turn: AgentTurn) => {
    const msg: ChatMessage = { id: uid(), role: "ai", at: now(), text: turn.message };
    if (turn.details?.length) msg.detail = turn.details;
    if (turn.map) msg.map = turn.map;
    if (turn.actions?.length) msg.actions = turn.actions.map((a) => ({ label: a.label, kind: a.id }));
    push(msg);
    if (turn.ticket) {
      toast.success(`${turn.ticket.ticketId} · ${turn.ticket.status}`);
      // Covers lost escalation, reset success/failure and inventory escalation.
      bumpTickets();
    }
  };

  const agentFailed = (e: unknown) =>
    push({
      id: uid(),
      role: "ai",
      at: now(),
      text: e instanceof Error ? e.message : "The assistant is unavailable right now.",
    });

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setInput("");
    push({ id: uid(), role: "user", text, at: now() });
    setTopic(classify(text));

    if (!sessionId) {
      // Assistant unavailable. Release the guard, or the composer stays locked.
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        busyRef.current = false;
        offlineReply().forEach((m, i) => setTimeout(() => push(m), i * 400));
      }, 900);
      return;
    }

    setTyping(true);
    setAgentBusy(true);
    try {
      const turn = await sendAgentMessage({
        sessionId,
        text,
        deviceId: selectedDevice?.id ?? null,
        itemType: selectedDevice?.itemType ?? null,
      });
      pushTurn(turn);
    } catch (e) {
      agentFailed(e);
    } finally {
      busyRef.current = false;
      setTyping(false);
      setAgentBusy(false);
    }
  };

  /**
   * Action buttons are routed to the agent, which runs the real service behind
   * them (simulated ping / diagnostic / reset) and returns the next turn.
   * "create-ticket" still opens the existing review screen.
   */
  const runAction = async (kind: ActionKind) => {
    if (kind === "create-ticket") {
      setStage("summary");
      return;
    }
    if (!sessionId) {
      push({ id: uid(), role: "ai", at: now(), text: "The assistant session is not ready yet." });
      return;
    }
    // A second click must not run the action twice - that would open two tickets.
    if (busyRef.current) return;
    busyRef.current = true;
    setTyping(true);
    setAgentBusy(true);
    try {
      // Carry the currently selected device so an action follows a device the
      // member switched to without sending a message first.
      const turn = await runAgentAction({
        sessionId,
        action: kind,
        deviceId: selectedDevice?.id ?? null,
        itemType: selectedDevice?.itemType ?? null,
      });
      pushTurn(turn);
    } catch (e) {
      agentFailed(e);
    } finally {
      busyRef.current = false;
      setTyping(false);
      setAgentBusy(false);
    }
  };

  const submitTicket = async () => {
    if (!member) {
      setSubmitError("Sign in before creating a ticket.");
      return;
    }
    const draft = ticketDrafts[topic];
    const issueType = draft["Issue Type"] ?? "General IT support request";
    const transcript = messages
      .filter((m) => m.role === "user")
      .map((m) => m.text)
      .join("\n");

    setSubmitting(true);
    setSubmitError(null);
    try {
      // Asset identity travels as the GLPI id + BTDS tag; the backend never
      // resolves an asset from its display name.
      const result = await reportTicket({
        title: selectedDevice
          ? `[${selectedDevice.assetTag ?? selectedDevice.name}] ${issueType}`
          : issueType,
        text: transcript || draft["Description"] || issueType,
        category: issueType,
        urgency: URGENCY_BY_PRIORITY[draft["Priority"] ?? ""] ?? 3,
        userId: member.id,
        device: selectedDevice,
      });
      setCreated(result);
      bumpTickets();
      setStage("success");
      toast.success(`Service ticket ${result.ticketId} created`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not create the ticket.");
      toast.error("Could not create the ticket");
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Simulated device reset against the selected GLPI asset. The backend records
   * it as a ticket that is created and closed in one step.
   */
  const runReset = async () => {
    if (!member || !selectedDevice) return;
    setResetting(true);
    push({
      id: uid(),
      role: "user",
      text: `Reset ${selectedDevice.name}${selectedDevice.assetTag ? ` (${selectedDevice.assetTag})` : ""}`,
      at: now(),
    });
    setTyping(true);
    try {
      const r: ResetResult = await resetDevice({ userId: member.id, device: selectedDevice });
      setTyping(false);
      push({
        id: uid(),
        role: "ai",
        at: now(),
        text: `${r.reason.detail} ${r.note}`,
        detail: [
          {
            label: "Device",
            value: `${r.device?.name ?? selectedDevice.name} (${selectedDevice.type ?? r.assetItemType ?? selectedDevice.itemType})`,
          },
          { label: "Reset type", value: r.resetType },
          {
            label: "Carrier record",
            value: r.carrierDataAvailable
              ? `${r.sim?.carrier ?? "on file"} · ${r.sim?.msisdn ?? r.sim?.line ?? "line on file"}`
              : "None in GLPI — generic device reset simulated",
          },
          { label: "Ticket", value: `${r.ticketId} · ${r.ticketStatus}` },
        ],
      });
      toast.success(`Simulated reset recorded as ${r.ticketId} (${r.ticketStatus})`);
      // The sidebar reset also writes a real GLPI ticket.
      if (r.ticketId) bumpTickets();
    } catch (e) {
      setTyping(false);
      push({
        id: uid(),
        role: "ai",
        at: now(),
        text: e instanceof Error ? e.message : "The reset could not be completed.",
      });
      toast.error("Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const resetChat = () => {
    setCreated(null);
    setSubmitError(null);
    setMessages([{ ...greeting, at: now() }]);
    setStage("chat");
    setTopic("general");
    setActiveConversation("c4");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar
        theme="blue"
        brandSubtitle="IT Service Desk"
        items={memberNav}
        user={navUser ?? { name: "Not signed in", initials: "--" }}
      />

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-0 py-0 lg:px-6 lg:py-6">
        {/* Sidebar */}
        <aside className="hidden w-72 shrink-0 flex-col rounded-xl border bg-card p-4 shadow-card lg:flex">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-steel/10 text-steel">
              <Bot className="size-5" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold">AI Service Assistant</p>
              <p className="text-xs text-muted-foreground">Tier 0 troubleshooting</p>
            </div>
          </div>
          <Button className="mt-4 w-full" variant="outline" onClick={resetChat}>
            <MessageSquarePlus className="size-4" /> New Chat
          </Button>
          <p className="mt-6 mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Your recent tickets
          </p>
          <nav className="flex flex-col gap-1">
            {recentTickets.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No tickets yet. Anything you raise here will appear in this list.
              </p>
            ) : (
              recentTickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveConversation(String(t.id))}
                  className={cn(
                    "rounded-lg px-3 py-2 text-left transition-colors",
                    activeConversation === String(t.id) ? "bg-steel/10 text-foreground" : "hover:bg-muted",
                  )}
                >
                  <span className="block truncate text-sm font-semibold">{t.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t.reference}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground/80">{t.statusLabel}</span>
                </button>
              ))
            )}
          </nav>

          {/* Assigned equipment from GLPI: pick the device a reset or report applies to. */}
          <div className="mt-4 border-t pt-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Your equipment
            </p>
            {devicesState === "loading" ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Loading…
              </p>
            ) : devicesState === "signed-out" ? (
              <p className="mt-2 text-xs text-muted-foreground">Sign in to see your equipment.</p>
            ) : devicesState === "error" ? (
              <p className="mt-2 text-xs text-destructive">{devicesError ?? "Unavailable."}</p>
            ) : devices.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">Nothing assigned to you.</p>
            ) : (
              <div className="mt-2 grid gap-1.5">
                {devices.map((d) => (
                  <button
                    key={`${d.itemType}-${d.id}`}
                    type="button"
                    onClick={() => setSelectedDeviceId(d.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors",
                      selectedDevice?.id === d.id && selectedDevice?.itemType === d.itemType
                        ? "border-steel bg-steel/10"
                        : "hover:bg-muted",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{d.name}</span>
                      <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {d.type ?? d.itemType}
                      </span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[d.model, d.assetTag].filter(Boolean).join(" · ") || "No inventory tag"}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground/80">
                      {d.locationName ?? "No location"}
                      {d.latitude && d.longitude ? ` · ${d.latitude}, ${d.longitude}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {/* Position of the SELECTED asset, from the GLPI location on that
                asset. Keyed by asset identity so switching device or member
                remounts the map instead of leaving the previous coordinates. */}
            {selectedDevice?.latitude && selectedDevice?.longitude ? (
              <DeviceMap
                key={`sel-${selectedDevice.itemType}-${selectedDevice.id}-${selectedDevice.latitude},${selectedDevice.longitude}`}
                latitude={selectedDevice.latitude}
                longitude={selectedDevice.longitude}
                label={`${selectedDevice.name} (${selectedDevice.type ?? selectedDevice.itemType})`}
                locationName={selectedDevice.locationName}
              />
            ) : null}
            {selectedDevice ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3 w-full"
                disabled={resetting}
                onClick={runReset}
              >
                {resetting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Resetting…
                  </>
                ) : (
                  <>
                    <Signal className="size-4" /> Reset this device
                  </>
                )}
              </Button>
            ) : null}
          </div>
        </aside>

        {/* Main */}
        <main className="flex min-h-[calc(100vh-4rem)] flex-1 flex-col rounded-none border-0 bg-card shadow-none lg:min-h-0 lg:rounded-xl lg:border lg:shadow-card">
          {stage === "success" ? (
            <SuccessScreen topic={topic} onNewChat={resetChat} created={created} />
          ) : stage === "summary" ? (
            <SummaryScreen
              topic={topic}
              submitting={submitting}
              onBack={() => setStage("chat")}
              onSubmit={submitTicket}
              member={member}
              devices={devices}
              devicesState={devicesState}
              devicesError={devicesError}
              selectedDevice={selectedDevice}
              onSelectDevice={setSelectedDeviceId}
              submitError={submitError}
            />
          ) : (
            <>
              <header className="border-b px-5 py-4">
                <h1 className="font-display text-lg font-bold">Fire Department IT Service Assistant</h1>
                <p className="text-sm text-muted-foreground">
                  Describe your technology issue and I'll help diagnose the problem or create a
                  service ticket.
                </p>
              </header>

              <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} onAction={runAction} />
                ))}
                {typing ? (
                  <div className="flex items-center gap-3">
                    <Avatar role="ai" />
                    <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border bg-muted px-4 py-3">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
                          style={{ animationDelay: `${i * 0.12}s` }}
                        />
                      ))}
                      <span className="ml-2 text-xs text-muted-foreground">
                        Assistant is analyzing…
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="border-t px-4 py-4 sm:px-6">
                <div className="flex flex-wrap gap-2 pb-3">
                  {prompts.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => send(p)}
                      className="rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:border-steel hover:bg-steel/10 hover:text-steel"
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(input);
                  }}
                >
                  <Input
                    onKeyDown={(e) => {
                      // Enter sends; Shift+Enter is reserved for a newline.
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send(input);
                      }
                    }}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Describe your issue — device, location, and what's happening"
                    aria-label="Message the AI service assistant"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    aria-label="Send message"
                    disabled={typing || !input.trim()}
                  >
                    {typing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </Button>
                </form>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function Avatar({ role }: { role: "ai" | "user" }) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold",
        role === "ai" ? "bg-steel text-steel-foreground" : "bg-navy text-navy-foreground",
      )}
      aria-hidden
    >
      {role === "ai" ? <Bot className="size-4" /> : <User className="size-4" />}
    </span>
  );
}

function MessageBubble({
  message,
  onAction,
}: {
  message: ChatMessage;
  onAction: (kind: ActionKind) => void;
}) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex animate-rise gap-3", isUser && "flex-row-reverse")}>
      <Avatar role={message.role} />
      <div className={cn("max-w-[85%] space-y-2 sm:max-w-[70%]", isUser && "items-end text-right")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "rounded-tr-sm bg-navy text-navy-foreground"
              : "rounded-tl-sm border bg-muted text-foreground",
          )}
        >
          {message.text}
        </div>
        {message.detail ? (
          <div className="rounded-xl border bg-background p-3 text-left">
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              {message.detail.map((d) => (
                <div key={d.label}>
                  <dt className="text-muted-foreground">{d.label}</dt>
                  <dd className="font-semibold">{d.value}</dd>
                </div>
              ))}
            </dl>
            {/* Marker at the GLPI coordinates for this asset. */}
            {message.map ? (
              <DeviceMap
                key={`${message.id}-${message.map.latitude},${message.map.longitude}`}
                {...message.map}
              />
            ) : null}
          </div>
        ) : null}
        {message.actions ? (
          <div className={cn("flex flex-wrap gap-2", isUser ? "justify-end" : "justify-start")}>
            {message.actions.map((a) => {
              const Icon = a.icon ?? Ticket;
              return (
                <Button key={a.label} size="sm" variant="outline" onClick={() => onAction(a.kind)}>
                  <Icon className="size-4" /> {a.label}
                </Button>
              );
            })}
          </div>
        ) : null}
        <p className="px-1 text-[11px] text-muted-foreground">{message.at}</p>
      </div>
    </div>
  );
}

function SummaryScreen({
  topic,
  submitting,
  onBack,
  onSubmit,
  member,
  devices,
  devicesState,
  devicesError,
  selectedDevice,
  onSelectDevice,
  submitError,
}: {
  topic: Topic;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
  member: ReturnType<typeof getSessionUser>;
  devices: GlpiDevice[];
  devicesState: string;
  devicesError: string | null;
  selectedDevice: GlpiDevice | null;
  onSelectDevice: (id: number) => void;
  submitError: string | null;
}) {
  const draft = ticketDrafts[topic];
  // Device and location come from GLPI or are left unset - the draft template
  // must never put another unit's station in front of the member.
  const resolved: Record<string, string> = {
    ...draft,
    "Device ID": selectedDevice
      ? (selectedDevice.assetTag ?? selectedDevice.name)
      : "Not specified",
    Location: selectedDevice?.locationName ?? "Not specified",
  };
  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-steel hover:underline"
      >
        <ArrowLeft className="size-4" /> Back to conversation
      </button>
      <h2 className="mt-4 font-display text-2xl font-extrabold">Review your service ticket</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Confirm the details collected by the assistant before submitting to the IT Service Desk.
      </p>

      <Card className="mt-6 gap-0 rounded-xl p-6 shadow-card">
        <dl className="grid gap-5 sm:grid-cols-2">
          {Object.entries(resolved).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {k}
              </dt>
              <dd className="mt-1 text-sm font-medium">
                {k === "Priority" ? <PriorityBadge priority={v as "High"} /> : v}
              </dd>
            </div>
          ))}
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Attachments
            </dt>
            <dd className="mt-1 text-sm text-muted-foreground">None</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Contact information
            </dt>
            <dd className="mt-1 text-sm font-medium">
              {member ? (
                <>
                  {displayNameOf(member)}
                  {member.email ? ` · ${member.email}` : ""}
                  <span className="block text-xs text-muted-foreground">
                    {member.employeeId ? `Employee ID ${member.employeeId}` : `Login ${member.name}`}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  Not signed in — sign in so the ticket carries your Fire Department record.
                </span>
              )}
            </dd>
          </div>
        </dl>
        <Separator className="my-6" />

        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Assigned device
          </p>
          {devicesState === "loading" ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading your assigned devices…
            </p>
          ) : devicesState === "signed-out" ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to attach one of your assigned devices to this ticket.
            </p>
          ) : devicesState === "error" ? (
            <p className="mt-2 text-sm text-destructive">
              {devicesError ?? "Could not load your devices."} The ticket can still be submitted
              without a device.
            </p>
          ) : devices.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No devices are assigned to you in the asset catalog. The ticket will be created
              without an asset link.
            </p>
          ) : (
            <div className="mt-2 grid gap-2">
              {devices.map((d) => (
                <label
                  key={d.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors",
                    selectedDevice?.id === d.id ? "border-steel bg-steel/5" : "hover:bg-muted/50",
                  )}
                >
                  <input
                    type="radio"
                    name="assigned-device"
                    className="mt-1"
                    checked={selectedDevice?.id === d.id}
                    onChange={() => onSelectDevice(d.id)}
                  />
                  <span>
                    <span className="font-medium">{d.name}</span>
                    {d.assetTag ? (
                      <span className="ml-2 rounded-md border bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {d.assetTag}
                      </span>
                    ) : null}
                    <span className="block text-xs text-muted-foreground">
                      {[d.type, d.model, d.unit, d.status].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {submitError ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {submitError}
          </p>
        ) : null}

        <Separator className="my-6" />
        <div className="flex flex-wrap gap-3">
          <Button size="lg" onClick={onSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Submitting…
              </>
            ) : (
              <>
                <Ticket className="size-4" /> Submit Service Ticket
              </>
            )}
          </Button>
          <Button size="lg" variant="ghost" onClick={onBack} disabled={submitting}>
            Keep troubleshooting
          </Button>
        </div>
      </Card>
    </div>
  );
}

function SuccessScreen({
  topic,
  onNewChat,
  created,
}: {
  topic: Topic;
  onNewChat: () => void;
  created: ReportTicketResult | null;
}) {
  const draft = ticketDrafts[topic];
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg animate-rise text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-success/12 text-success">
          <CheckCircle2 className="size-7" />
        </span>
        <h2 className="mt-5 font-display text-2xl font-extrabold">Ticket Created Successfully</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The IT Service Desk has received your request and will follow up in the portal.
        </p>

        <Card className="mt-6 gap-0 rounded-xl p-6 text-left shadow-card">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-xl font-extrabold">
              {created?.ticketId ?? "—"}
            </p>
            {/* The status GLPI returned, not an assumed one. */}
            <StatusBadge status={created?.status === "Closed" ? "Resolved" : "Open"} />
          </div>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground uppercase">Priority</dt>
              <dd className="mt-1">
                <PriorityBadge priority={draft["Priority"] as "High"} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground uppercase">Status in GLPI</dt>
              <dd className="mt-1 font-medium">{created?.status ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground uppercase">Linked asset</dt>
              <dd className="mt-1 font-medium">
                {created?.assetLinked ? "Linked to your device" : "No device linked"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground uppercase">Issue type</dt>
              <dd className="mt-1 font-medium">{draft["Issue Type"]}</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/my-cases">
                <MapPin className="size-4" /> View Ticket
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Back to Portal</Link>
            </Button>
            <Button variant="ghost" onClick={onNewChat}>
              New conversation
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
