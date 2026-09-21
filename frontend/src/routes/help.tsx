import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Bot, LifeBuoy, Phone, Send } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/fdny/Navbar";
import { Footer } from "@/components/fdny/Footer";
import { PageHeader } from "@/components/fdny/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { memberNav } from "@/lib/nav";
import { useSessionUser } from "@/lib/session";
import { faqs, supportChannels } from "@/lib/portal-data";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help & Support — FDNY IT Service Portal" },
      {
        name: "description",
        content:
          "Contact the IT service desk, read answers to common questions, and find the right channel for urgent in-service technology problems.",
      },
      { property: "og:title", content: "Help & Support — FDNY IT Service Portal" },
      {
        property: "og:description",
        content: "Service desk contacts, FAQs, and a message form for non-urgent questions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HelpPage,
});

function HelpPage() {
  const { navUser } = useSessionUser();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast.error("Add a subject and a message before sending.");
      return;
    }
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setSubject("");
      setMessage("");
      toast.success("Message sent to the service desk — reference HD-5571");
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar theme="red" items={memberNav} user={navUser ?? { name: "Not signed in", initials: "--" }} />

      <PageHeader
        eyebrow="Help & support"
        icon={LifeBuoy}
        title="Get a person, or get an answer"
        description="Urgent in-service problems go to the 24/7 line. Everything else can be handled here, usually faster."
      />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {supportChannels.map((c) => (
            <Card key={c.name} className="gap-0 rounded-xl p-5 shadow-card">
              <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <Phone className="size-5" />
              </span>
              <h2 className="mt-4 text-sm font-bold">{c.name}</h2>
              <p className="mt-1 font-display text-lg font-extrabold break-words">{c.detail}</p>
              <p className="mt-2 text-xs text-muted-foreground">{c.note}</p>
            </Card>
          ))}
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <Link
            to="/report-ticket"
            className="group rounded-2xl bg-primary p-7 text-primary-foreground shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lift"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-white/15">
              <Bot className="size-5" />
            </span>
            <h2 className="mt-4 font-display text-xl font-extrabold">Ask the AI assistant</h2>
            <p className="mt-2 text-sm text-primary-foreground/85">
              It runs the same device, carrier, and CMDB checks a technician would, and opens a
              ticket only if the issue needs one.
            </p>
          </Link>

          <Link
            to="/knowledge-base"
            className="group rounded-2xl bg-navy p-7 text-navy-foreground shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lift"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-white/12">
              <BookOpen className="size-5" />
            </span>
            <h2 className="mt-4 font-display text-xl font-extrabold">Browse the knowledge base</h2>
            <p className="mt-2 text-sm text-navy-foreground/80">
              Eight step-by-step guides covering the failures that come up most often in the field.
            </p>
          </Link>
        </section>

        <section className="mt-12 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 className="font-display text-2xl font-extrabold">Common questions</h2>
            <Accordion type="single" collapsible className="mt-4">
              {faqs.map((f, i) => (
                <AccordionItem key={f.q} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left text-base font-semibold">
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <Card className="h-fit gap-0 rounded-xl p-6 shadow-card">
            <h2 className="font-display text-xl font-bold">Message the service desk</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              For non-urgent questions. Expect a reply within four hours during the day tour.
            </p>
            <form className="mt-5 space-y-4" onSubmit={send}>
              <div className="space-y-2">
                <Label htmlFor="help-from">From</Label>
                <Input
                  id="help-from"
                  value={navUser ? `${navUser.name} · ${navUser.role ?? ""}`.trim() : "Not signed in"}
                  readOnly
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="help-subject">Subject</Label>
                <Input
                  id="help-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="What do you need help with?"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="help-message">Message</Label>
                <Textarea
                  id="help-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder="Include the device tag and what you have already tried."
                />
              </div>
              <Button type="submit" className="w-full" disabled={sending}>
                <Send className="size-4" /> {sending ? "Sending…" : "Send message"}
              </Button>
            </form>
          </Card>
        </section>
      </main>

      <Footer />
    </div>
  );
}
