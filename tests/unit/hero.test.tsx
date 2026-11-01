import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { Hero, heroPresetOrder } from "@/design-system/components";
import { Heading } from "@/design-system/primitives";

async function noAxeViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  expect(result.violations.map((v) => v.id)).toEqual([]);
}

const renderHero = () =>
  render(
    <Hero headingId="t" pauseLabel="Pause background animation" playLabel="Play background animation">
      <Heading level={1} id="t">Title</Heading>
    </Hero>,
  );

describe("Hero", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("labels the section by its heading and hides every decorative layer", async () => {
    const { container } = renderHero();
    expect(screen.getByRole("region", { name: "Title" })).toBeInTheDocument();
    const backdrop = container.querySelector("[data-hero-backdrop]")!;
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    expect([...backdrop.querySelectorAll("[data-hero-preset]")].map((el) => el.getAttribute("data-hero-preset"))).toEqual([...heroPresetOrder]);
    expect(backdrop.querySelectorAll("[data-hero-field]")).toHaveLength(4);
    await noAxeViolations(container);
  });

  it("toggles motion with a named button and remembers the choice for the visit", async () => {
    const user = userEvent.setup();
    const { container, unmount } = renderHero();
    const hero = container.querySelector("[data-hero]")!;
    expect(hero).toHaveAttribute("data-ready", "true");
    expect(hero).toHaveAttribute("data-motion", "running");
    await user.click(screen.getByRole("button", { name: "Pause background animation" }));
    expect(hero).toHaveAttribute("data-motion", "paused");
    expect(screen.getByRole("button", { name: "Play background animation" })).toHaveFocus();
    expect(window.sessionStorage.getItem("nltag-hero-paused")).toBe("1");
    unmount();
    const again = renderHero();
    expect(again.container.querySelector("[data-hero]")).toHaveAttribute("data-motion", "paused");
    await user.click(screen.getByRole("button", { name: "Play background animation" }));
    expect(again.container.querySelector("[data-hero]")).toHaveAttribute("data-motion", "running");
  });
});
