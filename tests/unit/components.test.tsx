import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { vi } from "vitest";
import {
  Button, ButtonLink, IconButton, LanguageSwitch, MembershipStatusBadge, ScheduleList, SectionIntro,
  SiteHeader, SpecialMeetingCard, TextField, VerseCard, VerseCardActions,
  SelectField, CheckboxField, Notice, DataTable, ConfirmButton,
} from "@/design-system/components";
import { Icon } from "@/design-system/primitives";
import { schedule } from "@/content/schedule";
import { placeholderVerse } from "@/content/bible";

vi.mock("next/navigation", () => ({ usePathname: () => "/ta/design-system" }));

/** Runs axe-core on the rendered container. Colour contrast is checked in the browser suite. */
async function expectNoA11yViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
}

describe("Button", () => {
  it("renders the label and fires clicks", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Join us this Friday</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Join us this Friday" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("loading: busy, keeps focusability, ignores presses, announces the loading label", async () => {
    const onClick = vi.fn();
    render(<Button loading loadingLabel="Please wait" onClick={onClick}>Download PNG</Button>);
    const b = screen.getByRole("button", { name: /Download PNG/ });
    expect(b).toHaveAttribute("aria-busy", "true");
    expect(b).not.toBeDisabled();
    expect(b).toHaveAccessibleName("Download PNG Please wait");
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("disabled: native disabled", () => {
    render(<Button disabled>Download PNG</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("applies variant classes", () => {
    const { container } = render(
      <>
        <Button variant="secondary">A</Button>
        <Button variant="tertiary" compact>B</Button>
        <Button variant="glass">C</Button>
      </>,
    );
    const [a, b, c] = container.querySelectorAll("button");
    expect(a!.className).toMatch(/secondary/);
    expect(b!.className).toMatch(/tertiary/);
    expect(b!.className).toMatch(/compact/);
    expect(c!.className).toMatch(/glass/);
  });

  it("ButtonLink is a link, IconButton has an accessible name", async () => {
    const { container } = render(
      <>
        <ButtonLink href="/ta">Home</ButtonLink>
        <IconButton label="Menu" icon={<Icon name="menu" />} />
      </>,
    );
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/ta");
    expect(screen.getByRole("button", { name: "Menu" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe("TextField", () => {
  it("links label, hint and error, and marks the field invalid", async () => {
    const { container } = render(
      <TextField id="name" label="Full name" hint="As on your ID" error="This field is required." requirementText="Required" required />,
    );
    const input = screen.getByRole("textbox", { name: /Full name/ });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("As on your ID This field is required.");
    await expectNoA11yViolations(container);
  });

  it("supports disabled, read-only and multiline", () => {
    render(
      <>
        <TextField id="a" label="A" disabled />
        <TextField id="b" label="B" readOnly defaultValue="x" />
        <TextField id="c" label="C" multiline />
      </>,
    );
    expect(screen.getByRole("textbox", { name: "A" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "B" })).toHaveAttribute("readonly");
    expect(screen.getByRole("textbox", { name: "C" }).tagName).toBe("TEXTAREA");
  });
});

describe("MembershipStatusBadge", () => {
  it("shows the status in words in both languages", () => {
    render(
      <>
        <MembershipStatusBadge status="pendingReview" locale="en" />
        <MembershipStatusBadge status="active" locale="ta" />
      </>,
    );
    expect(screen.getByText("Pending review")).toBeInTheDocument();
    expect(screen.getByText("செயலில்")).toBeInTheDocument();
  });
});

describe("LanguageSwitch", () => {
  it("links to the same page in the other language and marks the current one", async () => {
    const { container } = render(<LanguageSwitch locale="ta" />);
    const nav = screen.getByRole("navigation", { name: "மொழி" });
    const ta = within(nav).getByRole("link", { name: "தமிழ்" });
    const en = within(nav).getByRole("link", { name: "EN" });
    expect(ta).toHaveAttribute("aria-current", "true");
    expect(en).not.toHaveAttribute("aria-current");
    expect(en).toHaveAttribute("href", "/en/design-system");
    expect(en).toHaveAttribute("lang", "en");
    await expectNoA11yViolations(container);
  });
});

describe("SiteHeader", () => {
  const nav = [{ href: "/ta/about", label: "சபை வரலாறு" }];

  it("toggles the mobile menu, closes on Escape and returns focus", async () => {
    render(<SiteHeader locale="ta" navItems={nav} cta={{ href: "/ta/visit", label: "ஆராதனையில் இணைந்துகொள்ளுங்கள்" }} />);
    const button = await screen.findByRole("button", { name: "மெனு" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAccessibleName("மெனுவை மூடு");
    const panel = document.getElementById(button.getAttribute("aria-controls")!)!;
    expect(panel).not.toHaveAttribute("hidden");
    await userEvent.keyboard("{Escape}");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("hidden");
    expect(button).toHaveFocus();
  });

  it("has a skip link, the wordmark and no a11y violations", async () => {
    const { container } = render(<SiteHeader locale="en" navItems={nav} />);
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main");
    expect(screen.getByRole("link", { name: /NLTAG/ })).toHaveAttribute("href", "/en");
    await expectNoA11yViolations(container);
  });

  it("omits the menu button when there is nothing to show", () => {
    render(<SiteHeader locale="ta" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("ScheduleList", () => {
  it("renders all six Gate 0 items with the other language beneath", async () => {
    const { container } = render(<ScheduleList items={schedule} locale="ta" />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(6);
    expect(within(rows[0]!).getByText("Main Worship Service")).toHaveAttribute("lang", "en");
    expect(within(rows[1]!).getByText(/வெள்ளிக்கிழமை/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe("VerseCard", () => {
  const verse = placeholderVerse("ta");

  it("shows the placeholder chip, both languages, reference, translations and credit", async () => {
    const { container } = render(<VerseCard verse={verse} locale="ta" dateLabel="1 நவம்பர், 2026" />);
    const card = screen.getByRole("figure", { name: "இன்றைய தேவ வசனம்" });
    expect(within(card).getByText("மாதிரி")).toBeInTheDocument();
    expect(within(card).getByText(verse.text.ta!)).toBeInTheDocument();
    expect(within(card).getByText(verse.text.en!)).toBeInTheDocument();
    expect(card).toHaveTextContent("BSI Tamil (edition to confirm) · NKJV");
    expect(card).toHaveTextContent(verse.publisherCredit);
    // Tamil comes first
    const quotes = card.querySelectorAll("blockquote");
    expect(quotes[0]).toHaveAttribute("lang", "ta");
    expect(quotes[1]).toHaveAttribute("lang", "en");
    await expectNoA11yViolations(container);
  });

  it("hides the rule and the other language in single-language modes", () => {
    const { container } = render(<VerseCard verse={verse} locale="en" dateLabel="1 November 2026" languages="en" />);
    expect(container.querySelectorAll("blockquote")).toHaveLength(1);
    expect(container.querySelector("hr")).toBeNull();
    expect(container).toHaveTextContent("NKJV");
    expect(container).not.toHaveTextContent("BSI Tamil");
  });

  it("shows the designed fallback, never invented text, when nothing is scheduled", () => {
    const { container } = render(<VerseCard verse={null} locale="en" dateLabel="1 November 2026" />);
    expect(screen.getByText("Today's verse will be published soon.")).toBeInTheDocument();
    expect(container.querySelector("blockquote")).toBeNull();
    expect(screen.queryByText("Placeholder")).not.toBeInTheDocument();
  });

  it("keeps actions outside the exported card node", () => {
    render(
      <>
        <VerseCard verse={verse} locale="en" dateLabel="1 November 2026" variant="square" showExportGuide />
        <VerseCardActions><Button>Share</Button></VerseCardActions>
      </>,
    );
    const card = screen.getByRole("figure");
    expect(within(card).queryByRole("button")).toBeNull();
    expect(card.querySelector("[data-export-ignore]")).not.toBeNull();
    expect(card).toHaveAttribute("data-variant", "square");
  });
});

describe("SectionIntro and SpecialMeetingCard", () => {
  it("render accessible structures", async () => {
    const { container } = render(
      <section aria-labelledby="s">
        <SectionIntro headingId="s" eyebrow="Eyebrow" title="Worship schedule" lead="Lead" action={<ButtonLink href="/en">Go</ButtonLink>} />
        <SpecialMeetingCard
          preset="kadal" typeLabel="சிறப்புக் கூட்டம்" dateLabel="[Date]" dateTime="2026-11-01"
          titleTa="[தலைப்பு]" titleEn="[Title]" href="/en/events/x"
        />
      </section>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Worship schedule" })).toHaveAttribute("id", "s");
    expect(screen.getByRole("heading", { level: 3 })).toContainElement(screen.getByRole("link", { name: "[தலைப்பு]" }));
    expect(screen.getByText("சிறப்புக் கூட்டம்")).toBeVisible();
    await expectNoA11yViolations(container);
  });
});

describe("Phase 4c form and admin components", () => {
  it("SelectField and CheckboxField: visible labels, hints and errors linked", async () => {
    const { container } = render(
      <>
        <SelectField id="s" label="Status" hint="Pick one" error="Choose a status" options={[{ value: "a", label: "A" }]} />
        <CheckboxField id="c" name="c" label="Feature this item" hint="Listed first" />
      </>,
    );
    const select = screen.getByLabelText("Status");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select.getAttribute("aria-describedby")).toBe("s-hint s-error");
    expect(screen.getByRole("checkbox", { name: "Feature this item" })).toHaveAttribute("aria-describedby", "c-hint");
    await expectNoA11yViolations(container);
  });

  it("Notice: errors are alerts, other tones are polite status messages, in words", async () => {
    const { container } = render(
      <>
        <Notice tone="error" title="Not saved"><p>Fix the title.</p></Notice>
        <Notice tone="success" title="Saved" />
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Not saved");
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    await expectNoA11yViolations(container);
  });

  it("DataTable: named, keyboard-scrollable region with a caption", async () => {
    const { container } = render(
      <DataTable caption="Pages" captionHidden>
        <thead><tr><th scope="col">Title</th></tr></thead>
        <tbody><tr><th scope="row">[Row]</th></tr></tbody>
      </DataTable>,
    );
    expect(screen.getByRole("region", { name: "Pages" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("table", { name: "Pages" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("ConfirmButton: opens a labelled dialog; nothing submits until confirmed", async () => {
    // jsdom has no showModal; emulate it.
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.open = false; };
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    const { container } = render(
      <form onSubmit={(e) => onSubmit(e.nativeEvent)}>
        <ConfirmButton label="Delete" title="Delete this page?" message={<p>It can be restored.</p>} confirmLabel="Delete page" name="action" value="delete" />
      </form>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onSubmit).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Delete this page?" });
    expect(dialog).toHaveAccessibleDescription("It can be restored.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete page" }));
    expect(onSubmit).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });
});
