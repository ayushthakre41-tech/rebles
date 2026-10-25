'use client';

/* ── Tiny markdown renderer for chat bubbles ────────────────────────── */
function renderMd(text: string) {
  return text.split('\n').map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={j} style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.88em',
            background: 'rgba(124,111,247,0.15)',
            color: 'var(--accent)',
            borderRadius: '4px',
            padding: '1px 5px',
            letterSpacing: '0.03em',
          }}>
            {part.slice(1, -1)}
          </code>
        );
      }
      return <span key={j}>{part}</span>;
    });
    return <p key={i} style={{ margin: i > 0 ? '5px 0 0' : 0 }}>{parts}</p>;
  });
}

import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './chat.module.css';

/* ── Types ─────────────────────────────────────────────────────────── */
interface Message {
  id: string;
  role: 'agent' | 'user' | 'system';
  content: string;
  timestamp: Date;
  typing?: boolean;
  actions?: ChatAction[];
  status?: 'ok' | 'warn' | 'error';
}

interface ChatAction {
  id: string;
  label: string;
  variant?: 'primary' | 'success' | 'danger' | 'secondary';
  payload: Record<string, unknown>;
}

/* ── Suggested prompts shown when chat is empty ──────────────────────── */
const SUGGESTIONS = [
  { emoji: '✨', text: 'Create a new community event', prompt: 'I want to create a new community event' },
  { emoji: '🚀', text: 'Publish an event', prompt: 'Help me publish my event' },
  { emoji: '🚦', text: 'Check registration capacity', prompt: 'How many people can register for my event?' },
  { emoji: '🧪', text: 'Run all test cases', prompt: 'Run all 4 test cases now' },
];

/* ── Agent brain (simple rule-based for demo) ───────────────────────── */
type AgentStep = 'idle' | 'collecting' | 'awaiting_approval' | 'verifying';

interface AgentState {
  step: AgentStep;
  eventId?: string;
  actionId?: string;
  pendingField?: string;
  formData: Record<string, unknown>;
}

/* ── Helpers ────────────────────────────────────────────────────────── */
function uid() { return Math.random().toString(36).slice(2); }

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ── Typing indicator ───────────────────────────────────────────────── */
function TypingDots() {
  return (
    <div className={styles.typingDots}>
      <span /><span /><span />
    </div>
  );
}

/* ── Single message bubble ──────────────────────────────────────────── */
function MessageBubble({ msg, onAction }: { msg: Message; onAction: (a: ChatAction) => void }) {
  const isAgent = msg.role === 'agent';
  const isSystem = msg.role === 'system';

  if (isSystem) {
    return (
      <div className={styles.systemMsg}>
        <span>{msg.content}</span>
      </div>
    );
  }

  return (
    <div className={`${styles.messageRow} ${isAgent ? styles.agentRow : styles.userRow}`}>
      {isAgent && (
        <div className={styles.avatar}>
          <span>🎫</span>
        </div>
      )}
      <div className={`${styles.bubble} ${isAgent ? styles.agentBubble : styles.userBubble} ${msg.status === 'warn' ? styles.bubbleWarn : ''} ${msg.status === 'error' ? styles.bubbleError : ''}`}>
        {msg.typing ? (
          <TypingDots />
        ) : (
          <>
            <div className={styles.bubbleText}>
              {renderMd(msg.content)}
            </div>
            {msg.actions && msg.actions.length > 0 && (
              <div className={styles.bubbleActions}>
                {msg.actions.map((a) => (
                  <button
                    key={a.id}
                    className={`${styles.actionBtn} ${a.variant ? styles[`actionBtn_${a.variant}`] : ''}`}
                    onClick={() => onAction(a)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <span className={styles.timestamp}>{formatTime(msg.timestamp)}</span>
      </div>
      {!isAgent && (
        <div className={`${styles.avatar} ${styles.userAvatar}`}>
          <span>👤</span>
        </div>
      )}
    </div>
  );
}

const SESSION_MSGS_KEY = 'erm_chat_messages';
const SESSION_STATE_KEY = 'erm_chat_agent_state';

function loadStoredMessages(): Message[] {
  try {
    const raw = sessionStorage.getItem(SESSION_MSGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as (Message & { timestamp: string })[];
    // Revive Date objects and drop typing placeholders
    return parsed
      .filter((m) => !m.typing)
      .map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch { return []; }
}

function loadStoredAgentState(): AgentState {
  try {
    const raw = sessionStorage.getItem(SESSION_STATE_KEY);
    return raw ? JSON.parse(raw) : { step: 'idle', formData: {} };
  } catch { return { step: 'idle', formData: {} }; }
}

/* ── Main Chat Page ────────────────────────────────────────────────── */
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>(() => loadStoredMessages());
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentState, setAgentState] = useState<AgentState>(() => loadStoredAgentState());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Persist messages to sessionStorage whenever they change
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_MSGS_KEY, JSON.stringify(messages.filter((m) => !m.typing)));
    } catch { /* storage full — ignore */ }
  }, [messages]);

  // Persist agentState whenever it changes
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(agentState));
    } catch { /* ignore */ }
  }, [agentState]);

  const greeted = useRef(false);

  // Greet only if this is a genuinely fresh session (no stored messages)
  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;
    // If messages were restored from sessionStorage, don't greet again
    const restored = loadStoredMessages();
    if (restored.length > 0) return;
    const t = window.setTimeout(() => {
      addAgent(
        "Hey! 👋 I'm the **Event Registration Manager** agent.\n\nI can help you create events, manage registrations with capacity and waitlist rules, handle the approval workflow, and run the official test cases.\n\nWhat would you like to do?",
        [
          { id: uid(), label: '✨ Create a new event', variant: 'primary', payload: { cmd: 'create_event' } },
          { id: uid(), label: '📅 View all events', variant: 'secondary', payload: { cmd: 'view_events' } },
          { id: uid(), label: '🧪 Run test cases (TC1–TC4)', variant: 'secondary', payload: { cmd: 'run_tests' } },
        ]
      );
    }, 600);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addMessage(msg: Omit<Message, 'id' | 'timestamp'>) {
    const m: Message = { ...msg, id: uid(), timestamp: new Date() };
    setMessages((prev) => [...prev, m]);
    return m.id;
  }

  function addUser(content: string) {
    addMessage({ role: 'user', content });
  }

  function addAgent(content: string, actions?: ChatAction[], status?: Message['status']) {
    return addMessage({ role: 'agent', content, actions, status });
  }

  function addSystem(content: string) {
    addMessage({ role: 'system', content });
  }

  function showTyping() {
    const id = uid();
    setMessages((prev) => [...prev, { id, role: 'agent', content: '', timestamp: new Date(), typing: true }]);
    return id;
  }

  function removeTyping(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  async function thinkThen(delayMs: number, fn: () => void) {
    const tid = showTyping();
    await new Promise((r) => setTimeout(r, delayMs));
    removeTyping(tid);
    fn();
  }

  /* ── Handle action buttons ──────────────────────────────────────── */
  async function handleAction(action: ChatAction) {
    const { cmd, ...payload } = action.payload as Record<string, unknown>;
    setLoading(true);

    if (cmd === 'create_event') {
      addSystem('Starting event creation workflow…');
      await thinkThen(800, () => {
        setAgentState({ step: 'collecting', formData: {}, pendingField: 'title' });
        addAgent("Let's create your event! I'll need a few details.\n\nFirst — what's the **title** of your event?");
      });
    } else if (cmd === 'view_events') {
      const res = await fetch('/api/events');
      const d = await res.json();
      const events = d.events as { id: string; title: string; status: string; date: string }[];
      await thinkThen(700, () => {
        if (!events.length) {
          addAgent("No events yet! Would you like to create one?", [
            { id: uid(), label: '✨ Create an event', variant: 'primary', payload: { cmd: 'create_event' } },
          ]);
        } else {
          const list = events.slice(0, 5).map((e) => `• **${e.title}** — ${e.status} (${e.date})`).join('\n');
          addAgent(`Here are your recent events:\n\n${list}${events.length > 5 ? `\n\n…and ${events.length - 5} more.` : ''}\n\nClick an event to manage it, or create a new one.`, [
            { id: uid(), label: '✨ New event', variant: 'primary', payload: { cmd: 'create_event' } },
            { id: uid(), label: '📋 Approvals queue', variant: 'secondary', payload: { cmd: 'approvals' } },
          ]);
        }
      });
    } else if (cmd === 'run_tests') {
      addSystem('Running TC1–TC4 with synthetic data…');
      await thinkThen(600, () => addAgent("Running all 4 test cases. This takes a few seconds…"));
      const results: { tc: string; passed: boolean; actual: string }[] = [];
      for (const tc of ['TC1', 'TC2', 'TC3', 'TC4']) {
        const res = await fetch('/api/test-runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ testCase: tc }),
        });
        const d = await res.json();
        results.push({ tc, passed: !!d.passed, actual: d.actual || '' });
      }
      const allPass = results.every((r) => r.passed);
      const summary = results.map((r) => `${r.passed ? '✅' : '❌'} **${r.tc}** — ${r.actual}`).join('\n');
      addAgent(`Test run complete!\n\n${summary}\n\n${allPass ? '🎉 All 4 test cases passed.' : '⚠️ Some cases need review — check the Test Runs page.'}`,
        [{ id: uid(), label: '📊 View full report', variant: allPass ? 'success' : 'secondary', payload: { cmd: 'open_url', url: '/test-runs' } }],
        allPass ? 'ok' : 'warn'
      );
    } else if (cmd === 'approvals') {
      await thinkThen(600, () => {
        addAgent("Checking the approval queue…", [
          { id: uid(), label: '✅ Open Approvals', variant: 'primary', payload: { cmd: 'open_url', url: '/approvals' } },
        ]);
      });
    } else if (cmd === 'open_url') {
      window.open(payload.url as string, '_blank');
    } else if (cmd === 'approve_action') {
      const actionId = payload.actionId as string;
      const res = await fetch(`/api/actions/${actionId}/approve`, { method: 'POST' });
      const d = await res.json();
      await thinkThen(800, () => {
        if (res.ok) {
          addAgent(`✅ Action approved! The approved version has been stored.\n\nReady to execute?`, [
            { id: uid(), label: '▶ Execute now', variant: 'primary', payload: { cmd: 'execute_action', actionId } },
            { id: uid(), label: 'Not yet', variant: 'secondary', payload: { cmd: 'noop' } },
          ], 'ok');
        } else {
          addAgent(`❌ Could not approve: ${d.error}`, undefined, 'error');
        }
      });
    } else if (cmd === 'execute_action') {
      const actionId = payload.actionId as string;
      addSystem('Executing action and running verification…');
      const res = await fetch(`/api/actions/${actionId}/execute`, { method: 'POST' });
      const d = await res.json();
      await thinkThen(1000, () => {
        const vResult = d.verification?.result;
        addAgent(
          `Action executed!\n\n**Verification:** ${vResult ?? 'PENDING'}\n${vResult === 'VERIFIED' ? '✅ The event page matches the intended state.' : '⚠️ Verification is pending — the platform may need a moment to update.'}`,
          [{ id: uid(), label: '📄 View event', variant: 'primary', payload: { cmd: 'open_url', url: `/events/${agentState.eventId}` } }],
          vResult === 'VERIFIED' ? 'ok' : 'warn'
        );
      });
    } else if (cmd === 'reject_action') {
      const actionId = payload.actionId as string;
      await fetch(`/api/actions/${actionId}/reject`, { method: 'POST' });
      await thinkThen(700, () => {
        addAgent("❌ Action rejected. The event page remains unchanged. The rejected action is recorded for auditing.", undefined, 'warn');
      });
    } else if (cmd === 'noop') {
      // do nothing
    }

    setLoading(false);
  }

  /* ── Handle collecting form fields via conversation ──────────────── */
  async function handleCollecting(text: string) {
    const { pendingField, formData } = agentState;

    const updated = { ...formData, [pendingField!]: text };
    const fields = ['title', 'date', 'time', 'venue', 'capacity'];
    const fieldIdx = fields.indexOf(pendingField!);
    const nextField = fields[fieldIdx + 1] ?? null;

    const fieldPrompts: Record<string, string> = {
      date: "Got it! What's the **date** of the event? (e.g. 2026-12-01)",
      time: "And what **time** does it start? (e.g. 18:00)",
      venue: "Where will it be held? Give me the **venue name and address**.",
      capacity: "How many people can attend? Enter the **maximum capacity**.",
    };

    if (nextField) {
      setAgentState({ ...agentState, pendingField: nextField, formData: updated });
      await thinkThen(700, () => addAgent(fieldPrompts[nextField]));
    } else {
      // All fields collected — create the event
      setAgentState({ step: 'awaiting_approval', formData: updated });
      addSystem('Validating and creating event…');

      const cap = parseInt(String(updated.capacity));
      const futureDate = updated.date as string;

      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: updated.title,
          date: futureDate,
          time: updated.time || '18:00',
          venue: updated.venue,
          capacity: isNaN(cap) ? 50 : cap,
          ticket_rules: 'FREE',
        }),
      });
      const d = await res.json();

      if (!res.ok) {
        const fieldErrors = Object.values(d.fields || {}).join('; ');
        await thinkThen(700, () => addAgent(`⚠️ Validation failed: ${fieldErrors || d.error}\n\nLet's try again — what's the event title?`, undefined, 'error'));
        setAgentState({ step: 'collecting', pendingField: 'title', formData: {} });
      } else {
        const eventId = d.event.id;
        const eventSecret: string = d.eventSecret;
        setAgentState({ step: 'awaiting_approval', formData: updated, eventId });

        // Show the secret immediately — this is the only time it will appear
        await thinkThen(500, () => {
          addAgent(
            `🔑 **Your Event Secret — save this now!**\n\n\`${eventSecret}\`\n\n⚠️ This code is shown **only once**. You will need it to edit or delete this event. Copy it somewhere safe before continuing.`,
            undefined,
            'warn'
          );
        });

        // Create PUBLISH action
        const actRes = await fetch('/api/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId,
            type: 'PUBLISH',
            proposedChange: { publicUrl: `https://lu.ma/mock-${eventId.slice(0, 8)}` },
          }),
        });
        const actData = await actRes.json();
        const actionId = actData.action?.id;
        setAgentState((s) => ({ ...s, actionId }));

        await thinkThen(900, () => {
          addAgent(
            `✅ Event created!\n\n• **Title:** ${updated.title}\n• **Date:** ${updated.date} at ${updated.time}\n• **Venue:** ${updated.venue}\n• **Capacity:** ${isNaN(cap) ? 50 : cap}\n\nI've prepared a **PUBLISH** action for your review. This will make the event public — please approve or reject below.`,
            [
              { id: uid(), label: '✅ Approve & Publish', variant: 'success', payload: { cmd: 'approve_action', actionId } },
              { id: uid(), label: '❌ Reject', variant: 'danger', payload: { cmd: 'reject_action', actionId } },
            ]
          );
        });
      }
    }
  }

  /* ── Send a chat message ───────────────────────────────────────────── */
  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    addUser(text);
    setLoading(true);

    // If agent is collecting form fields, route accordingly
    if (agentState.step === 'collecting' && agentState.pendingField) {
      await handleCollecting(text);
      setLoading(false);
      return;
    }

    // Keyword intent detection
    const lower = text.toLowerCase();
    if (lower.includes('create') || lower.includes('new event')) {
      await handleAction({ id: uid(), label: '', payload: { cmd: 'create_event' } });
    } else if (lower.includes('test') || lower.includes('tc1') || lower.includes('tc2') || lower.includes('run')) {
      await handleAction({ id: uid(), label: '', payload: { cmd: 'run_tests' } });
    } else if (lower.includes('event') && (lower.includes('list') || lower.includes('all') || lower.includes('show'))) {
      await handleAction({ id: uid(), label: '', payload: { cmd: 'view_events' } });
    } else if (lower.includes('approv')) {
      await handleAction({ id: uid(), label: '', payload: { cmd: 'approvals' } });
    } else if (lower.includes('publish')) {
      await thinkThen(800, () => addAgent("To publish an event, first create one — I'll walk you through it.", [
        { id: uid(), label: '✨ Create an event', variant: 'primary', payload: { cmd: 'create_event' } },
      ]));
    } else if (lower.includes('help')) {
      await thinkThen(600, () => addAgent("Here's what I can do:\n\n• **Create events** with validation\n• **Manage registrations** with capacity & waitlist rules\n• **Approval-gated publishing** (nothing publishes without your OK)\n• **Verify outcomes** after execution\n• **Run TC1–TC4** test cases\n\nWhat would you like to do?", [
        { id: uid(), label: '✨ Create event', variant: 'primary', payload: { cmd: 'create_event' } },
        { id: uid(), label: '🧪 Run tests', variant: 'secondary', payload: { cmd: 'run_tests' } },
      ]));
    } else {
      await thinkThen(700, () => addAgent("I didn't quite catch that. Here are some things I can help with:", [
        { id: uid(), label: '✨ Create a new event', variant: 'primary', payload: { cmd: 'create_event' } },
        { id: uid(), label: '📅 View events', variant: 'secondary', payload: { cmd: 'view_events' } },
        { id: uid(), label: '🧪 Run test cases', variant: 'secondary', payload: { cmd: 'run_tests' } },
      ]));
    }

    setLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function startNewChat() {
    try {
      sessionStorage.removeItem(SESSION_MSGS_KEY);
      sessionStorage.removeItem(SESSION_STATE_KEY);
    } catch { /* ignore */ }
    setInput('');
    setAgentState({ step: 'idle', formData: {} });
    greeted.current = true;
    // Build greeting message directly to avoid stale closure
    const greetMsg: Message = {
      id: uid(),
      role: 'agent',
      timestamp: new Date(),
      content: "Hey! 👋 I'm the **Event Registration Manager** agent.\n\nI can help you create events, manage registrations with capacity and waitlist rules, handle the approval workflow, and run the official test cases.\n\nWhat would you like to do?",
      actions: [
        { id: uid(), label: '✨ Create a new event', variant: 'primary', payload: { cmd: 'create_event' } },
        { id: uid(), label: '📅 View all events', variant: 'secondary', payload: { cmd: 'view_events' } },
        { id: uid(), label: '🧪 Run test cases (TC1–TC4)', variant: 'secondary', payload: { cmd: 'run_tests' } },
      ],
    };
    setMessages([greetMsg]);
  }

  const isEmpty = messages.length === 0;

  return (
    <div className={styles.chatShell}>
      {/* Header */}
      <div className={styles.chatHeader}>
        <div className={styles.chatHeaderLeft}>
          <div className={styles.agentAvatarLg}>🎫</div>
          <div>
            <div className={styles.agentName}>ERM Agent</div>
            <div className={styles.agentStatus}>
              <span className={styles.statusDot} />
              Active · Human-in-the-loop
            </div>
          </div>
        </div>
        <div className={styles.chatHeaderActions}>
          <a href="/events" className={styles.headerLink}>📅 Events</a>
          <a href="/approvals" className={styles.headerLink}>✅ Approvals</a>
          <a href="/test-runs" className={styles.headerLink}>🧪 Tests</a>
          {messages.length > 0 && (
            <button
              id="new-chat-btn"
              className={styles.newChatBtn}
              onClick={startNewChat}
              title="Start a new conversation"
            >
              + New Chat
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className={styles.messagesArea}>
        {isEmpty && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🎫</div>
            <h2 className={styles.emptyTitle}>Event Registration Manager</h2>
            <p className={styles.emptyDesc}>
              Your AI agent for event setup, registration management, and approval-gated publishing.
            </p>
            <div className={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  className={styles.suggestion}
                  onClick={() => { setInput(s.prompt); inputRef.current?.focus(); }}
                >
                  <span className={styles.suggestionEmoji}>{s.emoji}</span>
                  <span>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} onAction={handleAction} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className={styles.composer}>
        <div className={styles.composerInner}>
          <textarea
            ref={inputRef}
            id="chat-input"
            className={styles.composerInput}
            placeholder="Ask me anything about your event…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={loading}
          />
          <button
            id="chat-send-btn"
            className={styles.sendBtn}
            onClick={send}
            disabled={loading || !input.trim()}
          >
            {loading
              ? <span className={styles.sendSpinner} />
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            }
          </button>
        </div>
        <div className={styles.composerHint}>
          Press <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for new line
        </div>
      </div>
    </div>
  );
}
