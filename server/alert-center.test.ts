import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
}));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: mocks.auth }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      pegasus: {
        listAlerts: { invalidate: vi.fn() },
        overview: { invalidate: vi.fn() },
      },
    }),
    pegasus: {
      listAlerts: { useQuery: mocks.query },
      acknowledgeAlert: { useMutation: mocks.mutation },
    },
  },
}));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children as string),
}));
import NotificationCenter from "../client/src/pages/NotificationCenter";

describe("durable Alerts page", () => {
  beforeEach(() => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, loading: false });
    mocks.query.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    mocks.mutation.mockReturnValue({ isPending: false, mutate: vi.fn() });
  });
  const render = () => renderToStaticMarkup(createElement(NotificationCenter));
  it("reads PEGASUS and truthfully labels unsupported delivery", () => {
    const html = render();
    expect(mocks.query).toHaveBeenCalledWith(
      { limit: 50 },
      expect.objectContaining({ enabled: true })
    );
    expect(html).toContain("Email and browser push delivery are not");
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain("No rule-triggered security alerts recorded");
  });
  it("does not disguise a failed read as an empty inbox", () => {
    mocks.query.mockReturnValue({
      error: new Error("private db error"),
      isLoading: false,
    });
    const html = render();
    expect(html).toContain("Alerts are unavailable");
    expect(html).not.toContain("No rule-triggered security alerts recorded");
    expect(html).not.toContain("private db error");
  });
  it("offers acknowledgement only for open alerts", () => {
    mocks.query.mockReturnValue({
      data: [
        {
          id: 9,
          title: "Protection disabled",
          ruleId: "PEG-CONFIG-001",
          severity: "critical",
          status: "open",
          createdAt: new Date("2026-09-15T12:00:00Z"),
        },
      ],
    });
    expect(render()).toContain(">Acknowledge</button>");
    mocks.query.mockReturnValue({
      data: [
        {
          id: 9,
          title: "Protection disabled",
          ruleId: "PEG-CONFIG-001",
          severity: "critical",
          status: "acknowledged",
          createdAt: new Date("2026-09-15T12:00:00Z"),
        },
      ],
    });
    expect(render()).not.toContain(">Acknowledge</button>");
  });
  it("does not query alerts before authentication", () => {
    mocks.auth.mockReturnValue({ user: null, loading: false });
    expect(render()).toContain("sign in");
    expect(mocks.query).toHaveBeenLastCalledWith(
      { limit: 50 },
      expect.objectContaining({ enabled: false })
    );
  });
});
